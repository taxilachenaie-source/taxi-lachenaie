type Driver = {
  id: number;
  name: string;
  status: string;
  balance: number;
  latitude: number | null;
  longitude: number | null;
};

type Reservation = {
  id: number;
  latitude: number | null;
  longitude: number | null;
};

function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function rankDrivers(reservation: Reservation, drivers: Driver[]) {
  const availableDrivers = drivers.filter(
    (driver) =>
      driver.status === "Disponible" && Number(driver.balance || 0) > 0
  );

  const ranked = availableDrivers.map((driver) => {
    let distanceKm = 9999;

    if (
      reservation.latitude &&
      reservation.longitude &&
      driver.latitude &&
      driver.longitude
    ) {
      distanceKm = calculateDistanceKm(
        Number(reservation.latitude),
        Number(reservation.longitude),
        Number(driver.latitude),
        Number(driver.longitude)
      );
    }

    const score = Math.max(0, 100 - distanceKm * 10);

    return {
      driver,
      score,
      distanceKm,
    };
  });

  return ranked.sort((a, b) => b.score - a.score);
}

export function chooseBestDriver(reservation: Reservation, drivers: Driver[]) {
  const ranked = rankDrivers(reservation, drivers);

  if (ranked.length === 0) return null;

  return ranked[0].driver;
}