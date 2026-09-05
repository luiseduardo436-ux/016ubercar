const crypto = require('node:crypto');

let Pool;
let createClient;
try { ({ Pool } = require('pg')); } catch { Pool = null; }
try { ({ createClient } = require('redis')); } catch { createClient = null; }

function createInfrastructure({ databaseUrl = process.env.DATABASE_URL, redisUrl = process.env.REDIS_URL } = {}) {
  const pool = Pool && databaseUrl ? new Pool({ connectionString: databaseUrl, max: 10 }) : null;
  const redis = createClient && redisUrl ? createClient({ url: redisUrl }) : null;
  const memoryEvents = [];
  const memoryLocations = new Map();

  if (redis) redis.on('error', error => console.error('Redis error:', error.message));

  async function connect() {
    if (redis && !redis.isOpen) await redis.connect();
    if (pool) await pool.query('SELECT 1');
  }

  async function publishEvent(type, aggregateId, payload) {
    const event = { id: crypto.randomUUID(), type, aggregate_id: aggregateId, payload, created_at: new Date().toISOString() };
    memoryEvents.push(event);
    if (pool) {
      await pool.query(
        'INSERT INTO outbox_events (id, event_type, aggregate_id, payload) VALUES ($1, $2, $3, $4)',
        [event.id, type, aggregateId, payload]
      );
    }
    if (redis) await redis.xAdd('ubercar:events', '*', { type, aggregate_id: aggregateId, payload: JSON.stringify(payload) });
    return event;
  }

  async function setDriverLocation(driverId, location, rideId = null) {
    const capturedAt = location.captured_at || new Date().toISOString();
    const value = { ...location, driver_id: driverId, ride_id: rideId, captured_at: capturedAt };
    memoryLocations.set(driverId, value);
    if (redis) {
      await redis.geoAdd('drivers:available', { longitude: value.lng, latitude: value.lat, member: driverId });
      await redis.hSet(`driver:location:${driverId}`, value);
      await redis.expire(`driver:location:${driverId}`, 45);
    }
    if (pool) {
      await pool.query(
        `INSERT INTO driver_location_events
          (driver_id, ride_id, position, accuracy_m, speed_kmh, heading, captured_at)
         VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, $5, $6, $7, $8)`,
        [driverId, rideId, value.lng, value.lat, value.accuracy_m || null, value.speed_kmh || null, value.heading || null, capturedAt]
      );
    }
    return value;
  }

  async function nearbyDrivers(lat, lng, radiusKm = 5) {
    if (redis) return redis.geoSearch('drivers:available', { longitude: lng, latitude: lat }, { radius: radiusKm, unit: 'km' });
    return [...memoryLocations.values()]
      .filter(location => distanceKm(lat, lng, location.lat, location.lng) <= radiusKm)
      .map(location => location.driver_id);
  }

  async function reserveRide(rideId, driverId) {
    if (!pool) return true;
    const result = await pool.query(
      `UPDATE rides SET driver_id = $1, status = 'accepted'
       WHERE id = $2 AND status = 'searching' AND driver_id IS NULL`,
      [driverId, rideId]
    );
    return result.rowCount === 1;
  }

  async function persistRide(ride, passengerId = '00000000-0000-4000-8000-000000000001') {
    if (!pool || !ride.origin || !ride.destination) return false;
    await pool.query('BEGIN');
    try {
      await pool.query(
        `INSERT INTO users (id, name, phone, role) VALUES ($1, $2, $3, 'passenger')
         ON CONFLICT (id) DO NOTHING`,
        [passengerId, 'Passageiro demo', `demo-${passengerId}@016ubercar.local`]
      );
      await pool.query(
        `INSERT INTO rides
          (id, passenger_id, driver_id, status, origin, destination, price_estimated, payment_method)
         VALUES ($1, $2, NULL, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography,
                 ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [ride.request_id, passengerId, ride.status, ride.origin.lng, ride.origin.lat, ride.destination.lng, ride.destination.lat, ride.estimate.amount, ride.payment_method || 'cash']
      );
      await pool.query('COMMIT');
      return true;
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }

  async function updateRideStatus(rideId, status, driverId = null, priceFinal = null) {
    if (!pool) return false;
    await pool.query(
      `UPDATE rides SET status = $2, driver_id = COALESCE($3, driver_id),
        price_final = COALESCE($4, price_final), completed_at = CASE WHEN $2 = 'completed' THEN now() ELSE completed_at END
       WHERE id = $1`,
      [rideId, status, driverId, priceFinal]
    );
    return true;
  }

  async function close() {
    if (redis?.isOpen) await redis.quit();
    if (pool) await pool.end();
  }

  return { pool, redis, connect, publishEvent, setDriverLocation, nearbyDrivers, reserveRide, persistRide, updateRideStatus, close, memoryEvents };
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const radians = value => value * Math.PI / 180;
  const deltaLat = radians(lat2 - lat1);
  const deltaLng = radians(lng2 - lng1);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = { createInfrastructure, distanceKm };