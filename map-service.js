const EARTH_RADIUS_KM = 6371;

async function routeBetween(origin, destination) {
  const fallback = fallbackRoute(origin, destination);
  if (process.env.MAP_PROVIDER === 'mapbox' && process.env.MAPBOX_ACCESS_TOKEN) {
    const mapbox = await mapboxRoute(origin, destination);
    if (mapbox) return mapbox;
  }
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(7000) });
    if (!response.ok) return fallback;
    const data = await response.json();
    const route = data.routes?.[0];
    if (!route) return fallback;
    return { distance_km: Number((route.distance / 1000).toFixed(2)), duration_seconds: Math.round(route.duration), geometry: route.geometry };
  } catch {
    return fallback;
  }
}

async function mapboxRoute(origin, destination) {
  const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?overview=full&geometries=geojson&access_token=${encodeURIComponent(process.env.MAPBOX_ACCESS_TOKEN)}`;
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(7000) });
    if (!response.ok) return null;
    const data = await response.json();
    const route = data.routes?.[0];
    return route ? { distance_km: Number((route.distance / 1000).toFixed(2)), duration_seconds: Math.round(route.duration), geometry: route.geometry } : null;
  } catch {
    return null;
  }
}

function fallbackRoute(origin, destination) {
  const distance = haversine(origin.lat, origin.lng, destination.lat, destination.lng);
  return { distance_km: Number((distance * 1.25).toFixed(2)), duration_seconds: Math.round(distance * 1.25 / 28 * 3600), geometry: { type: 'LineString', coordinates: [[origin.lng, origin.lat], [destination.lng, destination.lat]] } };
}

function haversine(lat1, lng1, lat2, lng2) {
  const radians = value => value * Math.PI / 180;
  const a = Math.sin(radians(lat2 - lat1) / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lng2 - lng1) / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = { routeBetween, fallbackRoute };