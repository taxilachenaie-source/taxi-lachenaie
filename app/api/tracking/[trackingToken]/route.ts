import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

type RouteContext = {
  params: Promise<{
    trackingToken: string;
  }>;
};

function toValidNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(
  request: Request,
  { params }: RouteContext
) {
  void request;

  try {
    const { trackingToken } = await params;
    const cleanTrackingToken = trackingToken?.trim();

    if (!cleanTrackingToken) {
      return NextResponse.json(
        {
          success: false,
          error: "Lien de suivi invalide.",
        },
        { status: 400 }
      );
    }

    /*
     * Dans la base de données, la durée s’appelle "duration".
     * L’alias "minutes:duration" permet à la page client
     * de continuer à utiliser reservation.minutes.
     */
    const {
      data: reservation,
      error: reservationError,
    } = await supabaseServer
      .from("reservations")
      .select(`
        id,
        name,
        origin,
        destination,
        trip_date,
        trip_time,
        service,
        distance,
        minutes:duration,
        price,
        status,
        tracking_status,
        tracking_enabled,
        driver_id,
        latitude,
        longitude,
        scheduled_at,
        dispatch_at,
        dispatched_at,
        accepted_at,
        driver_arrived_at,
        trip_started_at,
        trip_completed_at
      `)
      .eq("tracking_token", cleanTrackingToken)
      .maybeSingle();

    if (reservationError) {
      console.error(
        "Erreur récupération réservation de suivi :",
        reservationError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Impossible de récupérer cette réservation.",
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

    const clientLatitude = toValidNumber(
      reservation.latitude
    );

    const clientLongitude = toValidNumber(
      reservation.longitude
    );

    /*
     * Le suivi GPS devient visible seulement après
     * l’acceptation réelle d’un chauffeur.
     */
    const trackingEnabled =
      reservation.tracking_enabled === true &&
      Boolean(reservation.driver_id) &&
      reservation.status !== "Terminée";

    const safeReservation = {
      id: reservation.id,
      name: reservation.name,
      origin: reservation.origin,
      destination: reservation.destination,
      trip_date: reservation.trip_date,
      trip_time: reservation.trip_time,
      service: reservation.service,
      distance: reservation.distance,
      minutes: reservation.minutes,
      price: reservation.price,
      status: reservation.status,

      tracking_status:
        reservation.tracking_status ||
        (reservation.status === "Programmée"
          ? "Réservation programmée"
          : trackingEnabled
            ? "Chauffeur en route"
            : "En attente d’un chauffeur"),

      tracking_enabled: trackingEnabled,

      driver_id: trackingEnabled
        ? reservation.driver_id
        : null,

      latitude: clientLatitude,
      longitude: clientLongitude,

      scheduled_at: reservation.scheduled_at,
      dispatch_at: reservation.dispatch_at,
      dispatched_at: reservation.dispatched_at,
      accepted_at: reservation.accepted_at,
      driver_arrived_at:
        reservation.driver_arrived_at,
      trip_started_at: reservation.trip_started_at,
      trip_completed_at:
        reservation.trip_completed_at,
    };

    /*
     * Avant l’acceptation, aucune donnée du chauffeur
     * n’est exposée au client.
     */
    if (!trackingEnabled) {
      return NextResponse.json({
        success: true,
        tracking_enabled: false,
        reservation: safeReservation,
        driver: null,
        server_time: new Date().toISOString(),
      });
    }

    const {
      data: driver,
      error: driverError,
    } = await supabaseServer
      .from("drivers")
      .select(`
        id,
        name,
        vehicle,
        plate,
        status,
        current_position,
        latitude,
        longitude,
        speed,
        heading,
        last_location_at
      `)
      .eq("id", reservation.driver_id)
      .maybeSingle();

    if (driverError) {
      console.error(
        "Erreur récupération chauffeur de suivi :",
        driverError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Impossible de récupérer la position du chauffeur.",
        },
        { status: 500 }
      );
    }

    const driverLatitude = toValidNumber(
      driver?.latitude
    );

    const driverLongitude = toValidNumber(
      driver?.longitude
    );

    const hasValidLocation =
      driverLatitude !== null &&
      driverLongitude !== null;

    const safeDriver = driver
      ? {
          id: driver.id,
          name: driver.name,
          vehicle: driver.vehicle,
          plate: driver.plate,
          status: driver.status,
          current_position:
            driver.current_position,

          latitude: hasValidLocation
            ? driverLatitude
            : null,

          longitude: hasValidLocation
            ? driverLongitude
            : null,

          speed: toValidNumber(driver.speed),
          heading: toValidNumber(driver.heading),

          last_location_at:
            driver.last_location_at,

          has_valid_location: hasValidLocation,
        }
      : null;

    return NextResponse.json({
      success: true,
      tracking_enabled: true,
      reservation: safeReservation,
      driver: safeDriver,
      server_time: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Erreur API suivi client :", error);

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