"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("taxilachenaie@gmail.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function login() {
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
  console.error(error);
  alert(error.message);
  return;
}

    router.push("/admin");
  }

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-2">
          🚖 Taxi Lachenaie
        </h1>

        <p className="text-center text-slate-500 mb-8">
          Connexion administrateur
        </p>

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Courriel"
          className="w-full border rounded-xl p-4 mb-4"
        />

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe"
          className="w-full border rounded-xl p-4 mb-4"
        />

        <button
          onClick={login}
          disabled={loading}
          className="w-full bg-yellow-400 text-black rounded-xl py-4 font-bold"
        >
          {loading ? "Connexion..." : "Se connecter"}
        </button>

        <p className="text-center text-xs text-slate-400 mt-6">
          Accès réservé à l'administration Taxi Lachenaie
        </p>
      </div>
    </main>
  );
}