import {MODULE_ID, TEMPLATES} from "./config.mjs";
import {initAlerts, onUpdateWorldTime} from "./alerts.mjs";
import {LunarAlmanac, openAlmanac, refreshAlmanac, scheduleRefresh} from "./almanac.mjs";
import {onGetSceneControlButtons, onRenderEmberCalendar} from "./controls.mjs";
import {editItemMoons, markedMoons, moonGear, onGetHeaderControls} from "./gear.mjs";
import {exportJournal} from "./journal.mjs";
import {applyModuleLanguage} from "./language.mjs";
import {noticeNewVersions, runSelfTest} from "./selftest.mjs";
import {onPreCreateTimePassedMessage, onUpdateWorldTime as addPeakDeltas, registerRecoveryPeriods} from "./recovery.mjs";
import {registerSettings} from "./settings.mjs";
import {
  emberReady, forecastBody, heroAttunement, heroesByAttunement, mayBeListed, partyHeroes, skyBodies, waitForEmber
} from "./sky.mjs";
import {weatherReport} from "./weather.mjs";

/** Settings of other packages whose change the almanac shows: Ember's weather and the system's party. */
const WATCHED_SETTINGS = new Set(["ember.weather", "crucible.party", "dnd5e.primaryParty"]);

Hooks.once("init", () => {
  registerSettings();
  foundry.applications.handlebars.loadTemplates([
    `${TEMPLATES}/body-row.hbs`, `${TEMPLATES}/hero-chip.hbs`, `${TEMPLATES}/timeline.hbs`
  ]);

  Hooks.on("getSceneControlButtons", onGetSceneControlButtons);
  Hooks.on("renderEmberCalendarNavigation", onRenderEmberCalendar);
  Hooks.on("updateWorldTime", onUpdateWorldTime);
  // Before dnd5e 6 recovers limited uses, which it registers on ready
  Hooks.on("updateWorldTime", addPeakDeltas);
  Hooks.on("dnd5e.preCreateTimePassedMessage", onPreCreateTimePassedMessage);
  Hooks.on("getHeaderControlsDocumentSheetV2", onGetHeaderControls);

  // Attunements and blessings live on the heroes, gear in their items (equipping, investing, marks, new talents), the
  // party in a group actor
  Hooks.on("updateActor", onHeroChange);
  for ( const event of ["create", "update", "delete"] ) {
    Hooks.on(`${event}ActiveEffect`, effect => onHeroChange(effect.parent));
    Hooks.on(`${event}Item`, item => onHeroChange(item.parent));
  }
  for ( const event of ["create", "update"] ) {
    Hooks.on(`${event}Setting`, setting => {
      if ( WATCHED_SETTINGS.has(setting.key) ) scheduleRefresh();
    });
  }

  game.modules.get(MODULE_ID).api = {
    /** Open the almanac window. */
    open: openAlmanac,
    /** Redraw the almanac if it is open. */
    refresh: refreshAlmanac,
    /** Show the sky a number of days from the world time in the almanac (0 is today); the world time stays. */
    lookAhead: async days => (await openAlmanac()).lookAhead(days),
    /** Phase, influence and the next change of every moon and realm, now or at another world time. */
    sky: time => skyBodies().map(entry => ({id: entry.body.id, kind: entry.kind, ...forecastBody(entry, time)})),
    /** The active Ember attunement of a hero. */
    attunement: heroAttunement,
    /** The heroes attuned to each moon or realm. */
    heroesByAttunement,
    /** The heroes the almanac lists: the party, or all player characters. */
    heroes: partyHeroes,
    /** The items of an actor which react to the moons. */
    moonGear,
    /** The moons the GM marked on an item. */
    markedMoons,
    /** Ask which moons an item depends on (GM). */
    markItem: editItemMoons,
    /** The weather where the party is and the coming wind changes. */
    weather: () => weatherReport(game.time.worldTime),
    /** Write the coming full moons and dominant realms into a journal entry (GM). */
    exportJournal,
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
  if ( await waitForEmber() ) {
    initAlerts();
    registerRecoveryPeriods();
  }
  noticeNewVersions();
});

/* -------------------------------------------- */

/**
 * Redraw the almanac when the attunement, blessing or gear of a hero it may list has changed, or the members of a
 * party. Party members without a player owner count too.
 * @param {Actor|null} actor
 */
function onHeroChange(actor) {
  if ( !(actor instanceof Actor) ) return;
  if ( ["group", "party"].includes(actor.type) || mayBeListed(actor) ) scheduleRefresh();
}
