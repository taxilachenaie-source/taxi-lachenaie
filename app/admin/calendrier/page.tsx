"use client";

import { useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import frLocale from "@fullcalendar/core/locales/fr";

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
};

export default function CalendrierPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedReservation, setSelectedReservation] =
    useState<Reservation | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const reservationsResponse = await fetch("/api/admin/reservations");
    const driversResponse = await fetch("/api/admin/drivers");

    const reservations: Reservation[] = await reservationsResponse.json();
    const driversData: Driver[] = await driversResponse.json();

    setDrivers(driversData);

    const calendarEvents = reservations.map((r) => {
      const driver = driversData.find((d) => d.id === r.driver_id);
      const driverName = driver ? ` - ${driver.name}` : "";

      return {
        id: String(r.id),
        title: `🚖 ${r.name} - ${Number(r.price).toFixed(2)} $${driverName}`,
        start: `${r.trip_date}T${r.trip_time}`,
        backgroundColor: getStatusColor(r.status),
        borderColor: getStatusColor(r.status),
        extendedProps: { reservation: r },
      };
    });

    setEvents(calendarEvents);
  }

  async function updateStatus(id: number, status: string) {
    await fetch(`/api/admin/reservations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        driver_id: selectedReservation?.driver_id ?? null,
        origin: selectedReservation?.origin,
        destination: selectedReservation?.destination,
      }),
    });

    setSelectedReservation((current) =>
      current ? { ...current, status } : current
    );

    loadData();
  }

  async function updateDriver(id: number, driverId: string) {
    const newDriverId = driverId ? Number(driverId) : null;

    await fetch(`/api/admin/reservations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: selectedReservation?.status || "Nouvelle",
        driver_id: newDriverId,
        origin: selectedReservation?.origin,
        destination: selectedReservation?.destination,
      }),
    });

    setSelectedReservation((current) =>
      current ? { ...current, driver_id: newDriverId } : current
    );

    loadData();
  }

  function getStatusColor(status: string) {
    if (status === "Acceptée") return "#2563eb";
    if (status === "En cours") return "#f97316";
    if (status === "Terminée") return "#16a34a";
    if (status === "Annulée") return "#dc2626";
    return "#facc15";
  }

  function getDriverName(driverId: number | null) {
    const driver = drivers.find((d) => d.id === driverId);
    return driver ? driver.name : "Aucun chauffeur";
  }

  function openGoogleMaps(r: Reservation) {
    const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
      r.origin
    )}&destination=${encodeURIComponent(r.destination)}`;

    window.open(url, "_blank");
  }

  return (
    <main className="p-8">
      <h1 className="text-4xl font-bold mb-8">
        📅 Calendrier Taxi Lachenaie
      </h1>

      <div className="bg-white rounded-2xl shadow-xl p-6">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          locale={frLocale}
          initialView="dayGridMonth"
          height="700px"
          events={events}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          eventClick={(info) => {
            const reservation = info.event.extendedProps
              .reservation as Reservation;
            setSelectedReservation(reservation);
          }}
        />
      </div>

      {selectedReservation && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              color: "black",
              borderRadius: "20px",
              padding: "30px",
              width: "95%",
              maxWidth: "720px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
          >
            <div className="flex justify-between items-start mb-6">
              <h2 className="text-3xl font-bold">
                🚖 Détails de la réservation
              </h2>

              <button
                onClick={() => setSelectedReservation(null)}
                style={{
                  fontSize: "28px",
                  fontWeight: "bold",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>

            <div className="space-y-3 text-lg">
              <p><strong>Client :</strong> {selectedReservation.name}</p>
              <p><strong>Téléphone :</strong> {selectedReservation.phone}</p>
              <p><strong>Courriel :</strong> {selectedReservation.email}</p>
              <p><strong>Départ :</strong> {selectedReservation.origin}</p>
              <p><strong>Destination :</strong> {selectedReservation.destination}</p>
              <p><strong>Date :</strong> {selectedReservation.trip_date}</p>
              <p><strong>Heure :</strong> {selectedReservation.trip_time}</p>

              <div>
                <label className="font-bold mr-3">Chauffeur :</label>
                <select
                  value={selectedReservation.driver_id || ""}
                  onChange={(e) =>
                    updateDriver(selectedReservation.id, e.target.value)
                  }
                  style={{
                    padding: "8px 12px",
                    borderRadius: "10px",
                    border: "1px solid #ccc",
                    fontWeight: "bold",
                  }}
                >
                  <option value="">Aucun chauffeur</option>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name}
                    </option>
                  ))}
                </select>
              </div>

              <p>
                <strong>Chauffeur actuel :</strong>{" "}
                {getDriverName(selectedReservation.driver_id)}
              </p>

              <p>
                <strong>Prix :</strong>{" "}
                <span className="text-green-600 font-bold">
                  {Number(selectedReservation.price).toFixed(2)} $
                </span>
              </p>

              <div>
                <label className="font-bold mr-3">Statut :</label>
                <select
                  value={selectedReservation.status}
                  onChange={(e) =>
                    updateStatus(selectedReservation.id, e.target.value)
                  }
                  style={{
                    padding: "8px 12px",
                    borderRadius: "10px",
                    border: "1px solid #ccc",
                    fontWeight: "bold",
                  }}
                >
                  <option>Nouvelle</option>
                  <option>Acceptée</option>
                  <option>En cours</option>
                  <option>Terminée</option>
                  <option>Annulée</option>
                </select>
              </div>
            </div>

            <div
              style={{
                marginTop: "32px",
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "12px",
              }}
            >
              <a
                href={`tel:${selectedReservation.phone}`}
                style={{
                  backgroundColor: "#16a34a",
                  color: "white",
                  padding: "12px",
                  borderRadius: "12px",
                  fontWeight: "bold",
                  textAlign: "center",
                  textDecoration: "none",
                }}
              >
                📞 Appeler
              </a>

              <a
                href={`mailto:${selectedReservation.email}`}
                style={{
                  backgroundColor: "#2563eb",
                  color: "white",
                  padding: "12px",
                  borderRadius: "12px",
                  fontWeight: "bold",
                  textAlign: "center",
                  textDecoration: "none",
                }}
              >
                📧 Courriel
              </a>

              <button
                onClick={() => openGoogleMaps(selectedReservation)}
                style={{
                  backgroundColor: "#020617",
                  color: "white",
                  padding: "12px",
                  borderRadius: "12px",
                  fontWeight: "bold",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                🗺️ Google Maps
              </button>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setSelectedReservation(null)}
                className="px-5 py-3 rounded-xl bg-slate-200 font-bold"
              >
                Fermer
              </button>

              <a
                href="/admin/reservations"
                className="px-5 py-3 rounded-xl bg-yellow-400 text-black font-bold"
              >
                Gérer
              </a>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}