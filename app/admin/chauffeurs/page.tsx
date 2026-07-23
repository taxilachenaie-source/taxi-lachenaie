"use client";

import { useEffect, useState } from "react";

type Driver = {
  id: number;
  name: string;
  phone: string;
  email: string;
  vehicle: string;
  plate: string;
  status: string;
  current_position: string;
};

export default function ChauffeursPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [plate, setPlate] = useState("");
  const [currentPosition, setCurrentPosition] = useState("");

  useEffect(() => {
    loadDrivers();
  }, []);

  async function loadDrivers() {
    const response = await fetch("/api/admin/drivers");
    const data = await response.json();

    if (Array.isArray(data)) {
      setDrivers(data);
    }
  }

  async function addDriver() {
    if (!name || !phone || !vehicle) {
      alert("Nom, téléphone et véhicule sont obligatoires.");
      return;
    }

    await fetch("/api/admin/drivers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        phone,
        email,
        vehicle,
        plate,
        current_position:
          currentPosition || "Garage Taxi Lachenaie",
      }),
    });

    setName("");
    setPhone("");
    setEmail("");
    setVehicle("");
    setPlate("");
    setCurrentPosition("");

    loadDrivers();
  }

  async function deleteDriver(id: number) {
    if (!confirm("Supprimer ce chauffeur ?")) return;

    await fetch(`/api/admin/drivers/${id}`, {
      method: "DELETE",
    });

    loadDrivers();
  }

  function badgeColor(status: string) {
    if (status === "Occupé") return "#dc2626";
    if (status === "Disponible") return "#16a34a";
    if (status === "Pause") return "#f59e0b";
    return "#64748b";
  }

  return (
    <main className="p-8">
      <h1 className="mb-8 text-4xl font-bold">🚕 Chauffeurs</h1>

      <div className="mb-8 rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-6 text-2xl font-bold">
          Ajouter un chauffeur
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom"
            className="rounded-xl border p-4"
          />

          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Téléphone"
            className="rounded-xl border p-4"
          />

          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Courriel"
            className="rounded-xl border p-4"
          />

          <input
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
            placeholder="Véhicule"
            className="rounded-xl border p-4"
          />

          <input
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder="Plaque"
            className="rounded-xl border p-4"
          />

          <input
            value={currentPosition}
            onChange={(e) => setCurrentPosition(e.target.value)}
            placeholder="Position actuelle"
            className="rounded-xl border p-4"
          />

          <button
            onClick={addDriver}
            className="rounded-xl bg-yellow-400 p-4 font-bold text-black md:col-span-3"
          >
            Ajouter le chauffeur
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white shadow">
        <table className="w-full min-w-[1100px]">
          <thead className="bg-yellow-400">
            <tr>
              <th className="p-4 text-left">Nom</th>
              <th className="p-4 text-left">Téléphone</th>
              <th className="p-4 text-left">Courriel</th>
              <th className="p-4 text-left">Véhicule</th>
              <th className="p-4 text-left">Plaque</th>
              <th className="p-4 text-left">Statut</th>
              <th className="p-4 text-left">📍 Position actuelle</th>
              <th className="p-4 text-left">Action</th>
            </tr>
          </thead>

          <tbody>
            {drivers.map((driver) => (
              <tr key={driver.id} className="border-b hover:bg-yellow-50">
                <td className="p-4 font-bold">{driver.name}</td>
                <td className="p-4">{driver.phone}</td>
                <td className="p-4">{driver.email}</td>
                <td className="p-4">{driver.vehicle}</td>
                <td className="p-4">{driver.plate}</td>

                <td className="p-4">
                  <span
                    style={{
                      backgroundColor: badgeColor(driver.status),
                      color: "white",
                      padding: "8px 14px",
                      borderRadius: "999px",
                      fontWeight: "bold",
                    }}
                  >
                    {driver.status || "Disponible"}
                  </span>
                </td>

                <td className="p-4">
                  {driver.current_position || "Garage Taxi Lachenaie"}
                </td>

                <td className="p-4">
                  <button
                    onClick={() => deleteDriver(driver.id)}
                    style={{
                      backgroundColor: "#dc2626",
                      color: "white",
                      padding: "10px 16px",
                      borderRadius: "8px",
                      fontWeight: "bold",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}

            {drivers.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-500">
                  Aucun chauffeur enregistré.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}