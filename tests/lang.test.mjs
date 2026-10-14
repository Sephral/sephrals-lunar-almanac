import assert from "node:assert/strict";
import {readFile, readdir} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * All keys of a nested translation object, dotted.
 * @param {object} object
 * @param {string} [prefix]
 * @returns {string[]}
 */
function keysOf(object, prefix="") {
  return Object.entries(object).flatMap(([key, value]) => {
    const full = prefix ? `${prefix}.${key}` : key;
    return (value && (typeof value === "object")) ? keysOf(value, full) : [full];
  });
}

const en = JSON.parse(await readFile(path.join(root, "lang/en.json"), "utf8"));
const de = JSON.parse(await readFile(path.join(root, "lang/de.json"), "utf8"));
const enKeys = new Set(keysOf(en));

test("English and German have the same keys", () => {
  assert.deepEqual([...keysOf(de)].sort(), [...enKeys].sort());
});

test("every key used by scripts and templates exists", async () => {
  const files = [
    ...(await readdir(path.join(root, "scripts"))).map(f => path.join(root, "scripts", f)),
    ...(await readdir(path.join(root, "templates"))).map(f => path.join(root, "templates", f))
  ];
  const used = new Set();
  for ( const file of files ) {
    const text = await readFile(file, "utf8");
    for ( const match of text.matchAll(/["'`](SLA\.[A-Za-z0-9_.]+)["'`]/g) ) used.add(match[1]);
  }
  // Keys built from template strings in settings.mjs, selftest.mjs, almanac.mjs and alerts.mjs
  for ( const key of ["uiLanguage", "phaseAlert", "chatAlert", "heroSource", "timelineDays", "realmTimelineDays",
    "showWeather", "calendarButton", "controlButton"] ) {
    used.add(`SLA.SETTINGS.${key}.name`);
    used.add(`SLA.SETTINGS.${key}.hint`);
  }
  for ( const key of ["EmberInactive", "NoCalendar", "MoonCount", "RealmCount", "Units", "Phase", "Forecast", "Image",
    "Attunements", "BodyAttunements", "Rank", "Heroes", "Weather", "GearHooks"] ) used.add(`SLA.SELFTEST.${key}`);
  for ( const key of ["Start", "End", "Body", "Phase", "Duration", "Heroes"] ) used.add(`SLA.Export.Column.${key}`);
  for ( const phase of ["none", "waxing", "full", "waning", "dormant", "ascending", "dominant", "descending"] ) {
    used.add(`SLA.Phase.${phase}`);
  }
  for ( const kind of ["moon", "realm"] ) {
    used.add(`SLA.Almanac.PeakIn.${kind}`);
    used.add(`SLA.Alert.Peak.${kind}`);
    used.add(`SLA.Alert.WasPeak.${kind}`);
    used.add(`SLA.Influence.Meaning.${kind}`);
    used.add(`SLA.Influence.Peak.${kind}`);
  }
  const missing = [...used].filter(key => !enKeys.has(key));
  assert.deepEqual(missing, []);
});

test("no key is both a string and a namespace", () => {
  for ( const key of enKeys ) {
    assert.ok(![...enKeys].some(other => other.startsWith(`${key}.`)), key);
  }
});
