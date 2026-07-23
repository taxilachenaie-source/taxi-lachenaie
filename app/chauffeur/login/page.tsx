"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ChauffeurLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim() || !password) {
      setErrorMessage("Veuillez saisir votre courriel et votre mot de passe.");
      return;
    }

    try {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      if (!data.session || !data.user) {
        setErrorMessage("Connexion impossible. Veuillez réessayer.");
        return;
      }

      router.replace("/chauffeur/current-trip");
      router.refresh();
    } catch {
      setErrorMessage("Erreur de connexion au serveur.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
        <div className="text-center">
          <div className="text-6xl">🚖</div>

          <h1 className="mt-4 text-3xl font-black text-slate-900">
            Espace chauffeur
          </h1>

          <p className="mt-2 text-slate-600">
            Connectez-vous à Taxi Lachenaie
          </p>
        </div>

        <form onSubmit={handleLogin} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-2 block font-bold text-slate-700"
            >
              Courriel
            </label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="chauffeur@taxilachenaie.ca"
              className="w-full rounded-xl border border-slate-300 p-4 outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-200"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block font-bold text-slate-700"
            >
              Mot de passe
            </label>

            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="Votre mot de passe"
              className="w-full rounded-xl border border-slate-300 p-4 outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-200"
            />
          </div>

          {errorMessage && (
            <div className="rounded-xl bg-red-100 p-4 font-semibold text-red-700">
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-yellow-400 py-4 text-lg font-black text-slate-900 transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Connexion en cours..." : "Se connecter"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Accès réservé aux chauffeurs autorisés.
        </p>
      </div>
    </main>
  );
}