import { createServer } from "node:http";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { db, closeDatabase } from "./db.mjs";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const publicDirectory = join(projectRoot, "public");
const host = process.env.HOST || "127.0.0.1";
const portValue = Number(process.env.PORT || 3000);
const port = Number.isInteger(portValue) && portValue > 0 && portValue < 65536 ? portValue : 3000;
const publicOrigin = process.env.PUBLIC_ORIGIN || "";
const secureCookies = process.env.SECURE_COOKIES === "1";
const sessionLifetime = 7 * 24 * 60 * 60;
const scryptOptions = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const fakeSalt = "shattered-concord-login-padding";
const authAttempts = new Map();

const ancestries = {
  marcher: { label: "Marcher", bonuses: { presence: 1, insight: -1 } },
  emberkin: { label: "Emberkin", bonuses: { vigor: 1, presence: -1 } },
  stoneborn: { label: "Stoneborn", bonuses: { might: 1, finesse: -1 } },
  thornbound: { label: "Thornbound", bonuses: { finesse: 1, presence: -1 } },
  duskmarked: { label: "Duskmarked", bonuses: { insight: 1, presence: -1 } },
  wyrmblooded: { label: "Wyrmblooded", bonuses: { reason: 1, might: -1 } },
};
const backgrounds = {
  former_soldier: {
    label: "Former soldier",
    hook: "A former squadmate keeps watch at Greywatch's east gate.",
    item: "soldier-badge",
  },
  street_runner: {
    label: "Street runner",
    hook: "A runner for the Lantern Knives leaves messages at the old well.",
    item: "lockpick-roll",
  },
  disgraced_heir: {
    label: "Disgraced heir",
    hook: "A Greywatch clerk still recognizes your family's seal.",
    item: "family-seal",
  },
  traveling_factor: {
    label: "Traveling factor",
    hook: "A warehouse factor has a lead on the Salt Road.",
    item: "caravan-token",
  },
  hedge_apprentice: {
    label: "Hedge apprentice",
    hook: "A lay scholar seeks a missing ward-stone near the Gloamwood.",
    item: "apprentice-focus",
  },
  escaped_prisoner: {
    label: "Escaped prisoner",
    hook: "A ferryman remembers helping you cross the river.",
    item: "river-knot",
  },
  wandering_hunter: {
    label: "Wandering hunter",
    hook: "A warden knows you can read the Gloamwood's old trails.",
    item: "hunters-mark",
  },
  exiled_heir: {
    label: "Exiled heir",
    hook: "An old retainer may know why your claim was erased.",
    item: "broken-signet",
  },
};
const disciplines = {
  assassin: "Assassin",
  mercenary: "Mercenary",
  warrior: "Warrior",
  mage: "Mage",
  merchant: "Merchant",
  noble: "Noble",
  ranger: "Ranger",
  artificer: "Engineer / artificer",
};
const portraits = new Set(["ember", "raven", "moon", "wolf", "tower", "key"]);
const attributeKeys = ["might", "finesse", "vigor", "reason", "insight", "presence"];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, scryptOptions, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey.toString("hex"));
    });
  });
}

function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  );
}

function sendJson(res, status, value) {
  setSecurityHeaders(res);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}

function sendText(res, status, text, contentType) {
  setSecurityHeaders(res);
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  res.end(text);
}

function parseCookies(req) {
  const result = {};
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    result[key] = value;
  }
  return result;
}

function setSessionCookie(res, token, maxAge) {
  const fields = [
    "sid=" + token,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=" + String(maxAge),
  ];
  if (secureCookies) fields.push("Secure");
  res.setHeader("Set-Cookie", fields.join("; "));
}

function issueSession(accountId, res) {
  const token = randomBytes(32).toString("hex");
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + sessionLifetime;
  db.prepare("DELETE FROM sessions WHERE account_id = ? AND expires_at <= ?").run(accountId, now);
  db.prepare("INSERT INTO sessions(token_hash, account_id, created_at, expires_at) VALUES(?, ?, ?, ?)")
    .run(sha256(token), accountId, now, expiresAt);
  setSessionCookie(res, token, sessionLifetime);
}

function getSession(req) {
  const token = parseCookies(req).sid || "";
  if (!/^[a-f0-9]{64}$/i.test(token)) return null;
  const now = Math.floor(Date.now() / 1000);
  const row = db.prepare(
    "SELECT a.id AS account_id, a.username, s.token_hash FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ?",
  ).get(sha256(token), now);
  return row || null;
}

