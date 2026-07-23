import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  try {
    const { data: drivers, error } = await supabaseServer
      .from("drivers")
      .select(`
        id,
        name,
        phone,
        email,
        vehicle,
        plate,
        status,
        current_position,
        latitude,
        longitude,
        speed,
        heading,
        updated_at
      `)
      .order("name", { ascending: true });

    if (error) {
      console.error("Erreur drivers-live :", error);

      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    const formattedDrivers = (drivers || []).map((driver) => {
      const latitude =
        driver.latitude === null ? null : Number(driver.latitude);

      const longitude =
        driver.longitude === null ? null : Number(driver.longitude);

      const speed =
        driver.speed === null ? 0 : Number(driver.speed);

      const heading =
        driver.heading === null ? 0 : Number(driver.heading);

      const updatedAt = driver.updated_at
        ? new Date(driver.updated_at).toISOString()
        : null;

      const secondsSinceUpdate = updatedAt
        ? Math.max(
            0,
            Math.floor(
              (Date.now() - new Date(updatedAt).getTime()) / 1000
            )
          )
        : null;

      return {
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        email: driver.email,
        vehicle: driver.vehicle,
        plate: driver.plate,
        status: driver.status,
        current_position: driver.current_position,
        latitude,
        longitude,
        speed,
        heading,
        updated_at: updatedAt,
        seconds_since_update: secondsSinceUpdate,
        gps_active:
          latitude !== null &&
          longitude !== null &&
          secondsSinceUpdate !== null &&
          secondsSinceUpdate <= 120,
      };
    });

    return NextResponse.json({
      success: true,
      drivers: formattedDrivers,
    });
  } catch (error) {
    console.error("Erreur serveur drivers-live :", error);

    return NextResponse.json(
      {
        success: false,
        error: "Erreur serveur",
      },
      { status: 500 }
    );
  }
}