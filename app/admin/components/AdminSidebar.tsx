"use client";

import { supabase } from "@/lib/supabase";

export default function AdminSidebar() {
  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <aside
      style={{
        width: "320px",
        background: "#05081b",
        color: "white",
        minHeight: "100vh",
        padding: "30px 20px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <h1
        style={{
          color: "#facc15",
          fontSize: "28px",
          fontWeight: "bold",
          lineHeight: "1.3",
          marginBottom: "10px",
        }}
      >
        🚖 Taxi
        <br />
        Lachenaie
      </h1>

      <p
        style={{
          color: "#9ca3af",
          marginBottom: "35px",
          fontSize: "18px",
        }}
      >
        Administration
      </p>

      <nav
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}
      >
        <a href="/admin" style={linkActive}>
          🏠 Tableau de bord
        </a>

        <a href="/admin/dispatch" style={link}>
          🗺️ Dispatch
        </a>

        <a href="/admin/reservations" style={link}>
          📋 Réservations
        </a>

        <a href="/admin/calendrier" style={link}>
          🗓️ Calendrier
        </a>

        <a href="/admin/clients" style={link}>
          👥 Clients
        </a>

        <a href="/admin/chauffeurs" style={link}>
          🚖 Chauffeurs
        </a>

        <a href="/admin/parametres" style={link}>
          ⚙️ Paramètres
        </a>

        <a href="/admin/tarifs" style={link}>
          ✈️ Tarifs Aéroport
        </a>

        <a href="/admin/statistiques" style={link}>
          📊 Statistiques
        </a>
      </nav>

      <div style={{ flex: 1 }} />

      <button
        onClick={logout}
        style={{
          background: "#dc2626",
          color: "white",
          border: "none",
          borderRadius: "14px",
          padding: "16px",
          fontSize: "18px",
          fontWeight: "bold",
          cursor: "pointer",
          width: "100%",
        }}
      >
        🚪 Déconnexion
      </button>
    </aside>
  );
}

const link = {
  display: "block",
  padding: "15px 18px",
  borderRadius: "14px",
  color: "white",
  textDecoration: "none",
  fontWeight: "600",
  fontSize: "18px",
} as const;

const linkActive = {
  ...link,
  backgroundColor: "#facc15",
  color: "#000",
} as const;