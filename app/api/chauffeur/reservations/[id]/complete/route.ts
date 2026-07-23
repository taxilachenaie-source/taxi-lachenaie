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
      .select("id, balance, commission_rate")
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

    const {
      data: reservation,
      error: reservationError,
    } = await supabaseServer
      .from("reservations")
      .select("id, driver_id, status, price")
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

    if (reservation.status !== "En cours") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Seule une course en cours peut être terminée.",
        },
        { status: 409 }
      );
    }

    const price = Number(reservation.price || 0);
    const commissionRate = Number(driver.commission_rate ?? 10);
    const currentBalance = Number(driver.balance || 0);

    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Le prix de la course est invalide.",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(commissionRate) ||
      commissionRate < 0 ||
      commissionRate > 100
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Le taux de commission est invalide.",
        },
        { status: 400 }
      );
    }

    const commissionAmount = Number(
      ((price * commissionRate) / 100).toFixed(2)
    );

    const newBalance = Number(
      (currentBalance - commissionAmount).toFixed(2)
    );

    /*
     * Vérification supplémentaire pour éviter de créer
     * deux commissions pour la même course.
     */
    const {
      data: existingTransaction,
      error: existingTransactionError,
    } = await supabaseServer
      .from("wallet_transactions")
      .select("id")
      .eq("reservation_id", reservationId)
      .eq("driver_id", driver.id)
      .eq("type", "commission")
      .maybeSingle();

    if (existingTransactionError) {
      console.error(
        "Erreur vérification commission :",
        existingTransactionError
      );

      return NextResponse.json(
        {
          success: false,
          error: existingTransactionError.message,
        },
        { status: 500 }
      );
    }

    if (existingTransaction) {
      return NextResponse.json(
        {
          success: false,
          error:
            "La commission de cette course a déjà été enregistrée.",
        },
        { status: 409 }
      );
    }

    const completedAt = new Date().toISOString();

    const {
      data: updatedReservation,
      error: reservationUpdateError,
    } = await supabaseServer
      .from("reservations")
      .update({
        status: "Terminée",
        tracking_status: "Course terminée",
        trip_completed_at: completedAt,
      })
      .eq("id", reservationId)
      .eq("driver_id", driver.id)
      .eq("status", "En cours")
      .select("*")
      .maybeSingle();

    if (reservationUpdateError) {
      console.error(
        "Erreur fin de réservation :",
        reservationUpdateError
      );

      return NextResponse.json(
        {
          success: false,
          error: reservationUpdateError.message,
        },
        { status: 500 }
      );
    }

    if (!updatedReservation) {
      return NextResponse.json(
        {
          success: false,
          error:
            "La course n’a pas pu être terminée. Son statut a peut-être déjà changé.",
        },
        { status: 409 }
      );
    }

    const {
      data: transaction,
      error: transactionError,
    } = await supabaseServer
      .from("wallet_transactions")
      .insert({
        driver_id: driver.id,
        type: "commission",
        description: `Commission Taxi Lachenaie - Course #${reservationId}`,
        amount: -commissionAmount,
        reservation_id: reservationId,
      })
      .select("*")
      .maybeSingle();

    if (transactionError) {
      console.error(
        "Erreur enregistrement commission :",
        transactionError
      );

      return NextResponse.json(
        {
          success: false,
          error: transactionError.message,
        },
        { status: 500 }
      );
    }

    const {
      data: updatedDriver,
      error: driverUpdateError,
    } = await supabaseServer
      .from("drivers")
      .update({
        status: "Disponible",
        current_position: "Garage Taxi Lachenaie",
        current_trip_id: null,
        balance: newBalance,
      })
      .eq("id", driver.id)
      .select("*")
      .maybeSingle();

    if (driverUpdateError) {
      console.error(
        "Erreur libération chauffeur :",
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
      message: "Course terminée.",
      reservation: updatedReservation,
      driver: updatedDriver,
      transaction,
      commissionRate,
      commissionAmount,
      newBalance,
    });
  } catch (error) {
    console.error("Erreur fin de course :", error);

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