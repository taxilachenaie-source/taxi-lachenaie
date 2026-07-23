import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  return [h, m, s]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
}

export default async function InvoicePage({
  params,
}: PageProps) {
  const { id } = await params;

  const { data: invoice, error } = await supabaseServer
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !invoice) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="mx-auto max-w-4xl">

        <div className="mb-6 flex items-center justify-between">

          <Link
            href="/admin/invoices"
           className="rounded-xl bg-slate-700 px-5 py-3 font-bold text-white transition hover:bg-slate-800 print:hidden"
          >
            ← Retour
          </Link>

          <PrintButton />

        </div>

        <div className="rounded-3xl bg-white p-10 shadow-xl">

          <div className="flex items-start justify-between border-b pb-8">

            <div>
              <h1 className="text-5xl font-black text-blue-700">
                🚖 Taxi Lachenaie
              </h1>

              <p className="mt-2 text-slate-500">
                Terrebonne • Québec
              </p>

              <p className="text-slate-500">
                438-835-1797
              </p>

              <p className="text-slate-500">
                taxilachenaie@gmail.com
              </p>
            </div>

            <div className="text-right">

              <h2 className="text-3xl font-black">
                FACTURE
              </h2>

              <p className="mt-3 font-bold">
                {invoice.invoice_number}
              </p>

              <p className="text-slate-500">
                {new Date(
                  invoice.created_at
                ).toLocaleDateString("fr-CA")}
              </p>

            </div>

          </div>

          <div className="mt-10 grid grid-cols-2 gap-10">

            <div>

              <h3 className="mb-4 text-xl font-black">
                Client
              </h3>

              <p>{invoice.client_name}</p>
              <p>{invoice.client_phone}</p>
              <p>{invoice.client_email}</p>

            </div>

            <div>

              <h3 className="mb-4 text-xl font-black">
                Course
              </h3>

              <p>
                <strong>Départ :</strong>{" "}
                {invoice.origin}
              </p>

              <p>
                <strong>Destination :</strong>{" "}
                {invoice.destination}
              </p>

              <p>
                <strong>Service :</strong>{" "}
                {invoice.service}
              </p>

            </div>

          </div>

          <div className="mt-10">

            <table className="w-full">

              <thead className="bg-slate-900 text-white">

                <tr>
                  <th className="p-3 text-left">
                    Description
                  </th>

                  <th className="p-3 text-right">
                    Valeur
                  </th>

                </tr>

              </thead>

              <tbody>

                <tr className="border-b">
                  <td className="p-4">
                    Distance
                  </td>

                  <td className="p-4 text-right">
                    {Number(
                      invoice.distance_km
                    ).toFixed(2)} km
                  </td>
                </tr>

                <tr className="border-b">
                  <td className="p-4">
                    Temps d'attente
                  </td>

                  <td className="p-4 text-right">
                    {formatDuration(
                      invoice.waiting_seconds
                    )}
                  </td>
                </tr>

                <tr className="border-b">
                  <td className="p-4">
                    Temps total
                  </td>

                  <td className="p-4 text-right">
                    {formatDuration(
                      invoice.elapsed_seconds
                    )}
                  </td>
                </tr>

                <tr className="border-b">
                  <td className="p-4 font-bold">
                    Sous-total
                  </td>

                  <td className="p-4 text-right font-bold">
                    {Number(
                      invoice.subtotal
                    ).toFixed(2)} $
                  </td>
                </tr>

                <tr className="border-b">
                  <td className="p-4">
                    Taxes
                  </td>

                  <td className="p-4 text-right">
                    {Number(
                      invoice.tax_amount ?? 0
                    ).toFixed(2)} $
                  </td>
                </tr>

                <tr className="bg-green-100">

                  <td className="p-5 text-2xl font-black">
                    TOTAL
                  </td>

                  <td className="p-5 text-right text-2xl font-black text-green-700">
                    {Number(
                      invoice.total_amount
                    ).toFixed(2)} $
                  </td>

                </tr>

              </tbody>

            </table>

          </div>

          <div className="mt-10 border-t pt-6 text-center text-slate-500">

            Merci d'avoir choisi Taxi Lachenaie ❤️

          </div>

        </div>

      </div>
    </main>
  );
}