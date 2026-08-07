"use server";

import { createClient } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";


export async function deleteReservation(id: string) {

  const supabase = await createClient();


  const { error } = await supabase
    .from("reservations")
    .delete()
    .eq("id", id);


  if (error) {
    console.log(error);
    throw new Error("Erreur suppression réservation");
  }


  revalidatePath("/admin");
}