import assert from "node:assert/strict";
import test from "node:test";

import {MODULE_ID} from "../scripts/config.mjs";
import {markedMoons, moonGear, moonIds, onGetHeaderControls} from "../scripts/gear.mjs";

/**
 * Install an invented sky and an invented hook registry. The hooks only mimic the shape of Crucible's registry; their
 * names and rules are made up for the test.
 */
function stubWorld() {
  globalThis.game = {i18n: {lang: "en"}};
  globalThis.foundry = {utils: {getProperty: (object, path) => path.split(".").reduce((o, k) => o?.[k], object)}};
  globalThis.ember = {calendar: {moons: {moonA: {id: "moonA"}, moonB: {id: "moonB"}, moonC: {id: "moonC"}}}};
  globalThis.crucible = {api: {hooks: {
    weapon: {
      glowBlade: {finalizeAction() {
        return ember.calendar.moons.moonB.phase === "full";
      }}
    },
    talent: {
      plainTalent: {prepareDefenses(item, defenses) {
        defenses.bonus += 1;
      }}
    },
    affix: {
      tideWard: {
        _TABLE: Object.freeze({moonA: "one", moonC: "two"}),
        prepareResistances(item, out) {
          for ( const [id, key] of Object.entries(this._TABLE) ) out[key] = ember.calendar.moons[id]?.phase;
        }
      }
    }
  }}};
}

/**
 * An actor with items and the hook table Crucible builds for its active items.
 * @returns {object}
 */
function stubActor() {
  const blade = {id: "i1", name: "Glow Blade", type: "weapon", system: {identifier: "glowBlade"}};
  const talent = {id: "i2", name: "Plain Talent", type: "talent", system: {identifier: "plainTalent"}};
  const ring = {id: "i3", name: "Ring", type: "accessory", system: {identifier: "ring"}};
  const cloak = {id: "i4", name: "Cloak", type: "armor", system: {identifier: "cloak"},
    flags: {[MODULE_ID]: {moons: ["moonC", "unknown"]}}};
  const affix = {id: "a1", name: "of the Tide", system: {identifier: "tideWard"}};
  const fn = () => {};
  return {
    items: [blade, talent, ring, cloak],
    system: {actorHooks: {
      finalizeAction: [{item: blade, fn}],
      prepareDefenses: [{item: talent, fn}],
      prepareResistances: [{item: ring, fn, affix}, {item: ring, fn, affix}]
    }}
  };
}

test("moon sensitive gear is found in the hooks of active items and in the GM's marks", () => {
  stubWorld();
  assert.deepEqual(moonIds(), ["moonA", "moonB", "moonC"]);
  const gear = moonGear(stubActor());
  assert.deepEqual(gear.map(g => [g.name, g.moons, g.marked]), [
    ["Cloak", ["moonC"], true],
    ["Glow Blade", ["moonB"], false],
    ["Ring (of the Tide)", ["moonA", "moonC"], false]
  ]);
});

test("a marked item which also has moon hooks lists both", () => {
  stubWorld();
  const actor = stubActor();
  actor.items[0].flags = {[MODULE_ID]: {moons: ["moonA"]}};
  const blade = moonGear(actor).find(g => g.item.id === "i1");
  assert.deepEqual(blade.moons, ["moonA", "moonB"]);
  assert.equal(blade.marked, true);
});

test("without Crucible only the marks count, without moons nothing", () => {
  stubWorld();
  delete globalThis.crucible;
  assert.deepEqual(moonGear(stubActor()).map(g => g.name), ["Cloak"]);
  globalThis.ember = {calendar: {moons: {}}};
  assert.deepEqual(moonGear(stubActor()), []);
  assert.deepEqual(moonGear(null), []);
  delete globalThis.ember;
});

test("marks are read as a list of ids", () => {
  stubWorld();
  assert.deepEqual(markedMoons({flags: {[MODULE_ID]: {moons: ["moonA", 3, null]}}}), ["moonA"]);
  assert.deepEqual(markedMoons({flags: {[MODULE_ID]: {moons: "moonA"}}}), []);
  assert.deepEqual(markedMoons({}), []);
  delete globalThis.game;
  delete globalThis.foundry;
});

test("the GM's menu offers the mark only on item sheets the GM can edit", () => {
  stubWorld();
  class Item {}
  globalThis.Item = Item;
  globalThis.game.user = {isGM: true};
  globalThis.game.modules = new Map([["ember", {active: true}]]);
  const controls = app => {
    const list = [];
    onGetHeaderControls(app, list);
    return list.map(c => c.action);
  };
  assert.deepEqual(controls({document: new Item(), isEditable: true}), ["slaMarkMoons"]);
  // A locked compendium item cannot store the mark
  assert.deepEqual(controls({document: new Item(), isEditable: false}), []);
  assert.deepEqual(controls({document: {}, isEditable: true}), []);
  globalThis.game.user.isGM = false;
  assert.deepEqual(controls({document: new Item(), isEditable: true}), []);
  delete globalThis.Item;
  delete globalThis.game;
  delete globalThis.foundry;
  delete globalThis.ember;
  delete globalThis.crucible;
});
