-- PG Management System schema for Neon PostgreSQL
-- Includes PG scoping (`pg_id`) across core entities

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'superadmin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE room_status AS ENUM ('available', 'occupied');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE person_status AS ENUM ('active', 'inactive');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE message_type AS ENUM ('reminder_1', 'reminder_2', 'reminder_3', 'payment_confirmed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE notification_status AS ENUM ('sent', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE reminder_run_mode AS ENUM ('all_unpaid', 'scheduled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS pgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pg_whatsapp_settings (
  pg_id uuid PRIMARY KEY REFERENCES pgs(id) ON DELETE CASCADE,
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  whatsapp_api_key varchar(255),
  whatsapp_phone_number_id varchar(120),
  whatsapp_template_reminder varchar(120),
  whatsapp_template_confirmation varchar(120),
  whatsapp_template_language_code varchar(10) NOT NULL DEFAULT 'en',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pg_whatsapp_settings_required_check CHECK (
    whatsapp_enabled = false OR (
      whatsapp_api_key IS NOT NULL
      AND whatsapp_phone_number_id IS NOT NULL
      AND whatsapp_template_reminder IS NOT NULL
      AND whatsapp_template_confirmation IS NOT NULL
    )
  )
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  email varchar(255) UNIQUE NOT NULL,
  password varchar(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'admin',
  pg_id uuid REFERENCES pgs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pg_id uuid REFERENCES pgs(id) ON DELETE SET NULL,
  room_number varchar(50) NOT NULL,
  floor varchar(50) NOT NULL,
  capacity integer NOT NULL CHECK (capacity > 0),
  rent_amount numeric(10, 2) NOT NULL,
  status room_status NOT NULL DEFAULT 'available',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  phone varchar(20) NOT NULL CHECK (phone ~ '^\\+91[0-9]{10}$'),
  email varchar(255),
  aadhaar_url varchar(500),
  pg_id uuid REFERENCES pgs(id) ON DELETE SET NULL,
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  join_date date NOT NULL,
  payment_day integer NOT NULL DEFAULT 1 CHECK (payment_day >= 1 AND payment_day <= 28),
  status person_status NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pg_id uuid REFERENCES pgs(id) ON DELETE SET NULL,
  person_id uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  year integer NOT NULL CHECK (year >= 2000 AND year <= 3000),
  amount numeric(10, 2) NOT NULL,
  is_paid boolean NOT NULL DEFAULT false,
  paid_on timestamptz,
  receipt_url varchar(500),
  marked_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, month, year)
);

CREATE TABLE IF NOT EXISTS notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pg_id uuid REFERENCES pgs(id) ON DELETE SET NULL,
  person_id uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  month integer NOT NULL,
  year integer NOT NULL,
  message_type message_type NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  status notification_status NOT NULL
);

CREATE TABLE IF NOT EXISTS reminder_run_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pg_id uuid NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  year integer NOT NULL CHECK (year >= 2000 AND year <= 3000),
  mode reminder_run_mode NOT NULL DEFAULT 'all_unpaid',
  slot integer NOT NULL CHECK (slot >= 1 AND slot <= 2),
  triggered_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pg_id, month, year, mode, slot)
);

-- Backward-compatible upgrades for existing databases.
ALTER TABLE users ADD COLUMN IF NOT EXISTS pg_id uuid;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS pg_id uuid;
ALTER TABLE persons ADD COLUMN IF NOT EXISTS pg_id uuid;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS pg_id uuid;
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS pg_id uuid;

DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_pg_id_fkey FOREIGN KEY (pg_id) REFERENCES pgs(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE rooms ADD CONSTRAINT rooms_pg_id_fkey FOREIGN KEY (pg_id) REFERENCES pgs(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE persons ADD CONSTRAINT persons_pg_id_fkey FOREIGN KEY (pg_id) REFERENCES pgs(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE payments ADD CONSTRAINT payments_pg_id_fkey FOREIGN KEY (pg_id) REFERENCES pgs(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE notification_logs ADD CONSTRAINT notification_logs_pg_id_fkey FOREIGN KEY (pg_id) REFERENCES pgs(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_room_number_key;
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_room_number_unique;
DROP INDEX IF EXISTS rooms_room_number_key;
DROP INDEX IF EXISTS rooms_room_number_unique;

CREATE INDEX IF NOT EXISTS idx_persons_room_id ON persons(room_id);
CREATE INDEX IF NOT EXISTS idx_payments_person ON payments(person_id);
CREATE INDEX IF NOT EXISTS idx_payments_month_year ON payments(month, year);
CREATE INDEX IF NOT EXISTS idx_notification_logs_person ON notification_logs(person_id);
CREATE UNIQUE INDEX IF NOT EXISTS rooms_pg_room_number_uidx ON rooms(pg_id, room_number);
CREATE INDEX IF NOT EXISTS idx_reminder_run_limits_scope ON reminder_run_limits(pg_id, year, month, mode, created_at DESC);
