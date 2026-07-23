import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

type SchedulerResult = {
  reservationId: number;
  success: boolean;
  message: string;
};

export async function GET(request: Request) {
    const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (
    !cronSecret ||
    authorization !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "Accès non autorisé.",
      },
      { status: 401 }
    );
  }
  try {
    const nowIso = new Date().toISOString();
    const origin = new URL(request.url).origin;

    let expiredProposalsProcessed = 0;
    let scheduledReservationsProcessed = 0;

    const results: SchedulerResult[] = [];

    /*
     * ==========================================================
     * 1. Gérer les propositions expirées après 60 secondes
     * ==========================================================
     */

    const {
      data: waitingQueues,
      error: waitingQueuesError,
    } = await supabaseServer
      .from("dispatch_queue")
      .select("*")
      .eq("status", "waiting");

    if (waitingQueuesError) {
      return NextResponse.json(
        {
          success: false,
          error: waitingQueuesError.message,
        },
        { status: 500 }
      );
    }

    const nowMs = Date.now();

    for (const queue of waitingQueues || []) {
      if (!queue.assigned_at) {
        continue;
      }

      const assignedAtMs = new Date(queue.assigned_at).getTime();

      if (Number.isNaN(assignedAtMs)) {
        console.error(
          `assigned_at invalide pour la file ${queue.id}`
        );
        continue;
      }

      const secondsPassed = Math.floor(
        (nowMs - assignedAtMs) / 1000
      );

      if (secondsPassed < 60) {
        continue;
      }

      try {
        const response = await fetch(
          `${origin}/api/admin/dispatch-next`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              reservation_id: queue.reservation_id,
            }),
            cache: "no-store",
          }
        );

        const responseBody = await response
          .json()
          .catch(() => null);

        if (!response.ok) {
          console.error(
            `Erreur dispatch-next pour la réservation ${queue.reservation_id} :`,
            responseBody
          );

          results.push({
            reservationId: Number(queue.reservation_id),
            success: false,
            message:
              responseBody?.error ||
              "Impossible de proposer la course au chauffeur suivant.",
          });

          continue;
        }

        expiredProposalsProcessed++;

        results.push({
          reservationId: Number(queue.reservation_id),
          success: true,
          message:
            "Proposition expirée : chauffeur suivant contacté.",
        });
      } catch (error) {
        console.error(
          `Erreur réseau dispatch-next pour la réservation ${queue.reservation_id} :`,
          error
        );

        results.push({
          reservationId: Number(queue.reservation_id),
          success: false,
          message:
            "Erreur réseau pendant le passage au chauffeur suivant.",
        });
      }
    }

    /*
     * ==========================================================
     * 2. Trouver les réservations arrivées à leur heure de dispatch
     *
     * Exemple :
     * Course prévue à 08 h 00
     * dispatch_at = 07 h 30
     * ==========================================================
     */

    const {
      data: dueReservations,
      error: dueReservationsError,
    } = await supabaseServer
      .from("reservations")
      .select(
        `
          id,
          status,
          driver_id,
          scheduled_at,
          dispatch_at,
          dispatched_at
        `
      )
      .lte("dispatch_at", nowIso)
      .is("dispatched_at", null)
      .is("driver_id", null)
      .in("status", ["Nouvelle", "Programmée"])
      .order("dispatch_at", {
        ascending: true,
      });

    if (dueReservationsError) {
      return NextResponse.json(
        {
          success: false,
          error: dueReservationsError.message,
        },
        { status: 500 }
      );
    }

    /*
     * ==========================================================
     * 3. Lancer l’auto-dispatch pour chaque réservation arrivée
     * ==========================================================
     */

    for (const reservation of dueReservations || []) {
      const reservationId = Number(reservation.id);

      /*
       * Verrouillage simple :
       *
       * On inscrit dispatched_at avant d’appeler auto-dispatch.
       * La condition .is("dispatched_at", null) empêche deux
       * exécutions simultanées de traiter la même réservation.
       */
      const {
        data: claimedReservation,
        error: claimError,
      } = await supabaseServer
        .from("reservations")
        .update({
          dispatched_at: nowIso,
          status: "Nouvelle",
          tracking_enabled: false,
        })
        .eq("id", reservationId)
        .is("dispatched_at", null)
        .is("driver_id", null)
        .select("id")
        .maybeSingle();

      if (claimError) {
        console.error(
          `Erreur de verrouillage pour la réservation ${reservationId} :`,
          claimError
        );

        results.push({
          reservationId,
          success: false,
          message: claimError.message,
        });

        continue;
      }

      /*
       * Une autre exécution du scheduler l’a peut-être déjà prise.
       */
      if (!claimedReservation) {
        continue;
      }

      try {
        const dispatchResponse = await fetch(
          `${origin}/api/admin/auto-dispatch`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              reservation_id: reservationId,
            }),
            cache: "no-store",
          }
        );

        const dispatchBody = await dispatchResponse
          .json()
          .catch(() => null);

        if (!dispatchResponse.ok || !dispatchBody?.success) {
          /*
           * Aucun chauffeur ou erreur temporaire :
           * on libère la réservation pour qu’elle soit retentée
           * lors de la prochaine exécution du scheduler.
           */
          await supabaseServer
            .from("reservations")
            .update({
              dispatched_at: null,
              driver_id: null,
              status: "Programmée",
              tracking_status: "Recherche chauffeur",
              tracking_enabled: false,
            })
            .eq("id", reservationId);

          const message =
            dispatchBody?.error ||
            "L’auto-dispatch n’a pas pu être lancé.";

          console.error(
            `Auto-dispatch échoué pour la réservation ${reservationId} :`,
            message
          );

          results.push({
            reservationId,
            success: false,
            message,
          });

          continue;
        }

        scheduledReservationsProcessed++;

        results.push({
          reservationId,
          success: true,
          message:
            dispatchBody.message ||
            "Auto-dispatch lancé avec succès.",
        });
      } catch (error) {
        /*
         * Erreur réseau ou erreur inattendue :
         * on autorise une nouvelle tentative.
         */
        await supabaseServer
          .from("reservations")
          .update({
            dispatched_at: null,
            driver_id: null,
            status: "Programmée",
            tracking_status: "Recherche chauffeur",
            tracking_enabled: false,
          })
          .eq("id", reservationId);

        console.error(
          `Erreur auto-dispatch pour la réservation ${reservationId} :`,
          error
        );

        results.push({
          reservationId,
          success: false,
          message:
            "Erreur réseau pendant le lancement de l’auto-dispatch.",
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Scheduler exécuté avec succès.",
      executedAt: nowIso,
      expiredProposalsProcessed,
      scheduledReservationsProcessed,
      totalProcessed:
        expiredProposalsProcessed +
        scheduledReservationsProcessed,
      results,
    });
  } catch (error) {
    console.error("Erreur dispatch scheduler :", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Erreur serveur dans le scheduler.",
      },
      { status: 500 }
    );
  }
}