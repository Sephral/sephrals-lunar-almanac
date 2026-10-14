import assert from "node:assert/strict";
import test from "node:test";

// controls.mjs imports the almanac, which touches these Foundry APIs at import time
globalThis.foundry = {
  utils: {debounce: fn => fn},
  applications: {api: {ApplicationV2: class {}, HandlebarsApplicationMixin: Base => class extends Base {}}}
};

const {onGetSceneControlButtons, refreshButtons} = await import("../scripts/controls.mjs");

test("a changed button setting asks the scene controls for their tools again", () => {
  const calls = [];
  globalThis.ui = {controls: {render: options => calls.push(options)}};
  globalThis.ember = {};
  refreshButtons();
  assert.deepEqual(calls, [{reset: true}]);
  delete globalThis.ui;
  delete globalThis.ember;
});

test("the token tool follows the setting", () => {
  const values = {controlButton: true};
  globalThis.game = {modules: new Map([["ember", {active: true}]]), settings: {get: (_m, key) => values[key]}};
  const controls = {tokens: {tools: {select: {}}}};
  onGetSceneControlButtons(controls);
  assert.ok(controls.tokens.tools["sla-almanac"]);
  const off = {tokens: {tools: {select: {}}}};
  values.controlButton = false;
  onGetSceneControlButtons(off);
  assert.equal(off.tokens.tools["sla-almanac"], undefined);
  delete globalThis.game;
});
