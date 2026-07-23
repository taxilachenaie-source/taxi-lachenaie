"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

type DriversMapProps = {
  currentDriverId: number;
};

const DriversMapLeaflet = dynamic(
  () =>
    import("./DriversMapLeaflet").then(
      (module) => module.default
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] items-center justify-center rounded-3xl bg-white shadow">
        <p className="text-lg font-bold text-slate-700">
          Chargement de la carte...
        </p>
      </div>
    ),
  }
) as ComponentType<DriversMapProps>;

export default function DriversMap({
  currentDriverId,
}: DriversMapProps) {
  return <DriversMapLeaflet currentDriverId={currentDriverId} />;
}