import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY!;

const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseSecretKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "Session manquante." },
        { status: 401 }
      );
    }

    const accessToken = authorization.replace("Bearer ", "");

    const supabaseAuth = createClient(
      supabaseUrl,
      supabasePublishableKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Session invalide." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const status = body.status;

    if (!["Disponible", "Hors ligne"].includes(status)) {
      return NextResponse.json(
        { success: false, error: "Statut invalide." },
        { status: 400 }
      );
    }

    const { data: driver, error: driverError } =
      await supabaseAdmin
        .from("drivers")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();

    if (driverError || !driver) {
      return NextResponse.json(
        { success: false, error: "Chauffeur introuvable." },
        { status: 404 }
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from("drivers")
      .update({ status })
      .eq("id", driver.id);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      status,
    });
  } catch (error) {
    console.error("Erreur changement statut chauffeur :", error);

    return NextResponse.json(
      {
        success: false,
        error: "Impossible de modifier le statut.",
      },
      { status: 500 }
    );
  }
}