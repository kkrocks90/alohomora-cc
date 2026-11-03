CREATE TABLE IF NOT EXISTS flat_discount (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  percentage INTEGER NOT NULL CHECK (percentage BETWEEN 1 AND 90),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  end_date TEXT
);
