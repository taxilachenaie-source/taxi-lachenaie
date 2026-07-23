import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  try {
    const { data: queues, error } = await supabaseServer
      .from("dispatch_queue")
      .select("*")
      .eq("status", "waiting")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const { data: reservations } = await supabaseServer
      .from("reservations")
      .select("*");

    const { data: drivers } = await supabaseServer
      .from("drivers")
      .select("*");

    const formatted = (queues || []).map((queue) => {
      const reservation = (reservations || []).find(
        (r) => r.id === queue.reservation_id
      );

      const driverOrder = queue.driver_order || [];
      const currentDriverId = driverOrder[queue.current_index];
      const nextDriverId = driverOrder[queue.current_index + 1];

      const currentDriver = (drivers || []).find(
        (d) => d.id === currentDriverId
      );

      const nextDriver = (drivers || []).find(
        (d) => d.id === nextDriverId
      );

      const rankedDrivers = driverOrder
        .map((id: number) => (drivers || []).find((d) => d.id === id))
        .filter(Boolean);

      const assignedAt = queue.assigned_at
        ? new Date(queue.assigned_at).getTime()
        : Date.now();

      const secondsPassed = Math.floor((Date.now() - assignedAt) / 1000);
      const secondsLeft = Math.max(0, 60 - secondsPassed);

      return {
        ...queue,
        reservation,
        currentDriver,
        nextDriver,
        rankedDrivers,
        secondsLeft,
      };
    });

    return NextResponse.json({
      success: true,
      queues: formatted,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, error: "Erreur serveur" },
      { status: 500 }
    );
  }
}