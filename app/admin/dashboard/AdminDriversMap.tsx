"use client";

import dynamic from "next/dynamic";

const DriversMapLeaflet = dynamic(
  () => import("./DriversMapLeaflet"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[500px] items-center justify-center rounded-3xl bg-white shadow-xl">
        <p className="text-xl font-bold text-slate-700">
          Chargement de la carte des chauffeurs...
        </p>
      </div>
    ),
  }
);

export default function AdminDriversMap() {
  return <DriversMapLeaflet />;
}