import assert from "node:assert/strict";
import test from "node:test";
import {dayStarts, findChange, nextStart, phaseSegments, spanPercent, splitDuration} from "../scripts/lunar.mjs";

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
