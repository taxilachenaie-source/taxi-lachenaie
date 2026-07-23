import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader) {
      return NextResponse.json(
        {
          success: false,
          error: "Non autorisé",
        },
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
        {
          success: false,
          error: "Utilisateur invalide",
        },
        { status: 401 }
      );
    }

    // Recherche du chauffeur connecté
    const { data: driver, error: driverError } = await supabaseServer
      .from("drivers")
      .select("*")
      .eq("auth_user_id", user.id)
      .single();

    if (driverError || !driver) {
      console.log("❌ Chauffeur introuvable");
      console.log(driverError);

      return NextResponse.json(
        {
          success: false,
          error: "Chauffeur introuvable",
        },
        { status: 404 }
      );
    }

    console.log("========== API CHAUFFEUR ==========");
    console.log("USER ID =", user.id);
    console.log("DRIVER =", driver);

    // Recherche des courses du chauffeur
    const { data: reservations, error: reservationsError } =
      await supabaseServer
        .from("reservations")
        .select("*")
        .eq("driver_id", driver.id)
        .order("trip_date", { ascending: true })
        .order("trip_time", { ascending: true });

    if (reservationsError) {
      console.log(reservationsError);

      return NextResponse.json(
        {
          success: false,
          error: reservationsError.message,
        },
        { status: 500 }
      );
    }

    console.log("RESERVATIONS =", reservations);
    console.log("===================================");

    return NextResponse.json({
      success: true,
      driver,
      reservations,
    });
  } catch (error) {
    console.error("Erreur API chauffeur :", error);

    return NextResponse.json(
      {
        success: false,
        error: "Erreur serveur",
      },
      { status: 500 }
    );
  }
}