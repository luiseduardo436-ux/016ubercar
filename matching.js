const { distanceKm } = require('./infra');

function scoreDriver(candidate, request) {
  const distance = distanceKm(request.lat, request.lng, candidate.lat, candidate.lng);
  const eta = Number.isFinite(candidate.eta_seconds) ? candidate.eta_seconds : distance * 120;
  const idleSeconds = Math.max(0, Number(candidate.idle_seconds) || 0);
  const reliability = clamp(Number(candidate.reliability) || 0.8, 0, 1);
  const rating = clamp((Number(candidate.rating) || 5) / 5, 0, 1);
  return {
    ...candidate,
    distance_km: Number(distance.toFixed(3)),
    eta_seconds: Math.round(eta),
    score: Number((0.45 * normalize(eta, 900) + 0.2 * normalize(idleSeconds, 1800) + 0.15 * (1 - reliability) + 0.1 * normalize(distance, 10) + 0.1 * (1 - rating)).toFixed(5))
  };
}

function rankDrivers(candidates, request, radiusKm = 5) {
  return candidates
    .filter(candidate => distanceKm(request.lat, request.lng, candidate.lat, candidate.lng) <= radiusKm)
    .map(candidate => scoreDriver(candidate, request))
    .sort((left, right) => left.score - right.score);
}

function normalize(value, maximum) {
  return clamp(value / maximum, 0, 1);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

module.exports = { rankDrivers, scoreDriver };