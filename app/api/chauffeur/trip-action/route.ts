import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type TripAction = "arrived" | "start" | "finish";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          success: false,
          error: "Non connecté",
        },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Session invalide",
        },
        { status: 401 }
      );
    }

    const { data: driver, error: driverError } = await supabase
      .from("drivers")
      .select("id, name, status, auth_user_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (driverError) {
      return NextResponse.json(
        {
          success: false,
          error: driverError.message,
        },
        { status: 500 }
      );
    }

    if (!driver) {
      return NextResponse.json(
        {
          success: false,
          error: "Aucun chauffeur relié à ce compte",
        },
        { status: 404 }
      );
    }

    const body = await request.json();

    const reservationId = Number(body.reservation_id);
    const action = body.action as TripAction;

    if (
      !reservationId ||
      !["arrived", "start", "finish"].includes(action)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Paramètres invalides",
        },
        { status: 400 }
      );
    }

    const { data: reservation, error: reservationError } = await supabase
      .from("reservations")
      .select("*")
      .eq("id", reservationId)
      .eq("driver_id", driver.id)
      .maybeSingle();

    if (reservationError) {
      return NextResponse.json(
        {
          success: false,
          error: reservationError.message,
        },
        { status: 500 }
      );
    }

    if (!reservation) {
      return NextResponse.json(
        {
          success: false,
          error: "Course introuvable ou non autorisée",
        },
        { status: 404 }
      );
    }

    if (reservation.status === "Terminée") {
      return NextResponse.json(
        {
          success: false,
          error: "Cette course est déjà terminée",
        },
        { status: 400 }
      );
    }

    if (action === "arrived") {
      const { error: updateError } = await supabase
        .from("reservations")
        .update({
          tracking_status: "Votre chauffeur est arrivé",
        })
        .eq("id", reservation.id)
        .eq("driver_id", driver.id);

      if (updateError) {
        return NextResponse.json(
          {
            success: false,
            error: updateError.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Arrivée confirmée",
      });
    }

    if (action === "start") {
      const { error: updateError } = await supabase
        .from("reservations")
        .update({
          status: "En cours",
          tracking_status: "Trajet en cours",
        })
        .eq("id", reservation.id)
        .eq("driver_id", driver.id);

      if (updateError) {
        return NextResponse.json(
          {
            success: false,
            error: updateError.message,
          },
          { status: 500 }
        );
      }

      const { error: driverUpdateError } = await supabase
        .from("drivers")
        .update({
          status: "Occupé",
        })
        .eq("id", driver.id);

      if (driverUpdateError) {
        return NextResponse.json(
          {
            success: false,
            error: driverUpdateError.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Course démarrée",
      });
    }

    const { error: finishError } = await supabase
      .from("reservations")
      .update({
        status: "Terminée",
        tracking_status: "Course terminée",
      })
      .eq("id", reservation.id)
      .eq("driver_id", driver.id);

    if (finishError) {
      return NextResponse.json(
        {
          success: false,
          error: finishError.message,
        },
        { status: 500 }
      );
    }

    const { error: availableError } = await supabase
      .from("drivers")
      .update({
        status: "Disponible",
        current_position: "Disponible",
      })
      .eq("id", driver.id);

    if (availableError) {
      return NextResponse.json(
        {
          success: false,
          error: availableError.message,
        },
        { status: 500 }
      );
    }

    await supabase
      .from("driver_notifications")
      .update({
        status: "completed",
      })
      .eq("reservation_id", reservation.id)
      .eq("driver_id", driver.id)
      .in("status", ["pending", "accepted"]);

    return NextResponse.json({
      success: true,
      message: "Course terminée",
    });
  } catch (error) {
    console.error("Erreur trip-action chauffeur :", error);

    return NextResponse.json(
      {
        success: false,
        error: "Erreur serveur",
      },
      { status: 500 }
    );
  }
}