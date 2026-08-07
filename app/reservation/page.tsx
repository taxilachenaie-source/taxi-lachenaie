import Navbar from "../components/Navbar";
import Hero from "../components/Hero";

export default function ReservationPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <Navbar />

      <section className="mx-auto max-w-7xl px-4 py-12 md:px-8">
        <div className="mb-8">
          <p className="font-semibold text-yellow-400">
            Taxi Lachenaie
          </p>

          <h1 className="mt-2 text-4xl font-bold md:text-5xl">
            Réserver votre taxi
          </h1>

          <p className="mt-4 max-w-2xl text-lg text-slate-300">
            Remplissez le formulaire pour calculer votre trajet et envoyer
            votre réservation.
          </p>
        </div>

        <Hero />
      </section>
    </main>
  );
}