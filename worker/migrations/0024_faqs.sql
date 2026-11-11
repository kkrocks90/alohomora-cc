-- The About-page FAQ, saved as one JSON list. No row means the bundled defaults are used.
CREATE TABLE IF NOT EXISTS faq_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  items TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT ''
);
