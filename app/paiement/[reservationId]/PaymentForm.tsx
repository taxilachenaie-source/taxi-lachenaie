"use client";

import {
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { FormEvent, useState } from "react";

type PaymentFormProps = {
  amount: number;
  reservationId: number;
};

type ConfirmationResponse = {
  success?: boolean;
  error?: string;
};

export default function PaymentForm({
  amount,
  reservationId,
}: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!stripe || !elements || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
        confirmParams: {
          return_url: `${window.location.origin}/paiement/${reservationId}/confirmation`,
        },
      });

      if (error) {
        setMessage(
          error.message || "Le paiement n’a pas pu être autorisé."
        );
        return;
      }

      if (
        paymentIntent?.status === "requires_capture" ||
        paymentIntent?.status === "succeeded"
      ) {
        const confirmationResponse = await fetch(
          "/api/payments/confirm",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              reservationId,
              paymentIntentId: paymentIntent.id,
            }),
          }
        );

        const responseText = await confirmationResponse.text();

        let confirmationData: ConfirmationResponse = {};

        try {
          confirmationData = responseText
            ? (JSON.parse(responseText) as ConfirmationResponse)
            : {};
        } catch {
          throw new Error(
            "Le serveur a retourné une réponse invalide pendant la confirmation."
          );
        }

        if (
          !confirmationResponse.ok ||
          !confirmationData.success
        ) {
          throw new Error(
            confirmationData.error ||
              "Le paiement est autorisé, mais la réservation n’a pas pu être mise à jour."
          );
        }

        setIsSuccess(true);

        if (paymentIntent.status === "requires_capture") {
          setMessage(
            "Votre carte a été autorisée. Le montant sera débité à la fin de la course."
          );
        } else {
          setMessage("Le paiement a été effectué avec succès.");
        }

        return;
      }

      if (paymentIntent?.status === "processing") {
        setMessage("Le paiement est en cours de traitement.");
        return;
      }

      setMessage(
        `État du paiement : ${paymentIntent?.status || "inconnu"}.`
      );
    } catch (error) {
      console.error("Erreur de confirmation Stripe :", error);

      setMessage(
        error instanceof Error
          ? error.message
          : "Une erreur est survenue pendant le paiement."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSuccess) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
        <div className="mb-3 text-4xl">✅</div>

        <h2 className="text-xl font-bold text-green-800">
          Réservation confirmée
        </h2>

        <p className="mt-3 text-sm leading-6 text-green-700">
          {message}
        </p>

        <p className="mt-4 text-sm text-green-700">
          Montant autorisé :{" "}
          <strong>
            {amount.toLocaleString("fr-CA", {
              style: "currency",
              currency: "CAD",
            })}
          </strong>
        </p>

        <a
          href="/"
          className="mt-6 inline-flex rounded-xl bg-green-700 px-5 py-3 font-semibold text-white transition hover:bg-green-800"
        >
          Retour à l’accueil
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <PaymentElement
          options={{
            layout: "tabs",
          }}
        />
      </div>

      {message && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {message}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || !elements || isSubmitting}
        className="w-full rounded-xl bg-yellow-400 px-6 py-4 text-lg font-bold text-slate-950 transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting
          ? "Autorisation en cours..."
          : `Autoriser ${amount.toLocaleString("fr-CA", {
              style: "currency",
              currency: "CAD",
            })}`}
      </button>

      <p className="text-center text-xs leading-5 text-slate-500">
        Paiement sécurisé par Stripe. Le montant est autorisé maintenant et
        sera capturé à la fin de la course.
      </p>
    </form>
  );
}