"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type ServiceType = "standard" | "vip";
type FarePeriod = "day" | "night";
type MeterStatus = "running" | "paused";

type FareRate = {
  id: number;
  service: ServiceType;
  period: FarePeriod;
  base_fare: number | string;
  price_per_km: number | string;
  waiting_per_minute: number | string;
  start_time: string;
  end_time: string;
  active: boolean;
};

type GpsPoint = {
  latitude: number;
  longitude: number;
  timestamp: number;
};

type LocationPoint = {
  latitude: number;
  longitude: number;
};

type TaxiMeterProps = {
  reservationId: number;
  clientName: string;
  service: string;
  initialDistanceKm?: number;
  initialWaitingSeconds?: number;
  initialElapsedSeconds?: number;
};

const WAITING_SPEED_KMH = 10;
const MINIMUM_GPS_DISTANCE_METERS = 3;
const MAXIMUM_ACCEPTED_SPEED_KMH = 160;
const MAXIMUM_GPS_ACCURACY_METERS = 50;
const SAVE_INTERVAL_MILLISECONDS = 5000;

export default function TaxiMeter({
  reservationId,
  clientName,
  service,
  initialDistanceKm = 0,
  initialWaitingSeconds = 0,
  initialElapsedSeconds = 0,
}: TaxiMeterProps) {
  const normalizedService: ServiceType =
    service?.toLowerCase() === "vip" ? "vip" : "standard";

  const [rates, setRates] = useState<FareRate[]>([]);
  const [loadingRates, setLoadingRates] = useState(true);
  const [rateError, setRateError] = useState("");

  const [meterStatus, setMeterStatus] =
    useState<MeterStatus>("running");

  const [distanceKm, setDistanceKm] = useState(
    Number(initialDistanceKm) || 0
  );

  const [waitingSeconds, setWaitingSeconds] = useState(
    Number(initialWaitingSeconds) || 0
  );

  const [elapsedSeconds, setElapsedSeconds] = useState(
    Number(initialElapsedSeconds) || 0
  );

  const [speedKmh, setSpeedKmh] = useState(0);

  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(
    null
  );

  const [gpsMessage, setGpsMessage] = useState(
    "Recherche du signal GPS..."
  );

  const [saveMessage, setSaveMessage] = useState(
    "Synchronisation en attente..."
  );

  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(
    null
  );

  const [isFinishing, setIsFinishing] = useState(false);

  const gpsWatchIdRef = useRef<number | null>(null);
  const previousPointRef = useRef<GpsPoint | null>(null);
  const speedKmhRef = useRef(0);

  const distanceKmRef = useRef(
    Number(initialDistanceKm) || 0
  );

  const waitingSecondsRef = useRef(
    Number(initialWaitingSeconds) || 0
  );

  const elapsedSecondsRef = useRef(
    Number(initialElapsedSeconds) || 0
  );

  const currentPriceRef = useRef(0);

  const meterStatusRef =
    useRef<MeterStatus>("running");

  const latestLocationRef =
    useRef<LocationPoint | null>(null);

  const savingRef = useRef(false);
  const componentMountedRef = useRef(true);

  const farePeriod = useMemo<FarePeriod>(() => {
    const hour = new Date().getHours();

    return hour >= 5 && hour < 23 ? "day" : "night";
  }, []);

  const selectedRate = useMemo(() => {
    return rates.find(
      (rate) =>
        rate.service === normalizedService &&
        rate.period === farePeriod &&
        rate.active
    );
  }, [rates, normalizedService, farePeriod]);

  const baseFare = Number(selectedRate?.base_fare || 0);

  const pricePerKm = Number(
    selectedRate?.price_per_km || 0
  );

  const waitingPerMinute = Number(
    selectedRate?.waiting_per_minute || 0
  );

  const distancePrice = distanceKm * pricePerKm;

  const waitingPrice =
    (waitingSeconds / 60) * waitingPerMinute;

  const rawPrice =
    baseFare + distancePrice + waitingPrice;

  /*
   * Le prix affiché évolue uniquement par paliers de 0,05 $.
   *
   * Exemple :
   * 5,15 $
   * 5,20 $
   * 5,25 $
   * 5,30 $
   */
  const currentPrice =
    Math.round((rawPrice + Number.EPSILON) * 20) / 20;

  useEffect(() => {
    componentMountedRef.current = true;

    return () => {
      componentMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    distanceKmRef.current = distanceKm;
  }, [distanceKm]);

  useEffect(() => {
    waitingSecondsRef.current = waitingSeconds;
  }, [waitingSeconds]);

  useEffect(() => {
    elapsedSecondsRef.current = elapsedSeconds;
  }, [elapsedSeconds]);

  useEffect(() => {
    currentPriceRef.current = currentPrice;
  }, [currentPrice]);

  useEffect(() => {
    meterStatusRef.current = meterStatus;
  }, [meterStatus]);

  useEffect(() => {
    void loadFareRates();
  }, []);

  /*
   * Minuteur principal.
   *
   * Toutes les secondes :
   * - le temps total augmente ;
   * - si la vitesse est inférieure à 10 km/h,
   *   l’attente augmente.
   */
  useEffect(() => {
    if (meterStatus !== "running") {
      return;
    }

    const interval = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);

      if (speedKmhRef.current < WAITING_SPEED_KMH) {
        setWaitingSeconds((current) => current + 1);
      }
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [meterStatus]);

  /*
   * Activation et arrêt du GPS selon le statut.
   */
  useEffect(() => {
    if (meterStatus === "running") {
      startGpsTracking();
    } else {
      stopGpsTracking();
    }

    return () => {
      stopGpsTracking();
    };
  }, [meterStatus]);

  /*
   * Sauvegarde automatique dans Supabase toutes les 5 secondes.
   */
  useEffect(() => {
    if (!selectedRate) {
      return;
    }

    const saveInterval = window.setInterval(() => {
      void saveMeterState();
    }, SAVE_INTERVAL_MILLISECONDS);

    return () => {
      window.clearInterval(saveInterval);
    };
  }, [reservationId, selectedRate]);

  /*
   * Sauvegarde lorsque l’application passe en arrière-plan.
   */
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        void saveMeterState();
      }
    }

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [reservationId]);

  async function loadFareRates() {
    try {
      setLoadingRates(true);
      setRateError("");

      const response = await fetch("/api/fare-rates", {
        cache: "no-store",
      });

      const result = await response.json();

      if (
        !response.ok ||
        !result.success ||
        !Array.isArray(result.rates)
      ) {
        throw new Error(
          result.error ||
            "Impossible de charger les tarifs."
        );
      }

      setRates(result.rates);
    } catch (error) {
      console.error("Erreur chargement tarifs :", error);

      setRateError(
        error instanceof Error
          ? error.message
          : "Impossible de charger les tarifs."
      );
    } finally {
      setLoadingRates(false);
    }
  }

  async function saveMeterState(
    statusOverride?: MeterStatus
  ) {
    if (savingRef.current) {
      return;
    }

    try {
      savingRef.current = true;

      if (componentMountedRef.current) {
        setSaveMessage("Sauvegarde en cours...");
      }

      const { data, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !data.session) {
        throw new Error(
          "Session chauffeur introuvable."
        );
      }

      const location = latestLocationRef.current;

      const response = await fetch(
        `/api/chauffeur/reservations/${reservationId}/meter`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            meterStatus:
              statusOverride ?? meterStatusRef.current,

            distanceKm: distanceKmRef.current,

            waitingSeconds:
              waitingSecondsRef.current,

            elapsedSeconds:
              elapsedSecondsRef.current,

            currentPrice:
              currentPriceRef.current,

            latitude:
              location?.latitude ?? null,

            longitude:
              location?.longitude ?? null,
          }),
        }
      );

      const rawResponse = await response.text();

      let result: {
        success?: boolean;
        error?: string;
      };

      try {
        result = JSON.parse(rawResponse);
      } catch {
        throw new Error(
          `Réponse API invalide. Code HTTP : ${response.status}`
        );
      }

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ||
            "Impossible de sauvegarder le taximètre."
        );
      }

      if (componentMountedRef.current) {
        const savedDate = new Date();

        setLastSavedAt(savedDate);
        setSaveMessage("Taximètre sauvegardé");
      }
    } catch (error) {
      console.error(
        "Erreur synchronisation taximètre :",
        error
      );

      if (componentMountedRef.current) {
        setSaveMessage(
          error instanceof Error
            ? `Erreur : ${error.message}`
            : "Erreur de sauvegarde"
        );
      }
    } finally {
      savingRef.current = false;
    }
  }

  function startGpsTracking() {
    if (!navigator.geolocation) {
      setGpsMessage(
        "La géolocalisation n’est pas disponible sur cet appareil."
      );

      return;
    }

    if (gpsWatchIdRef.current !== null) {
      return;
    }

    setGpsMessage("Connexion au GPS...");

    gpsWatchIdRef.current =
      navigator.geolocation.watchPosition(
        handleGpsPosition,
        handleGpsError,
        {
          enableHighAccuracy: true,
          maximumAge: 2000,
          timeout: 15000,
        }
      );
  }

  function stopGpsTracking() {
    if (
      gpsWatchIdRef.current !== null &&
      navigator.geolocation
    ) {
      navigator.geolocation.clearWatch(
        gpsWatchIdRef.current
      );

      gpsWatchIdRef.current = null;
    }

    previousPointRef.current = null;
  }

  function handleGpsPosition(
    position: GeolocationPosition
  ) {
    const {
      latitude,
      longitude,
      accuracy,
      speed,
    } = position.coords;

    const timestamp =
      position.timestamp || Date.now();

    latestLocationRef.current = {
      latitude,
      longitude,
    };

    setGpsAccuracy(accuracy);

    /*
     * Un signal imprécis ne doit pas ajouter de distance.
     * L’attente continue toutefois à être calculée.
     */
    if (accuracy > MAXIMUM_GPS_ACCURACY_METERS) {
      speedKmhRef.current = 0;
      setSpeedKmh(0);

      setGpsMessage(
        `Signal GPS imprécis : ±${Math.round(
          accuracy
        )} mètres`
      );

      return;
    }

    const currentPoint: GpsPoint = {
      latitude,
      longitude,
      timestamp,
    };

    const previousPoint =
      previousPointRef.current;

    if (!previousPoint) {
      previousPointRef.current = currentPoint;

      const firstSpeedKmh =
        typeof speed === "number" && speed >= 0
          ? speed * 3.6
          : 0;

      speedKmhRef.current = firstSpeedKmh;
      setSpeedKmh(firstSpeedKmh);
      setGpsMessage("GPS connecté");

      return;
    }

    const elapsedMilliseconds =
      timestamp - previousPoint.timestamp;

    if (elapsedMilliseconds <= 0) {
      previousPointRef.current = currentPoint;
      return;
    }

    const elapsedHours =
      elapsedMilliseconds / 1000 / 60 / 60;

    const segmentDistanceKm =
      calculateDistanceKm(
        previousPoint.latitude,
        previousPoint.longitude,
        currentPoint.latitude,
        currentPoint.longitude
      );

    const calculatedSpeedKmh =
      elapsedHours > 0
        ? segmentDistanceKm / elapsedHours
        : 0;

    const deviceSpeedKmh =
      typeof speed === "number" && speed >= 0
        ? speed * 3.6
        : null;

    const reliableSpeedKmh =
      deviceSpeedKmh !== null
        ? deviceSpeedKmh
        : calculatedSpeedKmh;

    /*
     * Protection contre les sauts GPS impossibles.
     */
    if (
      calculatedSpeedKmh >
      MAXIMUM_ACCEPTED_SPEED_KMH
    ) {
      setGpsMessage("Point GPS anormal ignoré.");

      previousPointRef.current = currentPoint;
      return;
    }

    const safeSpeedKmh = Math.max(
      0,
      reliableSpeedKmh
    );

    speedKmhRef.current = safeSpeedKmh;
    setSpeedKmh(safeSpeedKmh);

    const segmentDistanceMeters =
      segmentDistanceKm * 1000;

    /*
     * La distance est ajoutée seulement si :
     * - le véhicule roule à 10 km/h ou plus ;
     * - le déplacement est d’au moins 3 mètres.
     */
    if (
      safeSpeedKmh >= WAITING_SPEED_KMH &&
      segmentDistanceMeters >=
        MINIMUM_GPS_DISTANCE_METERS
    ) {
      setDistanceKm(
        (currentDistance) =>
          currentDistance + segmentDistanceKm
      );
    }

    previousPointRef.current = currentPoint;
    setGpsMessage("GPS connecté");
  }

  function handleGpsError(
    error: GeolocationPositionError
  ) {
    console.error("Erreur GPS taximètre :", error);

    speedKmhRef.current = 0;
    setSpeedKmh(0);

    if (error.code === error.PERMISSION_DENIED) {
      setGpsMessage(
        "Autorisation GPS refusée. Active la localisation dans le navigateur."
      );

      return;
    }

    if (error.code === error.POSITION_UNAVAILABLE) {
      setGpsMessage(
        "Position GPS temporairement indisponible."
      );

      return;
    }

    if (error.code === error.TIMEOUT) {
      setGpsMessage(
        "Le GPS prend trop de temps à répondre."
      );

      return;
    }

    setGpsMessage("Erreur de géolocalisation.");
  }

  async function pauseMeter() {
    meterStatusRef.current = "paused";
    setMeterStatus("paused");

    speedKmhRef.current = 0;
    setSpeedKmh(0);

    setGpsMessage("Taximètre en pause");

    await saveMeterState("paused");
  }

  async function resumeMeter() {
    previousPointRef.current = null;

    speedKmhRef.current = 0;
    setSpeedKmh(0);

    meterStatusRef.current = "running";
    setMeterStatus("running");

    setGpsMessage("Reconnexion au GPS...");

    await saveMeterState("running");
  }

  async function finishRide() {
    if (isFinishing) {
      return;
    }

    const confirmed = window.confirm(
      `Terminer cette course au montant final de ${currentPriceRef.current.toFixed(
        2
      )} $ ?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsFinishing(true);
      setSaveMessage("Finalisation de la course...");

      meterStatusRef.current = "paused";
      setMeterStatus("paused");

      speedKmhRef.current = 0;
      setSpeedKmh(0);
      stopGpsTracking();

      await saveMeterState("paused");

      const { data, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !data.session) {
        throw new Error("Session chauffeur introuvable.");
      }

      const response = await fetch(
        `/api/chauffeur/reservations/${reservationId}/finish`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            finalDistanceKm: distanceKmRef.current,
            finalWaitingSeconds: waitingSecondsRef.current,
            finalElapsedSeconds: elapsedSecondsRef.current,
            finalPrice: currentPriceRef.current,
          }),
        }
      );

      const rawResponse = await response.text();

      let result: {
        success?: boolean;
        error?: string;
      };

      try {
        result = JSON.parse(rawResponse);
      } catch {
        throw new Error(
          `Réponse API invalide. Code HTTP : ${response.status}`
        );
      }

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "Impossible de terminer la course."
        );
      }

      setSaveMessage("Course terminée et sauvegardée");
      setLastSavedAt(new Date());

      window.alert("✅ Course terminée avec succès.");
      window.location.reload();
    } catch (error) {
      console.error("Erreur fin de course :", error);

      setSaveMessage(
        error instanceof Error
          ? `Erreur : ${error.message}`
          : "Erreur lors de la fin de la course"
      );

      window.alert(
        error instanceof Error
          ? error.message
          : "Erreur lors de la fermeture de la course."
      );
    } finally {
      setIsFinishing(false);
    }
  }

  function calculateDistanceKm(
    latitude1: number,
    longitude1: number,
    latitude2: number,
    longitude2: number
  ) {
    const earthRadiusKm = 6371;

    const latitudeDifference =
      degreesToRadians(
        latitude2 - latitude1
      );

    const longitudeDifference =
      degreesToRadians(
        longitude2 - longitude1
      );

    const firstLatitude =
      degreesToRadians(latitude1);

    const secondLatitude =
      degreesToRadians(latitude2);

    const haversine =
      Math.sin(latitudeDifference / 2) ** 2 +
      Math.cos(firstLatitude) *
        Math.cos(secondLatitude) *
        Math.sin(longitudeDifference / 2) ** 2;

    const angularDistance =
      2 *
      Math.atan2(
        Math.sqrt(haversine),
        Math.sqrt(1 - haversine)
      );

    return earthRadiusKm * angularDistance;
  }

  function degreesToRadians(value: number) {
    return (value * Math.PI) / 180;
  }

  function formatTime(totalSeconds: number) {
    const safeSeconds = Math.max(
      0,
      Math.floor(totalSeconds)
    );

    const hours = Math.floor(
      safeSeconds / 3600
    );

    const minutes = Math.floor(
      (safeSeconds % 3600) / 60
    );

    const seconds = safeSeconds % 60;

    return [hours, minutes, seconds]
      .map((value) =>
        String(value).padStart(2, "0")
      )
      .join(":");
  }

  if (loadingRates) {
    return (
      <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-2xl">
        <p className="text-center text-xl font-bold">
          Chargement du taximètre...
        </p>
      </section>
    );
  }

  if (rateError || !selectedRate) {
    return (
      <section className="rounded-3xl bg-red-700 p-6 text-white shadow-2xl">
        <h2 className="text-2xl font-black">
          Erreur du taximètre
        </h2>

        <p className="mt-3">
          {rateError ||
            "Aucun tarif actif ne correspond à cette course."}
        </p>

        <button
          type="button"
          onClick={() => void loadFareRates()}
          className="mt-5 rounded-xl bg-white px-5 py-3 font-bold text-red-700"
        >
          Réessayer
        </button>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-3xl bg-slate-950 text-white shadow-2xl">
      <div className="border-b border-slate-700 bg-black p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-yellow-400">
              Course no {reservationId}
            </p>

            <h2 className="mt-1 text-3xl font-black">
              🚖 TAXIMÈTRE
            </h2>

            <p className="mt-2 text-slate-300">
              Client :{" "}
              <strong className="text-white">
                {clientName}
              </strong>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-blue-600 px-4 py-2 text-sm font-bold uppercase">
              {normalizedService}
            </span>

            <span className="rounded-full bg-yellow-400 px-4 py-2 text-sm font-bold uppercase text-black">
              {farePeriod === "day"
                ? "Tarif jour"
                : "Tarif nuit"}
            </span>

            <span
              className={`rounded-full px-4 py-2 text-sm font-bold uppercase ${
                meterStatus === "running"
                  ? "bg-green-600"
                  : "bg-orange-500"
              }`}
            >
              {meterStatus === "running"
                ? "En marche"
                : "En pause"}
            </span>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-7">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MeterValue
            label="Temps total"
            value={formatTime(elapsedSeconds)}
          />

          <MeterValue
            label="Distance"
            value={`${distanceKm.toFixed(3)} km`}
          />

          <MeterValue
            label="Attente"
            value={formatTime(waitingSeconds)}
          />

          <MeterValue
            label="Vitesse"
            value={`${speedKmh.toFixed(1)} km/h`}
          />
        </div>

        <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-900 p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="font-bold">
                📡 État du GPS
              </p>

              <p className="mt-1 text-sm text-slate-300">
                {gpsMessage}
              </p>
            </div>

            {gpsAccuracy !== null && (
              <p className="text-sm text-slate-400">
                Précision : ±
                {Math.round(gpsAccuracy)} m
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-900 p-4">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <p className="font-bold">
                💾 Synchronisation
              </p>

              <p className="text-sm text-slate-300">
                {saveMessage}
              </p>
            </div>

            {lastSavedAt && (
              <p className="text-sm text-slate-400">
                Dernière sauvegarde :{" "}
                {lastSavedAt.toLocaleTimeString("fr-CA")}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-900 p-5">
          <h3 className="mb-4 text-xl font-black">
            Détail du tarif
          </h3>

          <div className="space-y-3">
            <PriceLine
              label="Prise en charge"
              description={`${baseFare.toFixed(2)} $`}
              amount={baseFare}
            />

            <PriceLine
              label="Distance"
              description={`${distanceKm.toFixed(
                3
              )} km × ${pricePerKm.toFixed(2)} $`}
              amount={distancePrice}
            />

            <PriceLine
              label="Attente"
              description={`${(
                waitingSeconds / 60
              ).toFixed(
                2
              )} min × ${waitingPerMinute.toFixed(
                2
              )} $`}
              amount={waitingPrice}
            />
          </div>
        </div>

        <div className="mt-5 rounded-3xl bg-green-700 p-6 text-center">
          <p className="text-lg font-bold uppercase tracking-wider">
            Total actuel
          </p>

          <p className="mt-2 text-6xl font-black">
            {currentPrice.toFixed(2)} $
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {meterStatus === "running" ? (
            <button
              type="button"
              onClick={() => void pauseMeter()}
              className="rounded-2xl bg-orange-500 px-6 py-5 text-xl font-black text-white"
            >
              ⏸ Mettre en pause
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void resumeMeter()}
              className="rounded-2xl bg-green-600 px-6 py-5 text-xl font-black text-white"
            >
              ▶ Reprendre
            </button>
          )}

          <div className="rounded-2xl border border-slate-700 bg-slate-900 px-6 py-4 text-center">
            <p className="text-sm text-slate-400">
              Passage automatique en attente
            </p>

            <p className="mt-1 font-bold">
              Sous {WAITING_SPEED_KMH} km/h
            </p>
          </div>

          <button
            type="button"
            onClick={() => void finishRide()}
            disabled={isFinishing}
            className="col-span-full rounded-2xl bg-red-600 px-6 py-5 text-xl font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isFinishing
              ? "⏳ Finalisation en cours..."
              : "🏁 Terminer la course"}
          </button>
        </div>
      </div>
    </section>
  );
}

function MeterValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-800 p-4 text-center">
      <p className="text-sm text-slate-400">
        {label}
      </p>

      <p className="mt-2 text-2xl font-black sm:text-3xl">
        {value}
      </p>
    </div>
  );
}

function PriceLine({
  label,
  description,
  amount,
}: {
  label: string;
  description: string;
  amount: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-700 pb-3 last:border-0 last:pb-0">
      <div>
        <p className="font-bold">{label}</p>

        <p className="text-sm text-slate-400">
          {description}
        </p>
      </div>

      <p className="text-xl font-black">
        {amount.toFixed(2)} $
      </p>
    </div>
  );
}