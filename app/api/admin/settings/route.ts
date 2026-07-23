import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const { data, error } = await supabaseServer
    .from("settings")
    .select("*")
    .limit(1)
    .single();

  if (error) {
    return NextResponse.json(error, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = await request.json();

  const { error } = await supabaseServer
    .from("settings")
    .update({
      company_name: body.companyName,
      phone: body.phone,
      email: body.email,
      address: body.address,
      website: body.website,
      base_fare: body.baseFare,
      price_per_km: body.pricePerKm,
      price_per_minute: body.pricePerMinute,
      vip_base_fare: body.vipBaseFare,
      vip_price_per_km: body.vipPricePerKm,
    })
    .eq("id", 1);

  if (error) {
    return NextResponse.json(error, { status: 500 });
  }

  return NextResponse.json({
    success: true,
  });
}