"use client";

import { useMemo, useState } from "react";

type FarePeriod = "day" | "night";

type TaxiRate = {
  label: string;
  icon: string;
  baseFare: number;
  pricePerKm: number;
  waitingPerMinute: number;
};

const DAY_RATE: TaxiRate = {
  label: "Tarif de jour",
  icon: "☀️",
  baseFare: 5.15,
  pricePerKm: 2.05,
  waitingPerMinute: 0.77,
};

const NIGHT_RATE: TaxiRate = {
  label: "Tarif de nuit",
  icon: "🌙",
  baseFare: 5.8,
  pricePerKm: 2.35,
  waitingPerMinute: 0.89,
};

/*
 * Le service VIP conserve temporairement son ancien tarif.
 * Nous pourrons définir séparément ses tarifs jour et nuit.
 */
const VIP_RATE = {
  baseFare: 10,
  pricePerKm: 3.25,
  waitingPerMinute: 0.65,
};

function getFarePeriod(time: string): FarePeriod {
  if (!time) {
    return "day";
  }

  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    return "day";
  }

  /*
   * Nuit :
   * 23 h 00 à 23 h 59
   * 00 h 00 à 04 h 59
   */
  if (hour >= 23 || hour < 5) {
    return "night";
  }

  return "day";
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
  }).format(value);
}

