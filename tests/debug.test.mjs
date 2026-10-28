import assert from "node:assert/strict";
import test from "node:test";

globalThis._loc = (key, data) => (data ? `${key} ${data.file}` : key);

const {MODULE_ID, TESTED_VERSIONS} = await import("../scripts/config.mjs");
const {describeState, registerDebug} = await import("../scripts/debug.mjs");

/** A world without Ember's calendar: the almanac part still answers. */
function installWorld() {
  globalThis.CONFIG = {};
  globalThis.game = {
    version: "14.369",
    system: {id: "crucible"},
    time: {worldTime: 1000},
    i18n: {lang: "en"},
    modules: new Map(),
    settings: {get: () => "players"},
    actors: [{type: "hero", hasPlayerOwner: true, visible: true, name: "Hero"}, {type: "adversary", name: "Foe"}]
  };
  delete globalThis.ember;
}

test("the debug file part answers without Ember's calendar", () => {
  installWorld();
  assert.deepEqual(describeState(), {
    tested: TESTED_VERSIONS,
    installed: {ember: null, core: "14.369"},
    emberReady: false,
    worldTime: 1000,
    sky: [],
    heroes: 1,
    recoveryPeriods: false
  });
});

test("the module registers its part of the shared debug file", () => {
  installWorld();
  registerDebug();
  const provider = globalThis.sephralsDebugFiles.providers.get(MODULE_ID);
  assert.equal(provider.label(), "SLA.DEBUG.Entry");
  assert.equal(provider.notice("x.json"), "SLA.DEBUG.Saved x.json");
  assert.equal(provider.recent().details.emberReady, false);
  assert.equal(provider.message, undefined, "the module reads no chat messages");
});
