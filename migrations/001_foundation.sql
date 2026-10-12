CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_account_expiry ON sessions(account_id, expires_at);

CREATE TABLE worlds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE regions (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  terrain TEXT NOT NULL,
  climate TEXT NOT NULL,
  controller TEXT NOT NULL,
  threat INTEGER NOT NULL CHECK(threat BETWEEN 1 AND 5),
  resources_json TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  UNIQUE(world_id, display_order)
);

CREATE TABLE region_edges (
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  from_region TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  to_region TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  PRIMARY KEY(world_id, from_region, to_region),
  CHECK(from_region <> to_region)
);

CREATE TABLE characters (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  world_id TEXT NOT NULL REFERENCES worlds(id),
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  ancestry TEXT NOT NULL,
  background TEXT NOT NULL,
  discipline TEXT NOT NULL,
  portrait TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1 CHECK(level >= 1),
  experience INTEGER NOT NULL DEFAULT 0 CHECK(experience >= 0),
  health INTEGER NOT NULL CHECK(health >= 0),
  max_health INTEGER NOT NULL CHECK(max_health > 0),
  current_region TEXT NOT NULL REFERENCES regions(id),
  attributes_json TEXT NOT NULL,
  origin_hook TEXT NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 1 CHECK(is_public IN (0, 1)),
  created_at INTEGER NOT NULL
);

CREATE TABLE currency_accounts (
  character_id INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  crowns INTEGER NOT NULL CHECK(crowns >= 0)
);

CREATE TABLE currency_ledger (
  id INTEGER PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL CHECK(delta <> 0),
  balance_after INTEGER NOT NULL CHECK(balance_after >= 0),
  reason TEXT NOT NULL,
  request_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX currency_ledger_character ON currency_ledger(character_id, id DESC);

CREATE TABLE item_definitions (
  item_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  rarity TEXT NOT NULL,
  unit_price INTEGER NOT NULL CHECK(unit_price >= 0),
  vendor_available INTEGER NOT NULL DEFAULT 0 CHECK(vendor_available IN (0, 1))
);

CREATE TABLE inventory_items (
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL REFERENCES item_definitions(item_key),
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  acquired_at INTEGER NOT NULL,
  PRIMARY KEY(character_id, item_key)
);

CREATE TABLE idempotency_requests (
  request_key TEXT PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idempotency_character ON idempotency_requests(character_id, created_at DESC);
