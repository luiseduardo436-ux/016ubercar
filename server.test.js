const test = require('node:test');
const assert = require('node:assert/strict');
const { estimate } = require('./server');
const { rankDrivers } = require('./matching');

test('calcula estimativa em BRL para uma corrida', () => {
  const result = estimate({});
  assert.equal(result.currency, 'BRL');
  assert.equal(result.distance_km, 5.8);
  assert.equal(result.price_per_km, 6.25);
  assert.equal(result.amount, 36.25);
  assert.equal(estimate({ distance_km: 4.5 }).amount, 28.13);
});

test('prioriza motorista com menor ETA dentro do raio', () => {
  const result = rankDrivers([
    { id: 'near', lat: -21.1775, lng: -47.8103, eta_seconds: 180, rating: 4.8, reliability: 0.9, idle_seconds: 30 },
    { id: 'far', lat: -21.19, lng: -47.83, eta_seconds: 600, rating: 5, reliability: 1, idle_seconds: 0 }
  ], { lat: -21.1774, lng: -47.8102 });
  assert.equal(result[0].id, 'near');
  assert.ok(result[0].score < result[1].score);
});
