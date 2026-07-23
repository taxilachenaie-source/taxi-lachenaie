"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import * as L from "leaflet";
() => import("./DriversMapLeaflet")

type Driver = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  vehicle: string | null;
  plate: string | null;
  status: string | null;
  current_position: string | null;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  heading: number | null;
  updated_at: string | null;
  seconds_since_update: number | null;
  gps_active: boolean;
};

type DriversApiResponse = {
  success: boolean;
  drivers?: Driver[];
  error?: string;
};

const taxiIcon = L.divIcon({
  html: `
    <div
      style="
        font-size: 36px;
        line-height: 44px;
        text-align: center;
      "
    >
      🚖
    </div>
  `,
  className: "taxi-driver-marker",
  iconSize: [44, 44],
  iconAnchor: [22, 40],
  popupAnchor: [0, -38],
});

function FitDriversBounds({ drivers }: { drivers: Driver[] }) {
  const map = useMap();

  useEffect(() => {
    const points: [number, number][] = drivers
      .filter(
        (driver) =>
          driver.latitude !== null &&
          driver.longitude !== null &&
          Number.isFinite(Number(driver.latitude)) &&
          Number.isFinite(Number(driver.longitude))
      )
      .map((driver) => [
        Number(driver.latitude),
        Number(driver.longitude),
      ]);

    if (points.length === 0) {
      map.setView([45.73, -73.51], 12);
      return;
    }

    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }

    map.fitBounds(points, {
      padding: [50, 50],
      maxZoom: 14,
    });
  }, [drivers, map]);

  return null;
}

function getStatusClasses(status: string | null) {
  switch (status) {
    case "Disponible":
      return "bg-green-100 text-green-700";

    case "Occupé":
      return "bg-orange-100 text-orange-700";

    case "Hors ligne":
      return "bg-red-100 text-red-700";

    default:
      return "bg-slate-100 text-slate-700";
  }
}