function requireSession(req) {
  const session = getSession(req);
  if (!session) throw new HttpError(401, "Sign in to continue.");
  return session;
}

function requireSameOrigin(req) {
  const origin = req.headers.origin;
  if (typeof origin !== "string") throw new HttpError(403, "This request did not include a valid origin.");
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw new HttpError(403, "This request did not include a valid origin.");
  }
  if (parsed.origin !== origin) throw new HttpError(403, "This request did not include a valid origin.");
  if (publicOrigin) {
    if (origin !== publicOrigin) throw new HttpError(403, "Cross-origin requests are not allowed.");
    return;
  }
  const scheme = req.socket.encrypted ? "https://" : "http://";
  const expected = scheme + (req.headers.host || "");
  if (origin !== expected) throw new HttpError(403, "Cross-origin requests are not allowed.");
}

function chargeAuthAttempt(req) {
  const key = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const existing = authAttempts.get(key);
  if (!existing || existing.resetAt <= now) {
    authAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return;
  }
  if (existing.count >= 10) throw new HttpError(429, "Too many sign-in attempts. Try again later.");
  existing.count += 1;
}

function readJson(req) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    throw new HttpError(415, "Send this action as JSON.");
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > 16 * 1024) {
        tooLarge = true;
        reject(new HttpError(413, "Request body is too large."));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) return;
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          reject(new HttpError(400, "Send a JSON object."));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new HttpError(400, "The request body is not valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function normalizeUsername(value) {
  if (typeof value !== "string") throw new HttpError(400, "Enter a username.");
  const username = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,19}$/.test(username)) {
    throw new HttpError(400, "Usernames must be 3–20 characters and use letters, numbers, underscores, or hyphens.");
  }
  return { username, key: username.toLowerCase() };
}

function validatePassword(value) {
  if (typeof value !== "string" || value.length < 12 || value.length > 128) {
    throw new HttpError(400, "Use a password between 12 and 128 characters.");
  }
  return value;
}

function transaction(work) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function parseCharacterRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    ancestry: row.ancestry,
    background: row.background,
    discipline: row.discipline,
    portrait: row.portrait,
    level: row.level,
    experience: row.experience,
    health: row.health,
    maxHealth: row.max_health,
    currentRegion: row.current_region,
    regionName: row.region_name,
    originHook: row.origin_hook,
    attributes: JSON.parse(row.attributes_json),
    crowns: row.crowns,
    createdAt: row.created_at,
  };
}

function getCharacter(accountId) {
  const row = db.prepare(
    "SELECT c.id, c.name, c.ancestry, c.background, c.discipline, c.portrait, c.level, c.experience, c.health, c.max_health, c.current_region, c.origin_hook, c.attributes_json, c.created_at, r.name AS region_name, ca.crowns FROM characters c JOIN regions r ON r.id = c.current_region LEFT JOIN currency_accounts ca ON ca.character_id = c.id WHERE c.account_id = ?",
  ).get(accountId);
  return parseCharacterRow(row);
}

function getInventory(characterId) {
  return db.prepare(
    "SELECT i.item_key AS itemKey, d.name, d.category, d.description, d.rarity, i.quantity, i.acquired_at AS acquiredAt FROM inventory_items i JOIN item_definitions d ON d.item_key = i.item_key WHERE i.character_id = ? ORDER BY d.category, d.name",
  ).all(characterId);
}

function getWorld(worldId, currentRegion) {
  const regions = db.prepare(
    "SELECT id, name, description, terrain, climate, controller, threat, resources_json FROM regions WHERE world_id = ? ORDER BY display_order",
  ).all(worldId).map((region) => ({
    id: region.id,
    name: region.name,
    description: region.description,
    terrain: region.terrain,
    climate: region.climate,
    controller: region.controller,
    threat: region.threat,
    resources: JSON.parse(region.resources_json),
    isCurrent: region.id === currentRegion,
  }));
  const edges = db.prepare(
    "SELECT from_region AS source, to_region AS destination FROM region_edges WHERE world_id = ? ORDER BY from_region, to_region",
  ).all(worldId);
  return { id: worldId, name: "The Ashen Marches", regions, edges };
}

function getPublicPlayers(worldId) {
  return db.prepare(
    "SELECT c.name, c.ancestry, c.discipline, c.level, c.current_region AS currentRegion, r.name AS regionName FROM characters c JOIN regions r ON r.id = c.current_region WHERE c.world_id = ? AND c.is_public = 1 ORDER BY c.created_at DESC, c.id DESC LIMIT 50",
  ).all(worldId);
}

