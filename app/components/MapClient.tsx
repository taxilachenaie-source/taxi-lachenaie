"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export default function MapClient() {
  return (
    <div className="px-8 pb-20">
      <div className="h-[450px] w-full overflow-hidden rounded-3xl shadow-2xl">
        <MapContainer
          center={[45.708, -73.617]}
          zoom={12}
          scrollWheelZoom={false}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <Marker position={[45.708, -73.617]}>
            <Popup>🚖 Taxi Lachenaie</Popup>
          </Marker>
        </MapContainer>
      </div>
    </div>
  );
}