"use client";

import { useEffect, useState } from "react";
import { getToken, onMessage } from "firebase/messaging";
import { getFirebaseMessaging } from "@/lib/firebase";
import { supabase } from "@/lib/supabase";

type Props = {
  driverId: number;
};

export default function PushNotificationSetup({
  driverId,
}: Props) {
  const [status, setStatus] = useState<
    "idle" | "loading" | "enabled" | "denied" | "error"
  >("idle");

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    async function initializeForegroundMessages() {
      const messaging = await getFirebaseMessaging();

      if (!messaging) return;

      unsubscribe = onMessage(messaging, (payload) => {
        console.log("Notification reçue au premier plan :", payload);

        const title =
          payload.notification?.title ||
          payload.data?.title ||
          "🚖 Taxi Lachenaie";

        const body =
          payload.notification?.body ||
          payload.data?.body ||
          "Une nouvelle course est disponible.";

        if (
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          new Notification(title, {
            body,
            icon: "/icon-192.png",
            badge: "/icon-192.png",
            tag:
              payload.data?.reservation_id ||
              "taxi-lachenaie",
          });
        }

        if ("vibrate" in navigator) {
          navigator.vibrate([300, 150, 300, 150, 500]);
        }
      });
    }

    void initializeForegroundMessages();

    return () => {
      unsubscribe?.();
    };
  }, []);

  async function activateNotifications() {
    try {
      setStatus("loading");

      if (!("Notification" in window)) {
        setStatus("error");
        alert(
          "Les notifications ne sont pas compatibles avec ce navigateur."
        );
        return;
      }

      const permission =
        await Notification.requestPermission();

      if (permission !== "granted") {
        setStatus("denied");
        alert(
          "Les notifications ont été refusées. Autorisez-les dans les paramètres du navigateur."
        );
        return;
      }

      if (!("serviceWorker" in navigator)) {
        setStatus("error");
        alert(
          "Le service worker n’est pas disponible sur ce navigateur."
        );
        return;
      }

      const registration =
        await navigator.serviceWorker.register(
          "/firebase-messaging-sw.js"
        );

      await navigator.serviceWorker.ready;

      const messaging = await getFirebaseMessaging();

      if (!messaging) {
        setStatus("error");
        alert(
          "Firebase Messaging n’est pas pris en charge par ce navigateur."
        );
        return;
      }

      const vapidKey =
        process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

      if (!vapidKey) {
        setStatus("error");
        alert(
          "La clé publique VAPID est absente de .env.local."
        );
        return;
      }

      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: registration,
      });

      if (!token) {
        setStatus("error");
        alert(
          "Firebase n’a pas retourné de jeton de notification."
        );
        return;
      }

      const { data: sessionData } =
        await supabase.auth.getSession();

      if (!sessionData.session) {
        setStatus("error");
        alert("Session chauffeur introuvable.");
        return;
      }

      const response = await fetch(
        "/api/chauffeur/push-token",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${sessionData.session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            driver_id: driverId,
            token,
            user_agent: navigator.userAgent,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        setStatus("error");
        alert(
          result.error ||
            "Impossible d’enregistrer le jeton de notification."
        );
        return;
      }

      setStatus("enabled");

      alert(
        "Notifications activées avec succès sur cet appareil."
      );
    } catch (error) {
      console.error(
        "Erreur activation notifications :",
        error
      );

      setStatus("error");

      alert(
        error instanceof Error
          ? `Erreur notifications : ${error.message}`
          : "Impossible d’activer les notifications."
      );
    }
  }

  return (
    <section className="mb-8 rounded-2xl bg-white p-6 shadow">
      <h2 className="text-2xl font-bold">
        🔔 Notifications chauffeur
      </h2>

      <p className="mt-2 text-slate-600">
        Activez les alertes pour recevoir les nouvelles
        courses sur cet appareil.
      </p>

      <button
        type="button"
        onClick={activateNotifications}
        disabled={
          status === "loading" ||
          status === "enabled"
        }
        className="mt-5 rounded-xl bg-yellow-400 px-6 py-3 font-bold text-black disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "loading"
          ? "Activation..."
          : status === "enabled"
            ? "✅ Notifications activées"
            : "🔔 Activer les notifications"}
      </button>

      {status === "denied" && (
        <p className="mt-3 font-semibold text-red-600">
          Les notifications sont bloquées dans le navigateur.
        </p>
      )}

      {status === "error" && (
        <p className="mt-3 font-semibold text-red-600">
          Une erreur est survenue pendant l’activation.
        </p>
      )}
    </section>
  );
}