import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const reservationId = Number(id);

    const authHeader = request.headers.get("authorization");

    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: "Non autorisé" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    const {
      data: { user },
      error: userError,
    } = await supabaseServer.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Utilisateur invalide" },
        { status: 401 }
      );
    }

    const { data: driver, error: driverError } = await supabaseServer
      .from("drivers")
      .select("*")
      .eq("auth_user_id", user.id)
      .single();

    if (driverError || !driver) {
      return NextResponse.json(
        { success: false, error: "Chauffeur introuvable" },
        { status: 404 }
      );
    }

    const { data: reservation, error: reservationError } = await supabaseServer
      .from("reservations")
      .select("*")
      .eq("id", reservationId)
      .eq("driver_id", driver.id)
      .single();

    if (reservationError || !reservation) {
      return NextResponse.json(
        { success: false, error: "Réservation introuvable" },
        { status: 404 }
      );
    }

    const price = Number(reservation.price || 0);
    const commissionRate = Number(driver.commission_rate || 10);
    const commissionAmount = Number(((price * commissionRate) / 100).toFixed(2));
    const newBalance = Number((Number(driver.balance || 0) - commissionAmount).toFixed(2));

    const { error: reservationUpdateError } = await supabaseServer
      .from("reservations")
      .update({ status: "Terminée" })
      .eq("id", reservationId);

    if (reservationUpdateError) {
      return NextResponse.json(
        { success: false, error: reservationUpdateError.message },
        { status: 500 }
      );
    }

    const { error: driverUpdateError } = await supabaseServer
      .from("drivers")
      .update({
        status: newBalance <= 0 ? "Disponible" : "Disponible",
        current_position: "Garage Taxi Lachenaie",
        balance: newBalance,
      })
      .eq("id", driver.id);

    if (driverUpdateError) {
      return NextResponse.json(
        { success: false, error: driverUpdateError.message },
        { status: 500 }
      );
    }

    const { error: transactionError } = await supabaseServer
      .from("wallet_transactions")
      .insert([
        {
          driver_id: driver.id,
          type: "commission",
          description: `Commission Taxi Lachenaie - Course #${reservationId}`,
          amount: -commissionAmount,
          reservation_id: reservationId,
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
      message: "Course terminée",
      commissionAmount,
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