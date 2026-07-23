"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import DriversMap from "./components/DriversMap";
import PushNotificationSetup from "./components/PushNotificationSetup";
import TaxiMeter from "@/app/components/TaxiMeter";

type Driver = {
  id: number;
  name: string;
  phone: string;
  email: string;
  vehicle: string;
  plate: string;
  status: string;
  current_position: string;
  balance: number;
  minimum_topup: number;
  commission_rate: number;
};

type Transaction = {
  id: number;
  type: string;
  description: string;
  amount: number;
  created_at: string;
};

type Reservation = {
  id: number;
  name: string;
  phone: string;
  origin: string;
  destination: string;
  trip_date: string;
  trip_time: string;
  price: number;
  status: string;
  service: string;

  meter_status?: string | null;
  meter_distance_km?: number | null;
  meter_waiting_seconds?: number | null;
  meter_elapsed_seconds?: number | null;
  meter_current_price?: number | null;
};

export default function ChauffeurPage() {
  const [driver, setDriver] = useState<Driver | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [newReservation, setNewReservation] =
    useState<Reservation | null>(null);
  const [countdown, setCountdown] = useState(60);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const soundIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentAlertIdRef = useRef<number | null>(null);
  const gpsWatchIdRef = useRef<number | null>(null);

  useEffect(() => {
    void loadDriver();
    startGpsTracking();

    const checkInterval = window.setInterval(() => {
      void checkNewReservation();
    }, 5000);

    const channel = supabase
      .channel("chauffeur-reservations")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reservations",
        },
        async () => {
          await loadDriver();
          await checkNewReservation();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
      window.clearInterval(checkInterval);
      stopAlertSound();

      if (
        gpsWatchIdRef.current !== null &&
        navigator.geolocation
      ) {
        navigator.geolocation.clearWatch(
          gpsWatchIdRef.current
        );
      }
    };
  }, []);

  useEffect(() => {
    if (!newReservation) return;

    setCountdown(60);
    startAlertSound();

    const timer = window.setInterval(() => {
      setCountdown((seconds) => {
        if (seconds <= 1) {
          window.clearInterval(timer);
          stopAlertSound();
          setNewReservation(null);
          currentAlertIdRef.current = null;
          return 0;
        }

        return seconds - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [newReservation]);

  async function checkNewReservation() {
    try {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        return;
      }

      const response = await fetch(
        "/api/chauffeur/reservations",
        {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
          },
        }
      );

      const result = await response.json();

      if (
        !response.ok ||
        !result.success ||
        !Array.isArray(result.reservations)
      ) {
        return;
      }

      const pendingReservation = result.reservations.find(
        (reservation: Reservation) =>
          reservation.status === "Nouvelle"
      );

      if (!pendingReservation) {
        stopAlertSound();
        setNewReservation(null);
        currentAlertIdRef.current = null;
        return;
      }

      if (
        pendingReservation.id === currentAlertIdRef.current
      ) {
        return;
      }

      currentAlertIdRef.current = pendingReservation.id;
      setNewReservation(pendingReservation);
    } catch (error) {
      console.error(
        "Erreur vérification nouvelle réservation :",
        error
      );
    }
  }

  async function loadDriver() {
    try {
      const { data: userData } =
        await supabase.auth.getUser();

      if (!userData.user) {
        window.location.href = "/chauffeur/login";
        return;
      }

      const { data: driverData, error } = await supabase
        .from("drivers")
        .select("*")
        .eq("auth_user_id", userData.user.id)
        .single();

      if (error || !driverData) {
        alert("Aucun chauffeur lié à ce compte.");
        return;
      }

      setDriver(driverData);

      const walletResponse = await fetch(
        `/api/admin/drivers/${driverData.id}/wallet`,
        {
          cache: "no-store",
        }
      );

      const wallet = await walletResponse.json();

      if (walletResponse.ok && wallet.success) {
        setTransactions(wallet.transactions || []);
      }

      const { data: sessionData } =
        await supabase.auth.getSession();

      if (!sessionData.session) return;

      const reservationsResponse = await fetch(
        "/api/chauffeur/reservations",
        {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${sessionData.session.access_token}`,
          },
        }
      );

      const reservationsData =
        await reservationsResponse.json();

      if (
        reservationsResponse.ok &&
        reservationsData.success
      ) {
        setReservations(
          Array.isArray(reservationsData.reservations)
            ? reservationsData.reservations
            : []
        );
      }
    } catch (error) {
      console.error("Erreur page chauffeur :", error);
      alert("Erreur dans la page chauffeur.");
    } finally {
      setLoading(false);
    }
  }

  async function reservationAction(
    reservationId: number,
    action: "accept" | "refuse"
  ) {
    try {
      setActionLoading(reservationId);

      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        alert("Session introuvable.");
        return;
      }

      const response = await fetch(
        `/api/chauffeur/reservations/${reservationId}/action`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        alert(
          result.error ||
            "Impossible de traiter cette course."
        );
        return;
      }

      stopAlertSound();
      setNewReservation(null);
      currentAlertIdRef.current = null;

      await loadDriver();
    } catch (error) {
      console.error(
        "Erreur action réservation :",
        error
      );

      alert("Erreur pendant le traitement de la course.");
    } finally {
      setActionLoading(null);
    }
  }

  async function driverArrived(
    reservationId: number
  ) {
    try {
      setActionLoading(reservationId);

      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        alert("Session introuvable.");
        return;
      }

      const response = await fetch(
        `/api/chauffeur/reservations/${reservationId}/arrived`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        alert(
          result.error ||
            "Impossible de confirmer votre arrivée."
        );
        return;
      }

      await loadDriver();
    } catch (error) {
      console.error(
        "Erreur confirmation arrivée :",
        error
      );

      alert("Impossible de confirmer votre arrivée.");
    } finally {
      setActionLoading(null);
    }
  }

  async function startTrip(reservationId: number) {
  try {
    setActionLoading(reservationId);

    const { data } = await supabase.auth.getSession();

    if (!data.session) {
      alert("Session introuvable.");
      return;
    }

    const response = await fetch(
      `/api/chauffeur/reservations/${reservationId}/start`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const rawResponse = await response.text();

    let result: {
      success?: boolean;
      error?: string;
      message?: string;
    };

    try {
      result = JSON.parse(rawResponse);
    } catch {
      console.error("Réponse API non JSON :", rawResponse);

      alert(
        `Route API introuvable ou invalide.\nStatut HTTP : ${response.status}`
      );
      return;
    }

    if (!response.ok || !result.success) {
      console.error("Erreur API start :", result);

      alert(
        result.error ||
          `Impossible de démarrer la course. Code : ${response.status}`
      );
      return;
    }

    await loadDriver();
  } catch (error) {
    console.error("Erreur démarrage course :", error);

    alert(
      error instanceof Error
        ? `Impossible de démarrer la course : ${error.message}`
        : "Impossible de démarrer la course."
    );
  } finally {
    setActionLoading(null);
  }
}
  async function completeReservation(
    reservationId: number
  ) {
    const ok = window.confirm(
      "Voulez-vous vraiment terminer cette course ?"
    );

    if (!ok) return;

    try {
      setActionLoading(reservationId);

      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        alert("Session introuvable.");
        return;
      }

      const response = await fetch(
        `/api/chauffeur/reservations/${reservationId}/complete`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        alert(
          result.error ||
            "Impossible de terminer la course."
        );
        return;
      }

      alert(
        `Course terminée.\nCommission : ${
          result.commissionAmount ?? 0
        } $\nNouveau solde : ${
          result.newBalance ?? 0
        } $`
      );

      await loadDriver();
    } catch (error) {
      console.error(
        "Erreur fin de course :",
        error
      );

      alert("Impossible de terminer la course.");
    } finally {
      setActionLoading(null);
    }
  }

  function startGpsTracking() {
    if (!navigator.geolocation) {
      console.error(
        "La géolocalisation n’est pas disponible."
      );
      return;
    }

    gpsWatchIdRef.current =
      navigator.geolocation.watchPosition(
        async (position) => {
          try {
            const { data: userData } =
              await supabase.auth.getUser();

            if (!userData.user) {
              console.error(
                "Utilisateur non connecté."
              );
              return;
            }

            const {
              data: driverData,
              error: driverError,
            } = await supabase
              .from("drivers")
              .select("id")
              .eq(
                "auth_user_id",
                userData.user.id
              )
              .maybeSingle();

            if (driverError || !driverData) {
              console.error(
                "Chauffeur GPS introuvable :",
                driverError
              );
              return;
            }

            const response = await fetch(
              "/api/chauffeur/update-location",
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body: JSON.stringify({
                  driver_id: driverData.id,
                  latitude:
                    position.coords.latitude,
                  longitude:
                    position.coords.longitude,
                  speed:
                    position.coords.speed ?? 0,
                  heading:
                    position.coords.heading ?? 0,
                }),
              }
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
              console.error(
                "Erreur mise à jour GPS :",
                result.error ||
                  "Erreur inconnue"
              );
            }
          } catch (error) {
            console.error(
              "Erreur envoi GPS :",
              error
            );
          }
        },
        (error) => {
          console.error(
            "Erreur GPS :",
            error.message
          );
        },
        {
          enableHighAccuracy: true,
          maximumAge: 3000,
          timeout: 10000,
        }
      );
  }

  function playAlertSound() {
    try {
      const audioContext = new AudioContext();
      const oscillator =
        audioContext.createOscillator();
      const gainNode =
        audioContext.createGain();

      oscillator.type = "square";

      oscillator.frequency.setValueAtTime(
        950,
        audioContext.currentTime
      );

      gainNode.gain.setValueAtTime(
        0.6,
        audioContext.currentTime
      );

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.start();

      oscillator.stop(
        audioContext.currentTime + 0.45
      );
    } catch (error) {
      console.error(
        "Son bloqué par le navigateur",
        error
      );
    }
  }

  function startAlertSound() {
    if (soundIntervalRef.current) return;

    playAlertSound();

    soundIntervalRef.current = setInterval(() => {
      playAlertSound();
    }, 1000);
  }

  function stopAlertSound() {
    if (soundIntervalRef.current) {
      clearInterval(soundIntervalRef.current);
      soundIntervalRef.current = null;
    }
  }

  function openNavigation(reservation: Reservation) {
    const destination =
      reservation.status === "En cours"
        ? reservation.destination
        : reservation.origin;

    const navigationUrl =
      `https://www.google.com/maps/dir/?api=1` +
      `&destination=${encodeURIComponent(
        destination
      )}` +
      `&travelmode=driving`;

    window.open(
      navigationUrl,
      "_blank",
      "noopener,noreferrer"
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-2xl bg-white px-8 py-6 text-xl font-bold shadow">
          Chargement...
        </div>
      </main>
    );
  }

  if (!driver) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-2xl bg-white px-8 py-6 text-xl font-bold shadow">
          Chauffeur introuvable.
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-2 text-3xl font-black sm:text-4xl">
          🚖 Bonjour {driver.name}
        </h1>

        <p className="mb-8 text-slate-600">
          Application chauffeur Taxi Lachenaie
        </p>
          <PushNotificationSetup driverId={driver.id} />
        <section className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-6 shadow">
            <p className="text-slate-500">
              Solde actuel
            </p>

            <h2
              className={`mt-3 text-5xl font-bold ${
                Number(driver.balance) <= 0
                  ? "text-red-600"
                  : "text-green-600"
              }`}
            >
              {Number(
                driver.balance || 0
              ).toFixed(2)}{" "}
              $
            </h2>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow">
            <p className="text-slate-500">
              Commission
            </p>

            <h2 className="mt-3 text-5xl font-bold text-red-500">
              {Number(
                driver.commission_rate || 10
              )}{" "}
              %
            </h2>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow">
            <p className="text-slate-500">
              Recharge minimale
            </p>

            <h2 className="mt-3 text-5xl font-bold text-blue-600">
              {Number(
                driver.minimum_topup || 50
              )}{" "}
              $
            </h2>
          </div>
        </section>

        {Number(driver.balance) <= 0 && (
          <div className="mb-8 rounded-2xl bg-red-600 p-5 font-bold text-white shadow">
            🚫 Votre solde est à 0 $ ou négatif.
            Vous ne recevrez pas de nouvelles courses
            tant que votre compte n’est pas rechargé.
          </div>
        )}

        <section className="mb-8 rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-4 text-2xl font-bold">
            🚕 Mon statut
          </h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Info
              label="Statut"
              value={
                driver.status || "Disponible"
              }
            />

            <Info
              label="Position"
              value={
                driver.current_position ||
                "Garage Taxi Lachenaie"
              }
            />

            <Info
              label="Véhicule"
              value={`${driver.vehicle || ""} ${
                driver.plate || ""
              }`}
            />
          </div>
        </section>

        <section className="mb-8 rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-4 text-2xl font-bold">
            🗺️ Position des chauffeurs
          </h2>

          <p className="mb-5 text-slate-500">
            Votre véhicule apparaît en bleu. Les
            autres chauffeurs apparaissent uniquement
            comme des taxis anonymes.
          </p>

          <DriversMap
            currentDriverId={driver.id}
          />
        </section>

        {newReservation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="w-full max-w-xl rounded-3xl bg-white p-8 shadow-2xl">
              <h2 className="mb-4 text-center text-4xl font-bold text-red-600">
                🔔 Nouvelle course
              </h2>

              <div className="mb-6 text-center">
                <p className="text-lg font-bold">
                  ⏳ Temps restant
                </p>

                <p
                  className={`text-7xl font-black ${
                    countdown <= 5
                      ? "text-red-600"
                      : "text-yellow-500"
                  }`}
                >
                  {countdown}
                </p>
              </div>

              <div className="space-y-4 text-xl">
                <p>
                  👤 <strong>Client :</strong>{" "}
                  {newReservation.name}
                </p>

                <p>
                  📞 <strong>Téléphone :</strong>{" "}
                  {newReservation.phone}
                </p>

                <p>
                  📍 <strong>Départ :</strong>{" "}
                  {newReservation.origin}
                </p>

                <p>
                  🏁{" "}
                  <strong>Destination :</strong>{" "}
                  {newReservation.destination}
                </p>

                <p className="text-4xl font-bold text-green-600">
                  {Number(
                    newReservation.price
                  ).toFixed(2)}{" "}
                  $
                </p>
              </div>

              <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
                <button
                  type="button"
                  disabled={
                    actionLoading ===
                    newReservation.id
                  }
                  onClick={() =>
                    reservationAction(
                      newReservation.id,
                      "accept"
                    )
                  }
                  className="rounded-2xl bg-green-600 px-6 py-5 text-2xl font-bold text-white disabled:opacity-50"
                >
                  ✅ Accepter
                </button>

                <button
                  type="button"
                  disabled={
                    actionLoading ===
                    newReservation.id
                  }
                  onClick={() =>
                    reservationAction(
                      newReservation.id,
                      "refuse"
                    )
                  }
                  className="rounded-2xl bg-red-600 px-6 py-5 text-2xl font-bold text-white disabled:opacity-50"
                >
                  ❌ Refuser
                </button>
              </div>
            </div>
          </div>
        )}

        <section className="mb-8 rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-6 text-2xl font-bold">
            🚖 Mes courses
          </h2>

          {reservations.length === 0 ? (
            <p className="text-slate-500">
              Aucune course assignée.
            </p>
          ) : (
            <div className="space-y-4">
              {reservations.map((reservation) => (
                <article
                  key={reservation.id}
                  className="rounded-xl border p-5"
                >
                  <div className="flex flex-col justify-between gap-4 sm:flex-row">
                    <div>
                      <h3 className="text-xl font-bold">
                        {reservation.name}
                      </h3>

                      <a
                        href={`tel:${reservation.phone}`}
                        className="text-blue-600 hover:underline"
                      >
                        📞 {reservation.phone}
                      </a>
                    </div>

                    <span className="self-start rounded-full bg-blue-600 px-4 py-2 font-bold text-white">
                      {reservation.status}
                    </span>
                  </div>

                  <div className="mt-5 space-y-2">
                    {reservation.status === "En cours" && (
  <div className="mt-6">
    <TaxiMeter
      reservationId={reservation.id}
      clientName={reservation.name}
      service={reservation.service}
      initialDistanceKm={
        reservation.meter_distance_km ?? 0
      }
      initialWaitingSeconds={
        reservation.meter_waiting_seconds ?? 0
      }
      initialElapsedSeconds={
        reservation.meter_elapsed_seconds ?? 0
      }
    />
  </div>
)}
                    <p>
                      📍 <strong>Départ :</strong>{" "}
                      {reservation.origin}
                    </p>

                    <p>
                      🏁{" "}
                      <strong>Destination :</strong>{" "}
                      {reservation.destination}
                    </p>

                    <p>
                      📅 {reservation.trip_date} à{" "}
                      {reservation.trip_time}
                    </p>

                    <p className="text-2xl font-bold text-green-600">
                      {Number(
                        reservation.price
                      ).toFixed(2)}{" "}
                      $
                    </p>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    {reservation.status ===
                      "Nouvelle" && (
                      <>
                        <button
                          type="button"
                          disabled={
                            actionLoading ===
                            reservation.id
                          }
                          onClick={() =>
                            reservationAction(
                              reservation.id,
                              "accept"
                            )
                          }
                          className="rounded-xl bg-green-600 px-5 py-3 font-bold text-white disabled:opacity-50"
                        >
                          ✅ Accepter
                        </button>

                        <button
                          type="button"
                          disabled={
                            actionLoading ===
                            reservation.id
                          }
                          onClick={() =>
                            reservationAction(
                              reservation.id,
                              "refuse"
                            )
                          }
                          className="rounded-xl bg-red-600 px-5 py-3 font-bold text-white disabled:opacity-50"
                        >
                          ❌ Refuser
                        </button>
                      </>
                    )}

                    {reservation.status ===
                      "Acceptée" && (
                      <button
                        type="button"
                        disabled={
                          actionLoading ===
                          reservation.id
                        }
                        onClick={() =>
                          driverArrived(
                            reservation.id
                          )
                        }
                        className="rounded-xl bg-orange-500 px-5 py-3 font-bold text-white disabled:opacity-50"
                      >
                        📍 Je suis arrivé
                      </button>
                    )}

                   {reservation.status === "Chauffeur arrivé" && (
  <button
    type="button"
    onClick={() => {
      console.log(
        "Bouton démarrer cliqué",
        reservation.id,
        "actionLoading:",
        actionLoading
      );

      void startTrip(reservation.id);
    }}
    className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white"
  >
    🚖 Débuter la course
  </button>
)}

                    <button
                      type="button"
                      onClick={() =>
                        openNavigation(reservation)
                      }
                      className="rounded-xl bg-slate-900 px-5 py-3 font-bold text-white"
                    >
                      🗺️ Navigation
                    </button>

                    {reservation.status ===
                      "En cours" && (
                      <button
                        type="button"
                        disabled={
                          actionLoading ===
                          reservation.id
                        }
                        onClick={() =>
                          completeReservation(
                            reservation.id
                          )
                        }
                        className="rounded-xl bg-yellow-400 px-5 py-3 font-bold text-black disabled:opacity-50"
                      >
                        🏁 Terminer
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-white p-6 shadow">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-2xl font-bold">
              📄 Historique portefeuille
            </h2>

            <button
              type="button"
              className="rounded-xl bg-yellow-400 px-6 py-3 font-bold text-black"
            >
              💳 Recharger
            </button>
          </div>

          {transactions.length === 0 ? (
            <p className="text-slate-500">
              Aucune transaction.
            </p>
          ) : (
            <div className="space-y-3">
              {transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border p-4 sm:flex-row sm:items-center"
                >
                  <div>
                    <p className="font-bold">
                      {transaction.description}
                    </p>

                    <p className="text-sm text-slate-500">
                      {new Date(
                        transaction.created_at
                      ).toLocaleString("fr-CA")}
                    </p>
                  </div>

                  <p
                    className={`text-2xl font-bold ${
                      Number(
                        transaction.amount
                      ) >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {Number(transaction.amount) >= 0
                      ? "+"
                      : ""}
                    {Number(
                      transaction.amount
                    ).toFixed(2)}{" "}
                    $
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-sm text-slate-500">
        {label}
      </p>

      <p className="font-bold">{value}</p>
    </div>
  );
}