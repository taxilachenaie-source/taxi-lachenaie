import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const {
      clientLatitude,
      clientLongitude,
      driverLatitude,
      driverLongitude,
    } = await request.json();

    if (
      clientLatitude == null ||
      clientLongitude == null ||
      driverLatitude == null ||
      driverLongitude == null
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Coordonnées manquantes",
        },
        { status: 400 }
      );
    }

    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${driverLongitude},${driverLatitude};` +
      `${clientLongitude},${clientLatitude}` +
      `?overview=full&geometries=geojson`;

    const response = await fetch(url);

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Impossible de calculer l'itinéraire",
        },
        { status: 500 }
      );
    }

    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Aucun itinéraire trouvé",
        },
        { status: 404 }
      );
    }

    const route = data.routes[0];

    return NextResponse.json({
      success: true,
      distanceKm: route.distance / 1000,
      durationMin: Math.round(route.duration / 60),
      geometry: route.geometry,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error: "Erreur serveur",
      },
      { status: 500 }
    );
  }
}