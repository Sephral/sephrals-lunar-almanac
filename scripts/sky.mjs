/**
 * The Ember adapter: everything the module reads from Ember lives here. Ember has no public API for the sky, so the
 * module reads its calendar at runtime, read only: the moons and inner realms of `ember.calendar`, their phase for any
 * time through `EmberMoon#animate`, the attunement options of `ember.CONST` and the attunement flags of the heroes.
 * Nothing of Ember is copied into the module; names, colors and images come from the running Ember module.
 */

import {HERO_TYPES, setting} from "./config.mjs";
import {PEAK_PHASE, findChange, findStart, nextStart} from "./lunar.mjs";

/** Images Ember's calendar uses for its moons, by moon id. */
const MOON_IMAGE = id => `modules/ember/ui/calendar/moon-${id}.webp`;

/** Attunements without a body in the sky, for when Ember's attunement options or calendar cannot be read. */
const UNBOUND_FALLBACK = ["heart", "abyss"];

/* -------------------------------------------- */

/**
 * Is Ember active and its calendar ready? Ember only creates its calendar when its adventure scenes exist.
 * @returns {boolean}
 */
export function emberReady() {
  const ember = globalThis.ember;
  return !!(game.modules.get("ember")?.active && ember?.ready && ember.calendar?.moons
    && Object.keys(ember.calendar.moons).length);
}

/**
 * Wait for Ember's asynchronous setup.
 * @returns {Promise<boolean>}  Whether the calendar is ready
 */
export async function waitForEmber() {
  const module = game.modules.get("ember");
  if ( !module?.active ) return false;
  try {
    await module.setupPromise;
  } catch {
    return false;
  }
  return emberReady();
}

/* -------------------------------------------- */

/**
 * The time units of the calendar.
 * @returns {{secondsPerDay: number, secondsPerHour: number, secondsPerMinute: number, daysPerYear: number}}
 */
export function calendarUnits() {
  const days = globalThis.ember?.calendar?.days ?? game.time.calendar?.days ?? {};
  const secondsPerMinute = days.secondsPerMinute || 60;
  const secondsPerHour = secondsPerMinute * (days.minutesPerHour || 60);
  const secondsPerDay = days.secondsPerDay || (secondsPerHour * (days.hoursPerDay || 24));
  return {secondsPerDay, secondsPerHour, secondsPerMinute, daysPerYear: days.daysPerYear || 365};
}

/**
 * Seconds since the start of the calendar day at a time.
 * @param {number} time
 * @returns {number}
 */
export function secondsIntoDay(time) {
  const {secondsPerHour, secondsPerMinute} = calendarUnits();
  try {
    const c = game.time.calendar.timeToComponents(time);
    return (c.hour * secondsPerHour) + (c.minute * secondsPerMinute) + c.second;
  } catch {
    return 0;
  }
}

/**
 * The date of a time, formatted by Ember's calendar.
 * @param {number} time
 * @returns {string}
 */
export function formatDate(time) {
  try {
    return globalThis.ember.calendar.format(time, "emberDate") || "";
  } catch {
    return "";
  }
}

/* -------------------------------------------- */

/**
 * @typedef SkyBody
 * @property {"moon"|"realm"} kind
 * @property {object} body     The EmberMoon or EmberRealm
 */

/**
 * The moons and inner realms of Ember's calendar.
 * @returns {SkyBody[]}
 */
export function skyBodies() {
  if ( !emberReady() ) return [];
  const calendar = globalThis.ember.calendar;
  return [
    ...Object.values(calendar.moons ?? {}).map(body => ({kind: "moon", body})),
    ...Object.values(calendar.realms ?? {}).map(body => ({kind: "realm", body}))
  ].filter(({body}) => typeof body?.animate === "function");
}

/**
 * The phase of a body at a time. Ember animates the visible moons for several seconds after a time change, so the
 * module never reads `moon.phase` but always computes the phase for the true time.
 * @param {object} body
 * @param {number} [time]
 * @returns {{phase: string, influence: number}}
 */
export function phaseAt(body, time=game.time.worldTime) {
  const {phase, influence} = body.animate(time);
  return {phase, influence};
}

/**
 * The name of a body or attunement as Ember provides it.
 * @param {string} id
 * @param {object} [body]
 * @returns {string}
 */
export function bodyName(id, body) {
  const option = globalThis.ember?.CONST?.ATTUNEMENTS?.[id];
  return body?.name || option?.name || option?.label || id;
}

