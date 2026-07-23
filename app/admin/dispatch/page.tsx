"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@supabase/supabase-js";

const DispatchMap = dynamic(() => import("../components/DispatchMap"), {
  ssr: false,
});

type Driver = {
  id: number;
  name: string;
  phone: string;
  email: string;
  vehicle: string;
  plate: string;
  status: string;
  current_position: string;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  last_location_at: string | null;
  balance: number;
};
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

export default function DispatchPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [dispatchQueues, setDispatchQueues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();

    const interval = setInterval(loadAll, 5000);

    const schedulerInterval = setInterval(async () => {
      try {
        await fetch("/api/admin/dispatch-scheduler");
      } catch {
        console.log("Scheduler temporairement indisponible");
      }
    }, 10000);

    return () => {
      clearInterval(interval);
      clearInterval(schedulerInterval);
    };
  }, []);

  async function loadAll() {
    await Promise.all([
      loadDrivers(),
      loadReservations(),
      loadDispatchQueues(),
    ]);

    setLoading(false);
  }

  async function loadDrivers() {
    try {
      const response = await fetch("/api/admin/drivers");
      const data = await response.json();

      if (Array.isArray(data)) {
        setDrivers(data);
      }
    } catch {
      console.log("Chauffeurs temporairement indisponibles");
    }
  }

  async function loadReservations() {
    try {
      const response = await fetch("/api/admin/reservations");
      const data = await response.json();

      if (Array.isArray(data)) {
        setReservations(data);
      }
    } catch {
      console.log("Réservations temporairement indisponibles");
    }
  }

  async function loadDispatchQueues() {
    try {
      const response = await fetch("/api/admin/dispatch-queue");
      const data = await response.json();

      if (data.success) {
        setDispatchQueues(data.queues || []);
      }
    } catch {
      console.log("Dispatch Queue temporairement indisponible");
    }
  }

  async function assignDriver(reservationId: number, driverId: number) {
    const response = await fetch("/api/admin/assign-driver", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reservation_id: reservationId,
        driver_id: driverId,
      }),
    });

    const data = await response.json();

    if (!data.success) {
      alert(data.error);
      return;
    }

    await loadAll();
    alert("🚖 Chauffeur assigné avec succès.");
  }

  async function topUpDriver(driverId: number, amount: number) {
    const response = await fetch(`/api/admin/drivers/${driverId}/topup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount }),
    });

    const data = await response.json();

    if (!data.success) {
      alert(data.error);
      return;
    }

    await loadAll();
    alert(`Solde ajouté. Nouveau solde : ${data.newBalance} $`);
  }

  async function autoDispatch(reservationId: number) {

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    alert("Vous devez être connecté.");
    return;
  }

  const response = await fetch("/api/admin/auto-dispatch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      reservation_id: reservationId,
    }),
  });

  const data = await response.json();

  if (!data.success) {
    alert(data.error);
    return;
  }

  await loadAll();

  alert(`🚖 Course attribuée à ${data.driver.name}`);
}

  const onlineDrivers = useMemo(
    () => drivers.filter((driver) => driver.latitude && driver.longitude),
    [drivers]
  );

  const availableDrivers = useMemo(
    () =>
      drivers.filter(
        (driver) =>
          driver.status === "Disponible" &&
          Number(driver.balance || 0) > 0 &&
          driver.latitude &&
          driver.longitude
      ),
    [drivers]
  );

  const busyDrivers = useMemo(
    () => drivers.filter((driver) => driver.status === "Occupé"),
    [drivers]
  );

  function formatLastLocation(date: string | null) {
    if (!date) return "Aucune position";

    const seconds = Math.floor(
      (Date.now() - new Date(date).getTime()) / 1000
    );

    if (seconds < 10) return "À l’instant";
    if (seconds < 60) return `Il y a ${seconds} sec`;

    const minutes = Math.floor(seconds / 60);
    return `Il y a ${minutes} min`;
  }

  function calculateDistanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;

    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  const activeReservations = reservations.filter(
    (reservation) =>
      reservation.latitude &&
      reservation.longitude &&
      reservation.status !== "Terminée"
  );

  const intelligentDispatch = activeReservations.map((reservation) => {
    const candidates = drivers
      .filter((driver) => driver.latitude && driver.longitude)
      .map((driver) => ({
        driver,
        distanceKm: calculateDistanceKm(
          Number(reservation.latitude),
          Number(reservation.longitude),
          Number(driver.latitude),
          Number(driver.longitude)
        ),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 3);

    return { reservation, candidates };
  });
async function forceNextDriver(reservationId: number) {
  const response = await fetch("/api/admin/dispatch-next", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reservation_id: reservationId,
    }),
  });

  const data = await response.json();

  if (!data.success) {
    alert(data.error);
    return;
  }

  await loadAll();
  alert("Course envoyée au chauffeur suivant.");
}
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        Chargement du dispatch...
      </main>
    );
  }

  return (
    <main className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold">🗺️ Dispatch Taxi Lachenaie</h1>
          <p className="text-slate-600">Suivi des chauffeurs en temps réel</p>
        </div>

        <button
          onClick={loadAll}
          className="rounded-xl bg-yellow-400 px-6 py-3 font-bold text-black shadow"
        >
          🔄 Actualiser
        </button>
      </div>

      <section className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
        <Card title="Chauffeurs" value={drivers.length} />
        <Card
          title="En ligne GPS"
          value={onlineDrivers.length}
          color="text-green-600"
        />
        <Card
          title="Disponibles"
          value={availableDrivers.length}
          color="text-blue-600"
        />
        <Card
          title="Occupés"
          value={busyDrivers.length}
          color="text-red-600"
        />
      </section>

      <section className="mb-8 rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-4 text-2xl font-bold">🗺️ Carte Dispatch</h2>
        <div className="overflow-hidden rounded-2xl">
          <DispatchMap drivers={drivers} reservations={reservations} />
        </div>
      </section>

      <section className="mb-8 rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-6 text-2xl font-bold">🚦 Dispatch en cours</h2>

        {dispatchQueues.length === 0 ? (
          <p className="text-slate-500">Aucune course en attente.</p>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {dispatchQueues.map((queue) => (
              <div key={queue.id} className="rounded-2xl border p-5">
                <h3 className="text-xl font-bold">
                  🚖 Course #{queue.reservation_id}
                </h3>

                <p className="mt-3">
                  👤 <strong>Client :</strong>{" "}
                  {queue.reservation?.name || "Client inconnu"}
                </p>

                <p>
                  📍 <strong>Départ :</strong>{" "}
                  {queue.reservation?.origin || "-"}
                </p>

                <p>
                  🏁 <strong>Destination :</strong>{" "}
                  {queue.reservation?.destination || "-"}
                </p>

                <div className="mt-4 rounded-xl bg-yellow-100 p-4">
                  <p className="font-bold">Chauffeur actuel</p>
                  <p className="text-2xl font-bold">
                    🚖 {queue.currentDriver?.name || "Inconnu"}
                  </p>
                </div>
<div className="mt-5 flex flex-wrap gap-3">
  <button
    onClick={() => forceNextDriver(queue.reservation_id)}
    className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700"
  >
    ➡️ Forcer suivant
  </button>
</div>
                <div className="mt-5 text-center">
                  <p className="font-bold">⏳ Temps restant</p>
                  <p
                    className={`text-6xl font-black ${
                      Number(queue.secondsLeft) <= 10
                        ? "text-red-600"
                        : "text-green-600"
                    }`}
                  >
                    {queue.secondsLeft}s
                  </p>
                </div>

                <div className="mt-4 rounded-xl bg-slate-100 p-4">
  <p className="font-bold mb-3">
    🚖 File d'attribution
  </p>

  <div className="space-y-2">
    {queue.rankedDrivers?.map((driver: any, index: number) => (
      <div
        key={driver.id}
        className={`flex items-center justify-between rounded-lg px-3 py-2 ${
          index === queue.current_index
            ? "bg-yellow-300"
            : "bg-white"
        }`}
      >
        <span className="font-bold">
          {index === 0
            ? "🥇"
            : index === 1
            ? "🥈"
            : index === 2
            ? "🥉"
            : "🏅"}{" "}
          {driver.name}
        </span>

        {index === queue.current_index && (
          <span className="text-green-700 font-bold">
            EN COURS
          </span>
        )}
      </div>
    ))}
  </div>
</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-8 rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-6 text-2xl font-bold">🤖 Dispatch intelligent</h2>

        {intelligentDispatch.length === 0 ? (
          <p className="text-slate-500">
            Aucune réservation active avec position GPS.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {intelligentDispatch.map(({ reservation, candidates }) => (
              <div key={reservation.id} className="rounded-2xl border p-5">
                <h3 className="text-xl font-bold">📍 {reservation.name}</h3>

                <p className="text-slate-600">
                  {reservation.origin} → {reservation.destination}
                </p>

                <p className="mt-2 font-bold text-green-600">
                  {Number(reservation.price || 0).toFixed(2)} $
                </p>

                <button
                  onClick={() => autoDispatch(reservation.id)}
                  className="mt-4 rounded-xl bg-yellow-400 px-5 py-3 font-bold text-black hover:bg-yellow-500"
                >
                  🤖 Auto-dispatch
                </button>

                <div className="mt-5 space-y-3">
                  {candidates.length === 0 ? (
                    <p className="font-bold text-red-600">
                      Aucun chauffeur avec GPS.
                    </p>
                  ) : (
                    candidates.map((item, index) => (
                      <div
                        key={item.driver.id}
                        className="flex items-center justify-between rounded-xl bg-slate-50 p-4"
                      >
                        <div>
                          <p className="font-bold">
                            {index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"}{" "}
                            {item.driver.name}
                          </p>

                          <p className="text-sm text-slate-500">
                            {item.driver.vehicle} {item.driver.plate}
                          </p>

                          <p className="text-sm font-bold">
                            Statut : {item.driver.status}
                          </p>

                          <button
                            disabled={item.driver.status !== "Disponible"}
                            onClick={() =>
                              assignDriver(reservation.id, item.driver.id)
                            }
                            className={`mt-3 rounded-xl px-4 py-2 font-bold text-white ${
                              item.driver.status === "Disponible"
                                ? "bg-green-600 hover:bg-green-700"
                                : "cursor-not-allowed bg-slate-400"
                            }`}
                          >
                            {item.driver.status === "Disponible"
                              ? "🚖 Attribuer"
                              : "Indisponible"}
                          </button>
                        </div>

                        <div className="text-right">
                          <p className="font-bold">
                            {item.distanceKm.toFixed(2)} km
                          </p>
                          <p className="text-sm text-slate-500">
                            Score{" "}
                            {Math.max(0, 100 - item.distanceKm * 10).toFixed(0)}
                            %
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-6 text-2xl font-bold">🚖 Chauffeurs en direct</h2>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-yellow-400">
              <tr>
                <th className="p-4 text-left">Chauffeur</th>
                <th className="p-4 text-left">Statut</th>
                <th className="p-4 text-left">Solde</th>
                <th className="w-[260px] p-4 text-left">Position</th>
                <th className="p-4 text-left">Latitude</th>
                <th className="p-4 text-left">Longitude</th>
                <th className="p-4 text-left">Vitesse</th>
                <th className="p-4 text-left">GPS</th>
                <th className="p-4 text-left">Action</th>
              </tr>
            </thead>

            <tbody>
              {drivers.map((driver) => (
                <tr key={driver.id} className="border-b hover:bg-yellow-50">
                  <td className="p-4">
                    <p className="font-bold">{driver.name}</p>
                    <p className="text-sm text-slate-500">{driver.phone}</p>
                    <p className="text-sm text-slate-500">
                      {driver.vehicle} {driver.plate}
                    </p>
                  </td>

                  <td className="p-4">
                    <span
                      className={`rounded-full px-3 py-1 font-bold text-white ${
                        driver.status === "Disponible"
                          ? "bg-green-600"
                          : driver.status === "Occupé"
                          ? "bg-red-600"
                          : "bg-slate-600"
                      }`}
                    >
                      {driver.status || "Inconnu"}
                    </span>
                  </td>

                  <td className="p-4 font-bold">
                    <span
                      className={
                        Number(driver.balance || 0) <= 0
                          ? "text-red-600"
                          : "text-green-600"
                      }
                    >
                      {Number(driver.balance || 0).toFixed(2)} $
                    </span>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        onClick={() => topUpDriver(driver.id, 50)}
                        className="rounded-lg bg-yellow-400 px-3 py-1 text-sm font-bold text-black"
                      >
                        +50 $
                      </button>

                      <button
                        onClick={() => topUpDriver(driver.id, 100)}
                        className="rounded-lg bg-green-600 px-3 py-1 text-sm font-bold text-white"
                      >
                        +100 $
                      </button>
                    </div>
                  </td>

                  <td className="max-w-[260px] whitespace-normal break-words p-4 font-semibold">
                    {driver.current_position || "Non disponible"}
                  </td>

                  <td className="p-4">
                    {driver.latitude ? Number(driver.latitude).toFixed(6) : "-"}
                  </td>

                  <td className="p-4">
                    {driver.longitude
                      ? Number(driver.longitude).toFixed(6)
                      : "-"}
                  </td>

                  <td className="p-4">
                    {driver.speed
                      ? `${Number(driver.speed).toFixed(1)} km/h`
                      : "0 km/h"}
                  </td>

                  <td className="p-4">
                    <span
                      className={`font-bold ${
                        driver.latitude && driver.longitude
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {formatLastLocation(driver.last_location_at)}
                    </span>
                  </td>

                  <td className="p-4">
                    {driver.latitude && driver.longitude ? (
                      <button
                        onClick={() =>
                          window.open(
                            `https://www.openstreetmap.org/?mlat=${driver.latitude}&mlon=${driver.longitude}#map=16/${driver.latitude}/${driver.longitude}`,
                            "_blank"
                          )
                        }
                        className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white"
                      >
                        Voir carte
                      </button>
                    ) : (
                      <span className="text-slate-400">Aucune position</span>
                    )}
                  </td>
                </tr>
              ))}

              {drivers.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500">
                    Aucun chauffeur enregistré.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Card({
  title,
  value,
  color = "",
}: {
  title: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow">
      <p className="text-slate-500">{title}</p>
      <p className={`mt-2 text-5xl font-bold ${color}`}>{value}</p>
    </div>
  );
}