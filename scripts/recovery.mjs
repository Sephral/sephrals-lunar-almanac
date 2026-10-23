/**
 * Recovery at the peaks of the sky in D&D 5e. Ember's D&D 5e worlds run on dnd5e 6, which recovers limited uses with
 * the calendar: on every change of the world time it counts how often midnight, dawn and dusk passed and recovers the
 * uses whose recovery period belongs to one of these counts. The almanac adds one recovery period per moon and realm,
 * "Full moon of Cora", and counts how often each of them reached its peak, so an item can recover at a full moon.
 */

import {PEAK_PHASE, phaseStarts} from "./lunar.mjs";
import {bodyName, calendarUnits, emberReady, phaseAt, scanSettings, skyBodies} from "./sky.mjs";

/** The recovery periods of the almanac start with this, followed by the id of the moon or realm. */
const PERIOD_PREFIX = "sla-";

/** The peaks of the last change of the world time, for dnd5e's time passed message. */
let lastPeaks = [];

/**
 * The recovery period of a moon or realm, also the key of its count in dnd5e's time deltas.
 * @param {string} bodyId
 * @returns {string}
 */
export function recoveryPeriod(bodyId) {
  return `${PERIOD_PREFIX}${bodyId}`;
}

/**
 * Does the system recover limited uses with the calendar (dnd5e 6)?
 * @returns {boolean}
 */
export function recoverySupported() {
  return (game.system?.id === "dnd5e") && (CONFIG.DND5E?.calendarDeltasRecoveryMapping instanceof Map)
    && !!CONFIG.DND5E?.limitedUsePeriods;
}

/**
 * Add a recovery period for every moon and realm, once Ember's calendar is ready.
 * @returns {number}  How many periods were added
 */
export function registerRecoveryPeriods() {
  if ( !recoverySupported() || !emberReady() ) return 0;
  let added = 0;
  for ( const {kind, body} of skyBodies() ) {
    const id = recoveryPeriod(body.id);
    const label = _loc(`SLA.Recovery.${kind}`, {name: bodyName(body.id, body)});
    CONFIG.DND5E.limitedUsePeriods[id] = {label, abbreviation: label, formula: true};
    CONFIG.DND5E.calendarDeltasRecoveryMapping.set(id, id);
    added++;
  }
  return added;
}

/**
 * How often each moon and realm reached its peak after one time up to another. A jump of more than a calendar year
 * counts the peaks of its last year.
 * @param {number} from
 * @param {number} to
 * @returns {Record<string, number>}  Counts by recovery period, only for bodies which reached their peak
 */
export function peakCounts(from, to) {
  return Object.fromEntries(peaksBetween(from, to).map(({body, count}) => [recoveryPeriod(body.id), count]));
}

/**
 * The moons and realms which reached their peak after one time up to another, with how often.
 * @param {number} from
 * @param {number} to
 * @returns {{kind: string, body: object, count: number}[]}
 */
function peaksBetween(from, to) {
  if ( !(to > from) ) return [];
  const {secondsPerDay, daysPerYear} = calendarUnits();
  const start = Math.max(from, to - (daysPerYear * secondsPerDay));
  const peaks = [];
  for ( const {kind, body} of skyBodies() ) {
    const {step, precision} = scanSettings(body);
    const count = phaseStarts(t => phaseAt(body, t).phase, start, to, step, precision)
      .filter(entry => entry.phase === PEAK_PHASE[kind]).length;
    if ( count ) peaks.push({kind, body, count});
  }
  return peaks;
}

/**
 * Hook "updateWorldTime": add the peaks to the time deltas dnd5e recovers from. dnd5e writes its deltas in a hook
 * registered before any module and recovers in one it registers when the game is ready, after the modules' hooks.
 * @param {number} worldTime
 * @param {number} deltaTime
 * @param {object} options
 */
export function onUpdateWorldTime(worldTime, deltaTime, options) {
  lastPeaks = [];
  if ( !game.user?.isActiveGM || !(deltaTime > 0) || !recoverySupported() || !emberReady() ) return;
  const deltas = options?.dnd5e?.deltas;
  if ( !deltas ) return;
  lastPeaks = peaksBetween(worldTime - deltaTime, worldTime);
  for ( const {body, count} of lastPeaks ) deltas[recoveryPeriod(body.id)] = count;
}

/**
 * Hook "dnd5e.preCreateTimePassedMessage": name the peaks in the message which lists what recovered. Without them a
 * recovery at a full moon in the middle of the day would come with an empty message.
 * @param {{create: boolean, data: object}} messageConfig
 */
export function onPreCreateTimePassedMessage(messageConfig) {
  const peaks = lastPeaks;
  lastPeaks = [];
  if ( !messageConfig?.create || !peaks.length || !messageConfig.data ) return;
  const lines = peaks.map(({kind, body}) => `<p>${_loc(`SLA.Alert.Peak.${kind}`, {name: bodyName(body.id, body)})}</p>`);
  messageConfig.data.content = (messageConfig.data.content ?? "") + lines.join("");
}
