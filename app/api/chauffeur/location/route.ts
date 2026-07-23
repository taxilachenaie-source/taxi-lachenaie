import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: "Non autorisé" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    const {
      data: { user },
      error: userError,
    } = await supabaseServer.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Utilisateur invalide" },
        { status: 401 }
      );
    }

    const body = await request.json();

    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const speed = body.speed ? Number(body.speed) : 0;

    if (!latitude || !longitude) {
      return NextResponse.json(
        { success: false, error: "Coordonnées invalides" },
        { status: 400 }
      );
    }

    const { data: driver, error: driverError } = await supabaseServer
      .from("drivers")
      .select("id")
      .eq("auth_user_id", user.id)
      .single();

    if (driverError || !driver) {
      return NextResponse.json(
        { success: false, error: "Chauffeur introuvable" },
        { status: 404 }
      );
    }

    const { error } = await supabaseServer
      .from("drivers")
      .update({
        latitude,
        longitude,
        speed,
        last_location_at: new Date().toISOString(),
      })
      .eq("id", driver.id);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Position mise à jour",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, error: "Erreur serveur" },
      { status: 500 }
    );
  }
}