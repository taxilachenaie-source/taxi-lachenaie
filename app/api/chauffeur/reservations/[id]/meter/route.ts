import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

type MeterPayload = {
  meterStatus?: "running" | "paused";
  distanceKm?: number;
  waitingSeconds?: number;
  elapsedSeconds?: number;
  currentPrice?: number;
  latitude?: number | null;
  longitude?: number | null;
};

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    /*
     * 1. Vérifier l’identifiant de la réservation.
     */
    const { id } = await context.params;
    const reservationId = Number(id);

    if (!Number.isInteger(reservationId) || reservationId <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Identifiant de réservation invalide.",
        },
        { status: 400 }
      );
    }

    /*
     * 2. Vérifier la session Supabase.
     */
    const authorization =
      request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          success: false,
          error: "Session chauffeur manquante.",
        },
        { status: 401 }
      );
    }

    const accessToken = authorization
      .slice("Bearer ".length)
      .trim();

    if (!accessToken) {
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
    } = await supabaseServer.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Session chauffeur invalide ou expirée.",
        },
        { status: 401 }
      );
    }

    /*
     * 3. Trouver le chauffeur associé au compte connecté.
     */
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
          error: "Impossible de récupérer le chauffeur.",
        },
        { status: 500 }
      );
    }

    if (!driver) {
      return NextResponse.json(
        {
          success: false,
          error: "Chauffeur introuvable.",
        },
        { status: 404 }
      );
    }

    /*
     * 4. Lire et valider les données envoyées.
     */
    let body: MeterPayload;

    try {
      body = (await request.json()) as MeterPayload;
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Données JSON invalides.",
        },
        { status: 400 }
      );
    }

    if (
      body.meterStatus !== "running" &&
      body.meterStatus !== "paused"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "État du taximètre invalide.",
        },
        { status: 400 }
      );
    }

    const distanceKm = validateNumber(
      body.distanceKm,
      "distance",
      0,
      2000
    );

    const waitingSeconds = Math.floor(
      validateNumber(
        body.waitingSeconds,
        "temps d’attente",
        0,
        86400
      )
    );

    const elapsedSeconds = Math.floor(
      validateNumber(
        body.elapsedSeconds,
        "durée",
        0,
        86400
      )
    );

    const currentPrice = validateNumber(
      body.currentPrice,
      "prix",
      0,
      10000
    );

    const latitude = validateCoordinate(
      body.latitude,
      -90,
      90
    );

    const longitude = validateCoordinate(
      body.longitude,
      -180,
      180
    );

    /*
     * 5. Vérifier la réservation et ses valeurs actuelles.
     */
    const {
      data: reservation,
      error: reservationError,
    } = await supabaseServer
      .from("reservations")
      .select(`
        id,
        driver_id,
        status,
        meter_distance_km,
        meter_waiting_seconds,
        meter_elapsed_seconds,
        meter_current_price
      `)
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
          error: "Impossible de récupérer la réservation.",
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

    if (
      Number(reservation.driver_id) !== Number(driver.id)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Cette réservation n’est pas assignée à ce chauffeur.",
        },
        { status: 403 }
      );
    }

    if (reservation.status !== "En cours") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Le taximètre peut être modifié uniquement pendant une course en cours.",
        },
        { status: 409 }
      );
    }

    /*
     * Une ancienne requête ne doit pas diminuer les valeurs
     * déjà enregistrées par une sauvegarde plus récente.
     */
    const safeDistanceKm = Math.max(
      normalizeStoredNumber(
        reservation.meter_distance_km
      ),
      distanceKm
    );

    const safeWaitingSeconds = Math.max(
      normalizeStoredNumber(
        reservation.meter_waiting_seconds
      ),
      waitingSeconds
    );

    const safeElapsedSeconds = Math.max(
      normalizeStoredNumber(
        reservation.meter_elapsed_seconds
      ),
      elapsedSeconds
    );

    const safeCurrentPrice = Math.max(
      normalizeStoredNumber(
        reservation.meter_current_price
      ),
      currentPrice
    );

    const updateData = {
      meter_status: body.meterStatus,
      meter_distance_km: safeDistanceKm,
      meter_waiting_seconds: safeWaitingSeconds,
      meter_elapsed_seconds: safeElapsedSeconds,
      meter_current_price: safeCurrentPrice,
      meter_last_latitude: latitude,
      meter_last_longitude: longitude,
      meter_last_updated_at: new Date().toISOString(),
    };

    /*
     * 6. Mettre à jour seulement si la réservation appartient
     * toujours au chauffeur et demeure en cours.
     */
    const {
      data: updatedReservation,
      error: updateError,
    } = await supabaseServer
      .from("reservations")
      .update(updateData)
      .eq("id", reservationId)
      .eq("driver_id", driver.id)
      .eq("status", "En cours")
      .select(`
        id,
        meter_status,
        meter_distance_km,
        meter_waiting_seconds,
        meter_elapsed_seconds,
        meter_current_price,
        meter_last_latitude,
        meter_last_longitude,
        meter_last_updated_at
      `)
      .maybeSingle();

    if (updateError) {
      console.error(
        "Erreur mise à jour taximètre :",
        updateError
      );

      return NextResponse.json(
        {
          success: false,
          error: "Impossible de sauvegarder le taximètre.",
        },
        { status: 500 }
      );
    }

    if (!updatedReservation) {
      return NextResponse.json(
        {
          success: false,
          error:
            "La course n’est plus disponible ou n’est plus en cours.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      reservation: updatedReservation,
      server_time: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "Erreur sauvegarde taximètre :",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Erreur serveur pendant la sauvegarde du taximètre.",
      },
      { status: 500 }
    );
  }
}

function validateNumber(
  value: unknown,
  fieldName: string,
  minimum: number,
  maximum: number
): number {
  const parsed = Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    throw new Error(
      `Valeur invalide pour le champ ${fieldName}.`
    );
  }

  return parsed;
}

function validateCoordinate(
  value: unknown,
  minimum: number,
  maximum: number
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    return null;
  }

  return parsed;
}

function normalizeStoredNumber(
  value: unknown
): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}