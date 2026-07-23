import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

function moveToward(
  currentLat: number,
  currentLng: number,
  targetLat: number,
  targetLng: number,
  step = 0.00035
) {
  const latDiff = targetLat - currentLat;
  const lngDiff = targetLng - currentLng;

  const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

  if (distance < step) {
    return {
      latitude: targetLat,
      longitude: targetLng,
    };
  }

  return {
    latitude: currentLat + (latDiff / distance) * step,
    longitude: currentLng + (lngDiff / distance) * step,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const reservationId = Number(body.reservation_id);

    if (!reservationId) {
      return NextResponse.json(
        { success: false, error: "Réservation invalide" },
        { status: 400 }
      );
    }

    const { data: reservation, error: reservationError } = await supabaseServer
      .from("reservations")
      .select("*")
      .eq("id", reservationId)
      .single();

    if (reservationError || !reservation || !reservation.driver_id) {
      return NextResponse.json(
        { success: false, error: "Réservation ou chauffeur introuvable" },
        { status: 404 }
      );
    }

    const { data: driver, error: driverError } = await supabaseServer
      .from("drivers")
      .select("*")
      .eq("id", reservation.driver_id)
      .single();

    if (driverError || !driver) {
      return NextResponse.json(
        { success: false, error: "Chauffeur introuvable" },
        { status: 404 }
      );
    }

    if (
      reservation.latitude == null ||
      reservation.longitude == null ||
      driver.latitude == null ||
      driver.longitude == null
    ) {
      return NextResponse.json(
        { success: false, error: "Coordonnées manquantes" },
        { status: 400 }
      );
    }

    const nextPosition = moveToward(
      Number(driver.latitude),
      Number(driver.longitude),
      Number(reservation.latitude),
      Number(reservation.longitude)
    );

    const { error: updateError } = await supabaseServer
      .from("drivers")
      .update({
        latitude: nextPosition.latitude,
        longitude: nextPosition.longitude,
        last_location_at: new Date().toISOString(),
        current_position: `En route vers ${reservation.origin}`,
      })
      .eq("id", driver.id);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      driver_id: driver.id,
      latitude: nextPosition.latitude,
      longitude: nextPosition.longitude,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, error: "Erreur serveur" },
      { status: 500 }
    );
  }
}