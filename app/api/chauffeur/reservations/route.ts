import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const VISIBLE_STATUSES = [
  "Nouvelle",
  "Acceptée",
  "Chauffeur arrivé",
  "En cours",
];

export async function GET(request: Request) {
  try {
    /*
     * 1. Vérifier le jeton d’authentification.
     */
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          success: false,
          error: "Non autorisé.",
        },
        { status: 401 }
      );
    }

    const token = authHeader.slice("Bearer ".length).trim();

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: "Jeton d’authentification manquant.",
        },
        { status: 401 }
      );
    }

    /*
     * 2. Récupérer l’utilisateur connecté.
     */
    const {
      data: { user },
      error: userError,
    } = await supabaseServer.auth.getUser(token);

    if (userError || !user) {
      console.error(
        "Erreur authentification chauffeur :",
        userError
      );

      return NextResponse.json(
        {
          success: false,
          error: "Utilisateur invalide ou session expirée.",
        },
        { status: 401 }
      );
    }

    /*
     * 3. Trouver le chauffeur associé au compte.
     */
    const {
      data: driver,
      error: driverError,
    } = await supabaseServer
      .from("drivers")
      .select("*")
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
          error: "Chauffeur introuvable.",
        },
        { status: 404 }
      );
    }

    /*
     * 4. Récupérer les réservations attribuées au chauffeur.
     *
     * On récupère seulement les statuts actifs.
     * Les courses terminées, annulées ou refusées sont exclues.
     */
    const {
      data: reservations,
      error: reservationsError,
    } = await supabaseServer
      .from("reservations")
      .select("*")
      .eq("driver_id", driver.id)
      .in("status", VISIBLE_STATUSES)
      .order("scheduled_at", {
        ascending: true,
        nullsFirst: false,
      })
      .order("trip_date", {
        ascending: true,
      })
      .order("trip_time", {
        ascending: true,
      });

    if (reservationsError) {
      console.error(
        "Erreur récupération réservations chauffeur :",
        reservationsError
      );

      return NextResponse.json(
        {
          success: false,
          error: reservationsError.message,
        },
        { status: 500 }
      );
    }

    /*
     * 5. Masquer les réservations programmées trop tôt.
     *
     * La course devient visible seulement lorsque dispatch_at
     * est atteint, donc normalement 30 minutes avant le départ.
     */
    const nowMs = Date.now();

    const visibleReservations = (reservations || []).filter(
      (reservation) => {
        /*
         * Si dispatch_at existe, la course reste invisible
         * jusqu’à ce que cette heure soit atteinte.
         */
        if (reservation.dispatch_at) {
          const dispatchAtMs = new Date(
            reservation.dispatch_at
          ).getTime();

          if (Number.isNaN(dispatchAtMs)) {
            console.error(
              `dispatch_at invalide pour la réservation ${reservation.id}`
            );

            return false;
          }

          return nowMs >= dispatchAtMs;
        }

        /*
         * Sécurité pour une ancienne réservation qui n’aurait
         * pas encore dispatch_at, mais qui possède scheduled_at.
         *
         * Elle devient visible 30 minutes avant scheduled_at.
         */
        if (reservation.scheduled_at) {
          const scheduledAtMs = new Date(
            reservation.scheduled_at
          ).getTime();

          if (Number.isNaN(scheduledAtMs)) {
            console.error(
              `scheduled_at invalide pour la réservation ${reservation.id}`
            );

            return false;
          }

          const calculatedDispatchAtMs =
            scheduledAtMs - 30 * 60 * 1000;

          return nowMs >= calculatedDispatchAtMs;
        }

        /*
         * Compatibilité avec une très ancienne course ne
         * possédant ni scheduled_at ni dispatch_at.
         *
         * Comme elle est déjà attribuée à ce chauffeur,
         * on la laisse visible pour ne pas casser les anciennes
         * courses actives.
         */
        return true;
      }
    );

    /*
     * 6. Ajouter des indicateurs utiles à l’interface.
     */
    const formattedReservations = visibleReservations.map(
      (reservation) => ({
        ...reservation,

        can_accept:
          reservation.status === "Nouvelle",

        can_arrive:
          reservation.status === "Acceptée",

        can_start:
          reservation.status === "Chauffeur arrivé",

        can_finish:
          reservation.status === "En cours",
      })
    );

    return NextResponse.json({
      success: true,
      driver,
      reservations: formattedReservations,
      count: formattedReservations.length,
      server_time: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "Erreur API réservations chauffeur :",
      error
    );

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