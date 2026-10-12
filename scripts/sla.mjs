import {MODULE_ID, TEMPLATES} from "./config.mjs";
import {initAlerts, onUpdateWorldTime} from "./alerts.mjs";
import {LunarAlmanac, openAlmanac, refreshAlmanac, scheduleRefresh} from "./almanac.mjs";
import {onGetSceneControlButtons, onRenderEmberCalendar} from "./controls.mjs";
import {applyModuleLanguage} from "./language.mjs";
import {noticeNewVersions, runSelfTest} from "./selftest.mjs";
import {registerSettings} from "./settings.mjs";
import {emberReady, forecastBody, heroAttunement, heroesByAttunement, skyBodies, waitForEmber} from "./sky.mjs";

Hooks.once("init", () => {
  registerSettings();
  foundry.applications.handlebars.loadTemplates([`${TEMPLATES}/body-row.hbs`, `${TEMPLATES}/hero-chip.hbs`]);

  Hooks.on("getSceneControlButtons", onGetSceneControlButtons);
  Hooks.on("renderEmberCalendarNavigation", onRenderEmberCalendar);
  Hooks.on("updateWorldTime", onUpdateWorldTime);

  // Attunements and blessings live on the heroes
  Hooks.on("updateActor", onHeroChange);
  for ( const event of ["create", "update", "delete"] ) {
    Hooks.on(`${event}ActiveEffect`, effect => onHeroChange(effect.parent));
  }

  game.modules.get(MODULE_ID).api = {
    /** Open the almanac window. */
    open: openAlmanac,
    /** Redraw the almanac if it is open. */
    refresh: refreshAlmanac,
    /** Phase, influence and the next change of every moon and realm. */
    sky: () => skyBodies().map(entry => ({id: entry.body.id, kind: entry.kind, ...forecastBody(entry)})),
    /** The active Ember attunement of a hero. */
    attunement: heroAttunement,
    /** The heroes attuned to each moon or realm. */
    heroesByAttunement,
    /** Is Ember's calendar ready? */
    ready: emberReady,
    /** Check the Ember integration (GM). */
    runSelfTest,
    LunarAlmanac
  };
});

/** Applying a fixed module language loads its file; the version notice waits for it. */
let languageReady = Promise.resolve();

Hooks.once("i18nInit", () => {
  languageReady = applyModuleLanguage(game.settings.get(MODULE_ID, "uiLanguage"));
});

Hooks.once("ready", async () => {
  await languageReady;
  if ( await waitForEmber() ) initAlerts();
  noticeNewVersions();
});

/* -------------------------------------------- */

/**
 * Redraw the almanac when a hero's attunement or blessing may have changed.
 * @param {Actor|null} actor
 */
function onHeroChange(actor) {
  if ( !(actor instanceof Actor) || !actor.hasPlayerOwner ) return;
  scheduleRefresh();
}
