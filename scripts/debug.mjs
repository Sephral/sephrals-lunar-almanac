/**
 * The part of the Lunar Almanac in the debug file of Sephral's modules: verified and installed versions, whether
 * Ember's calendar is ready, the phase of every moon and realm at the world time and how many heroes are listed.
 * The module reads no chat messages.
 */

import {MODULE_ID, TESTED_VERSIONS} from "./config.mjs";
import {registerDebugProvider} from "./debug-file.mjs";
import {recoverySupported} from "./recovery.mjs";
import {emberReady, forecastBody, partyHeroes, skyBodies} from "./sky.mjs";

/**
 * Run a check that may fail on an unusual world and keep the error instead.
 * @param {Function} fn
 * @returns {*}
 */
function attempt(fn) {
  try {
    return fn();
  } catch(err) {
    return {error: String(err?.stack ?? err)};
  }
}

/**
 * The state of the module in short.
 * @returns {object}
 */
export function describeState() {
  const ember = game.modules.get("ember");
  const time = game.time?.worldTime ?? 0;
  return {
    tested: TESTED_VERSIONS,
    installed: {ember: ember?.active ? ember.version : null, core: game.version},
    emberReady: emberReady(),
    worldTime: time,
    sky: attempt(() => skyBodies().map(entry => ({id: entry.body.id, kind: entry.kind,
      ...attempt(() => forecastBody(entry, time))}))),
    heroes: attempt(() => partyHeroes().length),
    recoveryPeriods: attempt(() => recoverySupported())
  };
}

/**
 * Register the module's part. Call in "init".
 */
export function registerDebug() {
  registerDebugProvider({
    moduleId: MODULE_ID,
    label: () => _loc("SLA.DEBUG.Entry"),
    notice: file => _loc("SLA.DEBUG.Saved", {file}),
    recent: () => ({details: describeState()})
  });
}
