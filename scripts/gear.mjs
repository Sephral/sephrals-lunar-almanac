/**
 * Moon sensitive gear: items of the heroes which react to the moons. Two sources, both read at runtime:
 * - Crucible item hooks. Ember registers code for some items, talents and affixes in `crucible.api.hooks`; Crucible
 *   binds it to the actor while the item is active. Code which reads the moons of Ember's calendar marks the item,
 *   and the moon ids found in that code tell which moons. Nothing of Ember's item rules is copied into the module.
 * - A marker the GM sets on an item ("depends on these moons"), for every other item and for other systems.
 */

import {MODULE_ID} from "./config.mjs";
import {hookSource, mergeMoons, moonReferences} from "./lunar.mjs";
import {bodyName, emberReady} from "./sky.mjs";
import {countFeature} from "./usage.mjs";

/** The flag of the GM's marker: an array of moon ids. */
export const GEAR_FLAG = "moons";

/** Moons found in hook objects, cached per hook object. */
const scanned = new WeakMap();

/**
 * The ids of the moons of Ember's calendar.
 * @returns {string[]}
 */
export function moonIds() {
  return Object.keys(globalThis.ember?.calendar?.moons ?? {});
}

/**
 * The moons a hook object reads, cached.
 * @param {object} hooks
 * @param {string[]} ids
 * @returns {string[]|null}
 */
function scanHooks(hooks, ids) {
  if ( !hooks || (typeof hooks !== "object") ) return null;
  if ( !scanned.has(hooks) ) scanned.set(hooks, moonReferences(hookSource(hooks), ids));
  return scanned.get(hooks);
}

/**
 * The moons the GM marked on an item.
 * @param {Item} item
 * @returns {string[]}
 */
export function markedMoons(item) {
  const value = foundry.utils.getProperty(item, `flags.${MODULE_ID}.${GEAR_FLAG}`);
  return Array.isArray(value) ? value.filter(id => typeof id === "string") : [];
}

/**
 * @typedef MoonGear
 * @property {Item} item
 * @property {string} name        The item name, with the affix that reacts to the moons
 * @property {string[]} moons     Moon ids
 * @property {boolean} marked     The GM marked the item
 */

/**
 * The items of an actor which react to the moons.
 * @param {Actor} actor
 * @returns {MoonGear[]}
 */
export function moonGear(actor) {
  const ids = moonIds();
  if ( !actor || !ids.length ) return [];
  const found = new Map();
  const add = (item, name, moons, marked=false) => {
    const entry = found.get(item.id) ?? {item, names: new Set(), moons: [], marked: false};
    entry.names.add(name);
    entry.moons = mergeMoons(ids, entry.moons, moons);
    entry.marked ||= marked;
    found.set(item.id, entry);
  };

  // Crucible hooks of the active items, talents and affixes of the actor
  const registry = globalThis.crucible?.api?.hooks;
  const actorHooks = actor.system?.actorHooks;
  if ( registry && actorHooks && (typeof actorHooks === "object") ) {
    const seen = new Set();
    for ( const list of Object.values(actorHooks) ) {
      if ( !Array.isArray(list) ) continue;
      for ( const {item, affix} of list ) {
        if ( !item?.id ) continue;
        const key = `${item.id}.${affix?.id ?? ""}`;
        if ( seen.has(key) ) continue;
        seen.add(key);
        const hooks = affix ? registry.affix?.[affix.system?.identifier]
          : registry[item.type]?.[item.system?.identifier || item.id];
        const moons = scanHooks(hooks, ids);
        if ( moons?.length ) add(item, affix?.name ? `${item.name} (${affix.name})` : item.name, moons);
      }
    }
  }

  // The GM's markers
  for ( const item of actor.items ?? [] ) {
    const moons = mergeMoons(ids, markedMoons(item));
    if ( moons.length ) add(item, item.name, moons, true);
  }

  return [...found.values()]
    .map(({item, names, moons, marked}) => ({item, name: [...names].join(", "), moons, marked}))
    .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
}

/* -------------------------------------------- */

/**
 * Ask the GM which moons an item depends on and store the answer on the item.
 * @param {Item} item
 * @returns {Promise<string[]|null>}  The marked moons, or null when cancelled
 */
export async function editItemMoons(item) {
  // An item in a locked compendium cannot store the mark
  if ( !game.user.isGM || !(item instanceof Item) || item.compendium?.locked || !emberReady() ) return null;
  const marked = new Set(markedMoons(item));
  const escape = foundry.utils.escapeHTML;
  const boxes = Object.values(globalThis.ember.calendar.moons).map(moon => `
    <label class="checkbox">
      <input type="checkbox" name="moon" value="${escape(moon.id)}" ${marked.has(moon.id) ? "checked" : ""}>
      ${escape(bodyName(moon.id, moon))}
    </label>`).join("");
  // A div without attributes keeps the checked state; a content string would be cleaned
  const content = document.createElement("div");
  content.innerHTML = `<p class="hint">${escape(_loc("SLA.Gear.MarkHint", {name: item.name}))}</p>
    <div class="sla-moon-choice">${boxes}</div>`;
  const result = await foundry.applications.api.DialogV2.wait({
    window: {title: _loc("SLA.Gear.MarkTitle"), icon: "fa-solid fa-moon"},
    classes: ["sla-gear-dialog"],
    content,
    buttons: [
      {action: "save", label: _loc("SLA.Dialog.Save"), icon: "fa-solid fa-check", default: true,
        callback: (event, button) => [...button.form.querySelectorAll('input[name="moon"]:checked')].map(i => i.value)},
      {action: "cancel", label: _loc("SLA.Dialog.Cancel"), icon: "fa-solid fa-xmark", callback: () => null}
    ],
    rejectClose: false
  });
  if ( !Array.isArray(result) ) return null;
  countFeature(MODULE_ID, "gearMarked");
  if ( result.length ) await item.setFlag(MODULE_ID, GEAR_FLAG, result);
  else if ( marked.size ) await item.unsetFlag(MODULE_ID, GEAR_FLAG);
  return result;
}

/**
 * Hook "getHeaderControlsDocumentSheetV2": the GM marks an item's moons from the menu of its sheet.
 * @param {DocumentSheetV2} app
 * @param {object[]} controls
 */
export function onGetHeaderControls(app, controls) {
  if ( !game.user.isGM || !(app.document instanceof Item) || !app.isEditable || !game.modules.get("ember")?.active ) return;
  controls.push({
    action: "slaMarkMoons",
    icon: "fa-solid fa-moon",
    label: "SLA.Gear.Mark",
    onClick: () => editItemMoons(app.document)
  });
}
