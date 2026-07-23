"use client";

import dynamic from "next/dynamic";

const MapComponent = dynamic(() => import("./MapClient"), {
  ssr: false,
});

export default function Map() {
  return (
    <div className="mt-20">
      <h2 className="text-4xl font-bold text-center mb-10">
        Notre zone de service
      </h2>

      <MapComponent />
    </div>
  );
}