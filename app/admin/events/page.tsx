"use client";

import { useEffect, useState } from "react";

type DispatchEvent = {
  id: number;
  reservation_id: number | null;
  driver_id: number | null;
  event_type: string;
  message: string;
  created_at: string;
};

export default function DispatchEventsPage() {
  const [events, setEvents] = useState<DispatchEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEvents();

    const interval = setInterval(loadEvents, 5000);

    return () => clearInterval(interval);
  }, []);

  async function loadEvents() {
    try {
      const response = await fetch("/api/admin/dispatch-events");
      const data = await response.json();

      if (data.success) {
        setEvents(data.events || []);
      }
    } catch {
      console.log("Journal temporairement indisponible");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        Chargement du journal...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <h1 className="mb-2 text-4xl font-bold">📜 Journal Dispatch</h1>
      <p className="mb-8 text-slate-600">
        Historique des événements du système Taxi Lachenaie
      </p>

      <section className="rounded-2xl bg-white p-6 shadow">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Événements récents</h2>

          <button
            onClick={loadEvents}
            className="rounded-xl bg-yellow-400 px-5 py-3 font-bold text-black"
          >
            🔄 Actualiser
          </button>
        </div>

        {events.length === 0 ? (
          <p className="text-slate-500">Aucun événement enregistré.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-yellow-400">
                <tr>
                  <th className="p-4 text-left">Heure</th>
                  <th className="p-4 text-left">Type</th>
                  <th className="p-4 text-left">Réservation</th>
                  <th className="p-4 text-left">Chauffeur</th>
                  <th className="p-4 text-left">Message</th>
                </tr>
              </thead>

              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-b hover:bg-yellow-50">
                    <td className="p-4 font-semibold">
                      {new Date(event.created_at).toLocaleString()}
                    </td>

                    <td className="p-4">
                      <span className="rounded-full bg-slate-900 px-3 py-1 text-sm font-bold text-white">
                        {event.event_type}
                      </span>
                    </td>

                    <td className="p-4">
                      #{event.reservation_id || "-"}
                    </td>

                    <td className="p-4">
                      {event.driver_id ? `#${event.driver_id}` : "-"}
                    </td>

                    <td className="p-4 font-semibold">
                      {event.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}