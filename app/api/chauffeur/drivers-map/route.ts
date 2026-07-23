import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  try {
    const { data, error } = await supabaseServer
      .from("drivers")
      .select(`
        id,
        latitude,
        longitude,
        status,
        heading,
        speed,
        updated_at
      `)
      .not("latitude", "is", null)
      .not("longitude", "is", null);

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      drivers: data,
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        success: false,
        error: "Erreur serveur",
      },
      { status: 500 }
    );
  }
}