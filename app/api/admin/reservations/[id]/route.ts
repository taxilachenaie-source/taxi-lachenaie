import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json();
    const { id } = await params;
    const reservationId = Number(id);

    const { data: existingReservation } = await supabaseServer
      .from("reservations")
      .select("*")
      .eq("id", reservationId)
      .single();

    const origin =
      existingReservation?.origin ||
      existingReservation?.departure ||
      body.origin ||
      "adresse de départ inconnue";

    const destination =
      existingReservation?.destination ||
      body.destination ||
      "destination inconnue";

    const { error } = await supabaseServer
      .from("reservations")
      .update({
        status: body.status,
        driver_id: body.driver_id,
      })
      .eq("id", reservationId);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (body.driver_id) {
      let driverStatus = "Disponible";
      let currentPosition = "Garage Taxi Lachenaie";

      if (body.status === "Acceptée") {
        driverStatus = "Occupé";
        currentPosition = `Assigné à une course - ${origin}`;
      }

      if (body.status === "En cours") {
        driverStatus = "Occupé";
        currentPosition = `En route vers ${destination}`;
      }

      if (body.status === "Terminée" || body.status === "Annulée") {
        driverStatus = "Disponible";
        currentPosition = "Garage Taxi Lachenaie";
      }

      await supabaseServer
        .from("drivers")
        .update({
          status: driverStatus,
          current_position: currentPosition,
        })
        .eq("id", body.driver_id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 });
  }
}