/**
 * A CSS color for a body.
 * @param {object} body
 * @returns {string}
 */
export function bodyColor(body) {
  const option = globalThis.ember?.CONST?.ATTUNEMENTS?.[body?.id];
  for ( const color of [body?.color, option?.color] ) {
    if ( (color === null) || (color === undefined) ) continue;
    try {
      const css = foundry.utils.Color.from(color).css;
      if ( css ) return css;
    } catch {}
  }
  return "#9a9aa8";
}

/**
 * The image of a body: Ember's calendar image for moons, the cosmos icon for realms.
 * @param {"moon"|"realm"} kind
 * @param {object} body
 * @returns {string|null}
 */
export function bodyImage(kind, body) {
  if ( kind === "moon" ) return MOON_IMAGE(body.id);
  return globalThis.ember?.CONST?.ATTUNEMENTS?.[body.id]?.icon || null;
}

/**
 * Scan settings for a body: a step much shorter than its shortest phase.
 * @param {object} body
 * @returns {{step: number, horizon: number, precision: number}}
 */
export function scanSettings(body) {
  const {secondsPerDay, secondsPerHour, secondsPerMinute} = calendarUnits();
  const period = Number(body.period) > 0 ? Number(body.period) : 40;
  const step = Math.max(Math.min(secondsPerHour * Math.ceil(period / 30), secondsPerDay), secondsPerMinute);
  return {step, horizon: Math.ceil(period * 1.05 * secondsPerDay), precision: secondsPerMinute};
}

/**
 * @typedef BodyForecast
 * @property {string} phase
 * @property {number} influence
 * @property {number|null} endsAt   When the current phase ends
 * @property {number|null} peakAt   When the next full moon or dominant phase starts (null while it runs)
 */

/**
 * Forecast a body from a time.
 * @param {SkyBody} entry
 * @param {number} [now]
 * @returns {BodyForecast}
 */
export function forecastBody({kind, body}, now=game.time.worldTime) {
  const sample = t => body.animate(t).phase;
  const {step, horizon, precision} = scanSettings(body);
  const {phase, influence} = phaseAt(body, now);
  const endsAt = findChange(sample, now, horizon, step, precision);
  const peak = PEAK_PHASE[kind];
  const peakAt = (phase === peak) ? null : nextStart(sample, peak, now, horizon, step, precision);
  return {phase, influence, endsAt, peakAt};
}

/** The influence at which each body enters its peak phase, by body id. */
const thresholds = new Map();

/**
 * From which influence on is a body full or dominant? Ember decides this in its code; the almanac measures it at the
 * start of a peak phase, so nothing of Ember's rules is copied.
 * @param {SkyBody} entry
 * @returns {number|null}   The influence in percent
 */
export function peakThreshold({kind, body}) {
  if ( thresholds.has(body.id) ) return thresholds.get(body.id);
  const sample = t => body.animate(t).phase;
  const {step, horizon, precision} = scanSettings(body);
  const peak = PEAK_PHASE[kind];
  const now = game.time.worldTime;
  let value = null;
  try {
    const start = (sample(now) === peak) ? findStart(sample, now, horizon, step, precision)
      : nextStart(sample, peak, now, horizon, step, precision);
    if ( start !== null ) value = Math.floor(body.animate(start).influence * 100);
  } catch {}
  if ( Number.isFinite(value) ) thresholds.set(body.id, value);
  return value;
}

/* -------------------------------------------- */

/**
 * @typedef HeroAttunement
 * @property {Actor} actor
 * @property {string} id            Attunement id, the same as the id of its moon or realm
 * @property {string} label
 * @property {number|null} rank     Effective rank, a blessing included
 * @property {number|null} baseRank Rank without a blessing
 * @property {boolean} blessed
 * @property {ActiveEffect|null} blessing
 */

/**
 * The members of the system's party: Crucible's party (the group actor chosen in the system settings) or the primary
 * party of D&D 5e. Read directly, so no warning appears when no party is set. The members are resolved from their
 * stored ids as well: a group prepared before its members were loaded has an empty member list on that client.
 * @returns {Actor[]}   All members, also those this user may not see
 */