function getVendor(characterId) {
  return db.prepare(
    "SELECT d.item_key AS itemKey, d.name, d.category, d.description, d.rarity, d.unit_price AS price, COALESCE(i.quantity, 0) AS owned FROM item_definitions d LEFT JOIN inventory_items i ON i.item_key = d.item_key AND i.character_id = ? WHERE d.vendor_available = 1 ORDER BY d.category, d.unit_price",
  ).all(characterId);
}

function getBootstrap(accountId) {
  const account = db.prepare("SELECT id, username, created_at FROM accounts WHERE id = ?").get(accountId);
  const character = getCharacter(accountId);
  if (!character) {
    return {
      account: { username: account.username, createdAt: account.created_at },
      character: null,
      world: getWorld("ashen-marches", "greywatch"),
      players: getPublicPlayers("ashen-marches"),
    };
  }
  const raw = db.prepare("SELECT world_id FROM characters WHERE id = ?").get(character.id);
  return {
    account: { username: account.username, createdAt: account.created_at },
    character,
    inventory: getInventory(character.id),
    vendor: character.currentRegion === "greywatch" ? getVendor(character.id) : [],
    world: getWorld(raw.world_id, character.currentRegion),
    players: getPublicPlayers(raw.world_id),
  };
}

function validateCharacterInput(body) {
  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (name.length < 3 || name.length > 18 || !/^[\p{L}][\p{L}\p{M}' -]{2,17}$/u.test(name)) {
    throw new HttpError(400, "Character names must be 3–18 letters, spaces, apostrophes, or hyphens, and start with a letter.");
  }
  if (typeof body.ancestry !== "string" || !Object.hasOwn(ancestries, body.ancestry)) {
    throw new HttpError(400, "Choose one of the listed ancestries.");
  }
  if (typeof body.background !== "string" || !Object.hasOwn(backgrounds, body.background)) {
    throw new HttpError(400, "Choose one of the listed backgrounds.");
  }
  if (typeof body.discipline !== "string" || !Object.hasOwn(disciplines, body.discipline)) {
    throw new HttpError(400, "Choose one of the listed disciplines.");
  }
  if (typeof body.portrait !== "string" || !portraits.has(body.portrait)) {
    throw new HttpError(400, "Choose one of the listed portraits.");
  }
  return {
    name,
    nameKey: name.toLocaleLowerCase("en-US"),
    ancestry: body.ancestry,
    background: body.background,
    discipline: body.discipline,
    portrait: body.portrait,
  };
}

function makeStartingAttributes(ancestry) {
  const values = Object.fromEntries(attributeKeys.map((key) => [key, 5]));
  for (const [key, amount] of Object.entries(ancestries[ancestry].bonuses)) values[key] += amount;
  return values;
}

function createCharacter(accountId, body) {
  const input = validateCharacterInput(body);
  return transaction(() => {
    const existingCharacter = db.prepare("SELECT id FROM characters WHERE account_id = ?").get(accountId);
    if (existingCharacter) throw new HttpError(409, "This account already has a character.");
    const nameTaken = db.prepare("SELECT id FROM characters WHERE name_key = ?").get(input.nameKey);
    if (nameTaken) throw new HttpError(409, "That character name is already in use.");

    const now = Math.floor(Date.now() / 1000);
    const attributes = makeStartingAttributes(input.ancestry);
    const maxHealth = 24 + attributes.vigor * 2;
    const result = db.prepare(
      "INSERT INTO characters(account_id, world_id, name, name_key, ancestry, background, discipline, portrait, level, experience, health, max_health, current_region, attributes_json, origin_hook, created_at) VALUES(?, 'ashen-marches', ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, 'greywatch', ?, ?, ?)",
    ).run(
      accountId,
      input.name,
      input.nameKey,
      ancestries[input.ancestry].label,
      backgrounds[input.background].label,
      disciplines[input.discipline],
      input.portrait,
      maxHealth,
      maxHealth,
      JSON.stringify(attributes),
      backgrounds[input.background].hook,
      now,
    );
    const characterId = Number(result.lastInsertRowid);
    const startingCrowns = 75;
    db.prepare("INSERT INTO currency_accounts(character_id, crowns) VALUES(?, ?)").run(characterId, startingCrowns);
    db.prepare(
      "INSERT INTO currency_ledger(character_id, delta, balance_after, reason, request_key, created_at) VALUES(?, ?, ?, ?, ?, ?)",
    ).run(characterId, startingCrowns, startingCrowns, "Starting purse", "starter:" + String(characterId), now);

    const addItem = db.prepare(
      "INSERT INTO inventory_items(character_id, item_key, quantity, acquired_at) VALUES(?, ?, ?, ?) ON CONFLICT(character_id, item_key) DO UPDATE SET quantity = quantity + excluded.quantity",
    );
    addItem.run(characterId, "iron-knife", 1, now);
    addItem.run(characterId, "field-rations", 2, now);
    addItem.run(characterId, backgrounds[input.background].item, 1, now);
    return getBootstrap(accountId);
  });
}

function normalizePurchase(body) {
  if (typeof body.itemKey !== "string" || !/^[a-z0-9-]{2,48}$/.test(body.itemKey)) {
    throw new HttpError(400, "Choose an item from the vendor list.");
  }
  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw new HttpError(400, "Choose a quantity from 1 to 10.");
  }
  return { itemKey: body.itemKey, quantity };
}