export default function BookingForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const [distance, setDistance] = useState(0);

  /*
   * Durée totale estimée du trajet.
   * Elle est affichée au client, mais elle ne représente pas
   * automatiquement du temps d’attente facturable.
   */
  const [minutes, setMinutes] = useState(0);

  /*
   * Attente estimée facultative.
   * Le vrai temps d’attente sera calculé plus tard par
   * le taximètre en direct pendant la course.
   */
  const [waitingMinutes, setWaitingMinutes] = useState(0);

  const [service, setService] = useState("standard");
  const [airportPrice, setAirportPrice] =
    useState<number | null>(null);

  const [priceMessage, setPriceMessage] = useState("");
  const [hasCalculated, setHasCalculated] = useState(false);

  const [loading, setLoading] = useState(false);
  const [bookingLoading, setBookingLoading] =
    useState(false);

  const [trackingUrl, setTrackingUrl] = useState("");

  const vehicleType =
    service === "vip" ? "VIP VUS" : "Berline";

  const farePeriod = useMemo<FarePeriod>(() => {
    return getFarePeriod(time);
  }, [time]);

  const activeTaxiRate = useMemo<TaxiRate>(() => {
    return farePeriod === "night"
      ? NIGHT_RATE
      : DAY_RATE;
  }, [farePeriod]);

  const regularPrice = useMemo(() => {
    const safeDistance = Math.max(0, Number(distance) || 0);
    const safeWaitingMinutes = Math.max(
      0,
      Number(waitingMinutes) || 0
    );

    if (service === "vip") {
      return (
        VIP_RATE.baseFare +
        safeDistance * VIP_RATE.pricePerKm +
        safeWaitingMinutes *
          VIP_RATE.waitingPerMinute
      );
    }

    return (
      activeTaxiRate.baseFare +
      safeDistance * activeTaxiRate.pricePerKm +
      safeWaitingMinutes *
        activeTaxiRate.waitingPerMinute
    );
  }, [
    distance,
    waitingMinutes,
    service,
    activeTaxiRate,
  ]);

  const finalPrice =
    airportPrice !== null
      ? airportPrice
      : regularPrice;

  function resetCalculatedPrice() {
    setAirportPrice(null);
    setPriceMessage("");
    setHasCalculated(false);
  }

  async function calculerDistance() {
    if (!origin || !destination || !time) {
      alert(
        "Veuillez saisir le départ, la destination et l’heure."
      );

      return;
    }

    try {
      setLoading(true);
      setAirportPrice(null);
      setPriceMessage("");
      setHasCalculated(false);

      /*
       * Vérifier d’abord si la course bénéficie
       * d’un tarif fixe vers ou depuis l’aéroport.
       */
      const priceResponse = await fetch(
        "/api/calculate-price",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            origin,
            destination,
            trip_time: time,
            vehicle_type: vehicleType,
          }),
        }
      );

      const priceData = await priceResponse.json();

      if (
        priceResponse.ok &&
        priceData.success &&
        priceData.type === "airport_fixed"
      ) {
        setAirportPrice(Number(priceData.price));
        setPriceMessage(
          `✈️ Tarif fixe YUL : ${priceData.city} / ${priceData.vehicle_type} / ${priceData.period}`
        );

        setDistance(0);
        setMinutes(0);
        setWaitingMinutes(0);
        setHasCalculated(true);

        return;
      }

      /*
       * Sinon, calculer l’itinéraire régulier.
       */
      const response = await fetch("/api/route", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          origin,
          destination,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(
          data.error ||
            "Erreur pendant le calcul de l’itinéraire."
        );

        return;
      }

      const calculatedDistance =
        Number(data.distanceKm);

      const calculatedDuration =
        Number(data.durationMin);

      if (
        !Number.isFinite(calculatedDistance) ||
        calculatedDistance < 0
      ) {
        alert(
          "La distance retournée par le serveur est invalide."
        );

        return;
      }

      setDistance(
        Number(calculatedDistance.toFixed(2))
      );

      setMinutes(
        Number.isFinite(calculatedDuration)
          ? Math.max(0, Math.ceil(calculatedDuration))
          : 0
      );

      setHasCalculated(true);

      if (service === "vip") {
        setPriceMessage(
          "🚙 Tarif VIP calculé selon la distance et l’attente estimée."
        );
      } else {
        setPriceMessage(
          `${activeTaxiRate.icon} ${activeTaxiRate.label} appliqué automatiquement.`
        );
      }
    } catch (error) {
      console.error(
        "Erreur calcul distance et prix :",
        error
      );

      alert("Impossible de joindre le serveur.");
    } finally {
      setLoading(false);
    }
  }

  async function reserver() {
    if (
      !name ||
      !phone ||
      !email ||
      !origin ||
      !destination ||
      !date ||
      !time
    ) {
      alert(
        "Veuillez remplir tous les champs avant de réserver."
      );

      return;
    }

    if (!hasCalculated) {
      alert(
        "Veuillez calculer la distance et le prix avant de réserver."
      );

      return;
    }

    try {
      setBookingLoading(true);
      setTrackingUrl("");

      const response = await fetch(
        "/api/reservations",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            phone,
            email,
            origin,
            destination,
            date,
            time,
            service,

            distance,
            minutes,
            waitingMinutes,

            price: Number(finalPrice.toFixed(2)),

            farePeriod:
              service === "standard"
                ? farePeriod
                : "vip",

            fareLabel:
              service === "standard"
                ? activeTaxiRate.label
                : "Tarif VIP",

            baseFare:
              service === "standard"
                ? activeTaxiRate.baseFare
                : VIP_RATE.baseFare,

            pricePerKm:
              service === "standard"
                ? activeTaxiRate.pricePerKm
                : VIP_RATE.pricePerKm,

            waitingPerMinute:
              service === "standard"
                ? activeTaxiRate.waitingPerMinute
                : VIP_RATE.waitingPerMinute,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(
          data.error ||
            "Erreur pendant la réservation."
        );

        return;
      }

      const fullTrackingUrl =
        `${window.location.origin}${data.trackingUrl}`;

      setTrackingUrl(fullTrackingUrl);

      alert("Réservation envoyée avec succès !");
    } catch (error) {
      console.error(
        "Erreur envoi réservation :",
        error
      );

      alert("Impossible d’envoyer la réservation.");
    } finally {
      setBookingLoading(false);
    }
  }

  async function copyTrackingLink() {
    if (!trackingUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        trackingUrl
      );

      alert("Lien de suivi copié.");
    } catch {
      alert(
        "Impossible de copier automatiquement le lien."
      );
    }
  }

  return (
    <div className="rounded-3xl bg-white p-6 text-black shadow-2xl sm:p-8">
      <h2 className="mb-8 text-3xl font-bold">
        Réserver votre taxi
      </h2>

      <div className="space-y-4">
        <input
          value={name}
          onChange={(event) =>
            setName(event.target.value)
          }
          placeholder="Nom complet"
          autoComplete="name"
          className="w-full rounded-xl border p-4"
        />

        <input
          value={phone}
          onChange={(event) =>
            setPhone(event.target.value)
          }
          placeholder="Téléphone"
          type="tel"
          autoComplete="tel"
          className="w-full rounded-xl border p-4"
        />

        <input
          value={email}
          onChange={(event) =>
            setEmail(event.target.value)
          }
          placeholder="Courriel"
          type="email"
          autoComplete="email"
          className="w-full rounded-xl border p-4"
        />

        <input
          value={origin}
          onChange={(event) => {
            setOrigin(event.target.value);
            resetCalculatedPrice();
          }}
          placeholder="Adresse de départ"
          autoComplete="street-address"
          className="w-full rounded-xl border p-4"
        />

        <input
          value={destination}
          onChange={(event) => {
            setDestination(event.target.value);
            resetCalculatedPrice();
          }}
          placeholder="Adresse de destination"
          className="w-full rounded-xl border p-4"
        />

        <input
          value={date}
          onChange={(event) => {
            setDate(event.target.value);
            resetCalculatedPrice();
          }}
          type="date"
          className="w-full rounded-xl border p-4"
        />

        <input
          value={time}
          onChange={(event) => {
            setTime(event.target.value);
            resetCalculatedPrice();
          }}
          type="time"
          className="w-full rounded-xl border p-4"
        />

        <select
          value={service}
          onChange={(event) => {
            setService(event.target.value);
            resetCalculatedPrice();
          }}
          className="w-full rounded-xl border p-4"
        >
          <option value="standard">
            Berline
          </option>

          <option value="vip">
            VIP VUS
          </option>
        </select>

        {service === "standard" && time && (
          <div
            className={`rounded-2xl border p-5 ${
              farePeriod === "night"
                ? "border-indigo-300 bg-indigo-50"
                : "border-yellow-300 bg-yellow-50"
            }`}
          >
            <p className="text-xl font-black">
              {activeTaxiRate.icon}{" "}
              {activeTaxiRate.label}
            </p>

            <p className="mt-2 text-sm">
              {farePeriod === "day"
                ? "Valide de 05 h 00 à 22 h 59"
                : "Valide de 23 h 00 à 04 h 59"}
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-white p-3">
                <p className="text-sm text-slate-500">
                  Prise en charge
                </p>

                <p className="font-black">
                  {formatMoney(
                    activeTaxiRate.baseFare
                  )}
                </p>
              </div>

              <div className="rounded-xl bg-white p-3">
                <p className="text-sm text-slate-500">
                  Prix par kilomètre
                </p>

                <p className="font-black">
                  {formatMoney(
                    activeTaxiRate.pricePerKm
                  )}
                </p>
              </div>

              <div className="rounded-xl bg-white p-3">
                <p className="text-sm text-slate-500">
                  Attente par minute
                </p>

                <p className="font-black">
                  {formatMoney(
                    activeTaxiRate.waitingPerMinute
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        <label className="block rounded-xl border p-4">
          <span className="font-semibold">
            Minutes d’attente estimées
          </span>

          <span className="mt-1 block text-sm text-slate-500">
            Facultatif. Ne pas utiliser la durée complète
            du trajet comme temps d’attente.
          </span>

          <input
            value={waitingMinutes}
            onChange={(event) => {
              const value = Math.max(
                0,
                Number(event.target.value) || 0
              );

              setWaitingMinutes(value);

              if (hasCalculated) {
                setAirportPrice(null);
              }
            }}
            type="number"
            min="0"
            step="1"
            className="mt-3 w-full rounded-xl border p-3"
          />
        </label>

        <button
          type="button"
          onClick={calculerDistance}
          disabled={loading}
          className="w-full rounded-xl bg-slate-900 py-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading
            ? "Calcul en cours..."
            : "Calculer distance et prix"}
        </button>

        <div className="rounded-xl bg-slate-100 p-5">
          {priceMessage && (
            <p className="mb-3 font-bold text-blue-700">
              {priceMessage}
            </p>
          )}

          <p>
            Distance estimée :{" "}
            <strong>{distance.toFixed(2)} km</strong>
          </p>

          <p>
            Durée estimée du trajet :{" "}
            <strong>{minutes} minutes</strong>
          </p>

          <p>
            Attente estimée facturable :{" "}
            <strong>{waitingMinutes} minutes</strong>
          </p>

          {hasCalculated &&
            airportPrice === null && (
              <div className="mt-4 rounded-xl bg-white p-4 text-sm">
                <p className="font-bold">
                  Détail du calcul
                </p>

                <p className="mt-2">
                  Prise en charge :{" "}
                  {formatMoney(
                    service === "standard"
                      ? activeTaxiRate.baseFare
                      : VIP_RATE.baseFare
                  )}
                </p>

                <p>
                  Distance :{" "}
                  {distance.toFixed(2)} km ×{" "}
                  {formatMoney(
                    service === "standard"
                      ? activeTaxiRate.pricePerKm
                      : VIP_RATE.pricePerKm
                  )}
                </p>

                <p>
                  Attente : {waitingMinutes} min ×{" "}
                  {formatMoney(
                    service === "standard"
                      ? activeTaxiRate.waitingPerMinute
                      : VIP_RATE.waitingPerMinute
                  )}
                </p>
              </div>
            )}

          <p className="mt-4 text-3xl font-bold text-green-600">
            Prix estimé :{" "}
            {hasCalculated
              ? formatMoney(finalPrice)
              : "—"}
          </p>

          <p className="mt-2 text-sm text-slate-500">
            Le montant final pourra varier selon la distance
            réellement parcourue et le temps d’attente réel.
          </p>
        </div>

        <button
          type="button"
          onClick={reserver}
          disabled={
            bookingLoading || !hasCalculated
          }
          className="w-full rounded-xl bg-yellow-400 py-4 font-bold text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {bookingLoading
            ? "Envoi en cours..."
            : "Réserver maintenant"}
        </button>

        {trackingUrl && (
          <div className="rounded-2xl border-4 border-green-500 bg-green-50 p-5">
            <h3 className="text-2xl font-bold text-green-700">
              ✅ Réservation confirmée
            </h3>

            <p className="mt-3 font-semibold">
              Votre lien de suivi :
            </p>

            <a
              href={trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block break-words font-bold text-blue-700 underline"
            >
              {trackingUrl}
            </a>

            <button
              type="button"
              onClick={copyTrackingLink}
              className="mt-4 rounded-xl bg-slate-900 px-5 py-3 font-bold text-white"
            >
              📋 Copier le lien
            </button>
          </div>
        )}
      </div>
    </div>
  );
}