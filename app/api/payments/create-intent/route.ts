import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "@/lib/supabase-server";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error("STRIPE_SECRET_KEY est manquante dans .env.local");
}

const stripe = new Stripe(stripeSecretKey);

type RequestBody = {
  reservationId?: number;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const reservationId = Number(body.reservationId);

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
        .select("id, name, email, price, status")
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

    const amountInCents = Math.round(Number(reservation.price) * 100);

    if (!Number.isFinite(amountInCents) || amountInCents < 50) {
      return NextResponse.json(
        {
          success: false,
          error: "Le montant de la réservation est invalide.",
        },
        { status: 400 }
      );
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: "cad",
      capture_method: "manual",
      automatic_payment_methods: {
        enabled: true,
      },
      receipt_email: reservation.email || undefined,
      description: `Taxi Lachenaie — réservation #${reservation.id}`,
      metadata: {
        reservation_id: String(reservation.id),
        customer_name: reservation.name || "",
      },
    });

    const { error: paymentError } = await supabaseServer
      .from("payments")
      .insert({
        reservation_id: reservation.id,
        stripe_payment_intent: paymentIntent.id,
        amount: Number(reservation.price),
        currency: "cad",
        status: paymentIntent.status,
        payment_method: "card",
      });

    if (paymentError) {
      await stripe.paymentIntents.cancel(paymentIntent.id).catch(() => null);

      console.error("Erreur création paiement Supabase :", paymentError);

      return NextResponse.json(
        {
          success: false,
          error: "Impossible d’enregistrer le paiement.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: Number(reservation.price),
    });
  } catch (error) {
    console.error("Erreur création PaymentIntent :", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Impossible de préparer le paiement.",
      },
      { status: 500 }
    );
  }
}