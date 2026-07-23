"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CurrentTripPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/chauffeur");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="rounded-2xl bg-white px-8 py-6 text-xl font-bold shadow">
        Redirection vers l’espace chauffeur...
      </div>
    </main>
  );
}