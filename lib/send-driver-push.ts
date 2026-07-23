import { firebaseAdminMessaging } from "@/lib/firebase-admin";
import { supabaseServer } from "@/lib/supabase-server";

type SendDriverPushParams = {
  driverId: number;
  reservationId: number;
  clientName: string;
  origin: string;
  destination: string;
  price: number;
};

export async function sendDriverPush({
  driverId,
  reservationId,
  clientName,
  origin,
  destination,
  price,
}: SendDriverPushParams) {
  const { data: driver, error } = await supabaseServer
    .from("drivers")
    .select("push_token")
    .eq("id", driverId)
    .maybeSingle();

  if (error) {
    console.error("Erreur lecture push_token :", error);
    return {
      success: false,
      error: error.message,
    };
  }

  if (!driver?.push_token) {
    return {
      success: false,
      error: "Aucun jeton Push pour ce chauffeur.",
    };
  }

  try {
    const messageId = await firebaseAdminMessaging.send({
      token: driver.push_token,

      notification: {
        title: "🚖 Nouvelle course Taxi Lachenaie",
        body: `${clientName} — ${origin} → ${destination} — ${Number(
          price || 0
        ).toFixed(2)} $`,
      },

      data: {
        title: "🚖 Nouvelle course Taxi Lachenaie",
        body: `${clientName} — ${origin} → ${destination}`,
        reservation_id: String(reservationId),
        url: "/chauffeur",
      },

      webpush: {
        fcmOptions: {
          link: "/chauffeur",
        },

        notification: {
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: `reservation-${reservationId}`,
          requireInteraction: true,
          renotify: true,
          vibrate: [300, 150, 300, 150, 500],
        },
      },
    });

    return {
      success: true,
      messageId,
    };
  } catch (error) {
    console.error("Erreur envoi notification Firebase :", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erreur inconnue Firebase.",
    };
  }
}