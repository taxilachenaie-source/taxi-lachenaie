"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const DriversMap = dynamic(
  () => import("./DriversMap"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-500">
          Chargement de la carte GPS…
        </p>
      </div>
    ),
  }
);

type Driver = {
  id: number;
  name: string;
  status: string | null;
  phone?: string | null;
  vehicle?: string | null;
  current_position?: string | null;
  latitude: number | null;
  longitude: number | null;
  location_updated_at?: string | null;
};

function statusClasses(status: string | null) {
  switch (status) {
    case "Disponible":
      return "bg-green-100 text-green-800";

    case "Occupé":
      return "bg-red-100 text-red-800";

    case "En attente":
      return "bg-yellow-100 text-yellow-800";

    case "Hors ligne":
      return "bg-slate-200 text-slate-700";

    default:
      return "bg-blue-100 text-blue-800";
  }
}

export default function AdminMapPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriverId, setSelectedDriverId] =
    useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDrivers = useCallback(async () => {
    const { data, error: driversError } = await supabase
      .from("drivers")
      .select(
        `
          id,
          name,
          status,
          phone,
          vehicle,
          current_position,
          latitude,
          longitude,
          location_updated_at
        `
      )
      .order("name", {
        ascending: true,
      });

    if (driversError) {
      setError(driversError.message);
      setLoading(false);
      return;
    }

    setDrivers((data || []) as Driver[]);
    setError("");
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDrivers();

    const channel = supabase
      .channel("admin-drivers-map")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "drivers",
        },
        () => {
          loadDrivers();
        }
      )
      .subscribe((status, realtimeError) => {
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          console.error(
            "Erreur Supabase Realtime :",
            realtimeError
          );
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadDrivers]);

  const selectedDriver = useMemo(
    () =>
      drivers.find(
        (driver) => driver.id === selectedDriverId
      ) || null,
    [drivers, selectedDriverId]
  );

  const availableCount = drivers.filter(
    (driver) => driver.status === "Disponible"
  ).length;

  const busyCount = drivers.filter(
    (driver) => driver.status === "Occupé"
  ).length;

  const pendingCount = drivers.filter(
    (driver) => driver.status === "En attente"
  ).length;

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-5">
          <h1 className="text-3xl font-black text-slate-900">
            Carte GPS des chauffeurs
          </h1>

          <p className="mt-1 text-slate-600">
            Suivi en temps réel de la flotte Taxi Lachenaie
          </p>
        </div>

        <section className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total chauffeurs"
            value={drivers.length}
          />

          <StatCard
            label="Disponibles"
            value={availableCount}
          />

          <StatCard
            label="Occupés"
            value={busyCount}
          />

          <StatCard
            label="En attente"
            value={pendingCount}
          />
        </section>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        <section className="grid min-h-[700px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[340px_1fr]">
          <aside className="max-h-[700px] overflow-y-auto border-b border-slate-200 p-4 lg:border-b-0 lg:border-r">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900">
                Chauffeurs
              </h2>

              <p className="text-sm text-slate-500">
                Cliquez sur un chauffeur pour le sélectionner.
              </p>
            </div>

            {loading ? (
              <p className="text-sm text-slate-500">
                Chargement des chauffeurs…
              </p>
            ) : drivers.length === 0 ? (
              <p className="text-sm text-slate-500">
                Aucun chauffeur trouvé.
              </p>
            ) : (
              <div className="space-y-3">
                {drivers.map((driver) => {
                  const selected =
                    selectedDriverId === driver.id;

                  const hasGps =
                    Number.isFinite(
                      Number(driver.latitude)
                    ) &&
                    Number.isFinite(
                      Number(driver.longitude)
                    );

                  return (
                    <button
                      key={driver.id}
                      type="button"
                      onClick={() =>
                        setSelectedDriverId(driver.id)
                      }
                      className={`w-full rounded-xl border p-4 text-left transition ${
                        selected
                          ? "border-blue-500 bg-blue-50 shadow-sm"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-slate-900">
                            🚖 {driver.name}
                          </p>

                          <p className="mt-1 text-sm text-slate-500">
                            {driver.current_position ||
                              "Position inconnue"}
                          </p>
                        </div>

                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClasses(
                            driver.status
                          )}`}
                        >
                          {driver.status ||
                            "Inconnu"}
                        </span>
                      </div>

                      <p className="mt-3 text-xs font-medium text-slate-500">
                        {hasGps
                          ? "📍 GPS actif"
                          : "⚠️ Aucune position GPS"}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          <div className="relative min-h-[500px]">
            <DriversMap
              drivers={drivers}
              selectedDriverId={selectedDriverId}
              onSelectDriver={setSelectedDriverId}
            />

            {selectedDriver && (
              <div className="absolute bottom-4 left-4 right-4 z-[1000] rounded-xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur md:left-auto md:w-80">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black text-slate-900">
                      {selectedDriver.name}
                    </h3>

                    <p className="text-sm text-slate-600">
                      {selectedDriver.current_position ||
                        "Position inconnue"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setSelectedDriverId(null)
                    }
                    className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">
        {label}
      </p>

      <p className="mt-2 text-3xl font-black text-slate-900">
        {value}
      </p>
    </div>
  );
}