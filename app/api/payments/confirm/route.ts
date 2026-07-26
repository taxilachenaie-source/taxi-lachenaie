import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "@/lib/supabase-server";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error("STRIPE_SECRET_KEY est manquante.");
}

const stripe = new Stripe(stripeSecretKey);

type ConfirmPaymentBody = {
  reservationId?: number;
  paymentIntentId?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ConfirmPaymentBody;

    const reservationId = Number(body.reservationId);
    const paymentIntentId = String(body.paymentIntentId || "");

    if (!Number.isInteger(reservationId) || reservationId <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Identifiant de réservation invalide.",
        },
        { status: 400 }
      );
    }

    if (!paymentIntentId.startsWith("pi_")) {
      return NextResponse.json(
        {
          success: false,
          error: "Identifiant de paiement Stripe invalide.",
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
          error: "Ce paiement ne correspond pas à cette réservation.",
        },
        { status: 400 }
      );
    }

    if (
      paymentIntent.status !== "requires_capture" &&
      paymentIntent.status !== "succeeded"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `Le paiement n’est pas autorisé. Statut : ${paymentIntent.status}`,
        },
        { status: 400 }
      );
    }

    const paymentStatus =
      paymentIntent.status === "requires_capture"
        ? "authorized"
        : "paid";

    const reservationUpdate: Record<string, unknown> = {
      payment_status: paymentStatus,
      stripe_payment_intent: paymentIntent.id,
    };

    if (paymentStatus === "authorized") {
      reservationUpdate.payment_authorized_at =
        new Date().toISOString();
    }

    if (paymentStatus === "paid") {
      reservationUpdate.payment_captured_at =
        new Date().toISOString();
    }

    const { error: reservationError } = await supabaseServer
      .from("reservations")
      .update(reservationUpdate)
      .eq("id", reservationId);

    if (reservationError) {
      console.error(
        "Erreur mise à jour réservation :",
        reservationError
      );

      return NextResponse.json(
        {
          success: false,
          error: "Impossible de mettre à jour la réservation.",
        },
        { status: 500 }
      );
    }

    const { error: paymentError } = await supabaseServer
      .from("payments")
      .update({
        status: paymentIntent.status,
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_payment_intent", paymentIntent.id);

    if (paymentError) {
      console.error(
        "Erreur mise à jour paiement :",
        paymentError
      );
    }

    return NextResponse.json({
      success: true,
      status: paymentIntent.status,
      paymentStatus,
    });
  } catch (error) {
    console.error("Erreur confirmation paiement :", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Impossible de confirmer le paiement.",
      },
      { status: 500 }
    );
  }
}