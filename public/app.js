const appRoot = document.getElementById("app");
const toast = document.getElementById("toast");

const state = {
  data: null,
  view: "overview",
  selectedRegion: null,
  authMode: "register",
};

const navItems = [
  ["overview", "Overview", "⌂"],
  ["character", "Character", "✦"],
  ["inventory", "Inventory & market", "◇"],
  ["world", "World map", "⌖"],
  ["players", "Adventurers", "♙"],
];
const ancestryOptions = [
  ["marcher", "Marcher — adaptable, at home in the borderlands"],
  ["emberkin", "Emberkin — resilient to heat and ley-scar"],
  ["stoneborn", "Stoneborn — practiced in craft and fortification"],
  ["thornbound", "Thornbound — keen trackers of woodland paths"],
  ["duskmarked", "Duskmarked — underworld ties, lawful scrutiny"],
  ["wyrmblooded", "Wyrmblooded — affinity for draconic relics"],
];
const backgroundOptions = [
  ["former_soldier", "Former soldier"],
  ["street_runner", "Street runner"],
  ["disgraced_heir", "Disgraced heir"],
  ["traveling_factor", "Traveling factor"],
  ["hedge_apprentice", "Hedge apprentice"],
  ["escaped_prisoner", "Escaped prisoner"],
  ["wandering_hunter", "Wandering hunter"],
  ["exiled_heir", "Exiled heir"],
];
const disciplineOptions = [
  ["assassin", "Assassin"],
  ["mercenary", "Mercenary"],
  ["warrior", "Warrior"],
  ["mage", "Mage"],
  ["merchant", "Merchant"],
  ["noble", "Noble"],
  ["ranger", "Ranger"],
  ["artificer", "Engineer / artificer"],
];
const portraitOptions = [
  ["ember", "The Ember"],
  ["raven", "The Raven"],
  ["moon", "The Moon"],
  ["wolf", "The Wolf"],
  ["tower", "The Tower"],
  ["key", "The Key"],
];
const portraitGlyphs = {
  ember: "✦",
  raven: "♜",
  moon: "☾",
  wolf: "♧",
  tower: "♖",
  key: "⚿",
};
const attributeLabels = {
  might: "Might",
  finesse: "Finesse",
  vigor: "Vigor",
  reason: "Reason",
  insight: "Insight",
  presence: "Presence",
};

