import assert from "node:assert/strict";
import test from "node:test";

import {attunementIds, mayBeListed, partyHeroes, systemParty, unboundAttunements} from "../scripts/sky.mjs";

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

/**
 * Install a world with actors, a party and the hero source setting.
 * @param {{system: string, source: string, party?: object|null}} options
 * @returns {Record<string, object>}  The actors by name
 */
function stubWorld({system, source, party=null}) {
  globalThis.Actor = class Actor {
    constructor(data) {
      Object.assign(this, data);
    }
  };
  const actor = (name, type, hasPlayerOwner, visible=true) => new Actor({id: name, name, type, hasPlayerOwner, visible});
  const actors = {
    Ada: actor("Ada", "hero", true),
    Bo: actor("Bo", "hero", true),
    Cy: actor("Cy", "hero", true, false),
    Guide: actor("Guide", "hero", false),
    Wolf: actor("Wolf", "adversary", false)
  };
  const list = Object.values(actors);
  list.party = (system === "dnd5e") ? party : undefined;
  list.get = id => list.find(a => a.id === id);
  globalThis.game = {
    system: {id: system},
    i18n: {lang: "en"},
    actors: list,
    settings: {get: (module, key) => (key === "heroSource" ? source : undefined)}
  };
  globalThis.crucible = (system === "crucible") ? {party} : undefined;
  return actors;
}

test("party mode lists the visible heroes of Crucible's party", () => {
  const actors = {};
  Object.assign(actors, stubWorld({system: "crucible", source: "party"}));
  globalThis.crucible.party = {system: {actors: new Set([actors.Bo, actors.Guide, actors.Cy, actors.Wolf])}};
  assert.deepEqual(systemParty().map(a => a.name), ["Bo", "Guide", "Cy", "Wolf"]);
  // Companions without a player count, hidden heroes and adversaries do not
  assert.deepEqual(partyHeroes().map(a => a.name), ["Bo", "Guide"]);
});

test("without a party or in the all mode every player character is listed", () => {
  stubWorld({system: "crucible", source: "party", party: null});
  assert.deepEqual(systemParty(), []);
  assert.deepEqual(partyHeroes().map(a => a.name), ["Ada", "Bo"]);
  const actors = stubWorld({system: "crucible", source: "all"});
  globalThis.crucible.party = {system: {actors: new Set([actors.Bo])}};
  assert.deepEqual(partyHeroes().map(a => a.name), ["Ada", "Bo"]);
});

test("a player sees the party members they may see and never falls back to all heroes", () => {
  const actors = stubWorld({system: "crucible", source: "party"});
  // The only member is hidden from this player
  globalThis.crucible.party = {system: {actors: new Set([actors.Cy])}};
  assert.deepEqual(partyHeroes(), []);
  // A member the player may see is listed, the hidden one stays hidden
  globalThis.crucible.party = {system: {actors: new Set([actors.Cy, actors.Bo])}};
  assert.deepEqual(partyHeroes().map(a => a.name), ["Bo"]);
  // A party of adversaries only has no heroes: then every player character the player may see is listed
  globalThis.crucible.party = {system: {actors: new Set([actors.Wolf])}};
  assert.deepEqual(partyHeroes().map(a => a.name), ["Ada", "Bo"]);
});

test("party members are found by their ids when the group was prepared before them", () => {
  stubWorld({system: "crucible", source: "party"});
  globalThis.crucible.party = {system: {actors: new Set(), members: [{actorId: "Bo"}, {actorId: "missing"}]}};
  assert.deepEqual(systemParty().map(a => a.name), ["Bo"]);
  assert.deepEqual(partyHeroes().map(a => a.name), ["Bo"]);
});

test("changes of heroes the almanac may list cause a redraw, also of party members without a player", () => {
  const actors = stubWorld({system: "crucible", source: "party"});
  globalThis.crucible.party = {system: {actors: new Set([actors.Guide])}};
  assert.equal(mayBeListed(actors.Guide), true, "party member without a player owner");
  assert.equal(mayBeListed(actors.Ada), true, "player character");
  assert.equal(mayBeListed(actors.Cy), true, "hidden from this user, but listed for others");
  assert.equal(mayBeListed(actors.Wolf), false);
});

test("the primary party of D&D 5e is read from its members", () => {
  const actors = stubWorld({system: "dnd5e", source: "party"});
  game.actors.party = {system: {members: [{actor: actors.Ada}, {actor: null}, {actor: {name: "plain object"}}]}};
  assert.deepEqual(partyHeroes().map(a => a.name), ["Ada"]);
  delete globalThis.game;
  delete globalThis.crucible;
  delete globalThis.Actor;
});
