"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import * as L from "leaflet";

type Props = {
  clientLatitude: number | null;
  clientLongitude: number | null;
  driverLatitude: number | null;
  driverLongitude: number | null;
};

type TrackingRouteResponse = {
  success: boolean;
  geometry?: {
    coordinates: [number, number][];
  };
  distanceKm?: number;
  durationMin?: number;
  error?: string;
};

const DEFAULT_CENTER: [number, number] = [45.728, -73.506];

const clientIcon = L.divIcon({
  html: `
    <div style="
      font-size: 36px;
      line-height: 40px;
      filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));
    ">
      📍
    </div>
  `,
  className: "",
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -38],
});

const taxiIcon = L.divIcon({
  html: `
    <div style="
      font-size: 36px;
      line-height: 40px;
      filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));
    ">
      🚖
    </div>
  `,
  className: "",
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -38],
});

function isValidCoordinate(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function FitBounds({
  clientLatitude,
  clientLongitude,
  driverLatitude,
  driverLongitude,
}: Props) {
  const map = useMap();

  useEffect(() => {
    const points: [number, number][] = [];

    if (
      isValidCoordinate(clientLatitude) &&
      isValidCoordinate(clientLongitude)
    ) {
      points.push([clientLatitude, clientLongitude]);
    }

    if (
      isValidCoordinate(driverLatitude) &&
      isValidCoordinate(driverLongitude)
    ) {
      points.push([driverLatitude, driverLongitude]);
    }

    if (points.length === 1) {
      map.setView(points[0], 15, {
        animate: true,
      });

      return;
    }

    if (points.length >= 2) {
      map.fitBounds(points, {
        padding: [50, 50],
        maxZoom: 15,
        animate: true,
      });
    }
  }, [
    clientLatitude,
    clientLongitude,
    driverLatitude,
    driverLongitude,
    map,
  ]);

  return null;
}

export default function TrackingMapLeaflet({
  clientLatitude,
  clientLongitude,
  driverLatitude,
  driverLongitude,
}: Props) {
  const [routePoints, setRoutePoints] = useState<
    [number, number][]
  >([]);

  const [distanceKm, setDistanceKm] =
    useState<number | null>(null);

  const [durationMin, setDurationMin] =
    useState<number | null>(null);

  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");

  const hasClientLocation =
    isValidCoordinate(clientLatitude) &&
    isValidCoordinate(clientLongitude);

  const hasDriverLocation =
    isValidCoordinate(driverLatitude) &&
    isValidCoordinate(driverLongitude);

  const defaultCenter = useMemo<[number, number]>(() => {
    if (hasClientLocation) {
      return [clientLatitude, clientLongitude];
    }

    if (hasDriverLocation) {
      return [driverLatitude, driverLongitude];
    }

    return DEFAULT_CENTER;
  }, [
    hasClientLocation,
    hasDriverLocation,
    clientLatitude,
    clientLongitude,
    driverLatitude,
    driverLongitude,
  ]);

  useEffect(() => {
    /*
     * Réinitialiser l’itinéraire lorsque l’une des deux
     * positions n’est pas encore disponible.
     */
    if (!hasClientLocation || !hasDriverLocation) {
      setRoutePoints([]);
      setDistanceKm(null);
      setDurationMin(null);
      setRouteError("");
      setRouteLoading(false);

      return;
    }

    const controller = new AbortController();

    async function loadRoute() {
      setRouteLoading(true);
      setRouteError("");

      try {
        const response = await fetch("/api/tracking-route", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          signal: controller.signal,
          body: JSON.stringify({
            clientLatitude,
            clientLongitude,
            driverLatitude,
            driverLongitude,
          }),
        });

        const data =
          (await response.json()) as TrackingRouteResponse;

        if (!response.ok || !data.success) {
          throw new Error(
            data.error ||
              "Impossible de calculer l’itinéraire."
          );
        }

        const coordinates =
          data.geometry?.coordinates || [];

        const points: [number, number][] = coordinates
          .filter(
            (point): point is [number, number] =>
              Array.isArray(point) &&
              point.length >= 2 &&
              Number.isFinite(Number(point[0])) &&
              Number.isFinite(Number(point[1]))
          )
          .map((point) => [
            Number(point[1]),
            Number(point[0]),
          ]);

        setRoutePoints(points);

        setDistanceKm(
          Number.isFinite(Number(data.distanceKm))
            ? Number(data.distanceKm)
            : null
        );

        setDurationMin(
          Number.isFinite(Number(data.durationMin))
            ? Math.max(0, Math.ceil(Number(data.durationMin)))
            : null
        );
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        console.error(
          "Erreur calcul itinéraire de suivi :",
          error
        );

        setRoutePoints([]);
        setDistanceKm(null);
        setDurationMin(null);

        setRouteError(
          error instanceof Error
            ? error.message
            : "Itinéraire temporairement indisponible."
        );
      } finally {
        if (!controller.signal.aborted) {
          setRouteLoading(false);
        }
      }
    }

    void loadRoute();

    return () => {
      controller.abort();
    };
  }, [
    hasClientLocation,
    hasDriverLocation,
    clientLatitude,
    clientLongitude,
    driverLatitude,
    driverLongitude,
  ]);

  const arrived =
    distanceKm !== null && distanceKm <= 0.1;

  return (
    <div>
      {routeLoading && (
        <div className="mb-4 rounded-2xl bg-slate-100 p-4 font-semibold text-slate-700">
          Calcul de l’arrivée du chauffeur...
        </div>
      )}

      {routeError && (
        <div className="mb-4 rounded-2xl bg-orange-100 p-4 text-sm font-semibold text-orange-800">
          {routeError}
        </div>
      )}

      {!routeLoading &&
        !routeError &&
        (distanceKm !== null || durationMin !== null) && (
          <div
            className={`mb-4 rounded-2xl p-4 ${
              arrived
                ? "bg-yellow-300 text-slate-950"
                : "bg-green-100 text-green-950"
            }`}
          >
            {arrived ? (
              <>
                <p className="text-2xl font-black">
                  🚖 Votre chauffeur est arrivé
                </p>

                <p className="mt-2 font-semibold">
                  Le taxi se trouve maintenant près de votre
                  point de départ.
                </p>
              </>
            ) : (
              <>
                {durationMin !== null && (
                  <p className="text-xl font-bold">
                    ⏱️ Arrivée estimée : {durationMin} min
                  </p>
                )}

                {distanceKm !== null && (
                  <p className="font-semibold">
                    📏 Distance restante :{" "}
                    {distanceKm.toFixed(2)} km
                  </p>
                )}
              </>
            )}
          </div>
        )}

      {!hasClientLocation && !hasDriverLocation && (
        <div className="mb-4 rounded-2xl bg-slate-100 p-5 text-center">
          <p className="text-lg font-bold">
            Position GPS temporairement indisponible
          </p>

          <p className="mt-2 text-sm text-slate-600">
            La carte se mettra automatiquement à jour dès
            qu’une position sera reçue.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <MapContainer
          center={defaultCenter}
          zoom={13}
          scrollWheelZoom={false}
          className="h-[400px] w-full"
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {routePoints.length > 1 && (
            <Polyline
              positions={routePoints}
              pathOptions={{
                weight: 6,
                opacity: 0.8,
              }}
            />
          )}

          {hasClientLocation && (
            <Marker
              position={[clientLatitude, clientLongitude]}
              icon={clientIcon}
            >
              <Popup>📍 Votre point de départ</Popup>
            </Marker>
          )}

          {hasDriverLocation && (
            <Marker
              position={[driverLatitude, driverLongitude]}
              icon={taxiIcon}
            >
              <Popup>🚖 Position actuelle du chauffeur</Popup>
            </Marker>
          )}

          <FitBounds
            clientLatitude={clientLatitude}
            clientLongitude={clientLongitude}
            driverLatitude={driverLatitude}
            driverLongitude={driverLongitude}
          />
        </MapContainer>
      </div>
    </div>
  );
}