function formatLastUpdate(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) {
    return "Jamais";
  }

  if (seconds < 60) {
    return `Il y a ${Math.floor(seconds)} s`;
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `Il y a ${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `Il y a ${hours} h`;
  }

  const days = Math.floor(hours / 24);

  return `Il y a ${days} j`;
}

export default function DriversMapLeaflet() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadDrivers = useCallback(async (showRefreshing = false) => {
    try {
      if (showRefreshing) {
        setRefreshing(true);
      }

      const response = await fetch("/api/admin/drivers-live", {
        method: "GET",
        cache: "no-store",
      });

      const data = (await response.json()) as DriversApiResponse;

      if (!response.ok || !data.success) {
        setErrorMessage(
          data.error || "Impossible de charger les chauffeurs."
        );
        return;
      }

      setDrivers(Array.isArray(data.drivers) ? data.drivers : []);
      setErrorMessage("");
    } catch (error) {
      console.error("Erreur carte chauffeurs :", error);
      setErrorMessage("Erreur de chargement de la carte.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDrivers();

    const interval = window.setInterval(() => {
      void loadDrivers();
    }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadDrivers]);

  const visibleDrivers = useMemo(() => {
    return drivers.filter(
      (driver) =>
        driver.latitude !== null &&
        driver.longitude !== null &&
        Number.isFinite(Number(driver.latitude)) &&
        Number.isFinite(Number(driver.longitude))
    );
  }, [drivers]);

  const defaultCenter: [number, number] = useMemo(() => {
    const firstDriver = visibleDrivers[0];

    if (!firstDriver) {
      return [45.73, -73.51];
    }

    return [
      Number(firstDriver.latitude),
      Number(firstDriver.longitude),
    ];
  }, [visibleDrivers]);

  if (loading) {
    return (
      <div className="flex h-[500px] items-center justify-center rounded-3xl bg-white shadow-xl">
        <p className="text-xl font-bold text-slate-700">
          Chargement de la carte des chauffeurs...
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-3xl bg-white p-5 shadow-xl sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900">
            🗺️ Carte GPS des chauffeurs
          </h2>

          <p className="mt-1 text-slate-600">
            Position actuelle de la flotte Taxi Lachenaie.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700">
            {visibleDrivers.length} chauffeur
            {visibleDrivers.length !== 1 ? "s" : ""} sur la carte
          </span>

          <button
            type="button"
            disabled={refreshing}
            onClick={() => void loadDrivers(true)}
            className="rounded-xl bg-yellow-400 px-5 py-2 font-black text-slate-900 transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Actualisation..." : "🔄 Actualiser"}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="mb-4 rounded-2xl bg-red-100 p-4 font-semibold text-red-700">
          {errorMessage}
        </div>
      )}

      {visibleDrivers.length === 0 ? (
        <div className="flex h-[500px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
          <div className="px-6 text-center">
            <p className="text-4xl">📍</p>

            <h3 className="mt-3 text-xl font-black text-slate-900">
              Aucune position GPS disponible
            </h3>

            <p className="mt-2 text-slate-600">
              Les chauffeurs doivent ouvrir leur page GPS pour apparaître sur
              la carte.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <MapContainer
            center={defaultCenter}
            zoom={12}
            scrollWheelZoom
            className="h-[500px] w-full"
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {visibleDrivers.map((driver) => (
              <Marker
                key={driver.id}
                position={[
                  Number(driver.latitude),
                  Number(driver.longitude),
                ]}
                icon={taxiIcon}
              >
                <Popup>
                  <div className="min-w-[230px] space-y-3">
                    <div>
                      <h3 className="text-xl font-black">
                        🚖 {driver.name}
                      </h3>

                      <span
                        className={`mt-2 inline-block rounded-full px-3 py-1 text-sm font-bold ${getStatusClasses(
                          driver.status
                        )}`}
                      >
                        {driver.status || "Statut inconnu"}
                      </span>
                    </div>

                    <div className="space-y-1 text-sm">
                      <p>
                        🚗 <strong>Véhicule :</strong>{" "}
                        {driver.vehicle || "Non défini"}
                      </p>

                      <p>
                        🔢 <strong>Plaque :</strong>{" "}
                        {driver.plate || "Non définie"}
                      </p>

                      <p>
                        📍 <strong>Position :</strong>{" "}
                        {driver.current_position || "Non définie"}
                      </p>

                      <p>
                        🚘 <strong>Vitesse :</strong>{" "}
                        {Number(driver.speed || 0).toFixed(1)} m/s
                      </p>

                      <p>
                        🧭 <strong>Direction :</strong>{" "}
                        {Number(driver.heading || 0).toFixed(0)}°
                      </p>

                      <p>
                        🕒 <strong>Dernière mise à jour :</strong>{" "}
                        {formatLastUpdate(driver.seconds_since_update)}
                      </p>
                    </div>

                    <div
                      className={`rounded-xl p-3 font-bold ${
                        driver.gps_active
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {driver.gps_active
                        ? "🟢 GPS actif"
                        : "🔴 GPS inactif"}
                    </div>

                    {driver.phone && (
                      <a
                        href={`tel:${driver.phone}`}
                        className="block rounded-xl bg-green-600 px-4 py-2 text-center font-bold text-white"
                      >
                        📞 Appeler
                      </a>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}

            <FitDriversBounds drivers={visibleDrivers} />
          </MapContainer>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {drivers.map((driver) => (
          <article
            key={driver.id}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-black text-slate-900">
                  🚖 {driver.name}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {driver.vehicle || "Véhicule non défini"}
                  {driver.plate ? ` • ${driver.plate}` : ""}
                </p>
              </div>

              <span
                className={`rounded-full px-3 py-1 text-sm font-bold ${getStatusClasses(
                  driver.status
                )}`}
              >
                {driver.status || "Inconnu"}
              </span>
            </div>

            <div className="mt-4 space-y-2 text-sm text-slate-700">
              <p>
                📍 {driver.current_position || "Position inconnue"}
              </p>

              <p>
                🕒 {formatLastUpdate(driver.seconds_since_update)}
              </p>

              <p
                className={
                  driver.gps_active
                    ? "font-bold text-green-600"
                    : "font-bold text-red-600"
                }
              >
                {driver.gps_active
                  ? "🟢 GPS actif"
                  : "🔴 GPS inactif"}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}