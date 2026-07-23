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

    const token = authorization.slice("Bearer ".length).trim();

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: "Jeton d’authentification manquant.",
        },
        { status: 401 }
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseServer.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Session invalide ou expirée.",
        },
        { status: 401 }
      );
    }

    const {
      data: driver,
      error: driverError,
    } = await supabaseServer
      .from("drivers")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (driverError) {
      console.error(
        "Erreur récupération chauffeur :",
        driverError
      );

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

    const {
      data: reservation,
      error: reservationError,
    } = await supabaseServer
      .from("reservations")
      .select("id, driver_id, status, destination")
      .eq("id", reservationId)
      .maybeSingle();

    if (reservationError) {
      console.error(
        "Erreur récupération réservation :",
        reservationError
      );

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

    if (reservation.status !== "Chauffeur arrivé") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Vous devez confirmer votre arrivée avant de démarrer la course.",
        },
        { status: 409 }
      );
    }

    const startedAt = new Date().toISOString();

    const {
      data: updatedReservation,
      error: updateError,
    } = await supabaseServer
      .from("reservations")
      .update({
        status: "En cours",
        tracking_status: "Course en cours",
        trip_started_at: startedAt,
        tracking_enabled: true,
      })
      .eq("id", reservationId)
      .eq("driver_id", driver.id)
      .eq("status", "Chauffeur arrivé")
      .select("*")
      .maybeSingle();

    if (updateError) {
      console.error(
        "Erreur démarrage réservation :",
        updateError
      );

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
          error:
            "La course n’a pas pu être démarrée. Son statut a peut-être déjà changé.",
        },
        { status: 409 }
      );
    }

    const destination =
      reservation.destination?.trim() || "destination";

    const { error: driverUpdateError } =
      await supabaseServer
        .from("drivers")
        .update({
          status: "Occupé",
          current_position: `Course en cours vers ${destination}`,
          current_trip_id: reservationId,
        })
        .eq("id", driver.id);

    if (driverUpdateError) {
      console.error(
        "Erreur mise à jour chauffeur :",
        driverUpdateError
      );

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
      message: "Course démarrée.",
      reservation: updatedReservation,
    });
  } catch (error) {
    console.error("Erreur démarrage course :", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Erreur serveur.",
      },
      { status: 500 }
    );
  }
}