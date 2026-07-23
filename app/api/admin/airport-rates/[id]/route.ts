import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const dayPrice = Number(body.day_price);
    const nightPrice = Number(body.night_price);

    if (dayPrice <= 0 || nightPrice <= 0) {
      return NextResponse.json(
        { success: false, error: "Prix invalide" },
        { status: 400 }
      );
    }

    const { error } = await supabaseServer
      .from("airport_rates")
      .update({
        day_price: dayPrice,
        night_price: nightPrice,
      })
      .eq("id", Number(id));

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Tarif modifié",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, error: "Erreur serveur" },
      { status: 500 }
    );
  }
}