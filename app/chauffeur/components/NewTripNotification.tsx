"use client";

type Reservation = {
  id: number;
  name: string;
  phone: string;
  origin: string;
  destination: string;
  price: number;
};

type Props = {
  reservation: Reservation | null;
  secondsLeft: number;
  onAccept: () => void;
  onRefuse: () => void;
};

export default function NewTripNotification({
  reservation,
  secondsLeft,
  onAccept,
  onRefuse,
}: Props) {
  if (!reservation) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6">
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl transition-all">

        <div className="rounded-t-3xl bg-yellow-400 p-6 text-center">
          <h1 className="text-4xl font-black text-slate-900">
            🚨 Nouvelle course
          </h1>

          <p className="mt-2 text-lg font-semibold">
            Taxi Lachenaie
          </p>
        </div>

        <div className="space-y-5 p-8">

          <div className="rounded-2xl bg-slate-100 p-4">
            <p className="text-xl">
              👤 <strong>Client :</strong>
            </p>

            <p className="text-2xl font-bold">
              {reservation.name}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-100 p-4">
            <p className="font-bold">
              📍 Départ
            </p>

            <p>{reservation.origin}</p>
          </div>

          <div className="rounded-2xl bg-slate-100 p-4">
            <p className="font-bold">
              🏁 Destination
            </p>

            <p>{reservation.destination}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">

            <div className="rounded-2xl bg-green-100 p-4 text-center">
              <p className="font-bold">
                💵 Prix
              </p>

              <p className="text-3xl font-black text-green-700">
                {Number(reservation.price).toFixed(2)} $
              </p>
            </div>

            <div className="rounded-2xl bg-red-100 p-4 text-center">
              <p className="font-bold">
                ⏳ Temps restant
              </p>

              <p className="text-3xl font-black text-red-600">
                {secondsLeft}s
              </p>
            </div>

          </div>

          <div className="grid grid-cols-2 gap-4">

            <button
              onClick={onAccept}
              className="rounded-2xl bg-green-600 py-5 text-xl font-bold text-white transition hover:bg-green-700"
            >
              ✅ ACCEPTER
            </button>

            <button
              onClick={onRefuse}
              className="rounded-2xl bg-red-600 py-5 text-xl font-bold text-white transition hover:bg-red-700"
            >
              ❌ REFUSER
            </button>

          </div>

        </div>

      </div>
    </div>
  );
}