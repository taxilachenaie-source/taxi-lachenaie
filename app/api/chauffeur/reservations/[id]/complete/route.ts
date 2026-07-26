import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "@/lib/supabase-server";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error(
    "STRIPE_SECRET_KEY est manquante dans .env.local."
  );
}

const stripe = new Stripe(stripeSecretKey);

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

    /*
     * 1. Authentifier le chauffeur
     */
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

    /*
     * 2. Charger le chauffeur
     */
    const {
      data: driver,
      error: driverError,
    } = await supabaseServer
      .from("drivers")
      .select(
        `
          id,
          balance,
          commission_rate
        `
      )
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
     * 3. Charger la réservation et son paiement
     */
    const {
      data: reservation,
      error: reservationError,
    } = await supabaseServer
      .from("reservations")
      .select(
        `
          id,
          driver_id,
          status,
          price,
          payment_status,
          stripe_payment_intent,
          payment_captured_at
        `
      )
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

    /*
     * 4. Vérifier les montants
     */
    const price = Number(reservation.price || 0);
    const commissionRate = Number(
      driver.commission_rate ?? 10
    );
    const currentBalance = Number(driver.balance || 0);

    if (!Number.isFinite(price) || price <= 0) {
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

    /*
     * 5. Éviter un double enregistrement
     */
    const {
      data: existingIncome,
      error: existingIncomeError,
    } = await supabaseServer
      .from("wallet_transactions")
      .select("id")
      .eq("reservation_id", reservationId)
      .eq("driver_id", driver.id)
      .eq("type", "course_income")
      .maybeSingle();

    if (existingIncomeError) {
      console.error(
        "Erreur vérification portefeuille :",
        existingIncomeError
      );

      return NextResponse.json(
        {
          success: false,
          error: existingIncomeError.message,
        },
        { status: 500 }
      );
    }

    if (existingIncome) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Le revenu de cette course a déjà été enregistré.",
        },
        { status: 409 }
      );
    }

    /*
     * 6. Capturer le paiement Stripe
     */
    const paymentIntentId = String(
      reservation.stripe_payment_intent || ""
    );

    let capturedAmount = price;
    let paymentStatus = String(
      reservation.payment_status || "unpaid"
    );
    let paymentCapturedAt =
      reservation.payment_captured_at || null;

    if (paymentIntentId.startsWith("pi_")) {
      const paymentIntent =
        await stripe.paymentIntents.retrieve(paymentIntentId);

      if (
        paymentIntent.metadata.reservation_id !==
        String(reservationId)
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Le paiement Stripe ne correspond pas à cette réservation.",
          },
          { status: 400 }
        );
      }

      if (paymentIntent.status === "requires_capture") {
        const amountToCapture = Math.round(price * 100);

        if (amountToCapture > paymentIntent.amount_capturable) {
          return NextResponse.json(
            {
              success: false,
              error: `Le montant final dépasse le montant autorisé. Maximum : ${(
                paymentIntent.amount_capturable / 100
              ).toLocaleString("fr-CA", {
                style: "currency",
                currency: "CAD",
              })}.`,
            },
            { status: 400 }
          );
        }

        const capturedPaymentIntent =
          await stripe.paymentIntents.capture(
            paymentIntent.id,
            {
              amount_to_capture: amountToCapture,
              metadata: {
                reservation_id: String(reservationId),
                captured_by: "driver_complete_trip",
              },
            }
          );

        capturedAmount =
          capturedPaymentIntent.amount_received / 100;

        paymentStatus = "paid";
        paymentCapturedAt = new Date().toISOString();

        const { error: paymentUpdateError } =
          await supabaseServer
            .from("payments")
            .update({
              amount: capturedAmount,
              status: capturedPaymentIntent.status,
              updated_at: paymentCapturedAt,
            })
            .eq(
              "stripe_payment_intent",
              capturedPaymentIntent.id
            );

        if (paymentUpdateError) {
          console.error(
            "Paiement capturé, mais erreur table payments :",
            paymentUpdateError
          );
        }
      } else if (paymentIntent.status === "succeeded") {
        capturedAmount =
          paymentIntent.amount_received / 100 || price;

        paymentStatus = "paid";
        paymentCapturedAt =
          reservation.payment_captured_at ||
          new Date().toISOString();
      } else {
        return NextResponse.json(
          {
            success: false,
            error: `Le paiement Stripe ne peut pas être capturé. Statut : ${paymentIntent.status}`,
          },
          { status: 409 }
        );
      }
    } else {
      /*
       * Pour une course payée comptant ou sans Stripe.
       * Le chauffeur conserve le montant et paie seulement
       * la commission à Taxi Lachenaie.
       */
      paymentStatus = reservation.payment_status || "cash";
    }

    /*
     * 7. Calculer la part du chauffeur
     */
    const commissionAmount = Number(
      ((capturedAmount * commissionRate) / 100).toFixed(2)
    );

    const driverEarnings = Number(
      (capturedAmount - commissionAmount).toFixed(2)
    );

    const isStripePayment =
      paymentIntentId.startsWith("pi_") &&
      paymentStatus === "paid";

    /*
     * Paiement Stripe :
     * Taxi Lachenaie a encaissé la totalité.
     * On crédite donc la part du chauffeur.
     *
     * Paiement comptant :
     * Le chauffeur a déjà reçu la totalité.
     * On retire uniquement la commission.
     */
    const balanceChange = isStripePayment
      ? driverEarnings
      : -commissionAmount;

    const newBalance = Number(
      (currentBalance + balanceChange).toFixed(2)
    );

    const completedAt = new Date().toISOString();

    /*
     * 8. Terminer la réservation
     */
    const {
      data: updatedReservation,
      error: reservationUpdateError,
    } = await supabaseServer
      .from("reservations")
      .update({
        status: "Terminée",
        tracking_status: "Course terminée",
        trip_completed_at: completedAt,
        price: capturedAmount,
        payment_status: paymentStatus,
        payment_captured_at: paymentCapturedAt,
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
          paymentCaptured: isStripePayment,
          error:
            "Le paiement a peut-être été capturé, mais la réservation n’a pas pu être terminée.",
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

    /*
     * 9. Enregistrer le revenu net du chauffeur
     */
    const {
      data: incomeTransaction,
      error: incomeTransactionError,
    } = await supabaseServer
      .from("wallet_transactions")
      .insert({
        driver_id: driver.id,
        type: "course_income",
        description: isStripePayment
          ? `Revenu net Stripe - Course #${reservationId}`
          : `Commission comptant - Course #${reservationId}`,
        amount: balanceChange,
        reservation_id: reservationId,
      })
      .select("*")
      .maybeSingle();

    if (incomeTransactionError) {
      console.error(
        "Erreur enregistrement portefeuille :",
        incomeTransactionError
      );

      return NextResponse.json(
        {
          success: false,
          paymentCaptured: isStripePayment,
          reservationCompleted: true,
          error:
            "La course est terminée, mais le portefeuille n’a pas pu être mis à jour.",
        },
        { status: 500 }
      );
    }

    /*
     * 10. Enregistrer la commission à titre informatif
     */
    const {
      error: commissionTransactionError,
    } = await supabaseServer
      .from("wallet_transactions")
      .insert({
        driver_id: driver.id,
        type: "commission",
        description: `Commission Taxi Lachenaie - Course #${reservationId}`,
        amount: -commissionAmount,
        reservation_id: reservationId,
      });

    if (commissionTransactionError) {
      console.error(
        "Erreur enregistrement commission :",
        commissionTransactionError
      );
    }

    /*
     * 11. Libérer le chauffeur et mettre à jour son solde
     */
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
          paymentCaptured: isStripePayment,
          reservationCompleted: true,
          error:
            "La course est terminée, mais le chauffeur n’a pas pu être libéré.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: isStripePayment
        ? "Course terminée et paiement Stripe capturé."
        : "Course terminée et commission enregistrée.",
      reservation: updatedReservation,
      driver: updatedDriver,
      transaction: incomeTransaction,
      payment: {
        type: isStripePayment ? "stripe" : "cash",
        status: paymentStatus,
        capturedAmount,
      },
      commissionRate,
      commissionAmount,
      driverEarnings,
      balanceChange,
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