function purchaseItem(accountId, requestKey, body) {
  const purchase = normalizePurchase(body);
  if (typeof requestKey !== "string" || !/^[A-Za-z0-9:_-]{8,100}$/.test(requestKey)) {
    throw new HttpError(400, "This purchase is missing a valid request key.");
  }
  const character = db.prepare(
    "SELECT id, current_region FROM characters WHERE account_id = ?",
  ).get(accountId);
  if (!character) throw new HttpError(409, "Create a character before trading.");
  if (character.current_region !== "greywatch") {
    throw new HttpError(409, "The Greywatch vendor is only available in Greywatch.");
  }
  const payloadHash = sha256(JSON.stringify([purchase.itemKey, purchase.quantity]));

  return transaction(() => {
    const replay = db.prepare(
      "SELECT character_id, action, payload_hash FROM idempotency_requests WHERE request_key = ?",
    ).get(requestKey);
    if (replay) {
      if (
        replay.character_id !== character.id ||
        replay.action !== "market.purchase" ||
        replay.payload_hash !== payloadHash
      ) {
        throw new HttpError(409, "This request key was already used for a different action.");
      }
      const current = getCharacter(accountId);
      return { character: current, inventory: getInventory(character.id), replayed: true };
    }

    const item = db.prepare(
      "SELECT item_key, unit_price FROM item_definitions WHERE item_key = ? AND vendor_available = 1",
    ).get(purchase.itemKey);
    if (!item) throw new HttpError(404, "That item is not offered by this vendor.");
    const cost = item.unit_price * purchase.quantity;
    const balance = db.prepare("SELECT crowns FROM currency_accounts WHERE character_id = ?").get(character.id);
    if (!balance || balance.crowns < cost) throw new HttpError(409, "You do not have enough crowns.");
    const owned = db.prepare(
      "SELECT quantity FROM inventory_items WHERE character_id = ? AND item_key = ?",
    ).get(character.id, item.item_key);
    if (owned && owned.quantity + purchase.quantity > 9999) {
      throw new HttpError(409, "There is no room for more of that item.");
    }

    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      "INSERT INTO idempotency_requests(request_key, character_id, action, payload_hash, created_at) VALUES(?, ?, 'market.purchase', ?, ?)",
    ).run(requestKey, character.id, payloadHash, now);
    const newBalance = balance.crowns - cost;
    db.prepare("UPDATE currency_accounts SET crowns = ? WHERE character_id = ?")
      .run(newBalance, character.id);
    db.prepare(
      "INSERT INTO currency_ledger(character_id, delta, balance_after, reason, request_key, created_at) VALUES(?, ?, ?, ?, ?, ?)",
    ).run(character.id, -cost, newBalance, "Greywatch vendor purchase: " + item.item_key, requestKey, now);
    db.prepare(
      "INSERT INTO inventory_items(character_id, item_key, quantity, acquired_at) VALUES(?, ?, ?, ?) ON CONFLICT(character_id, item_key) DO UPDATE SET quantity = quantity + excluded.quantity",
    ).run(character.id, item.item_key, purchase.quantity, now);

    return {
      character: getCharacter(accountId),
      inventory: getInventory(character.id),
      replayed: false,
    };
  });
}

