import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logDispatchEvent } from "@/lib/dispatch-logger";
import { requireAdmin } from "@/lib/admin-auth";

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

    const { data: queue, error: queueError } = await supabaseServer
      .from("dispatch_queue")
      .select("*")
      .eq("reservation_id", reservationId)
      .maybeSingle();

    if (queueError) {
      return NextResponse.json(
        {
          success: false,
          error: queueError.message,
        },
        { status: 500 }
      );
    }

    if (!queue) {
      return NextResponse.json(
        {
          success: false,
          error: "File de dispatch introuvable.",
        },
        { status: 404 }
      );
    }

    const { data: reservation, error: reservationError } =
      await supabaseServer
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

    const currentDriverId = reservation.driver_id
      ? Number(reservation.driver_id)
      : null;

    /*
     * 1. Libérer le chauffeur précédent
     */
    if (currentDriverId) {
      const { error: releaseDriverError } = await supabaseServer
        .from("drivers")
        .update({
          status: "Disponible",
          current_position: "Disponible",
        })
        .eq("id", currentDriverId);

      if (releaseDriverError) {
        return NextResponse.json(
          {
            success: false,
            error: releaseDriverError.message,
          },
          { status: 500 }
        );
      }

      /*
       * Fermer toute ancienne notification encore pending
       */
      const { error: expireNotificationError } = await supabaseServer
        .from("driver_notifications")
        .update({
          status: "refused",
          refused_at: new Date().toISOString(),
        })
        .eq("reservation_id", reservationId)
        .eq("driver_id", currentDriverId)
        .eq("status", "pending");

      if (expireNotificationError) {
        console.error(
          "Erreur fermeture ancienne notification :",
          expireNotificationError
        );
      }
    }

    const driverOrder = Array.isArray(queue.driver_order)
      ? queue.driver_order.map((id: unknown) => Number(id))
      : [];

    let nextIndex = Number(queue.current_index ?? 0) + 1;
    let nextDriver = null;

    /*
     * 2. Chercher le prochain chauffeur encore disponible
     *
     * Si un chauffeur dans la liste n'est plus disponible,
     * on passe automatiquement au suivant.
     */
    while (nextIndex < driverOrder.length) {
      const candidateDriverId = driverOrder[nextIndex];

      const { data: candidate, error: candidateError } =
        await supabaseServer
          .from("drivers")
          .select("*")
          .eq("id", candidateDriverId)
          .eq("status", "Disponible")
          .maybeSingle();

      if (candidateError) {
        return NextResponse.json(
          {
            success: false,
            error: candidateError.message,
          },
          { status: 500 }
        );
      }

      if (candidate) {
        nextDriver = candidate;
        break;
      }

      nextIndex += 1;
    }

    /*
     * 3. Aucun chauffeur restant
     */
    if (!nextDriver) {
      const { error: expireQueueError } = await supabaseServer
        .from("dispatch_queue")
        .update({
          current_index: nextIndex,
          status: "expired",
          assigned_at: new Date().toISOString(),
        })
        .eq("id", queue.id);

      if (expireQueueError) {
        return NextResponse.json(
          {
            success: false,
            error: expireQueueError.message,
          },
          { status: 500 }
        );
      }

      const { error: resetReservationError } = await supabaseServer
        .from("reservations")
        .update({
          driver_id: null,
          status: "Nouvelle",
          tracking_status: "Aucun chauffeur disponible",
        })
        .eq("id", reservationId);

      if (resetReservationError) {
        return NextResponse.json(
          {
            success: false,
            error: resetReservationError.message,
          },
          { status: 500 }
        );
      }

      await logDispatchEvent(
        reservationId,
        null,
        "DISPATCH_EXPIRED",
        "Tous les chauffeurs admissibles ont refusé ou sont indisponibles"
      );

      return NextResponse.json(
        {
          success: false,
          error: "Aucun autre chauffeur disponible.",
          exhausted: true,
        },
        { status: 404 }
      );
    }

    /*
     * 4. Réserver temporairement le prochain chauffeur
     */
    const { data: reservedDriver, error: reserveDriverError } =
      await supabaseServer
        .from("drivers")
        .update({
          status: "En attente",
          current_position: `Course proposée - ${reservation.origin}`,
        })
        .eq("id", nextDriver.id)
        .eq("status", "Disponible")
        .select("*")
        .maybeSingle();

    if (reserveDriverError) {
      return NextResponse.json(
        {
          success: false,
          error: reserveDriverError.message,
        },
        { status: 500 }
      );
    }

    if (!reservedDriver) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Le chauffeur suivant n'est plus disponible. Relancez le dispatch.",
        },
        { status: 409 }
      );
    }

    /*
     * 5. Mettre à jour la réservation
     *
     * Elle reste Nouvelle jusqu'à l'acceptation réelle.
     */
    const { error: updateReservationError } = await supabaseServer
      .from("reservations")
      .update({
        driver_id: nextDriver.id,
        status: "Nouvelle",
        tracking_status: "Recherche chauffeur",
      })
      .eq("id", reservationId);

    if (updateReservationError) {
      await supabaseServer
        .from("drivers")
        .update({
          status: "Disponible",
          current_position: "Disponible",
        })
        .eq("id", nextDriver.id);

      return NextResponse.json(
        {
          success: false,
          error: updateReservationError.message,
        },
        { status: 500 }
      );
    }

    /*
     * 6. Avancer la file
     */
    const assignedAt = new Date().toISOString();

    const { error: updateQueueError } = await supabaseServer
      .from("dispatch_queue")
      .update({
        current_index: nextIndex,
        assigned_at: assignedAt,
        status: "waiting",
      })
      .eq("id", queue.id);

    if (updateQueueError) {
      await supabaseServer
        .from("drivers")
        .update({
          status: "Disponible",
          current_position: "Disponible",
        })
        .eq("id", nextDriver.id);

      await supabaseServer
        .from("reservations")
        .update({
          driver_id: null,
          status: "Nouvelle",
          tracking_status: "Recherche chauffeur",
        })
        .eq("id", reservationId);

      return NextResponse.json(
        {
          success: false,
          error: updateQueueError.message,
        },
        { status: 500 }
      );
    }

    /*
     * 7. Éviter une notification pending en double
     */
    await supabaseServer
      .from("driver_notifications")
      .update({
        status: "expired",
      })
      .eq("reservation_id", reservationId)
      .eq("status", "pending");

    /*
     * 8. Créer la notification du prochain chauffeur
     */
    const { data: notification, error: notificationError } =
      await supabaseServer
        .from("driver_notifications")
        .insert([
          {
            driver_id: nextDriver.id,
            reservation_id: reservationId,
            status: "pending",
          },
        ])
        .select("*")
        .single();

    if (notificationError) {
      await supabaseServer
        .from("drivers")
        .update({
          status: "Disponible",
          current_position: "Disponible",
        })
        .eq("id", nextDriver.id);

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
        .update({
          status: "expired",
        })
        .eq("id", queue.id);

      return NextResponse.json(
        {
          success: false,
          error: notificationError.message,
        },
        { status: 500 }
      );
    }

    /*
     * 9. Journal
     */
    await logDispatchEvent(
      reservationId,
      nextDriver.id,
      "DISPATCH_NEXT",
      `Course proposée au chauffeur suivant : ${nextDriver.name}`
    );

    return NextResponse.json({
      success: true,
      message: `Course envoyée à ${nextDriver.name}`,
      nextDriver,
      nextDriverId: nextDriver.id,
      currentIndex: nextIndex,
      notification,
      secondsLeft: 60,
    });
  } catch (error) {
    console.error("Erreur dispatch-next :", error);

    return NextResponse.json(
      {
        success: false,
        error: "Erreur serveur pendant le dispatch suivant.",
      },
      { status: 500 }
    );
  }
}