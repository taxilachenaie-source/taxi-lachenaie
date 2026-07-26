"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";

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

type DriversMapProps = {
  drivers: Driver[];
  selectedDriverId: number | null;
  onSelectDriver: (driverId: number) => void;
};

function MapBounds({ drivers }: { drivers: Driver[] }) {
  const map = useMap();

  useEffect(() => {
    const validDrivers = drivers.filter(
      (driver) =>
        Number.isFinite(Number(driver.latitude)) &&
        Number.isFinite(Number(driver.longitude))
    );

    if (validDrivers.length === 0) {
      return;
    }

    const bounds: LatLngBoundsExpression = validDrivers.map(
      (driver) => [
        Number(driver.latitude),
        Number(driver.longitude),
      ]
    );

    map.fitBounds(bounds, {
      padding: [50, 50],
      maxZoom: 15,
    });
  }, [drivers, map]);

  return null;
}

function getMarkerColor(status: string | null) {
  switch (status) {
    case "Disponible":
      return "#16a34a";

    case "Occupé":
      return "#dc2626";

    case "En attente":
      return "#eab308";

    case "Hors ligne":
      return "#64748b";

    default:
      return "#2563eb";
  }
}

function formatDate(value?: string | null) {
  if (!value) {
    return "Position inconnue";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Position inconnue";
  }

  return new Intl.DateTimeFormat("fr-CA", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

export default function DriversMap({
  drivers,
  selectedDriverId,
  onSelectDriver,
}: DriversMapProps) {
  const validDrivers = useMemo(
    () =>
      drivers.filter(
        (driver) =>
          Number.isFinite(Number(driver.latitude)) &&
          Number.isFinite(Number(driver.longitude))
      ),
    [drivers]
  );

  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    setMapReady(true);
  }, []);

  if (!mapReady) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-500">
          Chargement de la carte…
        </p>
      </div>
    );
  }

  return (
    <MapContainer
      center={[45.7008, -73.6475]}
      zoom={12}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapBounds drivers={validDrivers} />

      {validDrivers.map((driver) => {
        const isSelected = selectedDriverId === driver.id;
        const color = getMarkerColor(driver.status);

        return (
          <CircleMarker
            key={driver.id}
            center={[
              Number(driver.latitude),
              Number(driver.longitude),
            ]}
            radius={isSelected ? 14 : 10}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: 0.9,
              weight: isSelected ? 5 : 3,
            }}
            eventHandlers={{
              click: () => onSelectDriver(driver.id),
            }}
          >
            <Popup>
              <div className="min-w-52 space-y-2">
                <div>
                  <p className="text-base font-bold">
                    🚖 {driver.name}
                  </p>

                  <p className="text-sm font-semibold">
                    {driver.status || "Statut inconnu"}
                  </p>
                </div>

                {driver.phone && (
                  <p className="text-sm">
                    Téléphone : {driver.phone}
                  </p>
                )}

                {driver.vehicle && (
                  <p className="text-sm">
                    Véhicule : {driver.vehicle}
                  </p>
                )}

                <p className="text-sm">
                  {driver.current_position ||
                    "Position non décrite"}
                </p>

                <p className="text-xs text-slate-500">
                  Mise à jour :{" "}
                  {formatDate(driver.location_updated_at)}
                </p>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}