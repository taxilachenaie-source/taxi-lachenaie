"use client";

import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import PaymentForm from "./PaymentForm";

const publishableKey =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";

const stripePromise = publishableKey
  ? loadStripe(publishableKey)
  : null;

type CreateIntentResponse = {
  success: boolean;
  clientSecret?: string;
  paymentIntentId?: string;
  amount?: number;
  error?: string;
};

export default function PaymentPage() {
  const params = useParams<{ reservationId: string }>();

  const reservationId = useMemo(
    () => Number(params.reservationId),
    [params.reservationId]
  );

  const [clientSecret, setClientSecret] = useState("");
  const [amount, setAmount] = useState(0);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    async function createPaymentIntent() {
      if (!Number.isInteger(reservationId) || reservationId <= 0) {
        setError("Identifiant de réservation invalide.");
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch("/api/payments/create-intent", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reservationId,
          }),
        });

        const data = (await response.json()) as CreateIntentResponse;

        if (!response.ok || !data.success || !data.clientSecret) {
          throw new Error(
            data.error || "Impossible de préparer le paiement."
          );
        }

        if (!isActive) {
          return;
        }

        setClientSecret(data.clientSecret);
        setAmount(Number(data.amount || 0));
      } catch (error) {
        console.error("Erreur page paiement :", error);

        if (isActive) {
          setError(
            error instanceof Error
              ? error.message
              : "Impossible de préparer le paiement."
          );
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    createPaymentIntent();

    return () => {
      isActive = false;
    };
  }, [reservationId]);

  if (!publishableKey || !stripePromise) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl">
          <h1 className="text-2xl font-bold text-red-700">
            Configuration Stripe manquante
          </h1>

          <p className="mt-3 text-slate-600">
            Vérifie la variable
            {" "}
            <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code>
            {" "}
            dans le fichier
            {" "}
            <code>.env.local</code>.
          </p>
        </div>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-yellow-400" />

          <p className="mt-4 font-medium text-slate-700">
            Préparation du paiement sécurisé...
          </p>
        </div>
      </main>
    );
  }

  if (error || !clientSecret) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl">
          <h1 className="text-2xl font-bold text-red-700">
            Paiement indisponible
          </h1>

          <p className="mt-3 text-slate-600">
            {error || "Le paiement ne peut pas être préparé."}
          </p>

          <a
            href="/"
            className="mt-6 inline-flex rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white"
          >
            Retour à l’accueil
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-6 text-center">
          <div className="text-5xl">🚖</div>

          <h1 className="mt-3 text-3xl font-black text-slate-900">
            Taxi Lachenaie
          </h1>

          <p className="mt-2 text-slate-600">
            Paiement sécurisé de la réservation #{reservationId}
          </p>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-xl sm:p-8">
          <div className="mb-6 rounded-2xl bg-slate-900 p-5 text-white">
            <p className="text-sm text-slate-300">
              Montant estimé
            </p>

            <p className="mt-1 text-3xl font-black">
              {amount.toLocaleString("fr-CA", {
                style: "currency",
                currency: "CAD",
              })}
            </p>

            <p className="mt-2 text-xs leading-5 text-slate-300">
              Une autorisation temporaire sera placée sur la carte. Le montant
              final sera capturé lorsque la course sera terminée.
            </p>
          </div>

          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: "stripe",
                variables: {
                  borderRadius: "12px",
                  fontFamily:
                    "Arial, Helvetica, sans-serif",
                },
              },
            }}
          >
            <PaymentForm
              amount={amount}
              reservationId={reservationId}
            />
          </Elements>
        </div>
      </div>
    </main>
  );
}