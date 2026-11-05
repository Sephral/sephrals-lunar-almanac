import assert from "node:assert/strict";
import test from "node:test";

import {adaptEmberCalendar} from "../scripts/ember-time.mjs";

/** Numeric comparison like foundry.utils.isNewerVersion, enough for the versions used here. */
function isNewerVersion(a, b) {
  const parts = value => String(value).split(".").map(Number);
  const [left, right] = [parts(a), parts(b)];
  for ( let i = 0; i < Math.max(left.length, right.length); i++ ) {
    if ( (left[i] ?? 0) !== (right[i] ?? 0) ) return (left[i] ?? 0) > (right[i] ?? 0);
  }
  return false;
}

/** An Ember calendar with the old arguments, which throws on a number like the real one. */
function stub({core, version}) {
  const calls = [];
  class EmberCalendar {
    onUpdateWorldTime(worldTime, options = {}, userId) {
      options.animationDuration = 10;
      calls.push({instance: this, worldTime, options, userId});
      return "done";
    }
  }
  globalThis.foundry = {utils: {isNewerVersion}};
  globalThis.game = {version: core, modules: {get: () => (version ? {version} : undefined)}};
  globalThis.ember = {calendar: new EmberCalendar()};
  return calls;
}

test("the time difference of Foundry 14.370 no longer reaches Ember 0.6.3", () => {
  const calls = stub({core: "14.370", version: "0.6.3"});
  assert.equal(adaptEmberCalendar(), true);
  const options = {};
  assert.equal(ember.calendar.onUpdateWorldTime(500, 100, options, "user"), "done");
  assert.deepEqual(calls.map(call => [call.worldTime, call.options, call.userId]), [[500, options, "user"]]);
  assert.equal(calls[0].instance, ember.calendar);
  assert.equal(options.animationDuration, 10);
});

test("Ember's own calls keep working", () => {
  const calls = stub({core: "14.370", version: "0.6.3"});
  adaptEmberCalendar();
  const options = {animationDuration: 0};
  ember.calendar.onUpdateWorldTime(500, options, "user");
  assert.equal(calls[0].options, options);
  assert.equal(calls[0].userId, "user");
});

test("older Foundry versions and a newer Ember stay untouched", () => {
  for ( const versions of [{core: "14.369", version: "0.6.3"}, {core: "14.370", version: "0.6.4"}, {core: "14.370"}] ) {
    stub(versions);
    const original = Object.getPrototypeOf(ember.calendar).onUpdateWorldTime;
    assert.equal(adaptEmberCalendar(), false);
    assert.equal(Object.getPrototypeOf(ember.calendar).onUpdateWorldTime, original);
  }
});
