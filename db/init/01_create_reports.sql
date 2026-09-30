-- Initializes the reports table to store parsed XML report data
CREATE TABLE IF NOT EXISTS reports (
  id            INTEGER      PRIMARY KEY,
  tag           TEXT                     NOT NULL,
  name          TEXT                     NOT NULL,
  article       TEXT                     NOT NULL,
  quantity      NUMERIC                  NOT NULL,
  unit          TEXT                     NOT NULL,
  category      TEXT                     NOT NULL,
  brand         TEXT                     NOT NULL,
  updated_at    TIMESTAMPTZ  DEFAULT now() NOT NULL
);
-- Index on tag and category may help query performance
CREATE INDEX IF NOT EXISTS idx_reports_tag ON reports(tag);
CREATE INDEX IF NOT EXISTS idx_reports_category ON reports(category);