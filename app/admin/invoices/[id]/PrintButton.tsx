"use client";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white transition hover:bg-blue-700 print:hidden"
    >
      🖨️ Imprimer
    </button>
  );
}