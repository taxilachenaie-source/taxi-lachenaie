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

type DriverPosition = {
  id: number;
  latitude: number | null;
  longitude: number | null;
  status: string | null;
  heading: number | null;
  speed: number | null;
  updated_at: string | null;
};

type ApiResponse = {
  success: boolean;
  drivers?: DriverPosition[];
  error?: string;
};

type Props = {
  currentDriverId: number;
};

const myTaxiIcon = L.divIcon({
  html: `
    <div style="
      width: 46px;
      height: 46px;
      border-radius: 9999px;
      background: #2563eb;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 4px solid white;
      box-shadow: 0 4px 14px rgba(0,0,0,.3);
      font-size: 26px;
    ">
      🚖
    </div>
  `,
  className: "",
  iconSize: [46, 46],
  iconAnchor: [23, 23],
  popupAnchor: [0, -24],
});

const otherTaxiIcon = L.divIcon({
  html: `
    <div style="
      width: 42px;
      height: 42px;
      border-radius: 9999px;
      background: #facc15;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 3px solid white;
      box-shadow: 0 4px 12px rgba(0,0,0,.25);
      font-size: 24px;
    ">
      🚖
    </div>
  `,
  className: "",
  iconSize: [42, 42],
  iconAnchor: [21, 21],
  popupAnchor: [0, -22],
});

function FitBounds({
  drivers,
  currentDriverId,
}: {
  drivers: DriverPosition[];
  currentDriverId: number;
}) {
  const map = useMap();

  useEffect(() => {
    const validDrivers = drivers.filter(
      (driver) =>
        driver.latitude !== null &&
        driver.longitude !== null &&
        Number.isFinite(Number(driver.latitude)) &&
        Number.isFinite(Number(driver.longitude))
    );

    const currentDriver = validDrivers.find(
      (driver) => driver.id === currentDriverId
    );

    if (currentDriver) {
      map.setView(
        [
          Number(currentDriver.latitude),
          Number(currentDriver.longitude),
        ],
        14
      );

      return;
    }

    const points: [number, number][] = validDrivers.map((driver) => [
      Number(driver.latitude),
      Number(driver.longitude),
    ]);

    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }

    if (points.length > 1) {
      map.fitBounds(points, {
        padding: [50, 50],
        maxZoom: 14,
      });
    }
  }, [drivers, currentDriverId, map]);

  return null;
}

function formatStatus(status: string | null) {
  switch (status) {
    case "Disponible":
      return "Disponible";

    case "Occupé":
      return "Occupé";

    case "En attente":
      return "En attente";

    case "Hors ligne":
      return "Hors ligne";

    default:
      return "Statut inconnu";
  }
}

export default function DriversMapLeaflet({
  currentDriverId,
}: Props) {
  const [drivers, setDrivers] = useState<DriverPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadDrivers = useCallback(async () => {
    try {
      const response = await fetch("/api/chauffeur/drivers-map", {
        cache: "no-store",
      });

      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.success) {
        setErrorMessage(
          data.error || "Impossible de charger les positions."
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
    }
  }, []);

  useEffect(() => {
    void loadDrivers();

    const interval = window.setInterval(() => {
      void loadDrivers();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [loadDrivers]);

  const visibleDrivers = useMemo(
    () =>
      drivers.filter(
        (driver) =>
          driver.latitude !== null &&
          driver.longitude !== null &&
          Number.isFinite(Number(driver.latitude)) &&
          Number.isFinite(Number(driver.longitude))
      ),
    [drivers]
  );

  const defaultCenter: [number, number] = useMemo(() => {
    const currentDriver = visibleDrivers.find(
      (driver) => driver.id === currentDriverId
    );

    if (currentDriver) {
      return [
        Number(currentDriver.latitude),
        Number(currentDriver.longitude),
      ];
    }

    const firstDriver = visibleDrivers[0];

    if (firstDriver) {
      return [
        Number(firstDriver.latitude),
        Number(firstDriver.longitude),
      ];
    }

    return [45.73, -73.51];
  }, [visibleDrivers, currentDriverId]);

  if (loading) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-3xl bg-white shadow">
        <p className="text-lg font-bold text-slate-700">
          Chargement de la carte...
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-3xl bg-white p-6 shadow">
      <div className="mb-5">
        <h2 className="text-2xl font-black text-slate-900">
          🗺️ Carte des chauffeurs
        </h2>

        <p className="mt-1 text-slate-600">
          Votre position est affichée en bleu. Les autres chauffeurs sont anonymes.
        </p>
      </div>

      {errorMessage && (
        <div className="mb-4 rounded-2xl bg-red-100 p-4 font-semibold text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-3 text-sm font-bold">
        <span className="rounded-full bg-blue-100 px-4 py-2 text-blue-700">
          🔵 Votre taxi
        </span>

        <span className="rounded-full bg-yellow-100 px-4 py-2 text-yellow-700">
          🟡 Autres taxis
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <MapContainer
          center={defaultCenter}
          zoom={13}
          scrollWheelZoom
          className="h-[420px] w-full"
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {visibleDrivers.map((driver) => {
            const isCurrentDriver = driver.id === currentDriverId;

            return (
              <Marker
                key={driver.id}
                position={[
                  Number(driver.latitude),
                  Number(driver.longitude),
                ]}
                icon={
                  isCurrentDriver
                    ? myTaxiIcon
                    : otherTaxiIcon
                }
              >
                <Popup>
                  {isCurrentDriver ? (
                    <div className="min-w-[180px]">
                      <p className="text-lg font-black">
                        🚖 Votre position
                      </p>

                      <p className="mt-2">
                        Statut : {formatStatus(driver.status)}
                      </p>

                      <p>
                        Vitesse :{" "}
                        {Number(driver.speed || 0).toFixed(1)} m/s
                      </p>
                    </div>
                  ) : (
                    <div className="min-w-[160px]">
                      <p className="text-lg font-black">
                        🚖 Autre chauffeur
                      </p>

                      <p className="mt-2">
                        Statut : {formatStatus(driver.status)}
                      </p>
                    </div>
                  )}
                </Popup>
              </Marker>
            );
          })}

          <FitBounds
            drivers={visibleDrivers}
            currentDriverId={currentDriverId}
          />
        </MapContainer>
      </div>
    </section>
  );
}