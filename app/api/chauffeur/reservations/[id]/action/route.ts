import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(
  request: Request,
  { params }: RouteContext
) {
  try {
    const { action } = await request.json();
    const { id } = await params;
    const reservationId = Number(id);

    if (
      !Number.isInteger(reservationId) ||
      reservationId <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Réservation invalide.",
        },
        { status: 400 }
      );
    }

    if (action !== "accept" && action !== "refuse") {
      return NextResponse.json(
        {
          success: false,
          error: "Action invalide.",
        },
        { status: 400 }
      );
    }

    const authHeader =
      request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          success: false,
          error: "Non autorisé.",
        },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    const {
      data: { user },
      error: userError,
    } = await supabaseServer.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Utilisateur invalide.",
        },
        { status: 401 }
      );
    }

    const { data: driver, error: driverError } =
      await supabaseServer
        .from("drivers")
        .select("*")
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
          error: "Chauffeur introuvable.",
        },
        { status: 404 }
      );
    }

    const {
      data: reservation,
      error: reservationError,
    } = await supabaseServer
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
          error:
            "Réservation introuvable ou non assignée à ce chauffeur.",
        },
        { status: 404 }
      );
    }

    if (action === "accept") {
      if (
        reservation.status !== "Nouvelle" &&
        reservation.status !== "Acceptée"
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Cette course ne peut plus être acceptée.",
          },
          { status: 409 }
        );
      }

      const {
        data: updatedReservation,
        error: reservationUpdateError,
      } = await supabaseServer
        .from("reservations")
        .update({
  status: "Acceptée",
  tracking_status: "Chauffeur assigné",
  tracking_enabled: true,
  accepted_at: new Date().toISOString(),
})
        .eq("id", reservationId)
        .eq("driver_id", driver.id)
        .select("*")
        .maybeSingle();

      if (reservationUpdateError) {
        return NextResponse.json(
          {
            success: false,
            error: reservationUpdateError.message,
          },
          { status: 500 }
        );
      }

      if (!updatedReservation) {
        return NextResponse.json(
          {
            success: false,
            error:
              "La réservation n’a pas pu être acceptée.",
          },
          { status: 409 }
        );
      }

      await supabaseServer
        .from("dispatch_queue")
        .update({
          status: "accepted",
        })
        .eq("reservation_id", reservationId);

      await supabaseServer
        .from("driver_notifications")
        .update({
          status: "accepted",
          accepted_at: new Date().toISOString(),
        })
        .eq("reservation_id", reservationId)
        .eq("driver_id", driver.id)
        .eq("status", "pending");

      const { error: driverUpdateError } =
        await supabaseServer
          .from("drivers")
          .update({
  status: "Occupé",
  current_position: `En route vers ${reservation.origin}`,
  current_trip_id: reservationId,
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
        message:
          "Course acceptée. Rendez-vous au point de départ.",
        reservation: updatedReservation,
      });
    }

    const { error: notificationUpdateError } =
      await supabaseServer
        .from("driver_notifications")
        .update({
          status: "refused",
          refused_at: new Date().toISOString(),
        })
        .eq("reservation_id", reservationId)
        .eq("driver_id", driver.id)
        .eq("status", "pending");

    if (notificationUpdateError) {
      console.error(
        "Erreur notification refusée :",
        notificationUpdateError
      );
    }

    const { error: releaseDriverError } =
      await supabaseServer
        .from("drivers")
        .update({
          status: "Disponible",
          current_position: "Garage Taxi Lachenaie",
        })
        .eq("id", driver.id);

    if (releaseDriverError) {
      return NextResponse.json(
        {
          success: false,
          error: releaseDriverError.message,
        },
        { status: 500 }
      );
    }

    const baseUrl = new URL(request.url).origin;

    const nextResponse = await fetch(
      `${baseUrl}/api/admin/dispatch-next`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reservation_id: reservationId,
        }),
      }
    );

    const nextResult = await nextResponse.json();

    if (!nextResponse.ok || !nextResult.success) {
      await supabaseServer
        .from("reservations")
        .update({
          status: "Nouvelle",
          tracking_status:
            "Aucun chauffeur disponible",
          driver_id: null,
        })
        .eq("id", reservationId);

      return NextResponse.json({
        success: true,
        message:
          "Course refusée. Aucun autre chauffeur disponible.",
      });
    }

    return NextResponse.json({
      success: true,
      message:
        "Course refusée et envoyée au chauffeur suivant.",
      nextDriverId: nextResult.nextDriverId,
    });
  } catch (error) {
    console.error(
      "Erreur action réservation :",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: "Erreur serveur.",
      },
      { status: 500 }
    );
  }
}