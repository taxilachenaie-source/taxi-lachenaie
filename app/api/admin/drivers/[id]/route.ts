import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const driver = await request.json();

  const { error } = await supabaseServer
    .from("drivers")
    .update({
      name: driver.name,
      phone: driver.phone,
      email: driver.email,
      vehicle: driver.vehicle,
      plate: driver.plate,
      status: driver.status,
      notes: driver.notes,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { error } = await supabaseServer
    .from("drivers")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}