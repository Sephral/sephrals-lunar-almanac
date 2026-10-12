/**
 * Phase alerts: every client compares the phases of all moons and realms before and after a change of the world time
 * and announces the changes. The module computes the phases itself for the true world time, so Ember's clock
 * animation and its day and night simulation never cause an alert. A jump in time which skips phases (a long rest or
 * a journey) is announced once, with the phases that came and went in between.
 */

import {MODULE_ID, setting} from "./config.mjs";
import {PEAK_PHASE, keepLatest, phaseStarts} from "./lunar.mjs";
import {highlightBodies, phaseLabel, scheduleRefresh} from "./almanac.mjs";
import {
  bodyName, calendarUnits, emberReady, formatDate, heroesByAttunement, phaseAt, scanSettings, skyBodies
} from "./sky.mjs";

/** How many phases of a jump in time one notification or chat message lists. */
const MAX_LISTED = 6;

/** The phases at the last known world time, by body id. */
let phases = null;

/** The last known world time. */
let lastTime = null;

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
  lastTime = game.time.worldTime;
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
  const since = lastTime;
  phases = now;
  lastTime = worldTime;
  if ( !before ) return;
  const events = jumpEvents(since, worldTime);
  if ( events ) {
    highlightBodies([...new Set(events.map(e => e.body.id))]);
    notifyJump(events);
    postChat(events, {jump: true});
    return;
  }
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

/**
 * The phases every body entered during a jump in time which skipped at least one phase, in time order. Null for a
 * normal step, a step back and a jump of more than a calendar year: they only report the net change.
 * @param {number|null} from
 * @param {number} to
 * @returns {object[]|null}
 */
function jumpEvents(from, to) {
  const {secondsPerDay, daysPerYear} = calendarUnits();
  if ( !Number.isFinite(from) || !(to > from) || ((to - from) > (daysPerYear * secondsPerDay)) ) return null;
  const events = [];
  let skipped = false;
  for ( const {kind, body} of skyBodies() ) {
    const {step, precision} = scanSettings(body);
    const entered = phaseStarts(t => phaseAt(body, t).phase, from, to, step, precision);
    if ( entered.length > 1 ) skipped = true;
    for ( const {phase, start, end, current} of entered ) {
      events.push({kind, body, to: phase, start, end, passed: !current, peak: phase === PEAK_PHASE[kind]});
    }
  }
  return skipped ? events.sort((a, b) => a.start - b.start) : null;
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
 * The text of a change. A phase which already ended during a jump in time names its dates.
 * @param {{kind: string, body: object, to: string, peak: boolean, passed?: boolean, start?: number, end?: number}} change
 * @param {Map<string, object[]>} heroes
 * @returns {string}
 */
function changeText(change, heroes) {
  const name = bodyName(change.body.id, change.body);
  const phase = phaseLabel(change.to);
  const start = change.passed ? formatDate(change.start) : "";
  const end = change.passed ? formatDate(change.end) : "";
  let text;
  if ( start && end ) {
    text = change.peak
      ? _loc(`SLA.Alert.WasPeak.${change.kind}`, {name, start, end})
      : _loc("SLA.Alert.WasPhase", {name, phase, start, end});
  }
  else if ( change.peak && !change.passed ) text = _loc(`SLA.Alert.Peak.${change.kind}`, {name});
  else text = _loc("SLA.Alert.Change", {name, phase});
  const names = heroNames(change.body.id, heroes);
  if ( names ) text += ` ${_loc("SLA.Alert.Heroes", {names})}`;
  return text;
}

/**
 * The lines which announce a jump in time: a heading, the latest phases and how many earlier ones are left out.
 * @param {object[]} events
 * @param {Map<string, object[]>} heroes
 * @returns {string[]}
 */
function jumpLines(events, heroes) {
  const {shown, hidden} = keepLatest(events, MAX_LISTED);
  const lines = [_loc("SLA.Alert.Meanwhile"), ...shown.map(e => changeText(e, heroes))];
  if ( hidden ) lines.push(_loc("SLA.Alert.Earlier", {count: hidden}));
  return lines;
}

/**
 * Does the user want to hear about a change?
 * @param {{body: object, peak: boolean}} change
 * @param {string} mode       The phaseAlert setting
 * @param {Map<string, object[]>} heroes
 * @returns {boolean}
 */
function wanted(change, mode, heroes) {
  if ( mode === "off" ) return false;
  if ( mode === "peak" ) return change.peak;
  if ( mode === "attuned" ) return !!heroes.get(change.body.id)?.length;
  return true;
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
    if ( wanted(change, mode, heroes) ) ui.notifications.info(changeText(change, heroes));
  }
}

/**
 * Show one notification which lists the phases of a jump in time, as the user chose.
 * @param {object[]} events
 */
function notifyJump(events) {
  const mode = setting("phaseAlert");
  if ( mode === "off" ) return;
  const heroes = heroesByAttunement();
  const listed = events.filter(e => wanted(e, mode, heroes));
  if ( !listed.length ) return;
  ui.notifications.info(jumpLines(listed, heroes).map(l => foundry.utils.escapeHTML(l)).join("<br>"));
}

/**
 * Post the full moons and dominant realms to the chat, written once by the active GM.
 * @param {object[]} changes
 * @param {object} [options]
 * @param {boolean} [options.jump=false]  The changes are the phases of a jump in time
 */
function postChat(changes, {jump=false}={}) {
  if ( !game.user.isActiveGM || !setting("chatAlert") ) return;
  const peaks = changes.filter(c => c.peak);
  if ( !peaks.length ) return;
  const heroes = heroesByAttunement();
  const escape = foundry.utils.escapeHTML;
  const texts = jump ? jumpLines(peaks, heroes) : peaks.map(c => changeText(c, heroes));
  const lines = texts.map(t => `<p>${escape(t)}</p>`).join("");
  const content = `<div class="sla-chat"><h3><i class="fa-solid fa-moon"></i> ${escape(_loc("SLA.Almanac.Title"))}</h3>${lines}</div>`;
  const cls = foundry.documents.ChatMessage.implementation;
  cls.create({content, speaker: {alias: game.modules.get(MODULE_ID).title}}).catch(err => {
    console.warn(`${MODULE_ID} | Could not post the phase change`, err);
  });
}
