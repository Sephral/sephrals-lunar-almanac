import assert from "node:assert/strict";
import test from "node:test";

/** Debounced functions waiting to run; flush() runs each once, like a debounce after the last call. */
const scheduled = new Set();
function flush() {
  const fns = [...scheduled];
  scheduled.clear();
  for ( const fn of fns ) fn();
}

/** A stub of ApplicationV2 which counts its renders. */
class StubApplication {
  rendered = true;
  renders = 0;
  render() {
    this.renders++;
    return Promise.resolve(this);
  }
  async _onFirstRender() {}
  async _onRender() {}
  _syncPartState() {}
}

globalThis.foundry = {
  utils: {debounce: fn => () => scheduled.add(fn), deepClone: value => structuredClone(value)},
  applications: {api: {ApplicationV2: StubApplication, HandlebarsApplicationMixin: Base => class extends Base {}}}
};

const {LunarAlmanac, OFFSET_LIMITS} = await import("../scripts/almanac.mjs");

/**
 * A stub of the day control: the number field and the today button.
 * @param {number} days
 */
function dayControl(days) {
  const today = {
    disabled: days === 0,
    classes: new Set(days === 0 ? ["inactive"] : []),
    classList: {toggle(name, on) {
      if ( on ) today.classes.add(name);
      else today.classes.delete(name);
    }}
  };
  const input = {value: String(days)};
  const controls = {
    input,
    today,
    replacedWith: null,
    querySelector: selector => ({'input[name="offsetDays"]': input, ".sla-today": today})[selector] ?? null,
    replaceWith(other) {
      this.replacedWith = other;
    }
  };
  return controls;
}

/**
 * An almanac whose window holds a day control.
 * @returns {{app: LunarAlmanac, controls: object, listeners: Map<string, Function>}}
 */
function almanac() {
  const app = new LunarAlmanac();
  const controls = dayControl(0);
  const listeners = new Map();
  app.element = {
    querySelector: selector => ((selector === ".sla-lookahead") ? controls : null),
    addEventListener: (type, fn) => listeners.set(type, fn)
  };
  return {app, controls, listeners};
}

const {shiftDays, today} = LunarAlmanac.DEFAULT_OPTIONS.actions;
const click = days => ({dataset: {days: String(days)}});

test("quick clicks on the arrows all count and lead to one redraw", () => {
  const {app, controls} = almanac();
  shiftDays.call(app, {}, click(1));
  shiftDays.call(app, {}, click(1));
  shiftDays.call(app, {}, click(1));
  shiftDays.call(app, {}, click(-1));
  assert.equal(app.offsetDays, 2);
  // The control shows the new day at once, before the redraw
  assert.equal(controls.input.value, "2");
  assert.equal(controls.today.disabled, false);
  assert.equal(controls.today.classes.has("inactive"), false);
  assert.equal(app.renders, 0);
  flush();
  assert.equal(app.renders, 1);
});

test("today returns to the world time and hides its button again", () => {
  const {app, controls} = almanac();
  shiftDays.call(app, {}, click(1));
  today.call(app);
  assert.equal(app.offsetDays, 0);
  assert.equal(controls.input.value, "0");
  assert.equal(controls.today.disabled, true);
  assert.equal(controls.today.classes.has("inactive"), true);
  flush();
  assert.equal(app.renders, 1);
});

test("the shown day stays within the limits", () => {
  const {app} = almanac();
  app.shiftTo(OFFSET_LIMITS.max);
  shiftDays.call(app, {}, click(1));
  assert.equal(app.offsetDays, OFFSET_LIMITS.max);
  app.shiftTo(-10000);
  assert.equal(app.offsetDays, OFFSET_LIMITS.min);
  scheduled.clear();
});

test("a redraw which began before the last click shows the current day in the control", async () => {
  const {app, controls} = almanac();
  app.offsetDays = 3;
  await app._onRender({}, {});
  assert.equal(controls.input.value, "3");
  assert.equal(controls.today.disabled, false);
});

test("a redraw while a pointer is pressed on the day control keeps the pressed control", async () => {
  const {app, listeners} = almanac();
  const documentListeners = [];
  globalThis.document = {addEventListener: (type, fn, options) => documentListeners.push({type, fn, options})};
  await app._onFirstRender({}, {});

  // Without a pressed pointer the new control is used
  let prior = dayControl(0);
  let next = dayControl(0);
  const part = control => ({querySelector: selector => ((selector === ".sla-lookahead") ? control : null)});
  app._syncPartState("almanac", part(next), part(prior), {});
  assert.equal(next.replacedWith, null);

  // A pointer pressed elsewhere in the window does not count
  listeners.get("pointerdown")({target: {closest: () => null}});
  app._syncPartState("almanac", part(next), part(prior), {});
  assert.equal(next.replacedWith, null);

  // Pressed on the arrows: the prior control moves into the new part
  listeners.get("pointerdown")({target: {closest: selector => ((selector === ".sla-lookahead") ? {} : null)}});
  prior = dayControl(1);
  next = dayControl(1);
  app._syncPartState("almanac", part(next), part(prior), {});
  assert.equal(next.replacedWith, prior);

  // After the pointer is released (and the click handled) redraws use the new control again
  documentListeners.find(l => l.type === "pointerup").fn();
  await new Promise(resolve => setTimeout(resolve, 5));
  next = dayControl(1);
  app._syncPartState("almanac", part(next), part(prior), {});
  assert.equal(next.replacedWith, null);
  delete globalThis.document;
});

test("a typed day is applied when the number field changes", async () => {
  const {app, listeners} = almanac();
  globalThis.document = {addEventListener: () => {}};
  await app._onFirstRender({}, {});
  listeners.get("change")({target: {matches: () => true, value: "12"}});
  assert.equal(app.offsetDays, 12);
  assert.equal(app.renders, 1);
  delete globalThis.document;
});
