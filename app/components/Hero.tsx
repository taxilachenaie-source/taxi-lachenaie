
import BookingForm from "./BookingForm";

export default function Hero() {
  return (
    <section className="grid md:grid-cols-2 gap-10 px-8 py-20 items-center">

      {/* Texte de gauche */}
      <div>
        <p className="text-yellow-400 font-bold mb-4">
          TAXI LACHENAIE • SERVICE 24/7
        </p>

        <h1 className="text-5xl md:text-7xl font-extrabold leading-tight">
          Votre trajet,
          <span className="text-yellow-400"> notre priorité.</span>
        </h1>

        <p className="mt-6 text-xl text-slate-300">
          Service de taxi fiable, rapide et sécuritaire à Lachenaie,
          Terrebonne et partout dans la région.
        </p>

        <div className="mt-8 flex gap-4">
          <button className="bg-yellow-400 text-black px-7 py-4 rounded-xl font-bold hover:bg-yellow-300 transition">
            Réserver maintenant
          </button>

          <button className="border border-yellow-400 px-7 py-4 rounded-xl hover:bg-yellow-400 hover:text-black transition">
            Voir les tarifs
          </button>
        </div>
      </div>

      {/* Formulaire de réservation */}
      <BookingForm />

    </section>
  );
}