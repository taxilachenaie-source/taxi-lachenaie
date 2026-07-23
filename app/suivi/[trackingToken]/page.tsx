"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import TrackingMap from "./TrackingMap";
import { supabase } from "@/lib/supabase";

type PageProps = {
  params: Promise<{
    trackingToken: string;
  }>;
};

type Reservation = {
  id: number;
  name: string;
  origin: string;
  destination: string;
  trip_date: string;
  trip_time: string;
  service?: string | null;
  distance?: number | string | null;
  minutes?: number | string | null;
  price: number | string | null;
  status: string | null;
  tracking_status: string | null;
  tracking_enabled?: boolean;
  driver_id?: number | null;

  latitude?: number | string | null;
  longitude?: number | string | null;

  scheduled_at?: string | null;
  dispatch_at?: string | null;
  accepted_at?: string | null;
  driver_arrived_at?: string | null;
  trip_started_at?: string | null;
  trip_completed_at?: string | null;
};

type Driver = {
  id: number;
  name: string;
  vehicle: string | null;
  plate: string | null;
  status: string | null;
  current_position: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  speed?: number | string | null;
  heading?: number | string | null;
  last_location_at?: string | null;
  has_valid_location?: boolean;
};

type TrackingResponse = {
  success: boolean;
  tracking_enabled?: boolean;
  reservation?: Reservation;
  driver?: Driver | null;
  server_time?: string;
  error?: string;
};

type TimelineStep = {
  label: string;
  completed: boolean;
  active: boolean;
  date?: string | null;
};

const COMPLETED_STATUS = "Terminée";

