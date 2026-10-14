import assert from "node:assert/strict";
import test from "node:test";

// journal.mjs imports the almanac, which touches these Foundry APIs at import time
globalThis.foundry = {
  utils: {debounce: fn => fn},
  applications: {api: {ApplicationV2: class {}, HandlebarsApplicationMixin: Base => class extends Base {}}}
};

const {EXPORT_DAYS, exportDays, htmlTable, peakRows, sortRows} = await import("../scripts/journal.mjs");

const DAY = 86400;

/**
 * An invented body: dormant for half its period, then rising, at its peak and falling for a sixth each.
 * @param {string} id
 * @param {number} period   In days
 * @param {number} offset   In days
 * @param {string[]} phases The four phases of its kind
 * @returns {object}
 */
function body(id, period, offset, phases) {
  return {id, name: id.toUpperCase(), period, animate(t) {
    const x = ((((t / DAY) + offset) % period) + period) % period / period;
    const phase = (x < 0.5) ? phases[0] : (x < 2 / 3) ? phases[1] : (x < 5 / 6) ? phases[2] : phases[3];
    return {phase, influence: 0};
  }};
}

test("peak rows list full moons and dominant realms in time order", () => {
  globalThis.game = {modules: {get: () => ({active: true})}, time: {}};
  globalThis.ember = {
    ready: true,
    calendar: {
      days: {secondsPerDay: DAY, secondsPerMinute: 60, minutesPerHour: 60, hoursPerDay: 24},
      moons: {moonA: body("moonA", 12, 0, ["none", "waxing", "full", "waning"])},
      realms: {realmA: body("realmA", 60, 20, ["dormant", "ascending", "dominant", "descending"])}
    }
  };
  // The moon is full on days 8 to 10 and 20 to 22, the realm dominant on days 20 to 30
  const rows = peakRows(0, 25 * DAY);
  assert.deepEqual(rows.map(r => [r.id, r.phase]), [["moonA", "full"], ["moonA", "full"], ["realmA", "dominant"]]);
  assert.ok(Math.abs(rows[0].start - (8 * DAY)) <= 60);
  assert.ok(Math.abs(rows[0].end - (10 * DAY)) <= 60);
  assert.equal(rows[0].name, "MOONA");
  assert.ok(Math.abs(rows[2].start - (20 * DAY)) <= 60);
  assert.ok(Math.abs(rows[2].end - (30 * DAY)) <= 60, "the end is found beyond the range");
  assert.deepEqual(peakRows(0, 25 * DAY, {realms: false}).map(r => r.id), ["moonA", "moonA"]);
  delete globalThis.game;
  delete globalThis.ember;
});

test("rows sort by start, a period without known start first", () => {
  const rows = [{name: "B", start: 50}, {name: "A", start: 50}, {name: "C", start: null}, {name: "D", start: 10}];
  assert.deepEqual(sortRows(rows).map(r => r.name), ["C", "D", "A", "B"]);
});

test("the table escapes every cell", () => {
  const escape = text => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const html = htmlTable(["When", "What"], [["Day 1", "<b>Moon</b> & co"]], escape);
  assert.equal(html, "<table><thead><tr><th>When</th><th>What</th></tr></thead>"
    + "<tbody><tr><td>Day 1</td><td>&lt;b&gt;Moon&lt;/b&gt; &amp; co</td></tr></tbody></table>");
  assert.deepEqual(EXPORT_DAYS, {initial: 90, min: 7, max: 720});
});

test("the days to export are a whole number within the limits", () => {
  const {initial, min, max} = EXPORT_DAYS;
  assert.equal(exportDays("60"), 60);
  assert.equal(exportDays(12.6), 13);
  assert.equal(exportDays(3), min);
  assert.equal(exportDays(0), min);
  assert.equal(exportDays("0"), min);
  assert.equal(exportDays(-5), min);
  assert.equal(exportDays(1e9), max);
  assert.equal(exportDays(""), initial);
  assert.equal(exportDays("abc"), initial);
  assert.equal(exportDays(undefined), initial);
  assert.equal(exportDays(null), initial);
});
