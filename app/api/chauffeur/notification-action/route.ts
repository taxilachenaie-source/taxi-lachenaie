import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
      .select("id, name, auth_user_id")
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

    const notificationId = Number(body.notification_id);
    const action = body.action;

    if (
      !notificationId ||
      !["accepted", "refused"].includes(action)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Paramètres invalides",
        },
        { status: 400 }
      );
    }

    const { data: notification, error: notificationError } =
      await supabase
        .from("driver_notifications")
        .select("*")
        .eq("id", notificationId)
        .eq("driver_id", driver.id)
        .eq("status", "pending")
        .maybeSingle();

    if (notificationError) {
      return NextResponse.json(
        {
          success: false,
          error: notificationError.message,
        },
        { status: 500 }
      );
    }

    if (!notification) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Notification introuvable, déjà traitée ou non autorisée",
        },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();

    const updateData =
      action === "accepted"
        ? {
            status: "accepted",
            accepted_at: now,
          }
        : {
            status: "refused",
            refused_at: now,
          };

    const { error: updateNotificationError } = await supabase
      .from("driver_notifications")
      .update(updateData)
      .eq("id", notification.id)
      .eq("driver_id", driver.id)
      .eq("status", "pending");

    if (updateNotificationError) {
      return NextResponse.json(
        {
          success: false,
          error: updateNotificationError.message,
        },
        { status: 500 }
      );
    }

    if (action === "accepted") {
      const { error: reservationError } = await supabase
        .from("reservations")
        .update({
          driver_id: driver.id,
          status: "Acceptée",
          tracking_status: "Chauffeur assigné",
        })
        .eq("id", notification.reservation_id);

      if (reservationError) {
        return NextResponse.json(
          {
            success: false,
            error: reservationError.message,
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
        message: "Course acceptée",
      });
    }

    const { error: releaseReservationError } = await supabase
      .from("reservations")
      .update({
        driver_id: null,
        status: "Nouvelle",
        tracking_status: "Recherche chauffeur",
      })
      .eq("id", notification.reservation_id)
      .eq("driver_id", driver.id);

    if (releaseReservationError) {
      return NextResponse.json(
        {
          success: false,
          error: releaseReservationError.message,
        },
        { status: 500 }
      );
    }

    const { error: driverAvailableError } = await supabase
      .from("drivers")
      .update({
        status: "Disponible",
      })
      .eq("id", driver.id);

    if (driverAvailableError) {
      return NextResponse.json(
        {
          success: false,
          error: driverAvailableError.message,
        },
        { status: 500 }
      );
    }

    const baseUrl = new URL(request.url).origin;

    const dispatchResponse = await fetch(
      `${baseUrl}/api/admin/dispatch-next`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reservation_id: notification.reservation_id,
        }),
      }
    );

    const dispatchData = await dispatchResponse.json();

    if (!dispatchResponse.ok || !dispatchData.success) {
      console.error(
        "Erreur dispatch suivant :",
        dispatchData.error
      );
    }

    return NextResponse.json({
      success: true,
      message: "Course refusée et transmise au chauffeur suivant",
    });
  } catch (error) {
    console.error(
      "Erreur notification-action chauffeur :",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: "Erreur serveur",
      },
      { status: 500 }
    );
  }
}