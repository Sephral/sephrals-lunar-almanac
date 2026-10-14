import assert from "node:assert/strict";
import test from "node:test";
import {
  clampOffset, dayStarts, findChange, findStart, hookSource, keepLatest, mergeMoons, moonReferences, nextStart,
  phaseSegments, phaseSpans, phaseStarts, spanPercent, splitDuration, tickPlan, timelineTicks
} from "../scripts/lunar.mjs";

const DAY = 86400;
const HOUR = 3600;

/**
 * A test moon with Ember's phase shares: 28 days, dormant for 14, waxing 5.25, full 3.5, waning 5.25.
 * @param {number} t
 * @returns {string}
 */
function moon(t) {
  const period = 28 * DAY;
  const x = ((t % period) + period) % period / period;
  if ( x < 0.25 ) return "none";
  if ( x < 0.4375 ) return "waxing";
  if ( x < 0.5625 ) return "full";
  if ( x < 0.75 ) return "waning";
  return "none";
}

test("finds the end of the current phase to the minute", () => {
  const change = findChange(moon, 0, 30 * DAY, 2 * HOUR, 60);
  assert.ok(Math.abs(change - (7 * DAY)) <= 60);
  assert.equal(moon(change), "waxing");
  assert.equal(moon(change - 61), "none");
});

test("returns null when nothing changes within the horizon", () => {
  assert.equal(findChange(moon, 0, 6 * DAY, 2 * HOUR), null);
  assert.equal(findChange(() => "full", 0, 100 * DAY, DAY), null);
  assert.equal(findChange(moon, 0, 0, HOUR), null);
});

test("next start of a phase skips the running one", () => {
  const fullStart = 0.4375 * 28 * DAY;
  const next = nextStart(moon, "full", 0, 40 * DAY, 2 * HOUR, 60);
  assert.ok(Math.abs(next - fullStart) <= 60);
  // While full, the next full moon is one period later
  const again = nextStart(moon, "full", fullStart + DAY, 40 * DAY, 2 * HOUR, 60);
  assert.ok(Math.abs(again - (fullStart + (28 * DAY))) <= 60);
  assert.equal(nextStart(moon, "full", 0, 5 * DAY, 2 * HOUR), null);
});

test("segments cover the range without gaps", () => {
  const segments = phaseSegments(moon, 0, 30 * DAY, 2 * HOUR, 60);
  assert.deepEqual(segments.map(s => s.phase), ["none", "waxing", "full", "waning", "none"]);
  assert.equal(segments[0].start, 0);
  assert.equal(segments.at(-1).end, 30 * DAY);
  for ( let i = 1; i < segments.length; i++ ) assert.equal(segments[i].start, segments[i - 1].end);
});

test("a short step enters at most the next phase", () => {
  assert.deepEqual(phaseStarts(moon, 0, 3 * DAY, 2 * HOUR), []);
  const entered = phaseStarts(moon, 6 * DAY, 8 * DAY, 2 * HOUR, 60);
  assert.deepEqual(entered.map(s => [s.phase, s.current]), [["waxing", true]]);
  assert.ok(Math.abs(entered[0].start - (7 * DAY)) <= 60);
  // Steps back in time or of no length enter nothing
  assert.deepEqual(phaseStarts(moon, 8 * DAY, 6 * DAY, 2 * HOUR), []);
  assert.deepEqual(phaseStarts(moon, 8 * DAY, 8 * DAY, 2 * HOUR), []);
});

test("a change right at the end of a step still counts", () => {
  // Six seconds of a combat round across the start of the waxing phase
  const entered = phaseStarts(moon, (7 * DAY) - 3, (7 * DAY) + 3, 2 * HOUR, 60);
  assert.deepEqual(entered.map(s => [s.phase, s.current]), [["waxing", true]]);
  assert.equal(entered[0].start, (7 * DAY) + 3);
});

test("a jump in time lists the phases that came and went", () => {
  // A rest of 20 days skips the full moon; the net change only says "waning"
  const entered = phaseStarts(moon, 0, 20 * DAY, 2 * HOUR, 60);
  assert.deepEqual(entered.map(s => [s.phase, s.current]), [["waxing", false], ["full", false], ["waning", true]]);
  const full = entered[1];
  assert.ok(Math.abs(full.start - (12.25 * DAY)) <= 60);
  assert.ok(Math.abs(full.end - (15.75 * DAY)) <= 60);
  assert.equal(entered[2].start, full.end);
  assert.equal(entered[2].end, 20 * DAY);
});

test("a jump of a whole cycle ends in the same phase but still lists the full moon", () => {
  const entered = phaseStarts(moon, 0, 28 * DAY, 2 * HOUR, 60);
  assert.equal(moon(0), moon(28 * DAY));
  assert.deepEqual(entered.map(s => s.phase), ["waxing", "full", "waning", "none"]);
  assert.deepEqual(entered.map(s => s.current), [false, false, false, true]);
});

test("keepLatest keeps the latest entries and counts the earlier ones", () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.deepEqual(keepLatest(items, 6), {shown: [5, 6, 7, 8, 9, 10], hidden: 4});
  assert.deepEqual(keepLatest([1, 2], 6), {shown: [1, 2], hidden: 0});
  assert.deepEqual(keepLatest([], 6), {shown: [], hidden: 0});
});

test("durations split into calendar units", () => {
  const units = {secondsPerDay: DAY, secondsPerHour: HOUR};
  assert.deepEqual(splitDuration((3 * DAY) + (4 * HOUR) + 125, units), {days: 3, hours: 4, minutes: 2});
  assert.deepEqual(splitDuration(-5, units), {days: 0, hours: 0, minutes: 0});
});

