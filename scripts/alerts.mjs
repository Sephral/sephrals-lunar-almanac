/**
 * Phase alerts: every client compares the phases of all moons and realms before and after a change of the world time
 * and announces the changes. The module computes the phases itself for the true world time, so Ember's clock
 * animation and its day and night simulation never cause an alert.
 */

import {MODULE_ID, setting} from "./config.mjs";
import {PEAK_PHASE} from "./lunar.mjs";
import {highlightBodies, phaseLabel, scheduleRefresh} from "./almanac.mjs";
import {bodyName, emberReady, heroesByAttunement, phaseAt, skyBodies} from "./sky.mjs";

/** The phases at the last known world time, by body id. */
let phases = null;

/**
 * The phases of every body at a time.
 * @param {number} time
 * @returns {Map<string, string>}
 */
function snapshot(time) {
  return new Map(skyBodies().map(({body}) => [body.id, phaseAt(body, time).phase]));
}

/**
 * Remember the current phases.
 */
export function initAlerts() {
  phases = emberReady() ? snapshot(game.time.worldTime) : null;
}

/* -------------------------------------------- */

/**
 * Hook "updateWorldTime": find the bodies which changed their phase and announce them.
 * @param {number} worldTime
 */
export function onUpdateWorldTime(worldTime) {
  if ( !emberReady() ) return;
  scheduleRefresh();
  const now = snapshot(worldTime);
  const before = phases;
  phases = now;
  if ( !before ) return;
  const changes = [];
  for ( const {kind, body} of skyBodies() ) {
    const from = before.get(body.id);
    const to = now.get(body.id);
    if ( from && to && (from !== to) ) changes.push({kind, body, from, to, peak: to === PEAK_PHASE[kind]});
  }
  if ( !changes.length ) return;
  highlightBodies(changes.map(c => c.body.id));
  notify(changes);
  postChat(changes);
}

/* -------------------------------------------- */

/**
 * The names of the heroes attuned to a body, for this user.
 * @param {string} id
 * @param {Map<string, object[]>} heroes
 * @returns {string}
 */
function heroNames(id, heroes) {
  return (heroes.get(id) ?? []).map(h => h.actor.name).join(", ");
}

/**
 * The text of a change.
 * @param {{kind: string, body: object, to: string, peak: boolean}} change
 * @param {Map<string, object[]>} heroes
 * @returns {string}
 */
function changeText(change, heroes) {
  const name = bodyName(change.body.id, change.body);
  let text = change.peak
    ? _loc(`SLA.Alert.Peak.${change.kind}`, {name})
    : _loc("SLA.Alert.Change", {name, phase: phaseLabel(change.to)});
  const names = heroNames(change.body.id, heroes);
  if ( names ) text += ` ${_loc("SLA.Alert.Heroes", {names})}`;
  return text;
}

/**
 * Show notifications for the changes, as the user chose.
 * @param {object[]} changes
 */
function notify(changes) {
  const mode = setting("phaseAlert");
  if ( mode === "off" ) return;
  const heroes = heroesByAttunement();
  for ( const change of changes ) {
    if ( (mode === "peak") && !change.peak ) continue;
    if ( (mode === "attuned") && !heroes.get(change.body.id)?.length ) continue;
    ui.notifications.info(changeText(change, heroes));
  }
}

/**
 * Post the full moons and dominant realms to the chat, written once by the active GM.
 * @param {object[]} changes
 */
function postChat(changes) {
  if ( !game.user.isActiveGM || !setting("chatAlert") ) return;
  const peaks = changes.filter(c => c.peak);
  if ( !peaks.length ) return;
  const heroes = heroesByAttunement();
  const escape = foundry.utils.escapeHTML;
  const lines = peaks.map(c => `<p>${escape(changeText(c, heroes))}</p>`).join("");
  const content = `<div class="sla-chat"><h3><i class="fa-solid fa-moon"></i> ${escape(_loc("SLA.Almanac.Title"))}</h3>${lines}</div>`;
  const cls = foundry.documents.ChatMessage.implementation;
  cls.create({content, speaker: {alias: game.modules.get(MODULE_ID).title}}).catch(err => {
    console.warn(`${MODULE_ID} | Could not post the phase change`, err);
  });
}
