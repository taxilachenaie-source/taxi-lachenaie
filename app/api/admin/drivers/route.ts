import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const { data, error } = await supabaseServer
    .from("drivers")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const driver = await request.json();

  const { data, error } = await supabaseServer
    .from("drivers")
    .insert([
      {
        name: driver.name,
        phone: driver.phone,
        email: driver.email,
        vehicle: driver.vehicle,
        plate: driver.plate,
        status: driver.status || "Disponible",
        current_position: driver.current_position || "Garage Taxi Lachenaie",
      },
    ])
    .select();

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data,
  });
}