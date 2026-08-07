import Link from "next/link";

export default function Navbar() {
  return (
    <header className="flex justify-between items-center px-8 py-6 border-b border-slate-800">
      <Link
        href="/"
        className="text-2xl font-bold text-yellow-400 hover:text-yellow-300 transition"
      >
        🚖 Taxi Lachenaie
      </Link>

      <nav className="hidden md:flex gap-8 text-lg">
        <Link href="/" className="hover:text-yellow-400 transition">
          Accueil
        </Link>

        <Link href="/reservation" className="hover:text-yellow-400 transition">
          Réservation
        </Link>

        <Link href="/tarifs" className="hover:text-yellow-400 transition">
          Tarifs
        </Link>

        <Link href="/disponibilites" className="hover:text-yellow-400 transition">
          Disponibilités
        </Link>

        <Link href="/contact" className="hover:text-yellow-400 transition">
          Contact
        </Link>
      </nav>

      <Link
        href="/login"
        className="bg-yellow-400 text-black px-5 py-2 rounded-xl font-bold hover:bg-yellow-300 transition"
      >
        Admin
      </Link>
    </header>
  );
}