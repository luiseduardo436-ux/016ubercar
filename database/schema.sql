CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('passenger', 'driver', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE drivers (
  id UUID PRIMARY KEY REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  rating_avg NUMERIC(3,2) NOT NULL DEFAULT 5.00,
  online BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id), plate TEXT NOT NULL UNIQUE,
  model TEXT NOT NULL, color TEXT, year INT, active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), passenger_id UUID NOT NULL REFERENCES users(id),
  driver_id UUID REFERENCES drivers(id), status TEXT NOT NULL CHECK (status IN ('searching','accepted','driver_en_route','in_progress','completed','cancelled')),
  origin GEOGRAPHY(Point, 4326) NOT NULL, destination GEOGRAPHY(Point, 4326) NOT NULL,
  price_estimated NUMERIC(10,2), price_final NUMERIC(10,2), distance_meters INT, duration_seconds INT,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('pix','card','wallet','cash')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ
);
CREATE INDEX rides_origin_gist ON rides USING GIST(origin);
CREATE INDEX rides_destination_gist ON rides USING GIST(destination);
CREATE INDEX rides_status_created ON rides(status, created_at);

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), ride_id UUID NOT NULL REFERENCES rides(id),
  payer_id UUID NOT NULL REFERENCES users(id), amount NUMERIC(10,2) NOT NULL,
  method TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('pending','success','failed','refunded')),
  gateway_reference TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ride_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES drivers(id),
  score NUMERIC(8,5) NOT NULL,
  eta_seconds INT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ride_id, driver_id)
);
CREATE INDEX ride_offers_pending ON ride_offers(status, expires_at);

CREATE TABLE ride_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ride_events_ride_created ON ride_events(ride_id, created_at);

CREATE TABLE driver_location_events (
  id BIGSERIAL PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES drivers(id),
  ride_id UUID REFERENCES rides(id),
  position GEOGRAPHY(Point, 4326) NOT NULL,
  accuracy_m NUMERIC(8,2),
  speed_kmh NUMERIC(8,2),
  heading NUMERIC(6,2),
  captured_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX driver_location_events_position_gist ON driver_location_events USING GIST(position);
CREATE INDEX driver_location_events_driver_time ON driver_location_events(driver_id, captured_at DESC);

CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  actor_id UUID,
  operation TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX outbox_unpublished ON outbox_events(created_at) WHERE published_at IS NULL;