function el(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = String(text);
  return element;
}
function append(parent, ...children) {
  for (const child of children) if (child) parent.append(child);
  return parent;
}
function makeButton(label, className, action) {
  const button = el("button", className || "button", label);
  button.type = "button";
  button.addEventListener("click", action);
  return button;
}
function makeField(labelText, control, hintText) {
  const wrapper = el("div", "field");
  const label = el("label", "", labelText);
  label.htmlFor = control.id;
  append(wrapper, label, control);
  if (hintText) wrapper.append(el("p", "form-hint", hintText));
  return wrapper;
}
function makeSelect(id, choices) {
  const select = el("select");
  select.id = id;
  select.name = id;
  for (const [value, label] of choices) {
    const option = el("option", "", label);
    option.value = value;
    select.append(option);
  }
  return select;
}
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("visible"), 3200);
}
async function api(path, options) {
  const config = options || {};
  const headers = { Accept: "application/json" };
  if (config.body !== undefined) headers["Content-Type"] = "application/json";
  if (config.idempotencyKey) headers["Idempotency-Key"] = config.idempotencyKey;
  const response = await fetch(path, {
    method: config.method || "GET",
    credentials: "same-origin",
    headers,
    body: config.body === undefined ? undefined : JSON.stringify(config.body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The request could not be completed.");
  return result;
}
function brandBlock(compact) {
  const wrapper = el("div", compact ? "brand-lockup topbar-brand" : "auth-brand");
  const seal = el("div", "brand-seal");
  seal.append(el("span", "", "S"));
  const names = el("div");
  append(names,
    el("p", "brand-name", "The Shattered Concord"),
    el("p", "brand-caption", "The Ashen Marches"));
  return append(wrapper, seal, names);
}
function renderLoading(message) {
  appRoot.replaceChildren();
  const loading = el("div", "loading");
  const group = el("div");
  group.append(el("div", "loading-mark", "✦"));
  group.append(el("p", "", message || "Opening the Marches…"));
  loading.append(group);
  appRoot.append(loading);
}
function renderAuth(mode) {
  state.authMode = mode;
  appRoot.replaceChildren();
  const shell = el("main", "auth-shell");
  const story = el("section", "auth-story");
  append(story, brandBlock(false), el("p", "eyebrow", "A persistent fantasy world"));
  const title = el("h1");
  title.append(document.createTextNode("Start as nothing."));
  title.append(document.createElement("br"));
  const second = document.createElement("em");
  second.textContent = "Build something.";
  title.append(second);
  append(story, title,
    el("p", "auth-story-copy", "The Concord is broken. Border lords bargain with old powers, roads vanish into haunted country, and every name begins with a first step. Enter a shared world built for choices that leave a mark."),
    el("p", "auth-mantra", "The Marches remember what you do."));

  const card = el("section", "auth-card");
  const tabs = el("div", "auth-tabs");
  tabs.append(
    makeButton("Create account", "auth-tab" + (mode === "register" ? " active" : ""), () => renderAuth("register")),
    makeButton("Sign in", "auth-tab" + (mode === "login" ? " active" : ""), () => renderAuth("login")));
  const heading = el("h2", "", mode === "register" ? "Claim your place" : "Return to the Marches");
  const subheading = el("p", "small", mode === "register"
    ? "Your account and character are saved on this world server."
    : "Your character is waiting where you left them.");
  const form = el("form", "form-stack");
  const username = el("input");
  username.id = "username";
  username.name = "username";
  username.autocomplete = "username";
  username.required = true;
  username.minLength = 3;
  username.maxLength = 20;
  username.placeholder = "3–20 characters";
  const password = el("input");
  password.id = "password";
  password.name = "password";
  password.type = "password";
  password.autocomplete = mode === "register" ? "new-password" : "current-password";
  password.required = true;
  password.minLength = 12;
  password.maxLength = 128;
  password.placeholder = "At least 12 characters";
  form.append(makeField("Username", username), makeField("Password", password));
  if (mode === "register") form.append(el("p", "form-hint", "Use a unique username and a long passphrase. Email is not collected in this foundation."));
  const error = el("p", "form-error");
  error.setAttribute("role", "alert");
  const submit = el("button", "button full", mode === "register" ? "Create account" : "Sign in");
  submit.type = "submit";
  form.append(error, submit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    submit.disabled = true;
    submit.textContent = mode === "register" ? "Creating account…" : "Signing in…";
    try {
      await api("/api/auth/" + mode, {
        method: "POST",
        body: { username: username.value, password: password.value },
      });
      await loadAccount();
    } catch (requestError) {
      error.textContent = requestError.message;
      submit.disabled = false;
      submit.textContent = mode === "register" ? "Create account" : "Sign in";
    }
  });
  append(card, tabs, heading, subheading, form);
  shell.append(story, card);
  appRoot.append(shell);
}
function renderCharacterCreation() {
  appRoot.replaceChildren();
  const wrap = el("main", "creation-wrap");
  const top = el("div");
  append(top, brandBlock(true), el("p", "eyebrow", "Character creation"));
  const card = el("section", "creation-card");
  const heading = el("h1", "", "Make your first mark");
  const copy = el("p", "creation-intro", "Choose an origin and a direction, not a permanent class. Your starting attributes stay modest; the Marches will shape what comes next.");
  const form = el("form", "");
  const grid = el("div", "creation-grid");

  const name = el("input");
  name.id = "character-name";
  name.name = "name";
  name.autocomplete = "off";
  name.maxLength = 18;
  name.minLength = 3;
  name.required = true;
  name.placeholder = "A name known only to you";
  grid.append(makeField("Character name", name, "3–18 letters, spaces, apostrophes, or hyphens. Names are unique across this world."));
  grid.append(makeField("Ancestry", makeSelect("ancestry", ancestryOptions), "Each ancestry shifts two attributes by one point."));
  grid.append(makeField("Background", makeSelect("background", backgroundOptions), "Your background adds a keepsake and a lead in Greywatch."));
  grid.append(makeField("Starting discipline", makeSelect("discipline", disciplineOptions), "A first direction. Skills can broaden as you advance."));
  grid.append(makeField("Portrait sigil", makeSelect("portrait", portraitOptions)));
  const preview = el("div", "hook-box wide");
  preview.append(el("p", "eyebrow", "Your first purse"));
  preview.append(el("p", "", "75 crowns, an iron road-knife, field rations, and a keepsake linked to your background."));
  grid.append(preview);

  const error = el("p", "form-error");
  error.setAttribute("role", "alert");
  const submit = el("button", "button", "Begin in Greywatch");
  submit.type = "submit";
  form.append(grid, error, submit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    submit.disabled = true;
    submit.textContent = "Preparing your arrival…";
    try {
      state.data = await api("/api/characters", {
        method: "POST",
        body: {
          name: name.value,
          ancestry: form.elements.ancestry.value,
          background: form.elements.background.value,
          discipline: form.elements.discipline.value,
          portrait: form.elements.portrait.value,
        },
      });
      state.view = "overview";
      renderGame();
    } catch (requestError) {
      error.textContent = requestError.message;
      submit.disabled = false;
      submit.textContent = "Begin in Greywatch";
    }
  });
  append(card, heading, copy, form);
  append(wrap, top, card);
  appRoot.append(wrap);
}
function renderGame() {
  if (!state.data || !state.data.character) {
    renderCharacterCreation();
    return;
  }
  appRoot.replaceChildren();
  const character = state.data.character;
  const shell = el("div", "game-shell");
  const topbar = el("header", "topbar");
  const status = el("div", "topbar-status");
  const statusValues = [
    ["Adventurer", "Level " + character.level, ""],
    ["Vitality", character.health + " / " + character.maxHealth, ""],
    ["Purse", character.crowns + " crowns", "gold"],
    ["Location", character.regionName, ""],
  ];
  statusValues.forEach(([label, value, extra]) => {
    const block = el("div", "status-block");
    block.append(el("span", "status-label", label), el("span", "status-value" + (extra ? " " + extra : ""), value));
    status.append(block);
  });

  const accountArea = el("div", "account-area");
  accountArea.append(el("span", "account-name", state.data.account.username));
  accountArea.append(makeButton("Sign out", "signout", async () => {
    try {
      await api("/api/auth/logout", { method: "POST", body: {} });
      state.data = null;
      state.view = "overview";
      renderAuth("login");
    } catch (requestError) {
      showToast(requestError.message);
    }
  }));
  topbar.append(brandBlock(true), status, accountArea);

  const layout = el("div", "game-layout");
  const sidebar = el("aside", "sidebar");
  sidebar.append(el("p", "side-section-label", "Your command"));
  const nav = el("nav", "nav-list");
  nav.setAttribute("aria-label", "Main navigation");
  for (const [key, label, icon] of navItems) {
    const button = makeButton("", "nav-button" + (state.view === key ? " active" : ""), () => {
      state.view = key;
      renderGame();
    });
    button.setAttribute("aria-current", state.view === key ? "page" : "false");
    button.append(el("span", "nav-icon", icon), el("span", "", label));
    nav.append(button);
  }
  const note = el("div", "sidebar-note");
  note.append(el("p", "eyebrow", "Shared world"));
  note.append(el("p", "", "One persistent Marches. Each account brings its own adventurer."));
  sidebar.append(nav, note);

  const main = el("main", "main-content");
  switch (state.view) {
    case "character":
      main.append(renderCharacterPage());
      break;
    case "inventory":
      main.append(renderInventoryPage());
      break;
    case "world":
      main.append(renderWorldPage());
      break;
    case "players":
      main.append(renderPlayersPage());
      break;
    default:
      main.append(renderOverviewPage());
  }
  layout.append(sidebar, main);
  shell.append(topbar, layout);
  appRoot.append(shell);
}

function pageHeading(eyebrow, title, subtitle) {
  const wrapper = el("div", "page-heading");
  const text = el("div");
  text.append(el("p", "kicker", eyebrow), el("h1", "", title), el("p", "", subtitle));
  wrapper.append(text);
  return wrapper;
}
function statCard(label, number, support, emphasize) {
  const card = el("section", "stat-card");
  card.append(el("span", "status-label", label));
  card.append(el("div", "stat-number" + (emphasize ? " gold" : ""), number));
  card.append(el("div", "stat-support", support));
  return card;
}
function sectionTitle(title, linkText, action) {
  const row = el("div", "section-title-row");
  row.append(el("h2", "", title));
  if (linkText && action) row.append(makeButton(linkText, "inline-link", action));
  return row;
}
function panel(title, subtitle) {
  const wrapper = el("section", "panel");
  const header = el("div", "panel-header");
  const info = el("div");
  info.append(el("h2", "panel-title", title));
  if (subtitle) info.append(el("p", "", subtitle));
  header.append(info);
  wrapper.append(header);
  return wrapper;
}
function threatBadge(level) {
  const badge = el("span", "threat", "Threat " + level + " / 5");
  badge.setAttribute("aria-label", "Threat level " + level + " out of 5");
  return badge;
}
function renderOverviewPage() {
  const character = state.data.character;
  const page = el("div");
  page.append(pageHeading("Greywatch · The Ashen Marches", "A new name in old lands", "The road is broken, the wards are failing, and your first choice is still yours."));
  const stats = el("div", "stats-grid");
  stats.append(
    statCard("Standing", "Level " + character.level, character.discipline + " · " + character.ancestry, false),
    statCard("Vitality", character.health + " / " + character.maxHealth, "You are fit to travel", false),
    statCard("Purse", String(character.crowns), "Crowns", true),
    statCard("Current place", character.regionName, "Neutral market town", false));
  page.append(stats);

  const introGrid = el("div", "overview-grid");
  const lead = el("section", "panel lead-card");
  lead.append(el("p", "eyebrow", "Your first chapter"));
  lead.append(el("h2", "", "The Marches are open."));
  lead.append(el("p", "", "Start with the tools you have. Learn the roads, make a name, and decide what kind of power you want to build. The world map already holds every region in the frontier."));
  lead.append(makeButton("Survey the world", "button secondary", () => {
    state.view = "world";
    renderGame();
  }));
  introGrid.append(lead);

  const arrival = panel("An old connection", "Your background leaves one thread to follow.");
  const hook = el("div", "hook-box");
  hook.append(el("p", "", character.originHook));
  arrival.append(hook, el("p", "small", "Contacts and contracts arrive in later milestones. This lead is saved with your character."));
  introGrid.append(arrival);
  page.append(introGrid);

  page.append(sectionTitle("The frontier", "Open map", () => {
    state.view = "world";
    renderGame();
  }));
  const frontier = panel("Known regions", "Inspect terrain, control, threat, and resources.");
  const list = el("div", "region-list");
  for (const region of state.data.world.regions.slice(0, 4)) {
    const row = el("div", "region-row");
    const nameWrap = el("div");
    nameWrap.append(el("strong", "", region.name), el("div", "small muted", region.controller));
    row.append(nameWrap, threatBadge(region.threat));
    list.append(row);
  }
  frontier.append(list);
  page.append(frontier);

  page.append(sectionTitle("Shared world", "View adventurers", () => {
    state.view = "players";
    renderGame();
  }));
  const shared = panel("Other names are entering the Marches", "Public character profiles from this world.");
  const previewPlayers = state.data.players
    .filter((player) => player.name !== character.name)
    .slice(0, 3);
  if (previewPlayers.length === 0) {
    shared.append(el("div", "empty-state", "No adventurers have arrived yet. Your name will be the first in the chronicle."));
  } else {
    const rows = el("div", "activity-list");
    for (const player of previewPlayers) {
      const row = el("div", "activity-item");
      const info = el("div");
      info.append(el("strong", "", player.name));
      info.append(el("p", "", "Level " + player.level + " " + player.discipline + " · " + player.regionName));
      rows.append(append(row, info, el("span", "badge", player.ancestry)));
    }
    shared.append(rows);
  }
  page.append(shared, renderLaterSystems());
  page.append(el("p", "footer-note", "Milestone 1 · The world is persistent; each later system will build on these records."));
  return page;
}
function renderLaterSystems() {
  const wrapper = el("div");
  wrapper.append(sectionTitle("Beyond Greywatch", null, null));
  const grid = el("div", "system-preview-grid");
  const systems = [
    ["✧", "Contracts", "Investigate, prepare, and resolve missions with lasting consequences."],
    ["⚒", "Crafting", "Turn gathered materials into equipment and useful goods."],
    ["♜", "Organizations", "Gather allies, share duties, and build collective influence."],
    ["⌂", "Empire", "Found a settlement and invest in the frontier."],
    ["⚔", "Armies", "Recruit, supply, and command forces across the region."],
    ["☾", "Diplomacy", "Make agreements with factions and rival powers."],
  ];
  for (const [icon, name, description] of systems) {
    const card = el("section", "preview-card");
    card.append(el("div", "preview-icon", icon), el("h3", "", name), el("p", "", description));
    grid.append(card);
  }
  wrapper.append(grid);
  return wrapper;
}
function renderCharacterPage() {
  const character = state.data.character;
  const page = el("div");
  page.append(pageHeading("Character record", character.name, "Your profile, starting talents, and the first thread attached to your past."));
  const hero = el("section", "profile-hero");
  const portrait = el("div", "portrait", portraitGlyphs[character.portrait] || "✦");
  const summary = el("div");
  summary.append(el("p", "eyebrow", "Level " + character.level + " · " + character.discipline));
  summary.append(el("h2", "", character.name));
  summary.append(el("p", "small", character.ancestry + " · " + character.background));
  const badges = el("div", "profile-meta");
  badges.append(el("span", "badge current", character.regionName), el("span", "badge", "Public profile"));
  summary.append(badges);
  hero.append(portrait, summary);
  page.append(hero);

  page.append(sectionTitle("Attributes", null, null));
  const attributes = el("div", "attribute-grid");
  for (const key of Object.keys(attributeLabels)) {
    const score = character.attributes[key];
    const card = el("div", "attribute-card");
    const top = el("div", "attribute-top");
    top.append(el("span", "attribute-name", attributeLabels[key]), el("span", "attribute-score", score));
    const track = el("div", "attribute-track");
    const fill = el("div", "attribute-fill");
    fill.style.width = Math.min(100, Math.round((score / 10) * 100)) + "%";
    track.append(fill);
    card.append(top, track);
    attributes.append(card);
  }
  page.append(attributes);

  page.append(sectionTitle("Character details", null, null));
  const columns = el("div", "panel-grid");
  const identity = panel("Identity", "A starting direction, open to change.");
  const details = [
    ["Ancestry", character.ancestry],
    ["Background", character.background],
    ["Discipline", character.discipline],
    ["Experience", String(character.experience) + " XP"],
  ];
  const list = el("div", "activity-list");
  for (const [key, value] of details) {
    const row = el("div", "activity-item");
    row.append(el("strong", "", key), el("span", "small muted", value));
    list.append(row);
  }
  identity.append(list);
  const connection = panel("A thread from your past", "A starting lead connected to your background.");
  connection.append(el("div", "hook-box", character.originHook));
  connection.append(el("p", "small", "This is a saved story hook. NPC interactions arrive with the quest systems."));
  columns.append(identity, connection);
  page.append(columns);
  page.append(el("p", "footer-note", "Training, skill trees, equipment effects, and achievements are planned for Milestone 2."));
  return page;
}

function itemSymbol(category) {
  const symbols = {
    Weapon: "⚔",
    Provision: "◇",
    Clothing: "◈",
    Supply: "✚",
    Material: "✧",
    Token: "⌑",
    Tool: "⚒",
    "Quest item": "✦",
  };
  return symbols[category] || "✧";
}
function itemRow(item) {
  const row = el("div", "item-row");
  row.append(el("div", "item-mark", itemSymbol(item.category)));
  const details = el("div");
  details.append(el("div", "item-name", item.name));
  details.append(el("p", "item-description", item.description), el("span", "badge", item.rarity));
  row.append(details, el("div", "item-quantity", "×" + item.quantity));
  return row;
}
function renderInventoryPage() {
  const page = el("div");
  page.append(pageHeading("Possessions", "Inventory & market", "Your carried goods and the Greywatch vendor's current wares."));
  const totalItems = state.data.inventory.reduce((sum, item) => sum + item.quantity, 0);
  const summary = el("div", "stats-grid");
  summary.append(
    statCard("Crowns", String(state.data.character.crowns), "Server-held balance", true),
    statCard("Item stacks", String(state.data.inventory.length), "Distinct possessions", false),
    statCard("Carried goods", String(totalItems), "Total units", false),
    statCard("Trade location", "Greywatch", "Neutral market access", false));
  page.append(summary);

  page.append(sectionTitle("Your inventory", null, null));
  const inventory = panel("Carried items", "Starter kit and background keepsake.");
  if (!state.data.inventory.length) {
    inventory.append(el("div", "empty-state", "Your pack is empty."));
  } else {
    const list = el("div", "inventory-list");
    state.data.inventory.forEach((item) => list.append(itemRow(item)));
    inventory.append(list);
  }
  page.append(inventory);

  page.append(sectionTitle("Greywatch vendor", null, null));
  const market = panel("The Lantern Market", state.data.character.currentRegion === "greywatch"
    ? "Prices are fixed for this foundation. Each purchase is committed by the server."
    : "Return to Greywatch to trade.");
  if (!state.data.vendor.length) {
    market.append(el("div", "empty-state", "The vendor is not available from your current region."));
  } else {
    for (const item of state.data.vendor) {
      const row = el("div", "market-row");
      const details = el("div");
      details.append(el("div", "item-name", item.name));
      details.append(el("p", "item-description", item.description));
      const price = el("div", "market-price", item.price + " crowns");
      const action = el("div", "market-action");
      const quantity = el("input", "quantity-input");
      quantity.type = "number";
      quantity.min = "1";
      quantity.max = "10";
      quantity.value = "1";
      quantity.setAttribute("aria-label", "Quantity of " + item.name);
      const buy = makeButton("Buy", "button small-button", async () => {
        const randomKey = window.crypto && window.crypto.randomUUID
          ? window.crypto.randomUUID()
          : String(Date.now()) + "-" + Math.random().toString(16).slice(2);
        buy.disabled = true;
        try {
          await api("/api/market/purchase", {
            method: "POST",
            idempotencyKey: randomKey,
            body: { itemKey: item.itemKey, quantity: Number(quantity.value) },
          });
          state.data = await api("/api/bootstrap");
          renderGame();
          showToast("Purchase recorded. Your purse and pack have been updated.");
        } catch (requestError) {
          showToast(requestError.message);
          buy.disabled = false;
        }
      });
      action.append(quantity, buy);
      row.append(details, price, action);
      market.append(row);
    }
  }
  page.append(market);
  page.append(el("p", "footer-note", "Market listings, player trades, equipment, and item sales arrive in later milestones."));
  return page;
}
function regionThreatClass(level) {
  return level <= 2 ? "low" : level >= 4 ? "high" : "";
}
function renderWorldPage() {
  const page = el("div");
  page.append(pageHeading("The frontier", "World map", "Inspect the roads, holdings, resources, and dangers known to the Greywatch Compact."));
  const mapPanel = panel("The Ashen Marches", "Select a region to inspect. The frontier is a shared world.");
  const map = el("div", "region-map");
  const selectedId = state.selectedRegion || state.data.character.currentRegion;
  const selected = state.data.world.regions.find((region) => region.id === selectedId) || state.data.world.regions[0];
  for (const region of state.data.world.regions) {
    const button = makeButton("", "map-region" +
      (region.id === selected.id ? " selected" : "") +
      (region.isCurrent ? " current" : ""), () => {
        state.selectedRegion = region.id;
        renderGame();
      });
    button.append(el("h3", "", region.name), el("p", "", region.controller));
    button.append(el("span", "map-threat " + regionThreatClass(region.threat), "Threat " + region.threat));
    if (region.isCurrent) button.append(el("span", "badge current", "You are here"));
    map.append(button);
  }
  mapPanel.append(map);
  page.append(mapPanel);

  const detailGrid = el("div", "map-detail-grid");
  const details = panel(selected.name, selected.description);
  const detailStats = el("div", "detail-stats");
  const facts = [
    ["Controller", selected.controller],
    ["Terrain", selected.terrain],
    ["Climate", selected.climate],
    ["Threat", selected.threat + " / 5"],
  ];
  for (const [label, value] of facts) {
    const item = el("div", "detail-stat");
    item.append(el("span", "", label), el("strong", "", value));
    detailStats.append(item);
  }
  details.append(detailStats, el("p", "eyebrow", "Known resources"));
  const tags = el("div", "tag-list");
  selected.resources.forEach((resource) => tags.append(el("span", "badge", resource)));
  details.append(tags);

  const routes = panel("Road connections", "Known paths between regions.");
  const neighbors = state.data.world.edges
    .filter((edge) => edge.source === selected.id)
    .map((edge) => state.data.world.regions.find((region) => region.id === edge.destination))
    .filter(Boolean);
  if (neighbors.length) {
    const list = el("div", "region-list");
    neighbors.forEach((region) => {
      const row = el("div", "region-row");
      row.append(el("strong", "", region.name), el("span", "small muted", "Threat " + region.threat));
      list.append(row);
    });
    routes.append(list);
  } else {
    routes.append(el("div", "empty-state", "No routes are recorded."));
  }
  detailGrid.append(details, routes);
  page.append(detailGrid);

  const status = el("section", "hook-box");
  status.append(el("p", "eyebrow", selected.isCurrent ? "Current location" : "Inspection only"));
  status.append(el("p", "", selected.isCurrent
    ? "Your character is here. Travel and scouting actions will unlock in the world-map milestone."
    : "The region is known, but travel and scouting actions unlock in a later milestone."));
  page.append(status);
  page.append(el("p", "footer-note", "Region ownership and resources are shared world data. Player control is not enabled yet."));
  return page;
}
function renderPlayersPage() {
  const page = el("div");
  page.append(pageHeading("People of the Marches", "Adventurers", "Public character profiles belonging to accounts in this shared world."));
  const directory = panel("Known names", "Only character details marked public are shown. Account credentials are never exposed.");
  if (!state.data.players.length) {
    directory.append(el("div", "empty-state", "No characters have arrived yet."));
  } else {
    const list = el("div");
    for (const player of state.data.players) {
      const row = el("div", "player-row");
      const initial = player.name.trim().slice(0, 1).toUpperCase();
      row.append(el("div", "player-initial", initial));
      const info = el("div", "player-info");
      info.append(el("strong", "", player.name));
      info.append(el("p", "", "Level " + player.level + " " + player.discipline + " · " + player.ancestry + " · " + player.regionName));
      row.append(info, el("span", "badge", "Public"));
      list.append(row);
    }
    directory.append(list);
  }
  page.append(directory);
  const note = panel("A shared beginning", "The same regions and settlements are visible to every account on this server.");
  note.append(el("p", "", "Player messaging, friends, trading, organizations, and rivalries will be added in their own milestones."));
  page.append(note);
  return page;
}
async function loadAccount() {
  const data = await api("/api/bootstrap");
  state.data = data;
  state.view = "overview";
  if (!data.character) renderCharacterCreation();
  else renderGame();
}
async function start() {
  renderLoading("Opening the Marches…");
  try {
    const session = await api("/api/session");
    if (!session.authenticated) {
      renderAuth("register");
      return;
    }
    await loadAccount();
  } catch {
    appRoot.replaceChildren();
    const failure = el("main", "creation-wrap");
    const card = el("section", "creation-card");
    card.append(el("p", "eyebrow", "The road is closed"));
    card.append(el("h1", "", "The game server is unavailable."));
    card.append(el("p", "", "Start the local server with node server.mjs, then reload this page."));
    failure.append(card);
    appRoot.append(failure);
  }
}
start();