test("timeline positions", () => {
  assert.deepEqual(spanPercent(0, 50, 0, 100), {left: 0, width: 50});
  assert.deepEqual(spanPercent(-20, 30, 0, 100), {left: 0, width: 30});
  assert.deepEqual(spanPercent(80, 150, 0, 100), {left: 80, width: 20});
  assert.deepEqual(spanPercent(0, 10, 5, 5), {left: 0, width: 0});
  assert.deepEqual(dayStarts(1000, 1000 + (3 * DAY), 1000, DAY), [DAY, 2 * DAY, 3 * DAY]);
});

test("finds the start of the current phase by looking back", () => {
  // Day 13 lies in the full moon of days 12.25 to 15.75
  const start = findStart(moon, 13 * DAY, 30 * DAY, 2 * HOUR, 60);
  assert.ok(Math.abs(start - (12.25 * DAY)) <= 60);
  assert.equal(moon(start), "full");
  assert.equal(moon(start - 61), "waxing");
  assert.equal(findStart(moon, 13 * DAY, DAY / 2, 2 * HOUR), null, "the start lies beyond the horizon");
  assert.equal(findStart(moon, 13 * DAY, 0, HOUR), null);
});

test("phase spans report the true start and end of periods cut by the range", () => {
  // From day 13 to day 50: the running full moon and the next one
  const spans = phaseSpans(moon, "full", 13 * DAY, 50 * DAY, 2 * HOUR, 60, 30 * DAY);
  assert.equal(spans.length, 2);
  assert.equal(spans[0].running, true);
  assert.ok(Math.abs(spans[0].start - (12.25 * DAY)) <= 60);
  assert.ok(Math.abs(spans[0].end - (15.75 * DAY)) <= 60);
  assert.equal(spans[1].running, false);
  assert.ok(Math.abs(spans[1].start - (40.25 * DAY)) <= 60);
  assert.ok(Math.abs(spans[1].end - (43.75 * DAY)) <= 60);
  // A range which ends inside a full moon finds its end beyond the range
  const cut = phaseSpans(moon, "full", 0, 14 * DAY, 2 * HOUR, 60, 30 * DAY);
  assert.equal(cut.length, 1);
  assert.ok(Math.abs(cut[0].end - (15.75 * DAY)) <= 60);
  assert.deepEqual(phaseSpans(moon, "full", 0, 10 * DAY, 2 * HOUR, 60), []);
});

test("timeline marks get sparser on longer timelines", () => {
  assert.deepEqual(tickPlan(30), {every: 1, labelEvery: 7});
  assert.deepEqual(tickPlan(180), {every: 10, labelEvery: 30});
  assert.deepEqual(tickPlan(360), {every: 30, labelEvery: 60});
  const daily = timelineTicks(0, 14 * DAY, 0, DAY, tickPlan(14));
  assert.equal(daily.length, 14);
  assert.deepEqual(daily.filter(t => t.label).map(t => t.day), [7, 14]);
  const long = timelineTicks(0, 180 * DAY, 0, DAY, tickPlan(180));
  assert.deepEqual(long.map(t => t.day), [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180]);
  assert.deepEqual(long.filter(t => t.label).map(t => t.day), [30, 60, 90, 120, 150, 180]);
  assert.equal(long[0].time, 10 * DAY);
});

test("day offsets are whole numbers within limits", () => {
  assert.equal(clampOffset("12", -360, 720), 12);
  assert.equal(clampOffset(2.6, -360, 720), 3);
  assert.equal(clampOffset(-1000, -360, 720), -360);
  assert.equal(clampOffset(5000, -360, 720), 720);
  assert.equal(clampOffset("abc", -360, 720), 0);
  assert.equal(clampOffset(undefined, -360, 720), 0);
});

test("moon references: code which reads the calendar's moons and the moons it names", () => {
  const ids = ["aura", "cora", "ragen"];
  assert.equal(moonReferences("resistances.fire.bonus += 5;", ids), null, "no moons read");
  assert.equal(moonReferences("const aura = 1;", ids), null, "a name alone is not enough");
  assert.deepEqual(moonReferences("if ( ember.calendar.moons.cora.phase === 'full' ) x++;", ids), ["cora"]);
  assert.deepEqual(moonReferences("ember.calendar.moons.ragen.phase; ember.calendar.moons.aura.phase", ids),
    ["aura", "ragen"]);
  // A moon picked at runtime depends on every moon
  assert.deepEqual(moonReferences("const phase = ember.calendar.moons[moonId]?.phase;", ids), ids);
  // Whole words only: "auras" or "coral" are not moons
  assert.deepEqual(moonReferences("ember.calendar.moons.cora; auras; coral", ids), ["cora"]);
});

test("hook source covers functions and the data next to them", () => {
  const hooks = {
    _TABLE: Object.freeze({aura: "a", cora: "b"}),
    prepare(item, out) {
      for ( const [id] of Object.entries(hooks._TABLE) ) out[id] = ember.calendar.moons[id].phase;
    },
    label: "plain"
  };
  const source = hookSource(hooks);
  assert.match(source, /calendar.moons/);
  assert.match(source, /"aura"/);
  assert.deepEqual(moonReferences(source, ["aura", "cora", "ragen"]), ["aura", "cora"]);
  assert.equal(hookSource(null), "");
  const circular = {};
  circular.self = circular;
  assert.equal(hookSource({circular, fn() {}}), "fn() {}");
});

test("mergeMoons keeps the calendar order and drops unknown ids", () => {
  const order = ["aura", "cora", "ragen"];
  assert.deepEqual(mergeMoons(order, ["ragen"], ["aura", "ragen", "gone"], null), ["aura", "ragen"]);
  assert.deepEqual(mergeMoons(order), []);
});