function toValidNumber(
  value: number | string | null | undefined
): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value: number | string | null | undefined) {
  const amount = Number(value || 0);

  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString("fr-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getStatusRank(status?: string | null) {
  switch (status) {
    case "Programmée":
      return 0;

    case "Nouvelle":
      return 1;

    case "Acceptée":
      return 2;

    case "Chauffeur arrivé":
      return 3;

    case "En cours":
      return 4;

    case "Terminée":
      return 5;

    default:
      return 0;
  }
}

export default function SuiviPage({ params }: PageProps) {
  const [trackingToken, setTrackingToken] = useState("");
  const [reservation, setReservation] =
    useState<Reservation | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);

  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const loadTracking = useCallback(
    async (token: string, silent = false) => {
      if (!token) {
        return;
      }

      if (!silent) {
        setRefreshing(true);
      }

      try {
        const response = await fetch(
          `/api/tracking/${encodeURIComponent(token)}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const data = (await response.json()) as TrackingResponse;

        if (!response.ok || !data.success || !data.reservation) {
          setReservation(null);
          setDriver(null);
          setTrackingEnabled(false);

          setErrorMessage(
            data.error || "Cette réservation est introuvable."
          );

          return;
        }

        setReservation(data.reservation);
        setDriver(data.driver || null);

        setTrackingEnabled(
          data.tracking_enabled === true &&
            data.reservation.tracking_enabled !== false
        );

        setErrorMessage("");
        setLastUpdate(new Date());
      } catch (error) {
        console.error("Erreur chargement suivi :", error);

        setErrorMessage(
          "Le suivi est temporairement indisponible. Une nouvelle tentative sera effectuée automatiquement."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  /*
   * Récupérer le trackingToken fourni par Next.js.
   */
  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      const resolvedParams = await params;

      if (cancelled) {
        return;
      }

      const token = resolvedParams.trackingToken?.trim() || "";

      setTrackingToken(token);

      if (!token) {
        setLoading(false);
        setErrorMessage("Lien de suivi invalide.");
        return;
      }

      await loadTracking(token, true);
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [params, loadTracking]);

  /*
   * Realtime : changements apportés à la réservation.
   */
  useEffect(() => {
    if (!trackingToken || !reservation?.id) {
      return;
    }

    const reservationChannel = supabase
      .channel(`tracking-reservation-${reservation.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "reservations",
          filter: `id=eq.${reservation.id}`,
        },
        () => {
          void loadTracking(trackingToken, true);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(reservationChannel);
    };
  }, [trackingToken, reservation?.id, loadTracking]);

  /*
   * Realtime : position GPS du chauffeur assigné.
   */
  useEffect(() => {
    if (
      !trackingToken ||
      !trackingEnabled ||
      !driver?.id ||
      reservation?.status === COMPLETED_STATUS
    ) {
      return;
    }

    const driverChannel = supabase
      .channel(`tracking-driver-${driver.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "drivers",
          filter: `id=eq.${driver.id}`,
        },
        () => {
          void loadTracking(trackingToken, true);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(driverChannel);
    };
  }, [
    trackingToken,
    trackingEnabled,
    driver?.id,
    reservation?.status,
    loadTracking,
  ]);

  /*
   * Actualisation de secours.
   *
   * Supabase Realtime reste la méthode principale.
   * Cette requête ne se fait que toutes les 30 secondes.
   */
  useEffect(() => {
    if (
      !trackingToken ||
      reservation?.status === COMPLETED_STATUS
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      void loadTracking(trackingToken, true);
    }, 30_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [trackingToken, reservation?.status, loadTracking]);

  const tripFinished = reservation?.status === COMPLETED_STATUS;
  const statusRank = getStatusRank(reservation?.status);

  const scheduledForLater = useMemo(() => {
    if (!reservation || trackingEnabled) {
      return false;
    }

    if (reservation.status === "Programmée") {
      return true;
    }

    if (!reservation.dispatch_at) {
      return false;
    }

    const dispatchAt = new Date(reservation.dispatch_at).getTime();

    return Number.isFinite(dispatchAt) && dispatchAt > Date.now();
  }, [reservation, trackingEnabled]);

  const searchingDriver =
    Boolean(reservation) &&
    !trackingEnabled &&
    !scheduledForLater &&
    reservation?.status !== COMPLETED_STATUS;

  const clientLatitude = toValidNumber(reservation?.latitude);
  const clientLongitude = toValidNumber(reservation?.longitude);
  const driverLatitude = toValidNumber(driver?.latitude);
  const driverLongitude = toValidNumber(driver?.longitude);

  const timeline = useMemo<TimelineStep[]>(() => {
    if (!reservation) {
      return [];
    }

    return [
      {
        label: "Réservation enregistrée",
        completed: true,
        active: statusRank === 0,
        date: reservation.scheduled_at,
      },
      {
        label: "Chauffeur assigné",
        completed: statusRank >= 2,
        active: statusRank === 2,
        date: reservation.accepted_at,
      },
      {
        label: "Chauffeur arrivé",
        completed: statusRank >= 3,
        active: statusRank === 3,
        date: reservation.driver_arrived_at,
      },
      {
        label: "Course en cours",
        completed: statusRank >= 4,
        active: statusRank === 4,
        date: reservation.trip_started_at,
      },
      {
        label: "Course terminée",
        completed: statusRank >= 5,
        active: statusRank === 5,
        date: reservation.trip_completed_at,
      },
    ];
  }, [reservation, statusRank]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="rounded-3xl bg-white px-8 py-7 text-center shadow-lg">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-yellow-400" />

          <p className="mt-5 text-xl font-bold text-slate-900">
            Chargement du suivi...
          </p>
        </div>
      </main>
    );
  }

  if (!reservation) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="w-full max-w-lg rounded-3xl bg-white p-8 text-center shadow-lg">
          <div className="text-5xl">⚠️</div>

          <h1 className="mt-4 text-3xl font-black text-red-600">
            Lien de suivi invalide
          </h1>

          <p className="mt-4 text-slate-600">
            {errorMessage ||
              "Cette réservation est introuvable ou le lien a expiré."}
          </p>

          <button
            type="button"
            disabled={!trackingToken || refreshing}
            onClick={() => {
              void loadTracking(trackingToken);
            }}
            className="mt-6 rounded-xl bg-slate-900 px-6 py-3 font-bold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshing ? "Actualisation..." : "Réessayer"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 rounded-3xl bg-slate-950 p-6 text-white shadow-lg sm:p-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-3xl font-black text-yellow-400 sm:text-4xl">
                🚖 Taxi Lachenaie
              </h1>

              <p className="mt-2 text-lg text-slate-200">
                Suivi de votre réservation
              </p>

              {lastUpdate && (
                <p className="mt-3 text-sm text-slate-400">
                  Dernière mise à jour :{" "}
                  {lastUpdate.toLocaleTimeString("fr-CA")}
                </p>
              )}
            </div>

            <button
              type="button"
              disabled={refreshing}
              onClick={() => {
                void loadTracking(trackingToken);
              }}
              className="rounded-xl bg-white/10 px-5 py-3 font-bold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refreshing ? "Actualisation..." : "↻ Actualiser"}
            </button>
          </div>
        </header>

        {errorMessage && (
          <div className="mb-6 rounded-2xl border border-orange-200 bg-orange-100 p-4 font-semibold text-orange-800">
            {errorMessage}
          </div>
        )}

        {scheduledForLater && (
          <section className="mb-6 rounded-3xl border border-blue-200 bg-blue-50 p-6 shadow">
            <div className="text-4xl">✅</div>

            <h2 className="mt-3 text-2xl font-black text-blue-950">
              Réservation confirmée
            </h2>

            <p className="mt-3 text-lg text-blue-900">
              Votre réservation est bien enregistrée.
            </p>

            <p className="mt-3 text-blue-800">
              Nous rechercherons automatiquement un chauffeur
              environ 30 minutes avant votre heure de départ.
            </p>

            <p className="mt-3 font-semibold text-blue-950">
              Le suivi GPS sera activé dès qu’un chauffeur aura
              accepté votre course.
            </p>

            {reservation.dispatch_at && (
              <p className="mt-4 text-sm text-blue-700">
                Recherche prévue :{" "}
                {formatDateTime(reservation.dispatch_at)}
              </p>
            )}
          </section>
        )}

        {searchingDriver && (
          <section className="mb-6 rounded-3xl border border-yellow-200 bg-yellow-50 p-6 shadow">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-yellow-200 border-t-yellow-600" />

              <div>
                <h2 className="text-2xl font-black text-slate-950">
                  Recherche d’un chauffeur
                </h2>

                <p className="mt-1 text-slate-700">
                  Votre demande est en cours de répartition.
                </p>
              </div>
            </div>

            <p className="mt-4 text-sm text-slate-600">
              Cette page sera mise à jour automatiquement dès
              qu’un chauffeur acceptera la course.
            </p>
          </section>
        )}

        <section className="mb-6 rounded-3xl bg-white p-6 shadow">
          <h2 className="mb-4 text-2xl font-black text-slate-950">
            📌 Statut de la course
          </h2>

          <div
            className={`rounded-2xl p-5 ${
              tripFinished
                ? "bg-green-100 text-green-800"
                : reservation.status === "Chauffeur arrivé"
                  ? "bg-yellow-300 text-slate-950"
                  : reservation.status === "En cours"
                    ? "bg-blue-100 text-blue-900"
                    : "bg-slate-100 text-slate-900"
            }`}
          >
            <p className="text-2xl font-black">
              {reservation.tracking_status ||
                reservation.status ||
                "Réservation reçue"}
            </p>

            <p className="mt-2 text-sm font-medium opacity-80">
              {tripFinished
                ? "Le suivi GPS de cette course est terminé."
                : trackingEnabled
                  ? "Les informations sont actualisées automatiquement."
                  : "Le suivi GPS n’est pas encore activé."}
            </p>
          </div>
        </section>

        <section className="mb-6 rounded-3xl bg-white p-6 shadow">
          <h2 className="mb-5 text-2xl font-black text-slate-950">
            Progression
          </h2>

          <div className="space-y-4">
            {timeline.map((step) => (
              <div
                key={step.label}
                className="flex items-start gap-4"
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-black ${
                    step.completed
                      ? "bg-green-600 text-white"
                      : step.active
                        ? "bg-yellow-400 text-slate-950"
                        : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {step.completed ? "✓" : "○"}
                </div>

                <div className="min-w-0">
                  <p
                    className={`font-bold ${
                      step.completed || step.active
                        ? "text-slate-950"
                        : "text-slate-400"
                    }`}
                  >
                    {step.label}
                  </p>

                  {step.date && (
                    <p className="mt-1 text-sm text-slate-500">
                      {formatDateTime(step.date)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-6 rounded-3xl bg-white p-6 shadow">
          <h2 className="mb-5 text-2xl font-black text-slate-950">
            Votre trajet
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-100 p-4">
              <p className="text-sm font-semibold text-slate-500">
                Client
              </p>

              <p className="mt-1 text-lg font-bold text-slate-950">
                {reservation.name}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-100 p-4">
              <p className="text-sm font-semibold text-slate-500">
                Date et heure
              </p>

              <p className="mt-1 text-lg font-bold text-slate-950">
                {reservation.trip_date} à {reservation.trip_time}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-100 p-4 sm:col-span-2">
              <p className="text-sm font-semibold text-slate-500">
                📍 Départ
              </p>

              <p className="mt-1 text-lg font-bold text-slate-950">
                {reservation.origin}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-100 p-4 sm:col-span-2">
              <p className="text-sm font-semibold text-slate-500">
                🏁 Destination
              </p>

              <p className="mt-1 text-lg font-bold text-slate-950">
                {reservation.destination}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-slate-200 pt-5">
            <div>
              {reservation.distance !== null &&
                reservation.distance !== undefined && (
                  <p className="text-sm text-slate-600">
                    Distance estimée :{" "}
                    <strong>
                      {Number(reservation.distance).toFixed(1)} km
                    </strong>
                  </p>
                )}

              {reservation.minutes !== null &&
                reservation.minutes !== undefined && (
                  <p className="mt-1 text-sm text-slate-600">
                    Durée estimée :{" "}
                    <strong>
                      {Math.ceil(Number(reservation.minutes))} min
                    </strong>
                  </p>
                )}
            </div>

            <p className="text-3xl font-black text-green-600">
              {formatMoney(reservation.price)}
            </p>
          </div>
        </section>

        {trackingEnabled && !tripFinished && (
          <section className="mb-6 rounded-3xl bg-white p-6 shadow">
            <h2 className="mb-4 text-2xl font-black text-slate-950">
              🗺️ Suivi GPS en direct
            </h2>

            <TrackingMap
              clientLatitude={clientLatitude}
              clientLongitude={clientLongitude}
              driverLatitude={driverLatitude}
              driverLongitude={driverLongitude}
            />
          </section>
        )}

        {trackingEnabled && driver && !tripFinished && (
          <section className="mb-6 rounded-3xl bg-white p-6 shadow">
            <h2 className="mb-4 text-2xl font-black text-slate-950">
              🚖 Votre chauffeur
            </h2>

            <div className="rounded-2xl bg-green-100 p-5">
              <p className="text-2xl font-black text-green-950">
                👤 {driver.name}
              </p>

              <p className="mt-3 text-green-900">
                🚗 {driver.vehicle || "Véhicule"}
                {driver.plate ? ` • ${driver.plate}` : ""}
              </p>

              <p className="mt-2 text-green-900">
                📍{" "}
                {driver.current_position ||
                  "Position en cours de mise à jour"}
              </p>

              {driverLatitude !== null &&
                driverLongitude !== null && (
                  <p className="mt-3 inline-flex rounded-full bg-green-600 px-3 py-1 text-sm font-bold text-white">
                    GPS actif
                  </p>
                )}
            </div>
          </section>
        )}

        {!trackingEnabled && !tripFinished && (
          <section className="rounded-3xl bg-white p-6 shadow">
            <h2 className="text-2xl font-black text-slate-950">
              🚖 Votre chauffeur
            </h2>

            <div className="mt-4 rounded-2xl bg-slate-100 p-5">
              <p className="text-xl font-bold text-slate-900">
                Aucun chauffeur confirmé pour le moment
              </p>

              <p className="mt-2 text-slate-600">
                Les informations du chauffeur apparaîtront ici
                immédiatement après son acceptation.
              </p>
            </div>
          </section>
        )}

        {tripFinished && (
          <section className="rounded-3xl bg-green-700 p-8 text-center text-white shadow">
            <div className="text-5xl">✅</div>

            <h2 className="mt-4 text-3xl font-black">
              Course terminée
            </h2>

            <p className="mt-3 text-lg text-green-100">
              Merci d’avoir choisi Taxi Lachenaie.
            </p>

            <p className="mt-5 text-3xl">⭐⭐⭐⭐⭐</p>
          </section>
        )}
      </div>
    </main>
  );
}