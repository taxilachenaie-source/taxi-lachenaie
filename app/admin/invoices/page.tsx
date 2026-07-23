import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const { data: invoices, error } = await supabaseServer
    .from("invoices")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="p-8">
        <h1 className="text-3xl font-bold text-red-600">
          Erreur
        </h1>

        <p className="mt-4">{error.message}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="mx-auto max-w-7xl">

        <div className="mb-8 flex items-center justify-between">

          <h1 className="text-4xl font-black">
            📄 Factures
          </h1>

          <div className="rounded-xl bg-green-600 px-5 py-3 font-bold text-white">
            {invoices?.length ?? 0} facture(s)
          </div>

        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow">

          <table className="w-full">

            <thead className="bg-slate-900 text-white">

              <tr>
                <th className="p-4 text-left">Facture</th>
                <th className="p-4 text-left">Client</th>
                <th className="p-4 text-left">Date</th>
                <th className="p-4 text-right">Montant</th>
                <th className="p-4 text-center">Paiement</th>
                <th className="p-4 text-center">Actions</th>
              </tr>

            </thead>

            <tbody>

              {invoices?.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="border-b hover:bg-slate-50"
                >
                  <td className="p-4 font-bold">
                    {invoice.invoice_number}
                  </td>

                  <td className="p-4">
                    {invoice.client_name}
                  </td>

                  <td className="p-4">
                    {invoice.created_at
                      ? new Date(
                          invoice.created_at
                        ).toLocaleDateString("fr-CA")
                      : "-"}
                  </td>

                  <td className="p-4 text-right font-bold">
                    {Number(
                      invoice.total_amount
                    ).toFixed(2)} $
                  </td>

                  <td className="p-4 text-center">
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-bold ${
                        invoice.payment_status === "Payée"
                          ? "bg-green-200 text-green-800"
                          : "bg-red-200 text-red-700"
                      }`}
                    >
                      {invoice.payment_status}
                    </span>
                  </td>

                  <td className="p-4 text-center">

                    <Link
                      href={`/admin/invoices/${invoice.id}`}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-white"
                    >
                      Voir
                    </Link>

                  </td>

                </tr>
              ))}

            </tbody>

          </table>

        </div>

      </div>
    </main>
  );
}