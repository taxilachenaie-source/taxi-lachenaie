"use client";

import { useEffect, useState } from "react";

export default function LivePositionPage() {
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number>(0);
  const [heading, setHeading] = useState<number>(0);
  const [status, setStatus] = useState("En attente du GPS...");

  const DRIVER_ID = 1;

  async function sendPosition(
    newLatitude: number,
    newLongitude: number,
    newSpeed = 0,
    newHeading = 0
  ) {
    try {
      await fetch("/api/chauffeur/update-location", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          driver_id: DRIVER_ID,
          latitude: newLatitude,
          longitude: newLongitude,
          speed: newSpeed,
          heading: newHeading,
        }),
      });

      setLatitude(newLatitude);
      setLongitude(newLongitude);
      setSpeed(newSpeed);
      setHeading(newHeading);
      setStatus("Position GPS envoyée.");
    } catch {
      setStatus("Erreur lors de l'envoi.");
    }
  }

  async function simulateMove() {
    if (latitude == null || longitude == null) {
      alert("GPS pas encore prêt.");
      return;
    }

    await sendPosition(
      latitude + 0.0001,
      longitude + 0.0001,
      15,
      45
    );
  }

  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus("Votre navigateur ne supporte pas la géolocalisation.");
      return;
    }

    setStatus("Recherche du GPS...");

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        await sendPosition(
          position.coords.latitude,
          position.coords.longitude,
          position.coords.speed ?? 0,
          position.coords.heading ?? 0
        );
      },
      () => {
        setStatus("GPS indisponible ou autorisation refusée.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-2xl rounded-3xl bg-white p-8 shadow">
        <h1 className="text-4xl font-bold text-yellow-500">
          🚖 GPS Chauffeur
        </h1>

        <p className="mt-4 rounded-xl bg-blue-100 p-4 font-semibold">
          {status}
        </p>

        <div className="mt-8 space-y-4 text-lg">
          <p>📍 <strong>Latitude :</strong> {latitude?.toFixed(6) ?? "--"}</p>
          <p>📍 <strong>Longitude :</strong> {longitude?.toFixed(6) ?? "--"}</p>
          <p>🚗 <strong>Vitesse :</strong> {speed.toFixed(2)} m/s</p>
          <p>🧭 <strong>Direction :</strong> {heading.toFixed(0)}°</p>
        </div>

        <div className="mt-8 rounded-2xl bg-green-100 p-6">
          <p className="text-xl font-bold">✅ Le GPS est actif.</p>
          <p className="mt-2">
            Votre position est automatiquement envoyée au serveur dès qu'elle change.
          </p>
        </div>

        <button
          onClick={simulateMove}
          className="mt-6 w-full rounded-2xl bg-blue-600 py-4 text-xl font-bold text-white hover:bg-blue-700"
        >
          🚗 Simuler un déplacement
        </button>
      </div>
    </main>
  );
}