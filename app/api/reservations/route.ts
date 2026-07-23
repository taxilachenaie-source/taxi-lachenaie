import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const DISPATCH_ADVANCE_MINUTES = 30;
const TRACKING_EXPIRATION_HOURS_AFTER_TRIP = 24;
const QUEBEC_TIME_ZONE = "America/Toronto";

type ReservationRequest = {
  name?: string;
  phone?: string;
  email?: string;
  origin?: string;
  destination?: string;
  date?: string;
  time?: string;
  service?: string;
  distance?: number | string;
  minutes?: number | string;
  price?: number | string;
};

async function geocodeAddress(address: string) {
  try {
    const url =
      "https://nominatim.openstreetmap.org/search?" +
      new URLSearchParams({
        q: address,
        format: "json",
        limit: "1",
        countrycodes: "ca",
      });

    const response = await fetch(url, {
      headers: {
        "User-Agent": "TaxiLachenaie/1.0",
        "Accept-Language": "fr-CA,fr;q=0.9",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        latitude: null,
        longitude: null,
      };
    }

    const data = (await response.json()) as Array<{
      lat?: string;
      lon?: string;
    }>;

    if (!Array.isArray(data) || data.length === 0) {
      return {
        latitude: null,
        longitude: null,
      };
    }

    const latitude = Number(data[0]?.lat);
    const longitude = Number(data[0]?.lon);

    return {
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
    };
  } catch (error) {
    console.error("Erreur de géocodage :", error);

    return {
      latitude: null,
      longitude: null,
    };
  }
}

function generateTrackingToken() {
  const randomPart = crypto.randomUUID()
    .replaceAll("-", "")
    .slice(0, 8)
    .toUpperCase();

  const year = new Date().getFullYear();

  return `TL-${year}-${randomPart}`;
}

function toValidNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

/*
 * Convertit une date et une heure saisies au Québec
 * en véritable date UTC.
 *
 * Cela évite qu’une réservation de 11 h 00 soit interprétée
 * comme 11 h 00 UTC par le serveur.
 */
function quebecLocalDateTimeToUtc(
  dateValue: string,
  timeValue: string
): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeValue);

  if (!dateMatch || !timeMatch) {
    return null;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (
    !Number.isInteger(year) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const desiredUtcTimestamp = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    0,
    0
  );

  let candidateTimestamp = desiredUtcTimestamp;

  /*
   * Deux passages permettent de corriger l’écart UTC,
   * y compris pendant les changements heure d’été/hiver.
   */
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: QUEBEC_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(candidateTimestamp));

    const values: Record<string, number> = {};

    for (const part of parts) {
      if (
        part.type === "year" ||
        part.type === "month" ||
        part.type === "day" ||
        part.type === "hour" ||
        part.type === "minute" ||
        part.type === "second"
      ) {
        values[part.type] = Number(part.value);
      }
    }

    const representedLocalTimestamp = Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second || 0
    );

    const difference =
      desiredUtcTimestamp - representedLocalTimestamp;

    candidateTimestamp += difference;
  }

  const result = new Date(candidateTimestamp);

  return Number.isNaN(result.getTime()) ? null : result;
}

export async function POST(request: Request) {
  try {
    const reservation =
      (await request.json()) as ReservationRequest;

    const name = reservation.name?.trim();
    const phone = reservation.phone?.trim();
    const email = reservation.email?.trim();
    const origin = reservation.origin?.trim();
    const destination = reservation.destination?.trim();
    const tripDate = reservation.date?.trim();
    const tripTime = reservation.time?.trim();
    const service = reservation.service?.trim() || "standard";

    if (
      !name ||
      !phone ||
      !email ||
      !origin ||
      !destination ||
      !tripDate ||
      !tripTime
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Veuillez remplir toutes les informations obligatoires.",
        },
        { status: 400 }
      );
    }

    const scheduledAt = quebecLocalDateTimeToUtc(
      tripDate,
      tripTime
    );

    if (!scheduledAt) {
      return NextResponse.json(
        {
          success: false,
          error: "La date ou l’heure de départ est invalide.",
        },
        { status: 400 }
      );
    }

    const now = new Date();

    /*
     * Facultatif : empêcher une réservation trop ancienne.
     * Une petite tolérance de cinq minutes est autorisée.
     */
    if (
      scheduledAt.getTime() <
      now.getTime() - 5 * 60 * 1000
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "La date et l’heure de départ doivent être dans le futur.",
        },
        { status: 400 }
      );
    }

    const dispatchAt = new Date(
      scheduledAt.getTime() -
        DISPATCH_ADVANCE_MINUTES * 60 * 1000
    );

    const mustDispatchNow =
      now.getTime() >= dispatchAt.getTime();

    const status = mustDispatchNow
      ? "Nouvelle"
      : "Programmée";

    const trackingStatus = mustDispatchNow
      ? "Recherche chauffeur"
      : "Réservation programmée";

    const trackingExpiresAt = new Date(
      scheduledAt.getTime() +
        TRACKING_EXPIRATION_HOURS_AFTER_TRIP *
          60 *
          60 *
          1000
    );

    const gps = await geocodeAddress(origin);
    const trackingToken = generateTrackingToken();

    const distance = toValidNumber(reservation.distance);
    const duration = toValidNumber(reservation.minutes);
    const price = toValidNumber(reservation.price);

    if (price === null || price < 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Le prix de la réservation est invalide.",
        },
        { status: 400 }
      );
    }

    const {
      data: createdReservation,
      error,
    } = await supabaseServer
      .from("reservations")
      .insert([
        {
          name,
          phone,
          email,
          origin,
          destination,
          trip_date: tripDate,
          trip_time: tripTime,
          service,
          distance,
          duration,
          price,
          latitude: gps.latitude,
          longitude: gps.longitude,

          status,
          tracking_token: trackingToken,
          tracking_status: trackingStatus,
          tracking_enabled: false,
          tracking_expires_at:
            trackingExpiresAt.toISOString(),

          scheduled_at: scheduledAt.toISOString(),
          dispatch_at: dispatchAt.toISOString(),
          dispatched_at: null,
          accepted_at: null,
          driver_arrived_at: null,
          trip_started_at: null,
          trip_completed_at: null,

          driver_id: null,
        },
      ])
      .select(`
        id,
        status,
        tracking_token,
        tracking_status,
        scheduled_at,
        dispatch_at
      `)
      .single();

    if (error || !createdReservation) {
      console.error(
        "Erreur création réservation :",
        error
      );

      return NextResponse.json(
        {
          success: false,
          error:
            error?.message ||
            "Impossible d’enregistrer la réservation.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        status === "Programmée"
          ? "Réservation programmée avec succès."
          : "Réservation enregistrée. Recherche d’un chauffeur en cours.",
      gps,
      reservationId: createdReservation.id,
      status: createdReservation.status,
      trackingToken,
      trackingUrl: `/suivi/${trackingToken}`,
      scheduledAt: createdReservation.scheduled_at,
      dispatchAt: createdReservation.dispatch_at,
      dispatchNow: mustDispatchNow,
    });
  } catch (error) {
    console.error("Erreur API création réservation :", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Erreur serveur.",
      },
      { status: 500 }
    );
  }
}