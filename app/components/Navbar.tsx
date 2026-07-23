export default function Navbar() {
  return (
    <header className="flex justify-between items-center px-8 py-6 border-b border-slate-800">
      <h1 className="text-2xl font-bold text-yellow-400">
        🚖 Taxi Lachenaie
      </h1>

      <nav className="hidden md:flex gap-8 text-lg">
        <a href="#">Accueil</a>
        <a href="#">Réservation</a>
        <a href="#">Tarifs</a>
        <a href="#">Disponibilités</a>
        <a href="#">Contact</a>
      </nav>

      <button className="bg-yellow-400 text-black px-5 py-2 rounded-xl font-bold hover:bg-yellow-300 transition">
        Admin
      </button>
    </header>
  );
}