import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          success: false,
          error: "Non connecté",
        },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error("Erreur Auth :", userError);

      return NextResponse.json(
        {
          success: false,
          error: "Session invalide",
        },
        { status: 401 }
      );
    }

    const { data: driver, error: driverError } = await supabase
      .from("drivers")
      .select("*")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (driverError) {
      console.error("Erreur chauffeur :", driverError);

      return NextResponse.json(
        {
          success: false,
          error: driverError.message,
        },
        { status: 500 }
      );
    }

    if (!driver) {
      return NextResponse.json(
        {
          success: false,
          error: "Aucun chauffeur relié à ce compte",
          user_id: user.id,
        },
        { status: 404 }
      );
    }

    const { data: reservation, error: reservationError } = await supabase
      .from("reservations")
      .select("*")
      .eq("driver_id", driver.id)
      .in("status", ["Acceptée", "En cours"])
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (reservationError) {
      console.error("Erreur réservation :", reservationError);

      return NextResponse.json(
        {
          success: false,
          error: reservationError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      driver,
      trip: reservation ?? null,
    });
  } catch (error) {
    console.error("Erreur current-trip :", error);

    return NextResponse.json(
      {
        success: false,
        error: "Erreur serveur",
      },
      { status: 500 }
    );
  }
}