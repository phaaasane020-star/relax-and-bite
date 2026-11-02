// Browser-only: find out whether the person is inside one of our delivery towns.

export type TownArea = { id: number; name: string; lat: number | null; lng: number | null; radius_km: number };

/** Distance between two points on Earth in km (haversine). */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type LocateResult =
  | { ok: true; inside: TownArea; km: number }
  | { ok: true; inside: null; nearest: TownArea | null; km: number | null }
  | { ok: false; reason: string };

export function locate(towns: TownArea[]): Promise<LocateResult> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({ ok: false, reason: "Your browser can't share your location. Choose your locality below." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const placed = towns
          .filter((t): t is TownArea & { lat: number; lng: number } => t.lat !== null && t.lng !== null)
          .map((t) => ({ town: t, km: distanceKm(latitude, longitude, t.lat, t.lng) }))
          .sort((a, b) => a.km - b.km);
        const hit = placed.find((p) => p.km <= p.town.radius_km);
        if (hit) resolve({ ok: true, inside: hit.town, km: hit.km });
        else resolve({ ok: true, inside: null, nearest: placed[0]?.town ?? null, km: placed[0]?.km ?? null });
      },
      (err) => {
        resolve({
          ok: false,
          reason:
            err.code === err.PERMISSION_DENIED
              ? 'Location is blocked for this site. Allow it in your browser settings, or choose your locality below.'
              : "We couldn't get your location. Check that location is on, or choose your locality below.",
        });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  });
}
