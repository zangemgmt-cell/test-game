import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const configuredPath = process.env.GAME_DB_PATH;
const databasePath = configuredPath
  ? resolve(configuredPath)
  : join(projectRoot, "data", "shattered-concord.sqlite");

mkdirSync(dirname(databasePath), { recursive: true });

export const db = new DatabaseSync(databasePath);
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA busy_timeout = 5000");

const migrationVersion = db.prepare("PRAGMA user_version").get().user_version;
if (migrationVersion < 1) {
  const migration = readFileSync(join(projectRoot, "migrations", "001_foundation.sql"), "utf8");
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(migration);
    db.exec("PRAGMA user_version = 1");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

const now = Math.floor(Date.now() / 1000);
db.prepare("INSERT OR IGNORE INTO worlds(id, name, created_at) VALUES(?, ?, ?)")
  .run("ashen-marches", "The Ashen Marches", now);

const regions = [
  {
    id: "greywatch",
    name: "Greywatch",
    description: "A border town built around the broken imperial road. Its market is neutral ground.",
    terrain: "Town and river crossing",
    climate: "Cool, overcast",
    controller: "Greywatch Compact",
    threat: 1,
    resources: ["Trade", "Provisions"],
  },
  {
    id: "cinderfen",
    name: "Cinderfen",
    description: "A peat bog where blue lights drift over old smuggler paths.",
    terrain: "Wetland",
    climate: "Cold and misty",
    controller: "Unclaimed",
    threat: 3,
    resources: ["Peat", "Alchemical herbs"],
  },
  {
    id: "gloamwood",
    name: "The Gloamwood",
    description: "A haunted forest of black pines and ward stones older than the Concord.",
    terrain: "Dense forest",
    climate: "Rainy",
    controller: "Briar Covenant",
    threat: 2,
    resources: ["Timber", "Hides"],
  },
  {
    id: "ironspine",
    name: "Ironspine Pass",
    description: "A narrow mountain route overlooking the Marches and its caravan road.",
    terrain: "Mountain pass",
    climate: "Highland",
    controller: "House Veyr",
    threat: 4,
    resources: ["Iron ore", "Stone"],
  },
  {
    id: "orra-steps",
    name: "Saint Orra's Steps",
    description: "A ruined pilgrimage road descending toward a sealed sanctuary.",
    terrain: "Ruins and uplands",
    climate: "Wind-scoured",
    controller: "Unclaimed",
    threat: 3,
    resources: ["Relic fragments", "Herbs"],
  },
  {
    id: "veyrhold",
    name: "Veyrhold",
    description: "The fortified seat of House Veyr, watching the northern approaches.",
    terrain: "Fortress and high plain",
    climate: "Cool, dry",
    controller: "House Veyr",
    threat: 4,
    resources: ["Administration", "Arms"],
  },
  {
    id: "salt-road",
    name: "The Salt Road",
    description: "A caravan artery linking the Marches to distant coastal markets.",
    terrain: "Road and scrubland",
    climate: "Dry",
    controller: "Greywatch Compact",
    threat: 2,
    resources: ["Trade", "Salt"],
  },
  {
    id: "hollow-vault",
    name: "The Hollow Vault",
    description: "A sealed place beneath the old road. Its wards still answer to the broken Concord.",
    terrain: "Buried ruins",
    climate: "Unknown",
    controller: "Unknown",
    threat: 5,
    resources: ["Unknown"],
  },
];

const insertRegion = db.prepare(
  "INSERT OR IGNORE INTO regions (id, world_id, name, description, terrain, climate, controller, threat, resources_json, display_order) VALUES (?, 'ashen-marches', ?, ?, ?, ?, ?, ?, ?, ?)",
);
regions.forEach((region, index) => {
  insertRegion.run(
    region.id,
    region.name,
    region.description,
    region.terrain,
    region.climate,
    region.controller,
    region.threat,
    JSON.stringify(region.resources),
    index + 1,
  );
});

const edges = [
  ["greywatch", "cinderfen"],
  ["greywatch", "gloamwood"],
  ["greywatch", "salt-road"],
  ["cinderfen", "orra-steps"],
  ["gloamwood", "ironspine"],
  ["gloamwood", "orra-steps"],
  ["ironspine", "veyrhold"],
  ["salt-road", "veyrhold"],
  ["orra-steps", "hollow-vault"],
  ["veyrhold", "hollow-vault"],
];
const insertEdge = db.prepare(
  "INSERT OR IGNORE INTO region_edges(world_id, from_region, to_region) VALUES('ashen-marches', ?, ?)",
);
edges.forEach(([from, to]) => {
  insertEdge.run(from, to);
  insertEdge.run(to, from);
});

const items = [
  ["iron-knife", "Iron road-knife", "Weapon", "A serviceable knife issued to caravan guards.", "Common", 18, 1],
  ["field-rations", "Field rations", "Provision", "A day's worth of hard bread, dried fruit, and salt.", "Common", 8, 1],
  ["ash-cloak", "Ash-cloth cloak", "Clothing", "A weatherproof grey cloak stitched in Greywatch.", "Common", 24, 1],
  ["herbal-poultice", "Herbal poultice", "Supply", "A bundle of bitter herbs and clean linen.", "Uncommon", 15, 1],
  ["glowshard", "Faint glowshard", "Material", "A dim crystal used in simple lanterns and ward marks.", "Uncommon", 32, 1],
  ["sealed-letter", "Sealed letter", "Quest item", "A letter whose wax bears no recognizable crest.", "Uncommon", 0, 0],
  ["soldier-badge", "Old company badge", "Token", "A tarnished badge that may still open a few doors among veterans.", "Common", 0, 0],
  ["lockpick-roll", "Lockpick roll", "Tool", "A compact set of picks wrapped in oilcloth.", "Common", 0, 0],
  ["family-seal", "Family seal", "Token", "A signet from a house that no longer claims you.", "Uncommon", 0, 0],
  ["caravan-token", "Caravan token", "Token", "A stamped token that identifies a traveling factor.", "Common", 0, 0],
  ["apprentice-focus", "Hedge focus", "Tool", "A small ashwood focus marked with a warding knot.", "Common", 0, 0],
  ["river-knot", "River knot", "Token", "A length of blue cord knotted by a ferryman.", "Common", 0, 0],
  ["hunters-mark", "Hunter's mark", "Token", "A carved pine disk accepted by a few woodland wardens.", "Common", 0, 0],
  ["broken-signet", "Broken signet", "Token", "A split seal that hints at an erased claim.", "Uncommon", 0, 0],
];
const insertItem = db.prepare(
  "INSERT OR IGNORE INTO item_definitions (item_key, name, category, description, rarity, unit_price, vendor_available) VALUES (?, ?, ?, ?, ?, ?, ?)",
);
items.forEach((item) => insertItem.run(...item));

db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);

export function closeDatabase() {
  db.close();
}
