/**
 * Constants and small helpers shared by the scripts of the module.
 */

/** The id of this module. */
export const MODULE_ID = "sephrals-lunar-almanac";

/** The folder of the module's templates. */
export const TEMPLATES = `modules/${MODULE_ID}/templates`;

/** The versions of Ember and Foundry the module was verified against (see the self-test). */
export const TESTED_VERSIONS = {ember: "0.6.3", core: "14.369"};

/** Actor types of player characters: Crucible heroes and D&D 5e characters. */
export const HERO_TYPES = ["hero", "character"];

/**
 * Read a setting of this module.
 * @param {string} key
 * @returns {*}
 */
export function setting(key) {
  return game.settings.get(MODULE_ID, key);
}

/**
 * Open Foundry's settings on the tab of this module.
 */
export async function openSettings() {
  const sheet = game.settings.sheet;
  await sheet.render({force: true});
  try {
    sheet.changeTab(MODULE_ID, "categories");
  } catch(err) {
    console.warn(`${MODULE_ID} | The settings have no tab for this module`, err);
  }
  sheet.bringToFront?.();
}

/**
 * Put a gear into the title bar of a window that opens the settings of this module. Players only get it when the
 * module has settings for them.
 * @param {HTMLElement} frame   The window frame
 */
export function addSettingsGear(frame) {
  const header = frame?.querySelector(".window-header");
  if ( !header || header.querySelector(".sla-settings") ) return;
  const own = s => (s.namespace === MODULE_ID) && s.config && (s.scope !== "world");
  if ( !game.user.isGM && !Array.from(game.settings.settings.values()).some(own) ) return;
  const gear = document.createElement("button");
  gear.type = "button";
  gear.className = "header-control icon fa-solid fa-gear sla-settings";
  gear.dataset.tooltip = _loc("SLA.Almanac.Settings");
  gear.setAttribute("aria-label", _loc("SLA.Almanac.Settings"));
  gear.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    openSettings();
  });
  const anchor = header.querySelector("[data-action=toggleControls]") ?? header.querySelector("[data-action=close]");
  if ( anchor ) anchor.before(gear);
  else header.append(gear);
}
