"use client";

import dynamic from "next/dynamic";

const TrackingMapLeaflet = dynamic(
  () => import("./TrackingMapLeaflet"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[400px] items-center justify-center rounded-2xl bg-slate-100">
        Chargement de la carte...
      </div>
    ),
  }
);

type Props = {
  clientLatitude: number | null;
  clientLongitude: number | null;
  driverLatitude: number | null;
  driverLongitude: number | null;
};

export default function TrackingMap(props: Props) {
  return <TrackingMapLeaflet {...props} />;
}