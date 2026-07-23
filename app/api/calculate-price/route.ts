import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

function isNightTime(time: string) {
  const hour = Number(time.split(":")[0]);
  return hour >= 23 || hour < 5;
}

function isYulAirport(text: string) {
  const value = text.toLowerCase();

  return (
    value.includes("yul") ||
    value.includes("aéroport montréal") ||
    value.includes("aeroport montreal") ||
    value.includes("trudeau") ||
    value.includes("pierre elliott")
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const origin = String(body.origin || "");
    const destination = String(body.destination || "");
    const tripTime = String(body.trip_time || "");
    const vehicleType = String(body.vehicle_type || "Berline");

    const airportTrip = isYulAirport(origin) || isYulAirport(destination);

    if (!airportTrip) {
      return NextResponse.json({
        success: true,
        type: "regular",
        price: null,
        message: "Tarif régulier à calculer avec distance et durée.",
      });
    }

    const addressToCheck = isYulAirport(origin) ? destination : origin;

    const { data: zones, error: zonesError } = await supabaseServer
  .from("airport_rate_zones")
  .select("*");

    if (zonesError) {
      return NextResponse.json(
        { success: false, error: zonesError.message },
        { status: 500 }
      );
    }

    const foundZone = (zones || []).find((zone) =>
  zone.cities?.some((city: string) =>
    addressToCheck.toLowerCase().includes(city.toLowerCase())
  )
);

    if (!foundZone) {
      return NextResponse.json({
        success: true,
        type: "airport_unknown_zone",
        price: null,
        message: "Aéroport détecté, mais la ville n'est pas dans les zones.",
      });
    }

    const { data: rate, error: rateError } = await supabaseServer
      .from("airport_rates")
      .select("*")
      .eq("zone_id", foundZone.id)
      .eq("vehicle_type", vehicleType)
      .single();

    if (rateError || !rate) {
      return NextResponse.json({
        success: true,
        type: "airport_missing_rate",
        price: null,
        message: "Zone trouvée, mais tarif introuvable.",
        zone: foundZone,
      });
    }

    const night = isNightTime(tripTime);
    const price = night ? Number(rate.night_price) : Number(rate.day_price);

    return NextResponse.json({
      success: true,
      type: "airport_fixed",
      price,
      zone: foundZone.name,
      city: foundZone.cities?.join(", "),
      vehicle_type: vehicleType,
      period: night ? "nuit" : "jour",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, error: "Erreur serveur" },
      { status: 500 }
    );
  }
}