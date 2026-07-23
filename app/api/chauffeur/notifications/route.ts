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
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
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
      .select("id, name, auth_user_id")
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
        },
        { status: 404 }
      );
    }

    const { data: notification, error: notificationError } = await supabase
      .from("driver_notifications")
      .select("*")
      .eq("driver_id", driver.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (notificationError) {
      console.error("Erreur notification :", notificationError);

      return NextResponse.json(
        {
          success: false,
          error: notificationError.message,
        },
        { status: 500 }
      );
    }

    if (!notification) {
      return NextResponse.json({
        success: true,
        notification: null,
      });
    }

    const { data: reservation, error: reservationError } = await supabase
      .from("reservations")
      .select("*")
      .eq("id", notification.reservation_id)
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

    if (!reservation) {
      return NextResponse.json({
        success: true,
        notification: null,
      });
    }

    return NextResponse.json({
      success: true,
      notification: {
        ...notification,
        reservations: reservation,
      },
    });
  } catch (error) {
    console.error("Erreur notifications chauffeur :", error);

    return NextResponse.json(
      {
        success: false,
        error: "Erreur serveur",
      },
      { status: 500 }
    );
  }
}