-- ============================================================
-- GreenFleet – PostgreSQL Schema (FYD)
-- A Web-Based Carbon Emission Management System for Maritime Vessels
-- ============================================================

-- 1. USERS
-- Roles: Admin, Sustainability Officer, Manager, Viewer
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(80)  NOT NULL UNIQUE,
  email         VARCHAR(120) UNIQUE,
  password      VARCHAR(255) NOT NULL,
  role          VARCHAR(30)  NOT NULL DEFAULT 'Viewer'
                CHECK (role IN ('Admin','Sustainability Officer','Manager','Viewer')),
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. VESSELS
-- Core vessel registry with IMO-relevant fields
CREATE TABLE IF NOT EXISTS vessels (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  imo_number    VARCHAR(20)  NOT NULL UNIQUE,
  vessel_type   VARCHAR(60),                        -- e.g. Bulk Carrier, Tanker, Container Ship
  flag_state    VARCHAR(60),                        -- e.g. United Kingdom, Panama
  gross_tonnage DECIMAL(12,2),                      -- GT for EEXI/DCS context
  fuel_type     VARCHAR(30),                        -- default fuel: HFO, MDO, MGO, LNG
  engine_type   VARCHAR(60),
  fuel_capacity DECIMAL(10,2),
  avg_speed     DECIMAL(10,2),
  created_by    INT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. VOYAGES
-- Individual voyage records with emission outputs
CREATE TABLE IF NOT EXISTS voyages (
  id              SERIAL PRIMARY KEY,
  vessel_id       INT NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  departure_port  VARCHAR(80),
  arrival_port    VARCHAR(80),
  voyage_date     DATE,                             -- date the voyage started
  distance_nm     DECIMAL(10,2) NOT NULL,
  duration_days  DECIMAL(10,2),
  fuel_type       VARCHAR(30),                      -- fuel used on this voyage (can differ from vessel default)
  fuel_tons       DECIMAL(10,3) NOT NULL,
  co2_tons        DECIMAL(10,3) NOT NULL DEFAULT 0,
  nox_tons        DECIMAL(10,3) NOT NULL DEFAULT 0,
  sox_tons        DECIMAL(10,3) NOT NULL DEFAULT 0,
  eeoi            DECIMAL(10,6),                    -- Energy Efficiency Operational Indicator (optional)
  created_by      INT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. RECOMMENDATIONS
-- Rule-based green technology suggestions linked to vessels
CREATE TABLE IF NOT EXISTS recommendations (
  id              SERIAL PRIMARY KEY,
  vessel_id       INT NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  technology      VARCHAR(120) NOT NULL,            -- e.g. Wind-Assisted Propulsion, Hull Optimisation
  category        VARCHAR(60),                      -- e.g. Propulsion, Hull, Fuel, Operations
  description     TEXT,
  estimated_reduction_pct DECIMAL(5,2),             -- estimated % emission reduction
  source_reference VARCHAR(255),                    -- link or citation for the recommendation
  generated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  generated_by    INT REFERENCES users(id) ON DELETE SET NULL
);

-- 5. COMPLIANCE REPORTS
-- Generated reports aligned with IMO DCS / EEXI
CREATE TABLE IF NOT EXISTS compliance_reports (
  id              SERIAL PRIMARY KEY,
  vessel_id       INT REFERENCES vessels(id) ON DELETE SET NULL,
  report_type     VARCHAR(30) NOT NULL DEFAULT 'DCS'
                  CHECK (report_type IN ('DCS','EEXI','Fleet Summary')),
  period_start    DATE,
  period_end      DATE,
  total_co2       DECIMAL(12,3),
  total_nox       DECIMAL(12,3),
  total_sox       DECIMAL(12,3),
  total_fuel      DECIMAL(12,3),
  total_distance  DECIMAL(12,2),
  compliance_status VARCHAR(30) DEFAULT 'Pending'
                  CHECK (compliance_status IN ('Compliant','Non-Compliant','Pending')),
  report_data     TEXT,                             -- JSON blob with full breakdown for PDF generation
  generated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  generated_by    INT REFERENCES users(id) ON DELETE SET NULL
);

-- 6. ALERTS
-- Emission anomalies and compliance warnings
CREATE TABLE IF NOT EXISTS alerts (
  id              SERIAL PRIMARY KEY,
  vessel_id       INT REFERENCES vessels(id) ON DELETE CASCADE,
  voyage_id       INT REFERENCES voyages(id) ON DELETE CASCADE,
  alert_type      VARCHAR(30) NOT NULL
                  CHECK (alert_type IN ('High Emission','Threshold Breach','Data Anomaly','Compliance Warning')),
  message         TEXT NOT NULL,
  severity        VARCHAR(15) DEFAULT 'Medium'
                  CHECK (severity IN ('Low','Medium','High','Critical')),
  is_read         BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. AUDIT LOGS
-- Track user actions for accountability (Admin-visible)
CREATE TABLE IF NOT EXISTS audit_logs (
  id              SERIAL PRIMARY KEY,
  user_id         INT REFERENCES users(id) ON DELETE SET NULL,
  action          VARCHAR(60) NOT NULL,             -- e.g. CREATE_VESSEL, DELETE_VOYAGE, LOGIN
  entity_type     VARCHAR(30),                      -- e.g. vessel, voyage, user
  entity_id       INT,
  details         TEXT,                             -- optional JSON with before/after or context
  ip_address      VARCHAR(45),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- INDEXES for query performance
-- ============================================================
CREATE INDEX idx_voyages_vessel     ON voyages(vessel_id);
CREATE INDEX idx_voyages_date       ON voyages(voyage_date);
CREATE INDEX idx_recommendations_vessel ON recommendations(vessel_id);
CREATE INDEX idx_alerts_vessel      ON alerts(vessel_id);
CREATE INDEX idx_alerts_unread      ON alerts(is_read) WHERE is_read = FALSE;
CREATE INDEX idx_audit_user         ON audit_logs(user_id);
CREATE INDEX idx_audit_action       ON audit_logs(action);
CREATE INDEX idx_compliance_vessel  ON compliance_reports(vessel_id);