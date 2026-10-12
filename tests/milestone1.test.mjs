import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import test from "node:test";

function invoke(dispatchRequest, method, path, options) {
  const settings = options || {};
  const request = new EventEmitter();
  request.method = method;
  request.url = path;
  request.headers = {
    host: "test.local",
    origin: "http://test.local",
    ...(settings.body === undefined ? {} : { "content-type": "application/json" }),
    ...(settings.cookie ? { cookie: settings.cookie } : {}),
    ...(settings.headers || {}),
  };
  request.socket = { encrypted: false, remoteAddress: "127.0.0.1" };

  let resolveResponse;
  const responsePromise = new Promise((resolveValue) => {
    resolveResponse = resolveValue;
  });
  const response = {
    headers: {},
    statusCode: 0,
    headersSent: false,
    body: "",
    setHeader(name, value) {
      this.headers[name] = value;
    },
    writeHead(status, headers) {
      this.statusCode = status;
      this.headersSent = true;
      Object.assign(this.headers, headers || {});
    },
    end(body) {
      this.body = body === undefined ? "" : String(body);
      resolveResponse(this);
    },
    destroy() {
      resolveResponse(this);
    },
  };

  const completion = dispatchRequest(request, response);
  if (settings.body !== undefined) {
    setImmediate(() => {
      request.emit("data", Buffer.from(JSON.stringify(settings.body)));
      request.emit("end");
    });
  }
  return Promise.all([completion, responsePromise]).then((values) => values[1]);
}

function json(response) {
  return JSON.parse(response.body);
}

function cookieFrom(response) {
  const raw = response.headers["Set-Cookie"] || "";
  const match = raw.match(/(?:^|;\s*)sid=([^;]+)/);
  assert.ok(match && match[1], "Expected a server-side session cookie.");
  return "sid=" + match[1];
}

