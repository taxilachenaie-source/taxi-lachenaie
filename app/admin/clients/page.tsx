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
};

type Client = {
  name: string;
  phone: string;
  email: string;
  trips: number;
  totalSpent: number;
  lastTrip: string;
};

export default function ClientsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadReservations();
  }, []);

  async function loadReservations() {
    const response = await fetch("/api/admin/reservations");
    const data = await response.json();

    if (Array.isArray(data)) {
      setReservations(data);
    }
  }

  const clients = useMemo(() => {
    const map = new Map<string, Client>();

    reservations.forEach((r) => {
      const key = r.email || r.phone;

      if (!map.has(key)) {
        map.set(key, {
          name: r.name,
          phone: r.phone,
          email: r.email,
          trips: 0,
          totalSpent: 0,
          lastTrip: r.trip_date,
        });
      }

      const client = map.get(key)!;
      client.trips += 1;
      client.totalSpent += Number(r.price || 0);

      if (r.trip_date > client.lastTrip) {
        client.lastTrip = r.trip_date;
      }
    });

    return Array.from(map.values());
  }, [reservations]);

  const filteredClients = clients.filter((c) => {
    const text = `${c.name} ${c.phone} ${c.email}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  return (
    <main className="p-8">
      <h1 className="mb-6 text-4xl font-bold">👥 Clients</h1>

      <div className="mb-6 rounded-2xl bg-white p-4 shadow">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un client..."
          className="w-full rounded-xl border p-4"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white shadow">
        <table className="w-full min-w-[900px]">
          <thead className="bg-yellow-400">
            <tr>
              <th className="p-4 text-left">Nom</th>
              <th className="p-4 text-left">Téléphone</th>
              <th className="p-4 text-left">Courriel</th>
              <th className="p-4 text-left">Courses</th>
              <th className="p-4 text-left">Total dépensé</th>
              <th className="p-4 text-left">Dernière course</th>
            </tr>
          </thead>

          <tbody>
            {filteredClients.map((client) => (
              <tr key={client.email || client.phone} className="border-b">
                <td className="p-4 font-bold">{client.name}</td>
                <td className="p-4">{client.phone}</td>
                <td className="p-4">{client.email}</td>
                <td className="p-4">{client.trips}</td>
                <td className="p-4 font-bold text-green-600">
                  {client.totalSpent.toFixed(2)} $
                </td>
                <td className="p-4">{client.lastTrip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}