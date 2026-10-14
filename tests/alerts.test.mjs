import assert from "node:assert/strict";
import test from "node:test";

const DAY = 86400;

/**
 * A test moon with Ember's phase shares: 28 days, dormant for 14, waxing 5.25, full 3.5, waning 5.25.
 * @param {number} t
 * @returns {string}
 */
function moonPhase(t) {
  const period = 28 * DAY;
  const x = ((t % period) + period) % period / period;
  if ( x < 0.25 ) return "none";
  if ( x < 0.4375 ) return "waxing";
  if ( x < 0.5625 ) return "full";
  if ( x < 0.75 ) return "waning";
  return "none";
}

// An invented sky with one moon instead of Ember's calendar, and the Foundry APIs the alerts touch
const moon = {id: "testMoon", name: "Test Moon", period: 28, animate: t => ({phase: moonPhase(t), influence: 0})};
const values = {phaseAlert: "all", chatAlert: true};
const notes = [];
const chats = [];

globalThis._loc = (key, data) => (data ? `${key}(${Object.values(data).join("|")})` : key);
globalThis.ui = {notifications: {info: message => notes.push(message)}};
globalThis.ember = {
  ready: true,
  CONST: {ATTUNEMENTS: {}},
  calendar: {
    moons: {testMoon: moon},
    realms: {},
    days: {secondsPerDay: DAY, secondsPerMinute: 60, minutesPerHour: 60, hoursPerDay: 24, daysPerYear: 360},
    format: t => `day ${Math.floor(t / DAY)}`
  }
};
globalThis.game = {
  modules: {get: id => ({active: true, title: id})},
  settings: {get: (_module, key) => values[key]},
  time: {worldTime: 0},
  user: {isActiveGM: true},
  actors: [],
  i18n: {has: () => true, lang: "en"}
};
globalThis.foundry = {
  utils: {debounce: fn => fn, escapeHTML: value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;")},
  applications: {
    api: {ApplicationV2: class {}, HandlebarsApplicationMixin: Base => class extends Base {}},
    instances: new Map()
  },
  documents: {ChatMessage: {implementation: {create: async data => chats.push(data)}}}
};

const {initAlerts, onUpdateWorldTime, publicHeroes} = await import("../scripts/alerts.mjs");

/**
 * Start at a time, move the world time and collect what was announced.
 * @param {number} from
 * @param {number} to
 * @param {object} [settings]
 * @returns {{notes: string[], chats: string[]}}
 */
function step(from, to, settings={}) {
  Object.assign(values, {phaseAlert: "all", chatAlert: true}, settings);
  notes.length = chats.length = 0;
  game.time.worldTime = from;
  initAlerts();
  game.time.worldTime = to;
  onUpdateWorldTime(to);
  return {notes: [...notes], chats: chats.map(c => c.content)};
}

test("a small step announces the change as before", () => {
  const result = step((7 * DAY) - 3, (7 * DAY) + 3);
  assert.deepEqual(result.notes, ["SLA.Alert.Change(Test Moon|SLA.Phase.waxing)"]);
  assert.deepEqual(result.chats, []);

  const full = step(12 * DAY, 13 * DAY, {phaseAlert: "peak"});
  assert.deepEqual(full.notes, ["SLA.Alert.Peak.moon(Test Moon)"]);
  assert.equal(full.chats.length, 1);
  assert.match(full.chats[0], /<p>SLA\.Alert\.Peak\.moon\(Test Moon\)<\/p>/);
  assert.doesNotMatch(full.chats[0], /Meanwhile/);

  assert.deepEqual(step(DAY, 2 * DAY).notes, [], "no change, no notification");
});

test("a jump announces the skipped full moon once", () => {
  // A rest of 20 days ends in the waning phase; before, the full moon in between went unnoticed
  const result = step(0, 20 * DAY, {phaseAlert: "peak"});
  assert.deepEqual(result.notes, ["SLA.Alert.Meanwhile<br>SLA.Alert.WasPeak.moon(Test Moon|day 12|day 15)"]);
  assert.equal(result.chats.length, 1);
  assert.match(result.chats[0], /<p>SLA\.Alert\.Meanwhile<\/p><p>SLA\.Alert\.WasPeak\.moon\(Test Moon\|day 12\|day 15\)<\/p>/);
});

test("a jump lists every phase in one notification for all changes", () => {
  const result = step(0, 20 * DAY, {chatAlert: false});
  assert.equal(result.notes.length, 1);
  assert.deepEqual(result.notes[0].split("<br>"), [
    "SLA.Alert.Meanwhile",
    "SLA.Alert.WasPhase(Test Moon|SLA.Phase.waxing|day 7|day 12)",
    "SLA.Alert.WasPeak.moon(Test Moon|day 12|day 15)",
    "SLA.Alert.Change(Test Moon|SLA.Phase.waning)"
  ]);
  assert.deepEqual(result.chats, []);
});

test("a long jump lists the latest phases and counts the earlier ones", () => {
  // 100 days: three cycles of four phases and three more
  const lines = step(0, 100 * DAY, {chatAlert: false}).notes[0].split("<br>");
  assert.equal(lines.length, 8);
  assert.equal(lines[0], "SLA.Alert.Meanwhile");
  assert.equal(lines.at(-2), "SLA.Alert.Change(Test Moon|SLA.Phase.waning)");
  assert.equal(lines.at(-1), "SLA.Alert.Earlier(9)");
});

test("steps back and jumps beyond a year only report the net change", () => {
  assert.deepEqual(step(20 * DAY, 0).notes, ["SLA.Alert.Change(Test Moon|SLA.Phase.none)"]);
  // 400 days are more than the calendar year of 360 days
  assert.deepEqual(step(0, 400 * DAY).notes, ["SLA.Alert.Change(Test Moon|SLA.Phase.waxing)"]);
});

test("the notification setting filters the phases of a jump", () => {
  assert.deepEqual(step(0, 20 * DAY, {phaseAlert: "off", chatAlert: false}).notes, []);
  // Nobody is attuned to the test moon
  assert.deepEqual(step(0, 20 * DAY, {phaseAlert: "attuned", chatAlert: false}).notes, []);
  // The GM's chat lists the full moon whatever the own notification setting is
  assert.equal(step(0, 20 * DAY, {phaseAlert: "off"}).chats.length, 1);
});

test("the chat names only the heroes every player may see", () => {
  const actor = (name, visibleTo) => ({name, testUserPermission: user => visibleTo.includes(user.id)});
  const players = [{id: "p1"}, {id: "p2"}];
  const heroes = new Map([
    ["moonA", [{actor: actor("Shared", ["p1", "p2"])}, {actor: actor("Own", ["p1"])}]],
    ["moonB", [{actor: actor("Hidden", [])}]]
  ]);
  const shown = publicHeroes(heroes, players);
  assert.deepEqual([...shown.keys()], ["moonA"]);
  assert.deepEqual(shown.get("moonA").map(h => h.actor.name), ["Shared"]);
  // Without players everyone may be named
  assert.equal(publicHeroes(heroes, []).get("moonB").length, 1);
});