test("Milestone 1 persists accounts, characters, shared world, and safe purchases", async (t) => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "shattered-concord-test-"));
  const databasePath = join(tempDirectory, "milestone1.sqlite");
  const priorDbPath = process.env.GAME_DB_PATH;
  const priorOrigin = process.env.PUBLIC_ORIGIN;
  process.env.GAME_DB_PATH = databasePath;
  process.env.PUBLIC_ORIGIN = "http://test.local";

  let database = null;
  let databaseClosed = false;
  t.after(() => {
    if (database && !databaseClosed) {
      try { database.close(); } catch {}
    }
    if (priorDbPath === undefined) delete process.env.GAME_DB_PATH;
    else process.env.GAME_DB_PATH = priorDbPath;
    if (priorOrigin === undefined) delete process.env.PUBLIC_ORIGIN;
    else process.env.PUBLIC_ORIGIN = priorOrigin;
    const tempRoot = resolve(tmpdir()) + sep;
    const target = resolve(tempDirectory);
    if (target.startsWith(tempRoot)) rmSync(target, { recursive: true, force: true });
  });

  const { dispatchRequest } = await import("../server.mjs");
  const dbModule = await import("../db.mjs");
  database = dbModule.db;

  const unauthenticated = await invoke(dispatchRequest, "POST", "/api/market/purchase", {
    body: { itemKey: "herbal-poultice", quantity: 1 },
    headers: { "idempotency-key": "unauthorized-001" },
  });
  assert.equal(unauthenticated.statusCode, 401, "A missing session must not mutate inventory.");

  const firstRegistration = await invoke(dispatchRequest, "POST", "/api/auth/register", {
    body: { username: "MarcherOne", password: "long passphrase for account one" },
  });
  assert.equal(firstRegistration.statusCode, 201);
  const firstCookie = cookieFrom(firstRegistration);

  const firstCharacterResponse = await invoke(dispatchRequest, "POST", "/api/characters", {
    cookie: firstCookie,
    body: {
      name: "Mara Venn",
      ancestry: "thornbound",
      background: "wandering_hunter",
      discipline: "ranger",
      portrait: "raven",
    },
  });
  assert.equal(firstCharacterResponse.statusCode, 201);
  const firstCreated = json(firstCharacterResponse);
  assert.equal(firstCreated.character.crowns, 75);
  assert.equal(firstCreated.character.currentRegion, "greywatch");
  assert.equal(firstCreated.world.id, "ashen-marches");
  assert.equal(firstCreated.inventory.find((item) => item.itemKey === "field-rations").quantity, 2);

  const duplicateCharacter = await invoke(dispatchRequest, "POST", "/api/characters", {
    cookie: firstCookie,
    body: {
      name: "Mara Venn",
      ancestry: "thornbound",
      background: "wandering_hunter",
      discipline: "ranger",
      portrait: "raven",
    },
  });
  assert.equal(duplicateCharacter.statusCode, 409, "An account may not create duplicate characters.");

  const secondRegistration = await invoke(dispatchRequest, "POST", "/api/auth/register", {
    body: { username: "MarcherTwo", password: "long passphrase for account two" },
  });
  assert.equal(secondRegistration.statusCode, 201);
  const secondCookie = cookieFrom(secondRegistration);
  const secondCreatedResponse = await invoke(dispatchRequest, "POST", "/api/characters", {
    cookie: secondCookie,
    body: {
      name: "Tovan Reed",
      ancestry: "stoneborn",
      background: "former_soldier",
      discipline: "mercenary",
      portrait: "tower",
    },
  });
  assert.equal(secondCreatedResponse.statusCode, 201);
  const secondCreated = json(secondCreatedResponse);
  assert.equal(secondCreated.character.crowns, 75);
  assert.equal(secondCreated.world.id, firstCreated.world.id);

  const sharedWorldResponse = await invoke(dispatchRequest, "GET", "/api/bootstrap", { cookie: firstCookie });
  assert.equal(sharedWorldResponse.statusCode, 200);
  const sharedWorld = json(sharedWorldResponse);
  const publicNames = sharedWorld.players.map((player) => player.name);
  assert.ok(publicNames.includes("Mara Venn"));
  assert.ok(publicNames.includes("Tovan Reed"));
  assert.equal(Object.hasOwn(sharedWorld.account, "password_hash"), false);

  const purchaseKey = "milestone1-buy-herb-001";
  const purchaseResponse = await invoke(dispatchRequest, "POST", "/api/market/purchase", {
    cookie: firstCookie,
    headers: { "idempotency-key": purchaseKey },
    body: { itemKey: "herbal-poultice", quantity: 2 },
  });
  assert.equal(purchaseResponse.statusCode, 200);
  const purchase = json(purchaseResponse);
  assert.equal(purchase.character.crowns, 45);
  assert.equal(purchase.inventory.find((item) => item.itemKey === "herbal-poultice").quantity, 2);
  assert.equal(purchase.replayed, false);

  const replayResponse = await invoke(dispatchRequest, "POST", "/api/market/purchase", {
    cookie: firstCookie,
    headers: { "idempotency-key": purchaseKey },
    body: { itemKey: "herbal-poultice", quantity: 2 },
  });
  assert.equal(replayResponse.statusCode, 200);
  const replay = json(replayResponse);
  assert.equal(replay.character.crowns, 45);
  assert.equal(replay.inventory.find((item) => item.itemKey === "herbal-poultice").quantity, 2);
  assert.equal(replay.replayed, true);

  const keyReuseResponse = await invoke(dispatchRequest, "POST", "/api/market/purchase", {
    cookie: firstCookie,
    headers: { "idempotency-key": purchaseKey },
    body: { itemKey: "ash-cloak", quantity: 1 },
  });
  assert.equal(keyReuseResponse.statusCode, 409, "A request key cannot be reused for another purchase.");

  const loginResponse = await invoke(dispatchRequest, "POST", "/api/auth/login", {
    body: { username: "MarcherOne", password: "long passphrase for account one" },
  });
  assert.equal(loginResponse.statusCode, 200, "Passwords should authenticate after registration.");
  const loginCookie = cookieFrom(loginResponse);
  const sessionResponse = await invoke(dispatchRequest, "GET", "/api/session", { cookie: loginCookie });
  assert.equal(json(sessionResponse).authenticated, true);

  database.exec("PRAGMA wal_checkpoint(FULL)");
  database.close();
  databaseClosed = true;
  const reopened = new DatabaseSync(databasePath);
  const savedCharacter = reopened.prepare(
    "SELECT c.name, ca.crowns FROM characters c JOIN currency_accounts ca ON ca.character_id = c.id WHERE c.name = ?",
  ).get("Mara Venn");
  assert.equal(savedCharacter.name, "Mara Venn");
  assert.equal(savedCharacter.crowns, 45);
  const savedItem = reopened.prepare(
    "SELECT quantity FROM inventory_items WHERE character_id = (SELECT id FROM characters WHERE name = ?) AND item_key = ?",
  ).get("Mara Venn", "herbal-poultice");
  assert.equal(savedItem.quantity, 2);
  const savedSessionCount = reopened.prepare(
    "SELECT COUNT(*) AS count FROM sessions WHERE account_id = (SELECT id FROM accounts WHERE username_key = ?)",
  ).get("marcherone").count;
  assert.equal(savedSessionCount, 2, "Account sessions are stored outside the browser.");
  reopened.close();
});
