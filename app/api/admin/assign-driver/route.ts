import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/admin-auth";

type AssignDriverPayload = {
  reservation_id?: number | string;
  driver_id?: number | string;
};

export async function POST(request: Request) {
  let reservedDriverId: number | null = null;

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
    /*
     * 1. Vérifier la session de l’utilisateur connecté.
     */
    const authorization =
      request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentification requise.",
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
          error: "Session invalide ou expirée.",
        },
        { status: 401 }
      );
    }

    /*
     * 2. Lire le JSON envoyé.
     */
    let body: AssignDriverPayload;

    try {
      body = (await request.json()) as AssignDriverPayload;
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Données JSON invalides.",
        },
        { status: 400 }
      );
    }

    const reservationId = Number(body.reservation_id);
    const driverId = Number(body.driver_id);

    if (
      !Number.isInteger(reservationId) ||
      reservationId <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Identifiant de réservation invalide.",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(driverId) ||
      driverId <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Identifiant de chauffeur invalide.",
        },
        { status: 400 }
      );
    }

    /*
     * 3. Vérifier que la réservation existe et qu’elle
     * n’est pas déjà attribuée.
     */
    const {
      data: reservation,
      error: reservationError,
    } = await supabaseServer
      .from("reservations")
      .select(`
        id,
        origin,
        driver_id,
        status
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
          error:
            "Impossible de vérifier la réservation.",
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

    if (reservation.driver_id !== null) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Cette réservation est déjà attribuée à un chauffeur.",
        },
        { status: 409 }
      );
    }

    if (reservation.status !== "Nouvelle") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Cette réservation ne peut plus être attribuée.",
        },
        { status: 409 }
      );
    }

    /*
     * 4. Vérifier le chauffeur.
     */
    const {
      data: driver,
      error: driverError,
    } = await supabaseServer
      .from("drivers")
      .select(`
        id,
        status,
        current_reservation_id
      `)
      .eq("id", driverId)
      .maybeSingle();

    if (driverError) {
      console.error(
        "Erreur récupération chauffeur :",
        driverError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Impossible de vérifier le chauffeur.",
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

    if (
      driver.status !== "Disponible" ||
      driver.current_reservation_id !== null
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Ce chauffeur n’est plus disponible.",
        },
        { status: 409 }
      );
    }

    /*
     * 5. Réserver le chauffeur.
     *
     * Les conditions dans la requête empêchent deux
     * répartiteurs de réserver le même chauffeur.
     */
    const {
      data: reservedDriver,
      error: reserveDriverError,
    } = await supabaseServer
      .from("drivers")
      .update({
        status: "Occupé",
        current_reservation_id: reservationId,
        current_position:
          `Assigné à une course - ${reservation.origin}`,
      })
      .eq("id", driverId)
      .eq("status", "Disponible")
      .is("current_reservation_id", null)
      .select("id")
      .maybeSingle();

    if (reserveDriverError) {
      console.error(
        "Erreur réservation chauffeur :",
        reserveDriverError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Impossible de réserver le chauffeur.",
        },
        { status: 500 }
      );
    }

    if (!reservedDriver) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Le chauffeur vient d’être attribué à une autre course.",
        },
        { status: 409 }
      );
    }

    reservedDriverId = driverId;

    /*
     * 6. Attribuer la réservation de manière conditionnelle.
     *
     * Cela empêche deux chauffeurs différents de recevoir
     * la même réservation.
     */
    const {
      data: assignedReservation,
      error: assignReservationError,
    } = await supabaseServer
      .from("reservations")
      .update({
        driver_id: driverId,
        status: "Acceptée",
      })
      .eq("id", reservationId)
      .eq("status", "Nouvelle")
      .is("driver_id", null)
      .select(`
        id,
        driver_id,
        status
      `)
      .maybeSingle();

    if (
      assignReservationError ||
      !assignedReservation
    ) {
      /*
       * La réservation n’a pas pu être attribuée.
       * On remet immédiatement le chauffeur disponible.
       */
      const { error: rollbackError } =
        await supabaseServer
          .from("drivers")
          .update({
            status: "Disponible",
            current_reservation_id: null,
            current_position: null,
          })
          .eq("id", driverId)
          .eq(
            "current_reservation_id",
            reservationId
          );

      if (rollbackError) {
        console.error(
          "Échec restauration chauffeur :",
          rollbackError
        );
      }

      reservedDriverId = null;

      if (assignReservationError) {
        console.error(
          "Erreur attribution réservation :",
          assignReservationError
        );
      }

      return NextResponse.json(
        {
          success: false,
          error:
            "La réservation vient d’être attribuée ou modifiée par un autre répartiteur.",
        },
        { status: 409 }
      );
    }

    reservedDriverId = null;

    return NextResponse.json({
      success: true,
      message: "Course attribuée au chauffeur.",
      reservation: assignedReservation,
    });
  } catch (error) {
    console.error(
      "Erreur attribution chauffeur :",
      error
    );

    /*
     * Sécurité supplémentaire si une erreur imprévue arrive
     * après avoir réservé le chauffeur.
     */
    if (reservedDriverId !== null) {
      const { error: rollbackError } =
        await supabaseServer
          .from("drivers")
          .update({
            status: "Disponible",
            current_reservation_id: null,
            current_position: null,
          })
          .eq("id", reservedDriverId);

      if (rollbackError) {
        console.error(
          "Échec restauration chauffeur :",
          rollbackError
        );
      }
    }

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