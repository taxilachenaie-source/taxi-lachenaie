import { NextResponse } from "next/server";

type GeocodeResult = {
  lat: number;
  lon: number;
  displayName: string;
};

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = 12000
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

function cleanAddress(address: string) {
  return address
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bqc\b/gi, "Québec")
    .replace(/\bq\.?c\.?\b/gi, "Québec");
}

function buildAddressQueries(address: string) {
  const cleaned = cleanAddress(address);

  const queries = [
    cleaned,
    `${cleaned}, Québec, Canada`,
    `${cleaned}, Terrebonne, Québec, Canada`,
    `${cleaned}, Lachenaie, Terrebonne, Québec, Canada`,
    `${cleaned}, Mascouche, Québec, Canada`,
    `${cleaned}, Repentigny, Québec, Canada`,
    `${cleaned}, Montréal, Québec, Canada`,
  ];

  return [...new Set(queries)];
}

async function geocode(address: string): Promise<GeocodeResult> {
  const queries = buildAddressQueries(address);

  for (const query of queries) {
    const url =
      "https://nominatim.openstreetmap.org/search?" +
      new URLSearchParams({
        q: query,
        format: "jsonv2",
        limit: "5",
        countrycodes: "ca",
        addressdetails: "1",
        dedupe: "1",
      });

    const response = await fetchWithTimeout(url, {
      headers: {
        "User-Agent":
          "TaxiLachenaie/1.0 (contact: taxilachenaie@gmail.com)",
        "Accept-Language": "fr-CA,fr;q=0.9,en;q=0.8",
      },
    });

    if (!response.ok) {
      continue;
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      continue;
    }

    const bestResult = data.find((item) => {
      const province =
        item?.address?.state ||
        item?.address?.province ||
        "";

      return String(province).toLowerCase().includes("québec");
    }) ?? data[0];

    const lat = Number(bestResult.lat);
    const lon = Number(bestResult.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }

    return {
      lat,
      lon,
      displayName:
        bestResult.display_name || query,
    };
  }

  throw new Error(`Adresse introuvable : ${address}`);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const origin =
      typeof body.origin === "string"
        ? cleanAddress(body.origin)
        : "";

    const destination =
      typeof body.destination === "string"
        ? cleanAddress(body.destination)
        : "";

    if (!origin || !destination) {
      return NextResponse.json(
        {
          success: false,
          error:
            "L’adresse de départ et la destination sont requises.",
        },
        { status: 400 }
      );
    }

    const [start, end] = await Promise.all([
      geocode(origin),
      geocode(destination),
    ]);

    const routeUrl =
      "https://router.project-osrm.org/route/v1/driving/" +
      `${start.lon},${start.lat};${end.lon},${end.lat}` +
      "?overview=false&steps=false&alternatives=false";

    const routeResponse = await fetchWithTimeout(
      routeUrl,
      {
        headers: {
          "User-Agent":
            "TaxiLachenaie/1.0 (contact: taxilachenaie@gmail.com)",
        },
      },
      15000
    );

    if (!routeResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Le service d’itinéraire est temporairement indisponible.",
        },
        { status: 502 }
      );
    }

    const routeData = await routeResponse.json();

    if (
      routeData.code !== "Ok" ||
      !Array.isArray(routeData.routes) ||
      routeData.routes.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Impossible de calculer un itinéraire routier entre ces deux adresses.",
        },
        { status: 400 }
      );
    }

    const route = routeData.routes[0];

    return NextResponse.json({
      success: true,
      distanceKm: Number(
        (Number(route.distance) / 1000).toFixed(1)
      ),
      durationMin: Math.max(
        1,
        Math.round(Number(route.duration) / 60)
      ),
      origin: {
        latitude: start.lat,
        longitude: start.lon,
        displayName: start.displayName,
      },
      destination: {
        latitude: end.lat,
        longitude: end.lon,
        displayName: end.displayName,
      },
    });
  } catch (error) {
    console.error("Erreur calcul trajet :", error);

    const message =
      error instanceof Error
        ? error.message
        : "Erreur inconnue";

    return NextResponse.json(
      {
        success: false,
        error:
          message.startsWith("Adresse introuvable")
            ? `${message}. Essaie avec le numéro civique, la rue, la ville et la province.`
            : "Le service de carte est temporairement indisponible. Réessaie dans quelques secondes.",
      },
      { status: 400 }
    );
  }
}