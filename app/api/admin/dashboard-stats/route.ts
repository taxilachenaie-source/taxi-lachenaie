import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  try {
    const [
      { count: totalDrivers },
      { count: availableDrivers },
      { count: busyDrivers },
      { count: offlineDrivers },
      { count: totalReservations },
      { count: pendingReservations },
      { count: activeReservations },
      { count: completedReservations },
      { data: todayReservations },
    ] = await Promise.all([
      supabaseServer
        .from("drivers")
        .select("*", { count: "exact", head: true }),

      supabaseServer
        .from("drivers")
        .select("*", { count: "exact", head: true })
        .eq("status", "Disponible"),

      supabaseServer
        .from("drivers")
        .select("*", { count: "exact", head: true })
        .eq("status", "Occupé"),

      supabaseServer
        .from("drivers")
        .select("*", { count: "exact", head: true })
        .eq("status", "Hors ligne"),

      supabaseServer
        .from("reservations")
        .select("*", { count: "exact", head: true }),

      supabaseServer
        .from("reservations")
        .select("*", { count: "exact", head: true })
        .eq("status", "Nouvelle"),

      supabaseServer
        .from("reservations")
        .select("*", { count: "exact", head: true })
        .in("status", ["Acceptée", "En cours"]),

      supabaseServer
        .from("reservations")
        .select("*", { count: "exact", head: true })
        .eq("status", "Terminée"),

      supabaseServer
        .from("reservations")
        .select("price, created_at")
        .gte(
          "created_at",
          new Date().toISOString().split("T")[0] + "T00:00:00"
        ),
    ]);

    const revenueToday =
      todayReservations?.reduce(
        (total, reservation) => total + Number(reservation.price || 0),
        0
      ) ?? 0;

    return NextResponse.json({
      success: true,

      drivers: {
        total: totalDrivers ?? 0,
        available: availableDrivers ?? 0,
        busy: busyDrivers ?? 0,
        offline: offlineDrivers ?? 0,
      },

      reservations: {
        total: totalReservations ?? 0,
        pending: pendingReservations ?? 0,
        active: activeReservations ?? 0,
        completed: completedReservations ?? 0,
      },

      revenue: {
        today: revenueToday,
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error: "Erreur serveur",
      },
      {
        status: 500,
      }
    );
  }
}