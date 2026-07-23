import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Chauffeur
    const { data: driver, error: driverError } = await supabaseServer
      .from("drivers")
      .select("*")
      .eq("id", id)
      .single();

    if (driverError) {
      return NextResponse.json(
        { success: false, error: driverError.message },
        { status: 500 }
      );
    }

    // Historique
    const { data: transactions, error: transactionError } =
      await supabaseServer
        .from("wallet_transactions")
        .select("*")
        .eq("driver_id", id)
        .order("created_at", { ascending: false });

    if (transactionError) {
      return NextResponse.json(
        { success: false, error: transactionError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      balance: driver.balance,
      commission: driver.commission_rate,
      minimumTopup: driver.minimum_topup,
      transactions,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, error: "Erreur serveur" },
      { status: 500 }
    );
  }
}