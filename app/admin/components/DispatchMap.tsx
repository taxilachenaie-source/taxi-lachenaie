"use client";

import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import * as L from "leaflet";

type Driver = {
  id: number;
  name: string;
  phone: string;
  vehicle: string;
  plate: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  current_position: string;
};

type Reservation = {
  id: number;
  name: string;
  phone: string;
  origin: string;
  destination: string;
  status: string;
  price: number;
  latitude?: number | null;
  longitude?: number | null;
};

const taxiIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/744/744465.png",
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36],
});

const clientIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [34, 34],
  iconAnchor: [17, 34],
  popupAnchor: [0, -34],
});

export default function DispatchMap({
  drivers,
  reservations,
}: {
  drivers: Driver[];
  reservations: Reservation[];
}) {
  const driversWithGps = drivers.filter(
    (driver) => driver.latitude && driver.longitude
  );

  const reservationsWithGps = reservations.filter(
    (reservation) => reservation.latitude && reservation.longitude
  );

  return (
    <MapContainer
      center={[45.7008, -73.6473]}
      zoom={11}
      style={{ height: "420px", width: "100%", borderRadius: "20px" }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {driversWithGps.map((driver) => (
        <Marker
          key={`driver-${driver.id}`}
          position={[Number(driver.latitude), Number(driver.longitude)]}
          icon={taxiIcon}
        >
          <Popup>
            <strong>🚖 {driver.name}</strong>
            <br />
            Statut : {driver.status}
            <br />
            Véhicule : {driver.vehicle} {driver.plate}
            <br />
            Vitesse : {Number(driver.speed || 0).toFixed(1)} km/h
            <br />
            Position : {driver.current_position}
          </Popup>
        </Marker>
      ))}

      {reservationsWithGps.map((reservation) => (
        <Marker
          key={`reservation-${reservation.id}`}
          position={[Number(reservation.latitude), Number(reservation.longitude)]}
          icon={clientIcon}
        >
          <Popup>
            <strong>📍 Client : {reservation.name}</strong>
            <br />
            📞 {reservation.phone}
            <br />
            Départ : {reservation.origin}
            <br />
            Destination : {reservation.destination}
            <br />
            Statut : {reservation.status}
            <br />
            Prix : {Number(reservation.price || 0).toFixed(2)} $
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}