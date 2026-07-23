"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Reservation = {
  id: number;
  name: string;
  phone: string;
  email: string;
  origin: string;
  destination: string;
  trip_date: string;
  trip_time: string;
  price: number;
  status: string;
  driver_id: number | null;
};

type Driver = {
  id: number;
  name: string;
  phone: string;
  email: string;
  vehicle: string;
  plate: string;
  status: string;
  current_position: string;
};

export default function AdminDashboardPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [alertMessage, setAlertMessage] = useState("");

  const knownReservationIds = useRef<Set<number>>(new Set());
  const firstLoad = useRef(true);

  useEffect(() => {
    loadData();

    const interval = setInterval(() => {
      loadData(true);
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  async function loadData(checkNew = false) {
    const reservationsResponse = await fetch("/api/admin/reservations");
    const driversResponse = await fetch("/api/admin/drivers");

    const reservationsData: Reservation[] = await reservationsResponse.json();
    const driversData: Driver[] = await driversResponse.json();

    if (Array.isArray(reservationsData)) {
      if (checkNew && !firstLoad.current) {
        const nouvelles = reservationsData.filter(
          (r) => r.status === "Nouvelle" && !knownReservationIds.current.has(r.id)
        );

        if (nouvelles.length > 0) {
          playBeep();

          const r = nouvelles[0];
          setAlertMessage(
            `🚖 Nouvelle réservation : ${r.name} - ${Number(r.price).toFixed(2)} $`
          );

          if (Notification.permission === "granted") {
            new Notification("🚖 Nouvelle réservation Taxi Lachenaie", {
              body: `${r.name}\n${r.origin} → ${r.destination}\n${Number(
                r.price
              ).toFixed(2)} $`,
            });
          }
        }
      }

      knownReservationIds.current = new Set(reservationsData.map((r) => r.id));
      firstLoad.current = false;
      setReservations(reservationsData);
    }

    if (Array.isArray(driversData)) {
      setDrivers(driversData);
    }
  }

  async function enableNotifications() {
    if ("Notification" in window) {
      await Notification.requestPermission();
    }

    playBeep();
    alert("Alertes activées !");
  }

  function playBeep() {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;

    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.frequency.value = 900;
    oscillator.type = "sine";

    gain.gain.setValueAtTime(0.4, audioContext.currentTime);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.35);
  }

  const today = new Date().toISOString().split("T")[0];

  const reservationsToday = reservations.filter((r) => r.trip_date === today);

  const activeReservations = reservations.filter(
    (r) => r.status === "Acceptée" || r.status === "En cours"
  );

  const revenueTotal = useMemo(
    () => reservations.reduce((total, r) => total + Number(r.price || 0), 0),
    [reservations]
  );

  const revenueToday = useMemo(
    () =>
      reservationsToday.reduce(
        (total, r) => total + Number(r.price || 0),
        0
      ),
    [reservationsToday]
  );

  const nouvelles = reservations.filter((r) => r.status === "Nouvelle").length;
  const driversAvailable = drivers.filter((d) => d.status === "Disponible").length;
  const driversBusy = drivers.filter((d) => d.status === "Occupé").length;

  function getDriver(driverId: number | null) {
    return drivers.find((d) => d.id === driverId);
  }

  function badgeColor(status: string) {
    if (status === "Occupé" || status === "En cours") return "#dc2626";
    if (status === "Disponible" || status === "Terminée") return "#16a34a";
    if (status === "Acceptée") return "#2563eb";
    if (status === "Nouvelle") return "#facc15";
    if (status === "Annulée") return "#64748b";
    return "#64748b";
  }

  function openGoogleMaps(r: Reservation) {
    const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
      r.origin
    )}&destination=${encodeURIComponent(r.destination)}`;

    window.open(url, "_blank");
  }

  return (
    <main className="p-8">
      {alertMessage && (
        <div className="mb-6 rounded-2xl bg-red-600 p-4 font-bold text-white shadow">
          🔔 {alertMessage}
        </div>
      )}

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold">🚖 Dispatch Taxi Lachenaie</h1>
          <p className="text-slate-600">Centre de répartition en direct</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={enableNotifications}
            className="rounded-xl bg-slate-950 px-6 py-3 font-bold text-white shadow"
          >
            🔔 Activer alertes
          </button>

          <button
            onClick={() => loadData()}
            className="rounded-xl bg-yellow-400 px-6 py-3 font-bold text-black shadow"
          >
            🔄 Actualiser
          </button>
        </div>
      </div>

      <section className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3 xl:grid-cols-6">
        <StatCard title="Réservations" value={reservations.length} />
        <StatCard title="Aujourd'hui" value={reservationsToday.length} color="#2563eb" />
        <StatCard title="Nouvelles" value={nouvelles} color="#ca8a04" />
        <StatCard title="Courses actives" value={activeReservations.length} color="#dc2626" />
        <StatCard title="Chauffeurs libres" value={driversAvailable} color="#16a34a" />
        <StatCard title="Chauffeurs occupés" value={driversBusy} color="#dc2626" />
      </section>

      <section className="mb-8 rounded-2xl bg-white p-6 shadow">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-bold">🚦 Courses actives</h2>
          <span className="rounded-full bg-red-100 px-4 py-2 font-bold text-red-700">
            {activeReservations.length} active(s)
          </span>
        </div>

        {activeReservations.length === 0 ? (
          <p className="text-slate-500">Aucune course active.</p>
        ) : (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {activeReservations.map((r) => {
              const driver = getDriver(r.driver_id);

              return (
                <div key={r.id} className="rounded-2xl border bg-slate-50 p-5">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-slate-500">Client</p>
                      <p className="text-xl font-bold">{r.name}</p>
                      <p className="text-sm text-slate-600">{r.phone}</p>
                    </div>

                    <span
                      style={{ backgroundColor: badgeColor(r.status) }}
                      className="rounded-full px-4 py-2 font-bold text-white"
                    >
                      {r.status}
                    </span>
                  </div>

                  <div className="mb-4 rounded-xl bg-white p-4">
                    <p className="font-bold">📍 {r.origin}</p>
                    <p className="font-bold">🚖 Direction {r.destination}</p>
                    <p className="text-slate-500">⏱ Temps restant à calculer</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <Info label="Chauffeur" value={driver?.name || "Aucun"} />
                    <Info label="Position" value={driver?.current_position || "-"} />
                    <Info label="Prix" value={`${Number(r.price).toFixed(2)} $`} green />
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <a
                      href={`tel:${r.phone}`}
                      className="rounded-xl bg-green-600 px-5 py-3 font-bold text-white"
                    >
                      📞 Appeler client
                    </a>

                    {driver?.phone && (
                      <a
                        href={`tel:${driver.phone}`}
                        className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white"
                      >
                        📞 Appeler chauffeur
                      </a>
                    )}

                    <button
                      onClick={() => openGoogleMaps(r)}
                      className="rounded-xl bg-slate-950 px-5 py-3 font-bold text-white"
                    >
                      🗺️ Google Maps
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mb-8 rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-5 text-2xl font-bold">📱 Chauffeurs</h2>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-yellow-400">
              <tr>
                <th className="p-4 text-left">Chauffeur</th>
                <th className="p-4 text-left">Statut</th>
                <th className="p-4 text-left">Position</th>
                <th className="p-4 text-left">Téléphone</th>
                <th className="p-4 text-left">Véhicule</th>
                <th className="p-4 text-left">Action</th>
              </tr>
            </thead>

            <tbody>
              {drivers.map((driver) => (
                <tr key={driver.id} className="border-b hover:bg-yellow-50">
                  <td className="p-4 font-bold">{driver.name}</td>

                  <td className="p-4">
                    <span
                      style={{ backgroundColor: badgeColor(driver.status) }}
                      className="rounded-full px-3 py-2 font-bold text-white"
                    >
                      {driver.status || "Disponible"}
                    </span>
                  </td>

                  <td className="p-4">
                    {driver.current_position || "Garage Taxi Lachenaie"}
                  </td>

                  <td className="p-4">{driver.phone}</td>

                  <td className="p-4">
                    {driver.vehicle} {driver.plate ? `- ${driver.plate}` : ""}
                  </td>

                  <td className="p-4">
                    <a
                      href={`tel:${driver.phone}`}
                      className="rounded-xl bg-green-600 px-4 py-2 font-bold text-white"
                    >
                      📞 Appeler
                    </a>
                  </td>
                </tr>
              ))}

              {drivers.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    Aucun chauffeur enregistré.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-4 text-2xl font-bold">📅 Réservations aujourd'hui</h2>

          {reservationsToday.length === 0 ? (
            <p className="text-slate-500">Aucune réservation aujourd'hui.</p>
          ) : (
            <div className="space-y-3">
              {reservationsToday.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border-l-8 border-yellow-400 bg-slate-50 p-4"
                >
                  <p className="text-xl font-bold">{r.trip_time}</p>
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-sm text-slate-600">
                    {r.origin} → {r.destination}
                  </p>
                  <p className="mt-2 font-bold text-green-600">
                    {Number(r.price).toFixed(2)} $
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-4 text-2xl font-bold">💰 Résumé financier</h2>

          <div className="space-y-4">
            <Line label="Revenus aujourd'hui" value={`${revenueToday.toFixed(2)} $`} green />
            <Line label="Revenus totaux" value={`${revenueTotal.toFixed(2)} $`} green />
            <Line label="Nombre de courses" value={String(reservations.length)} />
            <Line label="Réservations à traiter" value={String(nouvelles)} yellow />
          </div>
        </div>
      </section>
    </main>
  );
}

function StatCard({
  title,
  value,
  color = "#020617",
}: {
  title: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow">
      <p className="text-slate-500">{title}</p>
      <p style={{ color }} className="mt-2 text-4xl font-bold">
        {value}
      </p>
    </div>
  );
}

function Info({
  label,
  value,
  green = false,
}: {
  label: string;
  value: string;
  green?: boolean;
}) {
  return (
    <div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className={green ? "font-bold text-green-600" : "font-bold"}>
        {value}
      </p>
    </div>
  );
}

function Line({
  label,
  value,
  green = false,
  yellow = false,
}: {
  label: string;
  value: string;
  green?: boolean;
  yellow?: boolean;
}) {
  return (
    <div className="flex justify-between border-b pb-3">
      <span>{label}</span>
      <strong
        className={
          green ? "text-green-600" : yellow ? "text-yellow-600" : ""
        }
      >
        {value}
      </strong>
    </div>
  );
}