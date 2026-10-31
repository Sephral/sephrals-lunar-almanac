import assert from "node:assert/strict";
import test from "node:test";

// settings.mjs and the modules it imports touch these Foundry APIs at import time or while registering
globalThis.foundry = {
  utils: {debounce: fn => fn, deepClone: value => structuredClone(value)},
  applications: {api: {ApplicationV2: class {}, HandlebarsApplicationMixin: Base => class extends Base {}}},
  data: {fields: {NumberField: class {
    constructor(options) {
      this.options = options;
    }
  }}}
};

const {MODULE_ID} = await import("../scripts/config.mjs");
const {FOLLOW_FOUNDRY, UI_LANGUAGES, applyModuleLanguage, forcedLanguage, mergeStrings, moduleLanguage,
  resolveLanguage} = await import("../scripts/language.mjs");
const {SETTINGS, registerSettings} = await import("../scripts/settings.mjs");

/**
 * Register the settings with a stub of game.settings which records every call.
 * @returns {{settings: Map<string, object>, menus: Map<string, object>}}
 */
function register() {
  const settings = new Map();
  const menus = new Map();
  globalThis.game = {settings: {
    register: (module, key, data) => settings.set(`${module}.${key}`, data),
    registerMenu: (module, key, data) => menus.set(`${module}.${key}`, data)
  }};
  registerSettings();
  delete globalThis.game;
  const strip = map => new Map([...map].map(([key, data]) => [key.replace(`${MODULE_ID}.`, ""), data]));
  assert.ok([...settings.keys(), ...menus.keys()].every(key => key.startsWith(`${MODULE_ID}.`)));
  return {settings: strip(settings), menus: strip(menus)};
}

test("the module language comes first and follows Foundry by default", () => {
  const {settings} = register();
  assert.equal([...settings.keys()][0], "uiLanguage");
  const uiLanguage = settings.get("uiLanguage");
  assert.equal(uiLanguage.scope, "client");
  assert.equal(uiLanguage.default, FOLLOW_FOUNDRY);
  assert.deepEqual(Object.keys(uiLanguage.choices), [FOLLOW_FOUNDRY, "de", "en"]);
  assert.deepEqual(UI_LANGUAGES, ["en", "de"]);
});

test("every setting is registered with its scope, default and choices", () => {
  const {settings} = register();
  const summary = Object.fromEntries([...settings].map(([key, data]) => [key,
    [data.scope, data.default, data.config, data.choices ? Object.keys(data.choices) : null]]));
  assert.deepEqual(summary, {
    uiLanguage: ["client", FOLLOW_FOUNDRY, true, [FOLLOW_FOUNDRY, "de", "en"]],
    phaseAlert: ["client", "peak", true, ["peak", "attuned", "all", "off"]],
    chatAlert: ["world", false, true, null],
    heroSource: ["world", "party", true, ["party", "all"]],
    timelineDays: ["client", 30, true, null],
    realmTimelineDays: ["client", 180, true, null],
    showWeather: ["client", true, true, null],
    calendarButton: ["client", true, true, null],
    controlButton: ["client", true, true, null],
    acknowledgedVersions: ["client", "", false, null]
  });
  for ( const key of Object.keys(SETTINGS) ) {
    assert.equal(settings.get(key).name, `SLA.SETTINGS.${key}.name`);
    assert.equal(settings.get(key).hint, `SLA.SETTINGS.${key}.hint`);
  }
});

test("the timeline lengths are number fields with a range", () => {
  const {settings} = register();
  const {type} = settings.get("timelineDays");
  assert.ok(type instanceof foundry.data.fields.NumberField);
  assert.deepEqual(type.options, {min: 0, max: 60, step: 1, initial: 30});
  const realms = settings.get("realmTimelineDays").type;
  assert.ok(realms instanceof foundry.data.fields.NumberField);
  assert.deepEqual(realms.options, {min: 0, max: 360, step: 30, initial: 180});
});

