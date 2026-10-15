import assert from "node:assert/strict";
import test from "node:test";

import {readFile} from "node:fs/promises";

import {
  KMH_PER_MPH, mphToKmh, weatherReport, windChanges, windLevel, windStrengthLabel, windText
} from "../scripts/weather.mjs";

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
  assert.deepEqual(report.wind, {level: "1", label: "Breeze", speed: 7, kmh: 11, angle: 90});
  assert.deepEqual(report.forecast, [{time: 5 * HOUR, level: "2", label: "Gale", speed: 25, kmh: 40, angle: 180}]);

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

test("the wind level follows the exact speed, like Ember", () => {
  globalThis.ember = {
    region: {slice: {id: "surface"}, weather: {events: []}},
    weather: {getConfig: () => ({strengths: LEVELS}), state: {wind: {direction: 0, speed: 2.6, history: []}}}
  };
  // 2.6 mph shows as 3 mph but stays below the lowest speed of level 1
  assert.deepEqual(weatherReport(0).wind, {level: "0", label: "Still", speed: 3, kmh: 4, angle: 0});
  delete globalThis.ember;
});

test("mph turn into whole km/h", () => {
  assert.equal(KMH_PER_MPH, 1.609);
  assert.equal(mphToKmh(0), 0);
  assert.equal(mphToKmh(1), 2);
  assert.equal(mphToKmh(4), 6);
  assert.equal(mphToKmh(7), 11);
  assert.equal(mphToKmh(16), 26);
  assert.equal(mphToKmh(48), 77);
  assert.equal(mphToKmh(undefined), 0);
  assert.equal(mphToKmh("x"), 0);
});

/** The module strings of a language file, as a stub of game.i18n. */
async function i18nOf(lang) {
  const file = JSON.parse(await readFile(new URL(`../lang/${lang}.json`, import.meta.url), "utf8"));
  const get = key => key.split(".").reduce((o, k) => o?.[k], file);
  return {
    has: key => typeof get(key) === "string",
    localize: key => get(key) ?? key,
    format: (key, data) => (get(key) ?? key).replace(/{(\w+)}/g, (_, k) => data[k])
  };
}

test("German shows the module's names of Ember's wind levels, English and unknown levels Ember's", async () => {
  const de = await i18nOf("de");
  const translate = key => (de.has(key) ? de.localize(key) : null);
  const expected = {0: "Windstill", 1: "Brise", 2: "Windig", 3: "Stürmisch", 4: "Sturmböen"};
  for ( const [level, label] of Object.entries(expected) ) {
    assert.equal(windStrengthLabel(level, "Ember", "de", translate), label);
  }
  assert.equal(windStrengthLabel("9", "Hurricane", "de", translate), "Hurricane");
  assert.equal(windStrengthLabel(null, "", "de", translate), "");
  assert.equal(windStrengthLabel("1", "Breeze", "en", () => "Brise"), "Breeze");
  assert.equal(windStrengthLabel("1", undefined, "en", () => null), "");
});

test("the wind text uses mph in English and km/h in German", async () => {
  const en = await i18nOf("en");
  const de = await i18nOf("de");
  const breeze = {level: "1", label: "Breeze", speed: 7, kmh: 11};
  assert.equal(windText(breeze, "en", en), "Breeze, 7 mph");
  assert.equal(windText(breeze, "de", de), "Brise, 11 km/h");
  // A level the module does not know keeps Ember's name
  assert.equal(windText({level: "7", label: "Tempest", speed: 60, kmh: 97}, "de", de), "Tempest, 97 km/h");
  // Without a level only the speed shows, converted when the report has no km/h
  assert.equal(windText({level: null, label: "", speed: 5}, "de", de), "Wind 8 km/h");
  assert.equal(windText({level: null, label: "", speed: 5}, "en", en), "Wind 5 mph");
});
