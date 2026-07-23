import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

async function getAuthenticatedUser(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return {
      user: null,
      error: "Autorisation manquante.",
    };
  }

  const accessToken = authorization.replace("Bearer ", "").trim();

  const {
    data,
    error,
  } = await supabaseServer.auth.getUser(accessToken);

  if (error || !data.user) {
    return {
      user: null,
      error: "Session chauffeur invalide ou expirée.",
    };
  }

  return {
    user: data.user,
    error: null,
  };
}
type FinishRideBody = {
  finalDistanceKm?: number;
  finalWaitingSeconds?: number;
  finalElapsedSeconds?: number;
  finalPrice?: number;
};

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const authentication = await getAuthenticatedUser(request);

if (!authentication.user) {
  return NextResponse.json(
    {
      success: false,
      error: authentication.error,
    },
    { status: 401 }
  );
}
    /*
     * Récupération et validation de l'identifiant
     */
    const { id } = await context.params;
    const reservationId = Number(id);

    if (
      !Number.isInteger(reservationId) ||
      reservationId <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Réservation invalide.",
        },
        { status: 400 }
      );
    }

    /*
     * Récupération des données finales du taximètre
     */
    const body = (await request.json()) as FinishRideBody;

    const finalDistanceKm = Number(body.finalDistanceKm);
    const finalWaitingSeconds = Number(
      body.finalWaitingSeconds
    );
    const finalElapsedSeconds = Number(
      body.finalElapsedSeconds
    );
    const finalPrice = Number(body.finalPrice);

    if (
      !Number.isFinite(finalDistanceKm) ||
      finalDistanceKm < 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Distance finale invalide.",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(finalWaitingSeconds) ||
      finalWaitingSeconds < 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Temps d'attente invalide.",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(finalElapsedSeconds) ||
      finalElapsedSeconds < 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Durée finale invalide.",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(finalPrice) ||
      finalPrice < 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Prix final invalide.",
        },
        { status: 400 }
      );
    }

    /*
     * Récupération de la réservation
     */
    const {
      data: reservation,
      error: reservationError,
    } = await supabaseServer
      .from("reservations")
      .select("*")
      .eq("id", reservationId)
      .single();

    if (reservationError || !reservation) {
      console.error(
        "Erreur récupération réservation :",
        reservationError
      );

      return NextResponse.json(
        {
          success: false,
          error: "Réservation introuvable.",
        },
        { status: 404 }
      );
    }

    /*
     * Si la course possède déjà une facture,
     * on évite de créer une deuxième facture.
     */
    if (reservation.invoice_id) {
      await supabaseServer
        .from("drivers")
        .update({
          status: "Disponible",
          current_reservation_id: null,
        })
        .eq("current_reservation_id", reservationId);

      return NextResponse.json({
        success: true,
        message: "La course était déjà terminée.",
        invoiceId: reservation.invoice_id,
      });
    }

    const finishedAt = new Date().toISOString();

    /*
     * Numéro de facture :
     * TL-AAAAMMJJ-ID
     */
    const invoiceNumber = `TL-${finishedAt
      .slice(0, 10)
      .replaceAll("-", "")}-${reservationId}`;

    /*
     * Mise à jour de la réservation
     */
    const { error: updateReservationError } =
      await supabaseServer
        .from("reservations")
        .update({
          status: "Terminée",
          meter_status: "finished",
          meter_distance_km: finalDistanceKm,
          meter_waiting_seconds: Math.floor(
            finalWaitingSeconds
          ),
          meter_elapsed_seconds: Math.floor(
            finalElapsedSeconds
          ),
          meter_current_price: finalPrice,
          final_price: finalPrice,
          payment_status: "Non payée",
          finished_at: finishedAt,
        })
        .eq("id", reservationId);

    if (updateReservationError) {
      console.error(
        "Erreur mise à jour réservation :",
        updateReservationError
      );

      throw new Error(updateReservationError.message);
    }

    /*
     * Création de la facture
     */
    const {
      data: invoice,
      error: invoiceError,
    } = await supabaseServer
      .from("invoices")
      .insert({
        reservation_id: reservationId,
        invoice_number: invoiceNumber,

        client_name: reservation.name ?? "",
        client_email: reservation.email ?? "",
        client_phone: reservation.phone ?? "",

        origin: reservation.origin ?? "",
        destination: reservation.destination ?? "",
        service: reservation.service ?? "standard",

        trip_date:
          reservation.trip_date ??
          reservation.date ??
          null,

        trip_time:
          reservation.trip_time ??
          reservation.time ??
          null,

        finished_at: finishedAt,

        distance_km: finalDistanceKm,

        waiting_seconds: Math.floor(
          finalWaitingSeconds
        ),

        elapsed_seconds: Math.floor(
          finalElapsedSeconds
        ),

        subtotal: finalPrice,
        tax_amount: 0,
        total_amount: finalPrice,

        payment_status: "Non payée",
        payment_method: null,
        status: "Créée",
      })
      .select()
      .single();

    if (invoiceError || !invoice) {
      console.error(
        "Erreur création facture :",
        invoiceError
      );

      throw new Error(
        invoiceError?.message ??
          "Impossible de créer la facture."
      );
    }

    /*
     * Liaison de la facture à la réservation
     */
    const { error: invoiceLinkError } =
      await supabaseServer
        .from("reservations")
        .update({
          invoice_id: invoice.id,
          final_price: finalPrice,
          payment_status: "Non payée",
        })
        .eq("id", reservationId);

    if (invoiceLinkError) {
      console.error(
        "Erreur liaison facture :",
        invoiceLinkError
      );

      throw new Error(invoiceLinkError.message);
    }

    /*
     * Le chauffeur redevient disponible
     */
    const { error: driverError } =
      await supabaseServer
        .from("drivers")
        .update({
          status: "Disponible",
          current_reservation_id: null,
        })
        .eq("current_reservation_id", reservationId);

    if (driverError) {
      console.error(
        "Erreur disponibilité chauffeur :",
        driverError
      );

      throw new Error(driverError.message);
    }

    return NextResponse.json({
      success: true,
      message: "Course terminée avec succès.",
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
    });
  } catch (error) {
    console.error(
      "Erreur API de fin de course :",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Impossible de terminer la course.",
      },
      { status: 500 }
    );
  }
}