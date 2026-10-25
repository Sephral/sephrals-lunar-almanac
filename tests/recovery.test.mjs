import assert from "node:assert/strict";
import test from "node:test";

const DAY = 86400;

/**
 * A test moon with a cycle of 28 days: dormant for 14, waxing 5.25, full 3.5, waning 5.25.
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

// One moon and one realm instead of Ember's calendar, and dnd5e 6's recovery configuration
const moon = {id: "testMoon", name: "Test Moon", period: 28, animate: t => ({phase: moonPhase(t), influence: 0})};
const realm = {id: "testRealm", name: "Test Realm", period: 100, animate: t => ({phase: (t % (100 * DAY)) < (90 * DAY) ? "dormant" : "dominant", influence: 0})};
globalThis._loc = (key, data) => (data ? `${key}(${Object.values(data).join("|")})` : key);
globalThis.ember = {
  ready: true,
  CONST: {ATTUNEMENTS: {}},
  calendar: {
    moons: {testMoon: moon},
    realms: {testRealm: realm},
    days: {secondsPerDay: DAY, secondsPerMinute: 60, minutesPerHour: 60, hoursPerDay: 24, daysPerYear: 360}
  }
};
globalThis.game = {
  system: {id: "dnd5e"},
  modules: {get: () => ({active: true})},
  user: {isActiveGM: true}
};
globalThis.CONFIG = {DND5E: {
  limitedUsePeriods: {dawn: {label: "Dawn"}},
  calendarDeltasRecoveryMapping: new Map([["midnights", "day"], ["sunrises", "dawn"], ["sunsets", "dusk"]])
}};

const {onPreCreateTimePassedMessage, onUpdateWorldTime, peakCounts, recoveryPeriod, registerRecoveryPeriods} = await import("../scripts/recovery.mjs");

test("every moon and realm becomes a recovery period of dnd5e 6", () => {
  assert.equal(registerRecoveryPeriods(), 2);
  assert.deepEqual(CONFIG.DND5E.limitedUsePeriods[recoveryPeriod("testMoon")],
    {label: "SLA.Recovery.moon(Test Moon)", abbreviation: "SLA.Recovery.moon(Test Moon)", formula: true});
  assert.equal(CONFIG.DND5E.limitedUsePeriods["sla-testRealm"].label, "SLA.Recovery.realm(Test Realm)");
  // dnd5e's own periods keep their place before the new ones
  assert.deepEqual([...CONFIG.DND5E.calendarDeltasRecoveryMapping.keys()],
    ["midnights", "sunrises", "sunsets", "sla-testMoon", "sla-testRealm"]);
  assert.equal(CONFIG.DND5E.calendarDeltasRecoveryMapping.get("sla-testMoon"), "sla-testMoon");
});

test("the peaks are counted per body: a step into a full moon, a long journey and no peak", () => {
  // The moon is full from day 12.25 to day 15.75 of every 28
  assert.deepEqual(peakCounts(12 * DAY, 13 * DAY), {"sla-testMoon": 1});
  assert.deepEqual(peakCounts(13 * DAY, 14 * DAY), {});
  // Four full moons (days 12.25, 40.25, 68.25 and 96.25) and the realm's peak at day 90 in 100 days
  assert.deepEqual(peakCounts(0, 100 * DAY), {"sla-testMoon": 4, "sla-testRealm": 1});
  // More than a year counts the last year only: from day 1640 to 2000 the full moons of days 1664.25 to 1972.25
  assert.equal(peakCounts(0, 2000 * DAY)["sla-testMoon"], 12);
  assert.deepEqual(peakCounts(5 * DAY, 5 * DAY), {});
});

test("a change of the world time adds the peaks to dnd5e's deltas, only on the active GM and for steps forward", () => {
  const options = {dnd5e: {deltas: {midnights: 1, sunrises: 1, sunsets: 1}}};
  onUpdateWorldTime(13 * DAY, DAY, options);
  assert.deepEqual(options.dnd5e.deltas, {midnights: 1, sunrises: 1, sunsets: 1, "sla-testMoon": 1});

  const back = {dnd5e: {deltas: {midnights: -1}}};
  onUpdateWorldTime(12 * DAY, -DAY, back);
  assert.deepEqual(back.dnd5e.deltas, {midnights: -1});

  game.user.isActiveGM = false;
  const other = {dnd5e: {deltas: {}}};
  onUpdateWorldTime(13 * DAY, DAY, other);
  assert.deepEqual(other.dnd5e.deltas, {});
  game.user.isActiveGM = true;

  // Another system has no deltas to add to
  game.system.id = "crucible";
  const crucible = {};
  onUpdateWorldTime(13 * DAY, DAY, crucible);
  assert.deepEqual(crucible, {});
  game.system.id = "dnd5e";
});

test("dnd5e's time passed message names the peaks of the change, once", () => {
  onUpdateWorldTime(13 * DAY, DAY, {dnd5e: {deltas: {midnights: 1}}});
  const config = {create: true, data: {content: "<p>Midnight.</p>"}};
  onPreCreateTimePassedMessage(config);
  assert.equal(config.data.content, "<p>Midnight.</p><p>SLA.Alert.Peak.moon(Test Moon)</p>");
  // The next message of dnd5e does not repeat them
  const next = {create: true, data: {content: "<p>Dusk.</p>"}};
  onPreCreateTimePassedMessage(next);
  assert.equal(next.data.content, "<p>Dusk.</p>");
  // A message dnd5e does not post stays untouched
  onUpdateWorldTime(13 * DAY, DAY, {dnd5e: {deltas: {}}});
  const skipped = {create: false, data: {}};
  onPreCreateTimePassedMessage(skipped);
  assert.equal(skipped.data.content, undefined);
});