export function systemParty() {
  let party = null;
  try {
    party = (game.system.id === "crucible") ? globalThis.crucible?.party : game.actors.party;
  } catch {
    return [];
  }
  const system = party?.system;
  if ( !system ) return [];
  const members = new Set(system.actors instanceof Set ? system.actors : []);
  for ( const m of Array.isArray(system.members) ? system.members : [] ) {
    const actor = (m?.actor instanceof Actor) ? m.actor : game.actors.get?.(m?.actorId ?? m?.actor);
    if ( actor instanceof Actor ) members.add(actor);
  }
  return [...members];
}

/**
 * Is an actor a player character type?
 * @param {Actor} actor
 * @returns {boolean}
 */
function isHeroType(actor) {
  return HERO_TYPES.includes(actor?.type);
}

/**
 * The player characters this user may see: the members of the party, or every player character when the GM chose so
 * or the party has no heroes. Whether the party counts is decided for everyone alike; only then are the heroes this
 * user may not see left out, so a player never falls back to all player characters.
 * @returns {Actor[]}
 */
export function partyHeroes() {
  const party = (setting("heroSource") === "party") ? systemParty().filter(isHeroType) : [];
  const list = party.length ? party : game.actors.filter(a => isHeroType(a) && a.hasPlayerOwner);
  return [...new Set(list)].filter(a => a.visible).sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
}

/**
 * Could the almanac list an actor, whether or not this user sees it? Used to redraw after changes.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function mayBeListed(actor) {
  if ( !isHeroType(actor) ) return false;
  return actor.hasPlayerOwner || systemParty().includes(actor);
}

/**
 * The active Ember attunement of a hero.
 * @param {Actor} actor
 * @returns {HeroAttunement|null}
 */
export function heroAttunement(actor) {
  const C = globalThis.ember?.CONST;
  const identifier = foundry.utils.getProperty(actor, "flags.ember.attunement");
  const option = C?.ATTUNEMENT_IDENTIFIERS?.[identifier] ?? C?.ATTUNEMENTS?.[identifier];
  if ( !option?.id ) return null;
  const progression = foundry.utils.getProperty(actor, `flags.ember.attunements.${option.id}`) ?? {};
  const getRank = globalThis.ember?.api?.systems?.attunement?.getEffectiveAttunementRank;
  const rankOf = p => {
    try {
      return (typeof getRank === "function") ? (getRank(p)?.rank ?? null) : null;
    } catch {
      return null;
    }
  };
  const bonus = Number(progression.bonus) || 0;
  return {
    actor,
    id: option.id,
    label: option.name || option.label || option.id,
    rank: rankOf(progression),
    baseRank: rankOf({...progression, bonus: 0}),
    blessed: bonus > 0,
    blessing: (bonus > 0) ? findBlessing(actor, option.id) : null
  };
}

/**
 * The active effect which boosts an attunement of an actor (Ember's change type "boostAttunement").
 * @param {Actor} actor
 * @param {string} id
 * @returns {ActiveEffect|null}
 */
function findBlessing(actor, id) {
  const key = `flags.ember.attunements.${id}`;
  const effects = (typeof actor.allApplicableEffects === "function") ? actor.allApplicableEffects() : actor.effects;
  for ( const effect of effects ) {
    if ( !effect.active ) continue;
    const changes = effect.system?.changes ?? effect.changes ?? [];
    if ( changes.some(c => (c.type === "boostAttunement") && (c.key === key)) ) return effect;
  }
  return null;
}

/**
 * The heroes attuned to each attunement id.
 * @returns {Map<string, HeroAttunement[]>}
 */
export function heroesByAttunement() {
  const map = new Map();
  for ( const actor of partyHeroes() ) {
    const attunement = heroAttunement(actor);
    if ( !attunement ) continue;
    if ( !map.has(attunement.id) ) map.set(attunement.id, []);
    map.get(attunement.id).push(attunement);
  }
  return map;
}

/**
 * The ids of Ember's attunement options.
 * @returns {string[]}
 */
export function attunementIds() {
  return Object.entries(globalThis.ember?.CONST?.ATTUNEMENTS ?? {}).map(([key, option]) => option?.id ?? key);
}

/**
 * The attunements without a moon or inner realm: Ember's attunement options minus the bodies of its calendar.
 * @returns {string[]}
 */
export function unboundAttunements() {
  const ids = attunementIds();
  const bodies = new Set(skyBodies().map(({body}) => body.id));
  if ( !ids.length || !bodies.size ) return [...UNBOUND_FALLBACK];
  return ids.filter(id => !bodies.has(id));
}
