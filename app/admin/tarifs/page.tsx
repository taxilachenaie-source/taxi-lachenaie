"use client";

import { useEffect, useState } from "react";

type Rate = {
  id: number;
  zone_id: number;
  vehicle_type: string;
  day_price: number;
  night_price: number;
  airport_zones: {
    name: string;
    city: string;
  };
};

export default function TarifsPage() {
  const [rates, setRates] = useState<Rate[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedRate, setSelectedRate] = useState<Rate | null>(null);
  const [dayPrice, setDayPrice] = useState("");
  const [nightPrice, setNightPrice] = useState("");

  useEffect(() => {
    loadRates();
  }, []);

  async function loadRates() {
    const response = await fetch("/api/admin/airport-rates");
    const result = await response.json();

    if (result.success) {
      setRates(result.rates);
    }

    setLoading(false);
  }

  function openEdit(rate: Rate) {
    setSelectedRate(rate);
    setDayPrice(String(rate.day_price));
    setNightPrice(String(rate.night_price));
  }

  async function saveRate() {
    if (!selectedRate) return;

    const response = await fetch(`/api/admin/airport-rates/${selectedRate.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        day_price: Number(dayPrice),
        night_price: Number(nightPrice),
      }),
    });

    const result = await response.json();

    if (!result.success) {
      alert(result.error);
      return;
    }

    setSelectedRate(null);
    loadRates();
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        Chargement...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-2 text-4xl font-bold">✈️ Tarifs Aéroport YUL</h1>

        <p className="mb-8 text-slate-600">
          Gestion des tarifs promotionnels Taxi Lachenaie
        </p>

        <div className="overflow-hidden rounded-2xl bg-white shadow">
          <table className="w-full">
            <thead className="bg-yellow-400">
              <tr>
                <th className="p-4 text-left">Zone</th>
                <th className="p-4 text-left">Ville</th>
                <th className="p-4 text-left">Véhicule</th>
                <th className="p-4 text-left">Jour</th>
                <th className="p-4 text-left">Nuit</th>
                <th className="p-4 text-left">Action</th>
              </tr>
            </thead>

            <tbody>
              {rates.map((rate) => (
                <tr key={rate.id} className="border-b hover:bg-yellow-50">
                  <td className="p-4 font-bold">
                    {rate.airport_zones.name}
                  </td>

                  <td className="p-4">{rate.airport_zones.city}</td>

                  <td className="p-4">{rate.vehicle_type}</td>

                  <td className="p-4 font-bold text-green-600">
                    {Number(rate.day_price).toFixed(2)} $
                  </td>

                  <td className="p-4 font-bold text-red-600">
                    {Number(rate.night_price).toFixed(2)} $
                  </td>

                  <td className="p-4">
                    <button
                      onClick={() => openEdit(rate)}
                      className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700"
                    >
                      Modifier
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedRate && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl">
            <h2 className="mb-6 text-3xl font-bold">Modifier tarif</h2>

            <p className="mb-2 font-bold">
              {selectedRate.airport_zones.name} —{" "}
              {selectedRate.airport_zones.city}
            </p>

            <p className="mb-6 text-slate-600">
              Véhicule : {selectedRate.vehicle_type}
            </p>

            <label className="mb-2 block font-bold">Tarif jour</label>
            <input
              value={dayPrice}
              onChange={(e) => setDayPrice(e.target.value)}
              type="number"
              className="mb-5 w-full rounded-xl border p-4"
            />

            <label className="mb-2 block font-bold">Tarif nuit</label>
            <input
              value={nightPrice}
              onChange={(e) => setNightPrice(e.target.value)}
              type="number"
              className="mb-6 w-full rounded-xl border p-4"
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setSelectedRate(null)}
                className="rounded-xl bg-slate-200 px-5 py-3 font-bold"
              >
                Annuler
              </button>

              <button
                onClick={saveRate}
                className="rounded-xl bg-yellow-400 px-5 py-3 font-bold text-black"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}