import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(
  request: Request,
  { params }: RouteContext
) {
  try {
    const { id } = await params;
    const reservationId = Number(id);

    if (!Number.isInteger(reservationId) || reservationId <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Réservation invalide.",
        },
        { status: 400 }
      );
    }

    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentification requise.",
        },
        { status: 401 }
      );
    }

    const token = authorization.replace("Bearer ", "");

    const {
      data: { user },
      error: userError,
    } = await supabaseServer.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Session invalide.",
        },
        { status: 401 }
      );
    }

    const { data: driver, error: driverError } =
      await supabaseServer
        .from("drivers")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();

    if (driverError) {
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
          error: "Aucun chauffeur lié à ce compte.",
        },
        { status: 403 }
      );
    }

    const { data: reservation, error: reservationError } =
      await supabaseServer
        .from("reservations")
        .select("id, driver_id, status")
        .eq("id", reservationId)
        .maybeSingle();

    if (reservationError) {
      return NextResponse.json(
        {
          success: false,
          error: reservationError.message,
        },
        { status: 500 }
      );
    }

    if (!reservation) {
      return NextResponse.json(
        {
          success: false,
          error: "Réservation introuvable.",
        },
        { status: 404 }
      );
    }

    if (Number(reservation.driver_id) !== Number(driver.id)) {
      return NextResponse.json(
        {
          success: false,
          error: "Cette course ne vous est pas assignée.",
        },
        { status: 403 }
      );
    }

    if (reservation.status !== "Acceptée") {
      return NextResponse.json(
        {
          success: false,
          error:
            "La course doit être acceptée avant de confirmer votre arrivée.",
        },
        { status: 409 }
      );
    }

    // Mise à jour de la réservation
    const {
      data: updatedReservation,
      error: updateError,
    } = await supabaseServer
      .from("reservations")
      .update({
        status: "Chauffeur arrivé",
        tracking_status: "Votre chauffeur est arrivé",
        driver_arrived_at: new Date().toISOString(),
      })
      .eq("id", reservationId)
      .eq("driver_id", driver.id)
      .eq("status", "Acceptée")
      .select("*")
      .maybeSingle();

    if (updateError) {
      return NextResponse.json(
        {
          success: false,
          error: updateError.message,
        },
        { status: 500 }
      );
    }

    if (!updatedReservation) {
      return NextResponse.json(
        {
          success: false,
          error: "Impossible de confirmer l'arrivée.",
        },
        { status: 409 }
      );
    }

    // Mise à jour du chauffeur
    const { error: driverUpdateError } =
      await supabaseServer
        .from("drivers")
        .update({
          status: "Occupé",
          current_position: "Arrivé au point de départ",
        })
        .eq("id", driver.id);

    if (driverUpdateError) {
      return NextResponse.json(
        {
          success: false,
          error: driverUpdateError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Arrivée confirmée.",
      reservation: updatedReservation,
    });

  } catch (error) {
    console.error(
      "Erreur confirmation arrivée :",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: "Erreur serveur.",
      },
      { status: 500 }
    );
  }
}