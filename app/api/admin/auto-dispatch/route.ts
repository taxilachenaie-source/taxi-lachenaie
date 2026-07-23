import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { rankDrivers } from "@/lib/dispatch-engine";
import { logDispatchEvent } from "@/lib/dispatch-logger";
import { sendDriverPush } from "@/lib/send-driver-push";
import { requireAdmin } from "@/lib/admin-auth";

function toValidDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(request: Request) {
  try {
const auth = await requireAdmin(request);

if (!auth.success) {
  return NextResponse.json(
    {
      success: false,
      error: auth.error,
    },
    {
      status: auth.status,
    }
  );
}

    const body = await request.json();
    const reservationId = Number(body.reservation_id);

    if (!Number.isInteger(reservationId) || reservationId <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Réservation invalide.",
        },
        { status: 400 }
      );
    }

    /*
     * 1. Récupérer la réservation.
     */
    const {
      data: reservation,
      error: reservationError,
    } = await supabaseServer
      .from("reservations")
      .select("*")
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

    if (reservation.status === "Terminée") {
      return NextResponse.json(
        {
          success: false,
          error: "Cette réservation est déjà terminée.",
        },
        { status: 400 }
      );
    }

    /*
     * Une réservation programmée ne peut être distribuée
     * qu'à partir de dispatch_at, normalement 30 minutes
     * avant scheduled_at. Cette règle s'applique aussi au
     * bouton Auto-dispatch de l'administration.
     */
    const now = new Date();
    const explicitDispatchAt = toValidDate(reservation.dispatch_at);
    const scheduledAt = toValidDate(reservation.scheduled_at);

    const effectiveDispatchAt =
      explicitDispatchAt ||
      (scheduledAt
        ? new Date(scheduledAt.getTime() - 30 * 60 * 1000)
        : null);

    if (reservation.status === "Programmée" && !effectiveDispatchAt) {
      return NextResponse.json(
        {
          success: false,
          code: "DISPATCH_TIME_MISSING",
          error:
            "Cette réservation programmée ne possède pas une heure de dispatch valide.",
        },
        { status: 409 }
      );
    }

    if (effectiveDispatchAt && now.getTime() < effectiveDispatchAt.getTime()) {
      const millisecondsRemaining =
        effectiveDispatchAt.getTime() - now.getTime();

      const minutesRemaining = Math.max(
        1,
        Math.ceil(millisecondsRemaining / 60_000)
      );

      return NextResponse.json(
        {
          success: false,
          code: "DISPATCH_TOO_EARLY",
          error:
            "Cette course est programmée. Le dispatch sera disponible environ 30 minutes avant le départ.",
          dispatch_at: effectiveDispatchAt.toISOString(),
          minutes_remaining: minutesRemaining,
        },
        { status: 409 }
      );
    }

    if (
      reservation.status === "Acceptée" ||
      reservation.status === "Chauffeur arrivé" ||
      reservation.status === "En cours"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Cette réservation est déjà acceptée ou en cours.",
        },
        { status: 409 }
      );
    }

    /*
     * 2. Empêcher plusieurs propositions simultanées.
     */
    const {
      data: existingNotification,
      error: existingNotificationError,
    } = await supabaseServer
      .from("driver_notifications")
      .select("id, driver_id, status")
      .eq("reservation_id", reservationId)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();

    if (existingNotificationError) {
      return NextResponse.json(
        {
          success: false,
          error: existingNotificationError.message,
        },
        { status: 500 }
      );
    }

    if (existingNotification) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Cette course est déjà proposée à un chauffeur.",
        },
        { status: 409 }
      );
    }

    /*
     * 3. Récupérer tous les chauffeurs.
     */
    const {
      data: drivers,
      error: driversError,
    } = await supabaseServer
      .from("drivers")
      .select("*");

    if (driversError) {
      return NextResponse.json(
        {
          success: false,
          error: driversError.message,
        },
        { status: 500 }
      );
    }

    /*
     * 4. Classer les chauffeurs admissibles.
     */
    const rankedDrivers = rankDrivers(
      reservation,
      drivers || []
    );

    if (rankedDrivers.length === 0) {
      await logDispatchEvent(
        reservationId,
        null,
        "NO_DRIVER_AVAILABLE",
        "Aucun chauffeur admissible pour cette réservation"
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Aucun chauffeur admissible ou disponible.",
        },
        { status: 404 }
      );
    }

    const selectedDriver = rankedDrivers[0].driver;

    const driverOrder = rankedDrivers.map(
      (item) => item.driver.id
    );

    /*
     * 5. Supprimer une ancienne file de dispatch.
     */
    const { error: deleteQueueError } =
      await supabaseServer
        .from("dispatch_queue")
        .delete()
        .eq("reservation_id", reservationId);

    if (deleteQueueError) {
      return NextResponse.json(
        {
          success: false,
          error: deleteQueueError.message,
        },
        { status: 500 }
      );
    }

    /*
     * 6. Créer la nouvelle file de dispatch.
     */
    const assignedAt = new Date().toISOString();

    const {
      data: createdQueue,
      error: queueError,
    } = await supabaseServer
      .from("dispatch_queue")
      .insert([
        {
          reservation_id: reservationId,
          driver_order: driverOrder,
          current_index: 0,
          status: "waiting",
          assigned_at: assignedAt,
        },
      ])
      .select("*")
      .single();

    if (queueError || !createdQueue) {
      return NextResponse.json(
        {
          success: false,
          error:
            queueError?.message ||
            "Impossible de créer la file de dispatch.",
        },
        { status: 500 }
      );
    }

    /*
     * 7. Réserver temporairement le chauffeur.
     *
     * La mise à jour fonctionne seulement si le chauffeur
     * est encore disponible au moment exact du dispatch.
     */
    const {
      data: reservedDriver,
      error: driverUpdateError,
    } = await supabaseServer
      .from("drivers")
      .update({
        status: "En attente",
        current_position: `Course proposée - ${reservation.origin}`,
      })
      .eq("id", selectedDriver.id)
      .eq("status", "Disponible")
      .select("*")
      .maybeSingle();

    if (driverUpdateError || !reservedDriver) {
      await supabaseServer
        .from("dispatch_queue")
        .delete()
        .eq("reservation_id", reservationId);

      return NextResponse.json(
        {
          success: false,
          error:
            driverUpdateError?.message ||
            "Le chauffeur sélectionné n’est plus disponible.",
        },
        { status: 409 }
      );
    }

    /*
     * 8. Associer temporairement la réservation au chauffeur.
     *
     * Le statut reste Nouvelle jusqu’à ce que le chauffeur
     * clique sur Accepter.
     */
    const {
      data: updatedReservation,
      error: reservationUpdateError,
    } = await supabaseServer
      .from("reservations")
      .update({
        driver_id: selectedDriver.id,
        status: "Nouvelle",
        tracking_status: "Recherche chauffeur",
        tracking_enabled: false,
        dispatched_at: assignedAt,
      })
      .eq("id", reservationId)
      .select("*")
      .maybeSingle();

    if (
      reservationUpdateError ||
      !updatedReservation
    ) {
      await supabaseServer
        .from("drivers")
        .update({
          status: "Disponible",
          current_position: "Disponible",
        })
        .eq("id", selectedDriver.id);

      await supabaseServer
        .from("dispatch_queue")
        .delete()
        .eq("reservation_id", reservationId);

      return NextResponse.json(
        {
          success: false,
          error:
            reservationUpdateError?.message ||
            "Impossible de mettre à jour la réservation.",
        },
        { status: 500 }
      );
    }

    /*
     * 9. Créer la notification interne du chauffeur.
     */
    const {
      data: createdNotification,
      error: notificationError,
    } = await supabaseServer
      .from("driver_notifications")
      .insert([
        {
          driver_id: selectedDriver.id,
          reservation_id: reservationId,
          status: "pending",
        },
      ])
      .select("*")
      .single();

    if (
      notificationError ||
      !createdNotification
    ) {
      await supabaseServer
        .from("drivers")
        .update({
          status: "Disponible",
          current_position: "Disponible",
        })
        .eq("id", selectedDriver.id);

      await supabaseServer
        .from("reservations")
        .update({
          driver_id: null,
          status: "Nouvelle",
          tracking_status: "Recherche chauffeur",
        })
        .eq("id", reservationId);

      await supabaseServer
        .from("dispatch_queue")
        .delete()
        .eq("reservation_id", reservationId);

      return NextResponse.json(
        {
          success: false,
          error:
            notificationError?.message ||
            "Impossible de créer la notification chauffeur.",
        },
        { status: 500 }
      );
    }

    /*
     * 10. Envoyer la notification Push Firebase.
     *
     * Une erreur Push ne doit pas annuler l’attribution :
     * le chauffeur peut toujours voir la course dans son espace.
     */
    const pushResult = await sendDriverPush({
      driverId: selectedDriver.id,
      reservationId,
      clientName:
        reservation.name || "Nouveau client",
      origin: reservation.origin || "",
      destination: reservation.destination || "",
      price: Number(reservation.price || 0),
    });

    if (!pushResult.success) {
      console.error(
        "Notification Push non envoyée :",
        pushResult.error
      );
    } else {
      console.log(
        "Notification Push envoyée :",
        pushResult.messageId
      );
    }

    /*
     * 11. Journaliser l’événement.
     */
    await logDispatchEvent(
      reservationId,
      selectedDriver.id,
      "AUTO_DISPATCH",
      `Course proposée automatiquement à ${selectedDriver.name}`
    );

    /*
     * 12. Réponse finale.
     */
    return NextResponse.json({
      success: true,
      message: `Course proposée à ${selectedDriver.name}`,
      driver: reservedDriver,
      reservation: updatedReservation,
      notification: createdNotification,
      pushSent: pushResult.success,
      pushError: pushResult.success
        ? null
        : pushResult.error,
      driverOrder,
      ranking: rankedDrivers.map(
        (item, index) => ({
          rank: index + 1,
          driver_id: item.driver.id,
          driver_name: item.driver.name,
          distance_km: Number(
            item.distanceKm || 0
          ).toFixed(2),
          score: Number(
            item.score || 0
          ).toFixed(2),
        })
      ),
    });
  } catch (error) {
    console.error(
      "Erreur auto-dispatch :",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Erreur serveur pendant l’auto-dispatch.",
      },
      { status: 500 }
    );
  }
}