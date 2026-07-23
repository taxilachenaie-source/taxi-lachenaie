"use client";

import { useEffect, useMemo, useState } from "react";

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

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadReservations();
    loadDrivers();
  }, []);

  async function loadReservations() {
    const response = await fetch("/api/admin/reservations");
    const data = await response.json();
    if (Array.isArray(data)) setReservations(data);
  }

  async function loadDrivers() {
    const response = await fetch("/api/admin/drivers");
    const data = await response.json();
    if (Array.isArray(data)) setDrivers(data);
  }

  async function updateReservation(id: number, data: any) {
    await fetch(`/api/admin/reservations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    loadReservations();
  }

  async function deleteReservation(id: number) {
    if (!confirm("Voulez-vous vraiment supprimer cette réservation ?")) return;

    await fetch(`/api/admin/reservations/${id}/delete`, {
      method: "DELETE",
    });

    loadReservations();
  }

  const filteredReservations = useMemo(() => {
    return reservations.filter((r) => {
      const text = `${r.name} ${r.phone} ${r.email} ${r.origin} ${r.destination}`.toLowerCase();
      return text.includes(search.toLowerCase());
    });
  }, [reservations, search]);

  return (
    <main className="p-8">
      <h1 className="mb-6 text-4xl font-bold">📋 Réservations</h1>

      <div className="mb-6 rounded-2xl bg-white p-4 shadow">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une réservation..."
          className="w-full rounded-xl border p-4"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white shadow">
        <table className="w-full min-w-[1500px]">
          <thead className="bg-yellow-400">
            <tr>
              <th className="p-4 text-left">Nom</th>
              <th className="p-4 text-left">Téléphone</th>
              <th className="p-4 text-left">Courriel</th>
              <th className="p-4 text-left">Départ</th>
              <th className="p-4 text-left">Destination</th>
              <th className="p-4 text-left">Date</th>
              <th className="p-4 text-left">Heure</th>
              <th className="p-4 text-left">Prix</th>
              <th className="p-4 text-left">Chauffeur</th>
              <th className="p-4 text-left">Statut</th>
              <th className="p-4 text-left">Action</th>
            </tr>
          </thead>

          <tbody>
            {filteredReservations.map((r) => (
              <tr key={r.id} className="border-b hover:bg-yellow-50">
                <td className="p-4 font-semibold">{r.name}</td>
                <td className="p-4">{r.phone}</td>
                <td className="p-4">{r.email}</td>
                <td className="p-4">{r.origin}</td>
                <td className="p-4">{r.destination}</td>
                <td className="p-4">{r.trip_date}</td>
                <td className="p-4">{r.trip_time}</td>
                <td className="p-4 font-bold">{Number(r.price).toFixed(2)} $</td>

                <td className="p-4">
                  <select
                    value={r.driver_id || ""}
                    onChange={(e) =>
                      updateReservation(r.id, {
                        status: r.status,
                        driver_id: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="rounded-lg border px-3 py-2"
                  >
                    <option value="">Aucun</option>
                    {drivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.name}
                      </option>
                    ))}
                  </select>
                </td>

                <td className="p-4">
                  <select
                    value={r.status}
                    onChange={(e) =>
                      updateReservation(r.id, {
                        status: e.target.value,
                        driver_id: r.driver_id,
                      })
                    }
                    className="rounded-lg border px-3 py-2"
                  >
                    <option>Nouvelle</option>
                    <option>Acceptée</option>
                    <option>En cours</option>
                    <option>Terminée</option>
                    <option>Annulée</option>
                  </select>
                </td>

                <td className="p-4">
                  <button
                    onClick={() => deleteReservation(r.id)}
                    style={{
                      backgroundColor: "#dc2626",
                      color: "white",
                      padding: "10px 16px",
                      borderRadius: "8px",
                      fontWeight: "bold",
                      border: "none",
                    }}
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}