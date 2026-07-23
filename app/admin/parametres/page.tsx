"use client";

import { useEffect, useState } from "react";

type Settings = {
  companyName: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  baseFare: string;
  pricePerKm: string;
  pricePerMinute: string;
  vipBaseFare: string;
  vipPricePerKm: string;
};

export default function ParametresPage() {
  const [settings, setSettings] = useState<Settings>({
    companyName: "",
    phone: "",
    email: "",
    address: "",
    website: "",
    baseFare: "",
    pricePerKm: "",
    pricePerMinute: "",
    vipBaseFare: "",
    vipPricePerKm: "",
  });

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    const response = await fetch("/api/admin/settings");
    const data = await response.json();

    setSettings({
      companyName: data.company_name || "",
      phone: data.phone || "",
      email: data.email || "",
      address: data.address || "",
      website: data.website || "",
      baseFare: String(data.base_fare || ""),
      pricePerKm: String(data.price_per_km || ""),
      pricePerMinute: String(data.price_per_minute || ""),
      vipBaseFare: String(data.vip_base_fare || ""),
      vipPricePerKm: String(data.vip_price_per_km || ""),
    });
  }

  async function saveSettings() {
    await fetch("/api/admin/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(settings),
    });

    alert("Paramètres enregistrés dans Supabase !");
  }

  function updateField(field: keyof Settings, value: string) {
    setSettings({
      ...settings,
      [field]: value,
    });
  }

  return (
    <main className="p-8">
      <h1 className="mb-6 text-4xl font-bold">⚙️ Paramètres</h1>

      <div className="rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-6 text-2xl font-bold">
          Informations de l'entreprise
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <input value={settings.companyName} onChange={(e) => updateField("companyName", e.target.value)} placeholder="Nom de la compagnie" className="rounded-xl border p-4" />
          <input value={settings.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="Téléphone" className="rounded-xl border p-4" />
          <input value={settings.email} onChange={(e) => updateField("email", e.target.value)} placeholder="Courriel" className="rounded-xl border p-4" />
          <input value={settings.address} onChange={(e) => updateField("address", e.target.value)} placeholder="Adresse" className="rounded-xl border p-4" />
          <input value={settings.website} onChange={(e) => updateField("website", e.target.value)} placeholder="Site web" className="rounded-xl border p-4 md:col-span-2" />
        </div>

        <h2 className="mb-6 mt-10 text-2xl font-bold">Tarifs Standard</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <input value={settings.baseFare} onChange={(e) => updateField("baseFare", e.target.value)} placeholder="Tarif de base" className="rounded-xl border p-4" />
          <input value={settings.pricePerKm} onChange={(e) => updateField("pricePerKm", e.target.value)} placeholder="Prix par km" className="rounded-xl border p-4" />
          <input value={settings.pricePerMinute} onChange={(e) => updateField("pricePerMinute", e.target.value)} placeholder="Prix par minute" className="rounded-xl border p-4" />
        </div>

        <h2 className="mb-6 mt-10 text-2xl font-bold">Tarifs VIP</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <input value={settings.vipBaseFare} onChange={(e) => updateField("vipBaseFare", e.target.value)} placeholder="Tarif VIP de base" className="rounded-xl border p-4" />
          <input value={settings.vipPricePerKm} onChange={(e) => updateField("vipPricePerKm", e.target.value)} placeholder="Prix VIP par km" className="rounded-xl border p-4" />
        </div>

        <button
          onClick={saveSettings}
          className="mt-8 rounded-xl bg-yellow-400 px-8 py-4 font-bold text-black"
        >
          Enregistrer les paramètres
        </button>
      </div>
    </main>
  );
}