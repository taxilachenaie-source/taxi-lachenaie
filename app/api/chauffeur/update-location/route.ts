import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      driver_id,
      latitude,
      longitude,
      speed,
      heading,
    } = body;

    const { error } = await supabaseServer
      .from("drivers")
      .update({
        latitude,
        longitude,
        speed,
        heading,
        updated_at: new Date().toISOString(),
      })
      .eq("id", driver_id);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Erreur serveur",
      },
      {
        status: 500,
      }
    );
  }
}