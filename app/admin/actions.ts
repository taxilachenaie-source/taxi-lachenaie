"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

export async function deleteReservation(id: string) {
  const { error } = await supabaseServer
    .from("reservations")
    .delete()
    .eq("id", id);

  if (error) {
    console.error(error);
    throw new Error("Erreur suppression réservation");
  }

  revalidatePath("/admin");
}