function lookupStatic(pathname) {
  const routes = {
    "/": ["index.html", "text/html; charset=utf-8"],
    "/styles.css": ["styles.css", "text/css; charset=utf-8"],
    "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  };
  const route = routes[pathname];
  if (!route) return null;
  return { path: join(publicDirectory, route[0]), type: route[1] };
}

async function handleRequest(req, res) {
  setSecurityHeaders(res);
  const requestUrl = new URL(req.url || "/", "http://" + (req.headers.host || "localhost"));
  const pathname = requestUrl.pathname;

  if (req.method === "GET") {
    const file = lookupStatic(pathname);
    if (file) {
      const contents = readFileSync(file.path);
      res.writeHead(200, {
        "Content-Type": file.type,
        "Cache-Control": "no-cache",
      });
      res.end(contents);
      return;
    }
    if (pathname === "/api/session") {
      const session = getSession(req);
      sendJson(res, 200, {
        authenticated: Boolean(session),
        account: session ? { username: session.username } : null,
      });
      return;
    }
    if (pathname === "/api/bootstrap") {
      const session = requireSession(req);
      sendJson(res, 200, getBootstrap(session.account_id));
      return;
    }
    sendJson(res, 404, { error: "Not found." });
    return;
  }

  if (req.method !== "POST" || !pathname.startsWith("/api/")) {
    sendJson(res, 404, { error: "Not found." });
    return;
  }

  requireSameOrigin(req);

  if (pathname === "/api/auth/register") {
    chargeAuthAttempt(req);
    const body = await readJson(req);
    const username = normalizeUsername(body.username);
    const password = validatePassword(body.password);
    const salt = randomBytes(16).toString("hex");
    const passwordHash = await hashPassword(password, salt);
    const now = Math.floor(Date.now() / 1000);
    let accountId;
    try {
      accountId = Number(db.prepare(
        "INSERT INTO accounts(username, username_key, password_salt, password_hash, created_at) VALUES(?, ?, ?, ?, ?)",
      ).run(username.username, username.key, salt, passwordHash, now).lastInsertRowid);
    } catch (error) {
      if (String(error.message || "").includes("accounts.username_key")) {
        throw new HttpError(409, "That username is already registered.");
      }
      throw error;
    }
    issueSession(accountId, res);
    sendJson(res, 201, { authenticated: true, needsCharacter: true });
    return;
  }

  if (pathname === "/api/auth/login") {
    chargeAuthAttempt(req);
    const body = await readJson(req);
    const username = normalizeUsername(body.username);
    const password = validatePassword(body.password);
    const account = db.prepare(
      "SELECT id, username, password_salt, password_hash FROM accounts WHERE username_key = ?",
    ).get(username.key);
    const candidate = await hashPassword(password, account ? account.password_salt : fakeSalt);
    const expected = account ? Buffer.from(account.password_hash, "hex") : Buffer.alloc(64);
    const candidateBuffer = Buffer.from(candidate, "hex");
    const valid = timingSafeEqual(candidateBuffer, expected);
    if (!account || !valid) throw new HttpError(401, "Username or password was not recognized.");
    issueSession(account.id, res);
    const character = getCharacter(account.id);
    sendJson(res, 200, { authenticated: true, needsCharacter: !character });
    return;
  }

  if (pathname === "/api/auth/logout") {
    const token = parseCookies(req).sid || "";
    if (/^[a-f0-9]{64}$/i.test(token)) {
      db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
    }
    setSessionCookie(res, "", 0);
    sendJson(res, 200, { authenticated: false });
    return;
  }

  if (pathname === "/api/characters") {
    const session = requireSession(req);
    const body = await readJson(req);
    const result = createCharacter(session.account_id, body);
    sendJson(res, 201, result);
    return;
  }

  if (pathname === "/api/market/purchase") {
    const session = requireSession(req);
    const body = await readJson(req);
    const result = purchaseItem(session.account_id, req.headers["idempotency-key"], body);
    sendJson(res, 200, result);
    return;
  }

  sendJson(res, 404, { error: "Not found." });
}

export async function dispatchRequest(req, res) {
  try {
    await handleRequest(req, res);
  } catch (error) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }
    console.error("Request failed:", error.message);
    sendJson(res, 500, { error: "The request could not be completed." });
  }
}

const server = createServer(dispatchRequest);
const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  server.listen(port, host, () => {
    console.log("The Shattered Concord is ready at http://" + host + ":" + String(port));
  });
  function stop() {
    server.close(() => {
      closeDatabase();
      process.exit(0);
    });
  }
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
