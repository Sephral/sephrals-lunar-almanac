import assert from "node:assert/strict";
import test from "node:test";

import {weatherReport, windChanges, windLevel} from "../scripts/weather.mjs";

const HOUR = 3600;

/** Invented wind levels in the shape of Ember's configuration. */
const LEVELS = {
  0: {label: "Still", speed: [0, 2]},
  1: {label: "Breeze", speed: [3, 12]},
  2: {label: "Gale", speed: [13, 40]}
};

test("the wind level is the strongest level the speed reaches", () => {
  assert.equal(windLevel(LEVELS, 0), "0");
  assert.equal(windLevel(LEVELS, 3), "1");
  assert.equal(windLevel(LEVELS, 12), "1");
  assert.equal(windLevel(LEVELS, 30), "2");
  assert.equal(windLevel({}, 5), null);
  assert.equal(windLevel(undefined, 5), null);
});

test("wind changes are the future ones within the window, in order", () => {
  const history = [
    {time: 0, direction: 0, speed: 5},
    {time: 10 * HOUR, direction: 1, speed: 8},
    {time: 4 * HOUR, direction: 2, speed: 20},
    {time: 60 * HOUR, direction: 3, speed: 2},
    {time: Number.NaN, direction: 0, speed: 0}
  ];
  assert.deepEqual(windChanges(history, HOUR, 48 * HOUR).map(w => w.time), [4 * HOUR, 10 * HOUR]);
  assert.deepEqual(windChanges(history, 0, 100 * HOUR, 1).map(w => w.time), [4 * HOUR]);
  assert.deepEqual(windChanges(null, 0, 10), []);
});

test("the weather report reads the party's hex, the wind and the coming wind", () => {
  const events = [{type: "mist", strength: 2, slice: "surface"}, {type: "unknown", strength: 1, slice: "surface"}];
  const configs = {
    mist: {label: "Mist", calendarIcon: "mist.webp", uiColor: "#aaa", strengths: {2: {label: "Thick mist", color: "#888"}}},
    wind: {strengths: LEVELS}
  };
  globalThis.ember = {
    region: {slice: {id: "surface"}, weather: {events, wind: {}}},
    weather: {
      getConfig: event => configs[event.type],
      state: {wind: {direction: Math.PI / 2, speed: 7, history: [
        {time: 0, direction: 0, speed: 7}, {time: 5 * HOUR, direction: Math.PI, speed: 25}
      ]}}
    }
  };
  const report = weatherReport(HOUR);
  assert.deepEqual(report.events, [{label: "Thick mist", kind: "Mist", icon: "mist.webp", color: "#888"}]);
  assert.deepEqual(report.wind, {label: "Breeze", speed: 7, angle: 90});
  assert.deepEqual(report.forecast, [{time: 5 * HOUR, label: "Gale", speed: 25, angle: 180}]);

  // A managed scene has its own weather
  globalThis.ember.scene = {weather: {events: []}};
  assert.deepEqual(weatherReport(HOUR).events, []);
  delete globalThis.ember;
});

test("without Ember's weather there is no report", () => {
  assert.equal(weatherReport(0), null);
  globalThis.ember = {weather: {getConfig: () => null}, region: {}};
  assert.equal(weatherReport(0), null);
  delete globalThis.ember;
});
