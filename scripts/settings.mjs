/**
 * Settings of the module. Like in every Sephral module, all options appear in Foundry's settings dialog under this
 * module, starting with the module language. World settings apply to everyone and are only shown to the GM; client
 * settings follow the user.
 */

import {MODULE_ID} from "./config.mjs";
import {refreshAlmanac} from "./almanac.mjs";
import {refreshButtons} from "./controls.mjs";
import {FOLLOW_FOUNDRY, applyModuleLanguage} from "./language.mjs";
import {runSelfTest} from "./selftest.mjs";

/**
 * @typedef SettingDefinition
 * @property {Function} type                  Boolean, String or Number
 * @property {*} default
 * @property {Record<string, string>} [choices]
 * @property {{min: number, max: number, step: number}} [range]
 * @property {"world"|"user"|"client"} [scope="world"]
 * @property {Function} [onChange]
 */

/**
 * The settings of the module, in the order they appear in the settings dialog.
 * @type {Record<string, SettingDefinition>}
 */
export const SETTINGS = {
  uiLanguage: {type: String, default: FOLLOW_FOUNDRY, scope: "client", onChange: onLanguageChange, choices: {
    [FOLLOW_FOUNDRY]: "SLA.LANGUAGE.default", de: "SLA.LANGUAGE.de", en: "SLA.LANGUAGE.en"}},
  phaseAlert: {type: String, default: "peak", scope: "client", choices: {
    peak: "SLA.SETTINGS.phaseAlert.peak", attuned: "SLA.SETTINGS.phaseAlert.attuned",
    all: "SLA.SETTINGS.phaseAlert.all", off: "SLA.SETTINGS.phaseAlert.off"}},
  chatAlert: {type: Boolean, default: false},
  timelineDays: {type: Number, default: 30, scope: "client", range: {min: 0, max: 60, step: 1},
    onChange: () => refreshAlmanac()},
  calendarButton: {type: Boolean, default: true, scope: "client", onChange: () => refreshButtons()},
  controlButton: {type: Boolean, default: true, scope: "client", onChange: () => refreshButtons()}
};

/* -------------------------------------------- */

/**
 * Switch the module strings when the user picks another module language, and redraw what shows them.
 * @param {string} value
 */
function onLanguageChange(value) {
  applyModuleLanguage(value).then(() => {
    refreshAlmanac();
    refreshButtons();
    if ( game.settings.sheet?.rendered ) game.settings.sheet.render();
  });
}

/* -------------------------------------------- */

/**
 * The menu button which runs the self-test. Foundry only accepts application classes as menus; this one runs the test
 * instead of opening a window.
 */
class AlmanacSelfTestMenu extends foundry.applications.api.ApplicationV2 {
  /** @override */
  async render() {
    if ( game.user.isGM ) await runSelfTest();
    return this;
  }
}

/* -------------------------------------------- */

/**
 * Register all settings of the module and the self-test menu button.
 */
export function registerSettings() {
  for ( const [key, def] of Object.entries(SETTINGS) ) {
    game.settings.register(MODULE_ID, key, {
      name: `SLA.SETTINGS.${key}.name`,
      hint: `SLA.SETTINGS.${key}.hint`,
      scope: def.scope ?? "world",
      config: true,
      type: def.range ? new foundry.data.fields.NumberField({...def.range, initial: def.default}) : def.type,
      choices: def.choices,
      default: def.default,
      onChange: def.onChange
    });
  }

  // The newer Ember and Foundry versions the GM was already told about
  game.settings.register(MODULE_ID, "acknowledgedVersions", {scope: "client", config: false, type: String, default: ""});

  game.settings.registerMenu(MODULE_ID, "selfTest", {
    name: "SLA.SELFTEST.Title",
    label: "SLA.SELFTEST.Run",
    hint: "SLA.SELFTEST.Hint",
    icon: "fa-solid fa-stethoscope",
    type: AlmanacSelfTestMenu,
    restricted: true
  });
}
