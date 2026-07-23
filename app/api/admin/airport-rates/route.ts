import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  try {
    const { data: rates, error: ratesError } = await supabaseServer
      .from("airport_rates")
      .select("*")
      .order("zone_id", { ascending: true })
      .order("vehicle_type", { ascending: true });

    if (ratesError) {
      return NextResponse.json(
        { success: false, error: ratesError.message },
        { status: 500 }
      );
    }

    const { data: zones, error: zonesError } = await supabaseServer
      .from("airport_rate_zones")
      .select("*")
      .order("id", { ascending: true });

    if (zonesError) {
      return NextResponse.json(
        { success: false, error: zonesError.message },
        { status: 500 }
      );
    }

    const formattedRates = (rates || []).map((rate) => {
      const zone = (zones || []).find((z) => z.id === rate.zone_id);

      return {
        ...rate,
        airport_zones: {
          name: zone?.name || `Zone ${rate.zone_id}`,
          city: zone?.cities?.join(", ") || "Villes inconnues",
        },
      };
    });

    return NextResponse.json({
      success: true,
      rates: formattedRates,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, error: "Erreur serveur" },
      { status: 500 }
    );
  }
}