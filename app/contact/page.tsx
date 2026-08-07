import Navbar from "../components/Navbar";

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <Navbar />

      <section className="max-w-4xl mx-auto py-20 px-6">
        <h1 className="text-5xl font-bold text-yellow-400 mb-8">
          Contact
        </h1>

        <div className="space-y-6 text-xl">
          <p>📞 Téléphone : (450) 944-1760</p>
          <p>📧 Courriel : info@taxilachenaie.ca</p>
          <p>📍 Lachenaie, Québec</p>
          <p>🚖 Service disponible 24h/24 et 7j/7</p>
        </div>
      </section>
    </main>
  );
}