test("the self test is a GM menu backed by an application class", () => {
  const {menus} = register();
  // The window Sephral's Modules registers first, in the init hook of the entry file
  assert.deepEqual([...menus.keys()], ["selfTest", "debugFile"]);
  const menu = menus.get("selfTest");
  assert.equal(menu.restricted, true);
  assert.ok(menu.type.prototype instanceof foundry.applications.api.ApplicationV2);
});

test("the debug file is a GM button of the shared debug file", () => {
  const menu = register().menus.get("debugFile");
  assert.equal(menu.restricted, true);
  assert.equal(menu.label, "SLA.DEBUG.Save");
  assert.ok(menu.type.prototype instanceof foundry.applications.api.ApplicationV2);
});

test("forcedLanguage only forces the shipped languages", () => {
  assert.equal(forcedLanguage("de"), "de");
  assert.equal(forcedLanguage("en"), "en");
  assert.equal(forcedLanguage(FOLLOW_FOUNDRY), null);
  assert.equal(forcedLanguage("fr"), null);
  assert.equal(forcedLanguage(undefined), null);
});

test("the shown language is the forced one, or Foundry's if the module ships it", () => {
  assert.equal(resolveLanguage("de", "en"), "de");
  assert.equal(resolveLanguage("en", "de"), "en");
  assert.equal(resolveLanguage(FOLLOW_FOUNDRY, "de"), "de");
  assert.equal(resolveLanguage(FOLLOW_FOUNDRY, "en"), "en");
  assert.equal(resolveLanguage(FOLLOW_FOUNDRY, "fr"), "en");
  assert.equal(resolveLanguage(undefined, undefined), "en");
});

test("moduleLanguage reads the setting and Foundry's language", () => {
  const saved = globalThis.game;
  globalThis.game = {settings: {get: () => FOLLOW_FOUNDRY}, i18n: {lang: "de"}};
  assert.equal(moduleLanguage(), "de");
  globalThis.game = {settings: {get: () => "en"}, i18n: {lang: "de"}};
  assert.equal(moduleLanguage(), "en");
  globalThis.game = {settings: {get: () => {
    throw new Error("not registered");
  }}, i18n: {lang: "de"}};
  assert.equal(moduleLanguage(), "de");
  globalThis.game = saved;
});

test("mergeStrings lays the forced file over Foundry's strings", () => {
  const loaded = {Phase: {full: "Voll", none: "Ruhend"}, Only: "nur geladen"};
  const forced = {Phase: {full: "Full"}};
  assert.deepEqual(mergeStrings(loaded, forced), {Phase: {full: "Full", none: "Ruhend"}, Only: "nur geladen"});
  assert.deepEqual(loaded.Phase, {full: "Voll", none: "Ruhend"}, "the loaded strings stay untouched");
  assert.deepEqual(mergeStrings(undefined, forced), forced);
});

test("applyModuleLanguage forces a language and restores Foundry's strings", async () => {
  globalThis.game = {i18n: {translations: {SLA: {Almanac: {Title: "Mondalmanach", Moons: "Monde"}}, CORE: {x: 1}}}};
  globalThis.fetch = async url => {
    assert.match(String(url), /lang\/en\.json$/);
    return {ok: true, json: async () => ({SLA: {Almanac: {Title: "Lunar Almanac"}}})};
  };
  await applyModuleLanguage("en");
  assert.deepEqual(game.i18n.translations.SLA, {Almanac: {Title: "Lunar Almanac", Moons: "Monde"}});
  assert.deepEqual(game.i18n.translations.CORE, {x: 1});

  await applyModuleLanguage(FOLLOW_FOUNDRY);
  assert.deepEqual(game.i18n.translations.SLA, {Almanac: {Title: "Mondalmanach", Moons: "Monde"}});
  delete globalThis.game;
  delete globalThis.fetch;
});
