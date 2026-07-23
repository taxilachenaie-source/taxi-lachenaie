"use client";

import { useEffect, useState } from "react";
import AdminDriversMap from "./AdminDriversMap";

type DashboardStats = {
  drivers: {
    total: number;
    available: number;
    busy: number;
    offline: number;
  };
  reservations: {
    total: number;
    pending: number;
    active: number;
    completed: number;
  };
  revenue: {
    today: number;
  };
};

const emptyStats: DashboardStats = {
  drivers: {
    total: 0,
    available: 0,
    busy: 0,
    offline: 0,
  },
  reservations: {
    total: 0,
    pending: 0,
    active: 0,
    completed: 0,
  },
  revenue: {
    today: 0,
  },
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  async function loadStats() {
    try {
      setErrorMessage("");

      const response = await fetch("/api/admin/dashboard-stats", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setErrorMessage(
          data.error || "Impossible de charger les statistiques."
        );
        return;
      }

      setStats({
        drivers: data.drivers || emptyStats.drivers,
        reservations: data.reservations || emptyStats.reservations,
        revenue: data.revenue || emptyStats.revenue,
      });

      setLastUpdate(new Date());
    } catch (error) {
      console.error("Erreur dashboard :", error);
      setErrorMessage("Le centre de contrôle est temporairement indisponible.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStats();

    const interval = window.setInterval(() => {
      void loadStats();
    }, 5000);

    return () => window.clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-2xl bg-white px-8 py-6 text-xl font-bold shadow">
          Chargement du centre de contrôle...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 rounded-3xl bg-slate-900 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-yellow-400">
                Administration
              </p>

              <h1 className="mt-2 text-3xl font-black sm:text-4xl">
                🚖 Centre de contrôle Taxi Lachenaie
              </h1>

              <p className="mt-2 text-slate-300">
                Suivi des chauffeurs, des courses et des revenus.
              </p>
            </div>

            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <div className="rounded-xl bg-white/10 px-4 py-3 text-sm">
                <p className="font-semibold text-slate-300">
                  Dernière mise à jour
                </p>

                <p className="font-bold text-white">
                  {lastUpdate
                    ? lastUpdate.toLocaleTimeString("fr-CA")
                    : "Non disponible"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => void loadStats()}
                className="rounded-xl bg-yellow-400 px-6 py-3 font-black text-slate-900 transition hover:bg-yellow-500"
              >
                🔄 Actualiser
              </button>
            </div>
          </div>
        </header>

        {errorMessage && (
          <div className="mb-6 rounded-2xl bg-red-100 p-4 font-semibold text-red-700">
            {errorMessage}
          </div>
        )}

        <section className="mb-8">
          <div className="mb-4">
            <h2 className="text-2xl font-black text-slate-900">
              Chauffeurs
            </h2>

            <p className="text-slate-600">
              État actuel de la flotte.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Total chauffeurs"
              value={stats.drivers.total}
              icon="🚖"
              className="border-slate-300"
            />

            <StatCard
              title="Disponibles"
              value={stats.drivers.available}
              icon="🟢"
              className="border-green-400"
              valueClassName="text-green-600"
            />

            <StatCard
              title="Occupés"
              value={stats.drivers.busy}
              icon="🟠"
              className="border-orange-400"
              valueClassName="text-orange-600"
            />

            <StatCard
              title="Hors ligne"
              value={stats.drivers.offline}
              icon="🔴"
              className="border-red-400"
              valueClassName="text-red-600"
            />
          </div>
        </section>

        <section className="mb-8">
          <div className="mb-4">
            <h2 className="text-2xl font-black text-slate-900">
              Réservations
            </h2>

            <p className="text-slate-600">
              Vue générale des courses.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Toutes les courses"
              value={stats.reservations.total}
              icon="📋"
              className="border-slate-300"
            />

            <StatCard
              title="En attente"
              value={stats.reservations.pending}
              icon="⏳"
              className="border-yellow-400"
              valueClassName="text-yellow-600"
            />

            <StatCard
              title="Actives"
              value={stats.reservations.active}
              icon="🛣️"
              className="border-blue-400"
              valueClassName="text-blue-600"
            />

            <StatCard
              title="Terminées"
              value={stats.reservations.completed}
              icon="✅"
              className="border-green-400"
              valueClassName="text-green-600"
            />
          </div>
        </section>

{/* ===================== CARTE GPS DES CHAUFFEURS ===================== */}
<section className="mb-8">
  <AdminDriversMap />
</section>

         <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl bg-gradient-to-br from-green-600 to-green-800 p-7 text-white shadow-xl lg:col-span-1">
            <p className="text-sm font-bold uppercase tracking-widest text-green-100">
              Revenus aujourd’hui
            </p>

            <p className="mt-4 text-5xl font-black">
              {Number(stats.revenue.today || 0).toLocaleString("fr-CA", {
                style: "currency",
                currency: "CAD",
              })}
            </p>

            <p className="mt-4 text-green-100">
              Total calculé à partir des réservations créées aujourd’hui.
            </p>
          </div>

          <div className="rounded-3xl bg-white p-7 shadow lg:col-span-2">
            <h2 className="text-2xl font-black text-slate-900">
              Accès rapides
            </h2>

            <p className="mt-1 text-slate-600">
              Ouvrez rapidement les principaux modules administratifs.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <AdminLink
                href="/admin/dispatch"
                icon="🗺️"
                title="Dispatch"
                description="Attribuer et suivre les courses."
              />

              <AdminLink
                href="/admin/reservations"
                icon="📋"
                title="Réservations"
                description="Consulter toutes les réservations."
              />

              <AdminLink
                href="/admin/calendrier"
                icon="📅"
                title="Calendrier"
                description="Voir les courses planifiées."
              />

              <AdminLink
                href="/admin/events"
                icon="📜"
                title="Journal"
                description="Consulter les événements du dispatch."
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatCard({
  title,
  value,
  icon,
  className = "",
  valueClassName = "text-slate-900",
}: {
  title: string;
  value: number;
  icon: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div
      className={`rounded-3xl border-l-8 bg-white p-6 shadow transition hover:-translate-y-1 hover:shadow-lg ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-bold text-slate-500">{title}</p>

          <p className={`mt-3 text-5xl font-black ${valueClassName}`}>
            {value}
          </p>
        </div>

        <div className="text-4xl">{icon}</div>
      </div>
    </div>
  );
}

function AdminLink({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <a
      href={href}
      className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:border-yellow-400 hover:bg-yellow-50"
    >
      <div className="text-3xl">{icon}</div>

      <h3 className="mt-3 text-xl font-black text-slate-900">
        {title}
      </h3>

      <p className="mt-1 text-sm text-slate-600">
        {description}
      </p>
    </a>
  );
}