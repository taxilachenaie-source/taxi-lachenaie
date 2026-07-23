import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const driverId = Number(id);
    const body = await request.json();

    const amount = Number(body.amount);

    if (!driverId || amount <= 0) {
      return NextResponse.json(
        { success: false, error: "Montant invalide" },
        { status: 400 }
      );
    }

    const { data: driver, error: driverError } = await supabaseServer
      .from("drivers")
      .select("*")
      .eq("id", driverId)
      .single();

    if (driverError || !driver) {
      return NextResponse.json(
        { success: false, error: "Chauffeur introuvable" },
        { status: 404 }
      );
    }

    const newBalance = Number(
      (Number(driver.balance || 0) + amount).toFixed(2)
    );

    const { error: updateError } = await supabaseServer
      .from("drivers")
      .update({
        balance: newBalance,
      })
      .eq("id", driverId);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      );
    }

    const { error: transactionError } = await supabaseServer
      .from("wallet_transactions")
      .insert([
        {
          driver_id: driverId,
          type: "topup",
          description: `Recharge administrateur de ${amount.toFixed(2)} $`,
          amount: amount,
        },
      ]);

    if (transactionError) {
      return NextResponse.json(
        { success: false, error: transactionError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Solde ajouté",
      newBalance,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, error: "Erreur serveur" },
      { status: 500 }
    );
  }
}