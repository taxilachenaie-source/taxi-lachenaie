import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "@/lib/supabase-server";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error("STRIPE_SECRET_KEY est manquante dans .env.local.");
}

const stripe = new Stripe(stripeSecretKey);

type CapturePaymentBody = {
  reservationId?: number;
  finalAmount?: number;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CapturePaymentBody;

    const reservationId = Number(body.reservationId);
    const finalAmount = Number(body.finalAmount);

    if (!Number.isInteger(reservationId) || reservationId <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Identifiant de réservation invalide.",
        },
        { status: 400 }
      );
    }

    const { data: reservation, error: reservationError } =
      await supabaseServer
        .from("reservations")
        .select(
          `
            id,
            price,
            payment_status,
            stripe_payment_intent,
            payment_captured_at
          `
        )
        .eq("id", reservationId)
        .single();

    if (reservationError || !reservation) {
      return NextResponse.json(
        {
          success: false,
          error: "Réservation introuvable.",
        },
        { status: 404 }
      );
    }

    if (
      reservation.payment_status === "paid" ||
      reservation.payment_captured_at
    ) {
      return NextResponse.json({
        success: true,
        alreadyCaptured: true,
        message: "Ce paiement a déjà été capturé.",
      });
    }

    const paymentIntentId = String(
      reservation.stripe_payment_intent || ""
    );

    if (!paymentIntentId.startsWith("pi_")) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Aucun paiement Stripe autorisé n’est associé à cette réservation.",
        },
        { status: 400 }
      );
    }

    const paymentIntent =
      await stripe.paymentIntents.retrieve(paymentIntentId);

    if (
      paymentIntent.metadata.reservation_id !== String(reservationId)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Le paiement ne correspond pas à cette réservation.",
        },
        { status: 400 }
      );
    }

    if (paymentIntent.status === "succeeded") {
      await supabaseServer
        .from("reservations")
        .update({
          payment_status: "paid",
          payment_captured_at: new Date().toISOString(),
        })
        .eq("id", reservationId);

      await supabaseServer
        .from("payments")
        .update({
          status: "succeeded",
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_payment_intent", paymentIntent.id);

      return NextResponse.json({
        success: true,
        alreadyCaptured: true,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
      });
    }

    if (paymentIntent.status !== "requires_capture") {
      return NextResponse.json(
        {
          success: false,
          error: `Le paiement ne peut pas être capturé. Statut Stripe : ${paymentIntent.status}`,
        },
        { status: 400 }
      );
    }

    const requestedAmount =
      Number.isFinite(finalAmount) && finalAmount > 0
        ? finalAmount
        : Number(reservation.price);

    const amountToCapture = Math.round(requestedAmount * 100);

    if (!Number.isInteger(amountToCapture) || amountToCapture < 50) {
      return NextResponse.json(
        {
          success: false,
          error: "Le montant final est invalide.",
        },
        { status: 400 }
      );
    }

    if (amountToCapture > paymentIntent.amount_capturable) {
      return NextResponse.json(
        {
          success: false,
          error: `Le montant final dépasse le montant autorisé. Maximum autorisé : ${(
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
      await stripe.paymentIntents.capture(paymentIntent.id, {
        amount_to_capture: amountToCapture,
        metadata: {
          reservation_id: String(reservationId),
          captured_by: "taxi_lachenaie",
        },
      });

    const capturedAmount =
      capturedPaymentIntent.amount_received / 100;

    const capturedAt = new Date().toISOString();

    const { error: reservationUpdateError } =
      await supabaseServer
        .from("reservations")
        .update({
          price: capturedAmount,
          payment_status: "paid",
          payment_captured_at: capturedAt,
        })
        .eq("id", reservationId);

    if (reservationUpdateError) {
      console.error(
        "Paiement capturé, mais erreur réservation :",
        reservationUpdateError
      );

      return NextResponse.json(
        {
          success: false,
          paymentCaptured: true,
          error:
            "Le paiement a été capturé, mais la réservation n’a pas pu être mise à jour.",
        },
        { status: 500 }
      );
    }

    const { error: paymentUpdateError } = await supabaseServer
      .from("payments")
      .update({
        amount: capturedAmount,
        status: capturedPaymentIntent.status,
        updated_at: capturedAt,
      })
      .eq("stripe_payment_intent", capturedPaymentIntent.id);

    if (paymentUpdateError) {
      console.error(
        "Erreur mise à jour table payments :",
        paymentUpdateError
      );
    }

    return NextResponse.json({
      success: true,
      paymentIntentId: capturedPaymentIntent.id,
      status: capturedPaymentIntent.status,
      capturedAmount,
      currency: capturedPaymentIntent.currency,
    });
  } catch (error) {
    console.error("Erreur capture paiement Stripe :", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Impossible de capturer le paiement.",
      },
      { status: 500 }
    );
  }
}