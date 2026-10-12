import assert from "node:assert/strict";
import test from "node:test";

import {attunementIds, unboundAttunements} from "../scripts/sky.mjs";

/**
 * Install an invented Ember sky: bodies by kind and the attunement options of ember.CONST.
 * @param {{moons?: string[], realms?: string[], attunements?: string[]|null}} sky
 */
function stubEmber({moons=[], realms=[], attunements=null}) {
  const bodies = ids => Object.fromEntries(ids.map(id => [id, {id, animate: () => ({phase: "none", influence: 0})}]));
  globalThis.game = {modules: {get: () => ({active: true})}};
  globalThis.ember = {
    ready: true,
    calendar: {moons: bodies(moons), realms: bodies(realms)},
    CONST: attunements ? {ATTUNEMENTS: Object.fromEntries(attunements.map(id => [id, {id, label: id}]))} : {}
  };
}

test("unbound attunements are Ember's options without a moon or realm", () => {
  stubEmber({moons: ["moonA", "moonB"], realms: ["realmA"], attunements: ["inner", "moonA", "moonB", "realmA", "outer"]});
  assert.deepEqual(attunementIds(), ["inner", "moonA", "moonB", "realmA", "outer"]);
  assert.deepEqual(unboundAttunements(), ["inner", "outer"]);
});

test("an attunement whose body left the calendar becomes unbound", () => {
  stubEmber({moons: ["moonA"], attunements: ["inner", "moonA", "realmA"]});
  assert.deepEqual(unboundAttunements(), ["inner", "realmA"]);
});

test("the known unbound attunements are the fallback", () => {
  stubEmber({moons: ["moonA"], realms: ["realmA"]});
  assert.deepEqual(attunementIds(), []);
  assert.deepEqual(unboundAttunements(), ["heart", "abyss"]);
  // Without a calendar every option would look unbound
  stubEmber({attunements: ["inner", "moonA"]});
  assert.deepEqual(unboundAttunements(), ["heart", "abyss"]);
  delete globalThis.ember;
  assert.deepEqual(unboundAttunements(), ["heart", "abyss"]);
});
