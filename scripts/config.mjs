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
