-- GPS303 Server — PostgreSQL + TimescaleDB
-- Execute com: bun run db:migrate

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Lista de permissões dos rastreadores que podem autenticar no servidor.
CREATE TABLE IF NOT EXISTS allow_imei (
    imei VARCHAR(15) PRIMARY KEY
        CHECK (imei ~ '^[0-9]{15}$'),
    name VARCHAR(120),
    description TEXT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_connected_at TIMESTAMPTZ,
    last_remote_address TEXT
);

CREATE INDEX IF NOT EXISTS allow_imei_enabled_idx
    ON allow_imei (enabled)
    WHERE enabled = TRUE;

CREATE TABLE IF NOT EXISTS gps_messages (
    id BIGSERIAL PRIMARY KEY,
    message TEXT NOT NULL,
    imei VARCHAR(15),
    remote_address TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS gps_messages_received_at_idx
    ON gps_messages (received_at DESC);

CREATE INDEX IF NOT EXISTS gps_messages_imei_received_at_idx
    ON gps_messages (imei, received_at DESC);

CREATE TABLE IF NOT EXISTS gps_locations (
    recorded_at TIMESTAMPTZ NOT NULL,
    imei VARCHAR(15) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    speed DOUBLE PRECISION,
    battery_level DOUBLE PRECISION,
    valid BOOLEAN NOT NULL DEFAULT FALSE,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw_message TEXT
);

SELECT create_hypertable(
    'gps_locations',
    'recorded_at',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS gps_locations_imei_recorded_at_idx
    ON gps_locations (imei, recorded_at DESC);

CREATE TABLE IF NOT EXISTS gps_latest_locations (
    imei VARCHAR(15) PRIMARY KEY,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    speed DOUBLE PRECISION,
    battery_level DOUBLE PRECISION,
    recorded_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid BOOLEAN NOT NULL DEFAULT FALSE,
    raw_message TEXT
);

CREATE INDEX IF NOT EXISTS gps_latest_locations_received_at_idx
    ON gps_latest_locations (received_at DESC);
