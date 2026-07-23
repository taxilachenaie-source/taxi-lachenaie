import { supabaseServer } from "@/lib/supabase-server";

export async function logDispatchEvent(
  reservationId: number,
  driverId: number | null,
  eventType: string,
  message: string
) {
  try {
    await supabaseServer.from("dispatch_events").insert([
      {
        reservation_id: reservationId,
        driver_id: driverId,
        event_type: eventType,
        message,
      },
    ]);
  } catch (error) {
    console.error("Dispatch Logger :", error);
  }
}