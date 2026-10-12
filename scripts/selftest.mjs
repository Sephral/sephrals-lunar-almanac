/**
 * Self-test: checks the Ember internals the almanac reads (Ember has no public API for its sky). Meant to be run after
 * every Ember or Foundry update; the GM also gets a notice once when a newer version than the verified one is
 * installed.
 */

import {MODULE_ID, TESTED_VERSIONS} from "./config.mjs";
import {MOON_PHASES, REALM_PHASES} from "./lunar.mjs";
import {bodyImage, calendarUnits, emberReady, forecastBody, heroAttunement, partyHeroes, skyBodies} from "./sky.mjs";

/**
 * Can an image be loaded?
 * @param {string} src
 * @returns {Promise<boolean>}
 */
function canLoad(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

/**
 * Check the Ember internals.
 * @returns {Promise<{problems: string[], checks: number, moons: number, realms: number, heroes: number}>}
 */
async function checkIntegrations() {
  const problems = [];
  let checks = 0;
  const check = (ok, key, data) => {
    checks++;
    if ( !ok ) problems.push(_loc(`SLA.SELFTEST.${key}`, data));
    return ok;
  };

  const result = {problems, checks: 0, moons: 0, realms: 0, heroes: 0};
  if ( !check(!!game.modules.get("ember")?.active, "EmberInactive") ) return {...result, checks};
  if ( !check(emberReady(), "NoCalendar") ) return {...result, checks};

  const bodies = skyBodies();
  const moons = bodies.filter(b => b.kind === "moon");
  const realms = bodies.filter(b => b.kind === "realm");
  check(moons.length === 6, "MoonCount", {count: moons.length});
  check(realms.length === 3, "RealmCount", {count: realms.length});

  const {secondsPerDay, secondsPerHour} = calendarUnits();
  check(Number.isFinite(secondsPerDay) && (secondsPerDay > secondsPerHour) && (secondsPerHour > 0), "Units");

  // Phases and the forecast
  for ( const entry of bodies ) {
    const known = (entry.kind === "moon") ? MOON_PHASES : REALM_PHASES;
    let state;
    try {
      state = forecastBody(entry);
    } catch(err) {
      console.error(err);
    }
    check(!!state && known.includes(state.phase) && Number.isFinite(state.influence), "Phase",
      {name: entry.body.name ?? entry.body.id});
    check(!!state && (state.endsAt !== null), "Forecast", {name: entry.body.name ?? entry.body.id});
  }

  // Moon images of Ember's calendar
  for ( const {kind, body} of moons ) {
    const src = bodyImage(kind, body);
    check(!!src && await canLoad(src), "Image", {name: body.name ?? body.id, src});
  }

  // Attunements
  const C = globalThis.ember.CONST;
  check(!!C?.ATTUNEMENTS && !!C?.ATTUNEMENT_IDENTIFIERS, "Attunements");
  check(typeof globalThis.ember.api?.systems?.attunement?.getEffectiveAttunementRank === "function", "Rank");
  const heroes = partyHeroes();
  const attuned = heroes.filter(a => heroAttunement(a));
  check(!heroes.length || attuned.length, "Heroes");
  return {problems, checks, moons: moons.length, realms: realms.length, heroes: attuned.length};
}

/* -------------------------------------------- */

/**
 * The installed versions next to the tested ones.
 * @returns {string}
 */
function versionLine() {
  const current = {ember: game.modules.get("ember")?.version, core: game.version};
  return Object.entries(TESTED_VERSIONS)
    .map(([id, tested]) => _loc("SLA.SELFTEST.Version", {id, current: current[id] ?? "–", tested}))
    .join(", ");
}

/* -------------------------------------------- */

/**
 * Run the self-test and report the result as a notification and a whispered chat message.
 * @param {object} [options]
 * @param {boolean} [options.report=true]   Post the chat report
 * @returns {Promise<object>}
 */
export async function runSelfTest({report=true}={}) {
  ui.notifications.info(_loc("SLA.SELFTEST.Started"));
  const result = await checkIntegrations();
  const {problems, checks} = result;
  const versions = versionLine();
  const summary = problems.length
    ? _loc("SLA.SELFTEST.Problems", {problems: problems.length, checks})
    : _loc("SLA.SELFTEST.Passed", {checks, moons: result.moons, realms: result.realms, heroes: result.heroes});

  console.group(`${MODULE_ID} | Self-test`);
  console.log(versions);
  if ( problems.length ) console.warn("Problems:", problems);
  console.groupEnd();

  if ( problems.length ) ui.notifications.warn(summary, {permanent: true});
  else ui.notifications.info(summary);

  if ( report ) {
    const escape = foundry.utils.escapeHTML;
    let content = `<h3>${_loc("SLA.SELFTEST.Title")}</h3><p>${escape(summary)}</p><p><small>${escape(versions)}</small></p>`;
    if ( problems.length ) content += `<ul>${problems.map(p => `<li>${escape(p)}</li>`).join("")}</ul>`;
    const cls = foundry.documents.ChatMessage.implementation;
    await cls.create({content, whisper: [game.user.id], speaker: {alias: game.modules.get(MODULE_ID).title}});
  }
  return result;
}

/* -------------------------------------------- */

/**
 * Tell the GM once when Ember or Foundry is newer than the versions the module was verified against.
 */
export function noticeNewVersions() {
  if ( !game.user.isGM ) return;
  const ember = game.modules.get("ember");
  const current = {ember: ember?.active ? ember.version : null, core: game.version};
  const newer = Object.entries(current)
    .filter(([id, version]) => version && foundry.utils.isNewerVersion(version, TESTED_VERSIONS[id]))
    .map(([id, version]) => `${id} ${version}`);
  if ( !newer.length ) return;
  const signature = newer.join(",");
  if ( game.settings.get(MODULE_ID, "acknowledgedVersions") === signature ) return;
  game.settings.set(MODULE_ID, "acknowledgedVersions", signature);
  ui.notifications.info(_loc("SLA.SELFTEST.NewVersions", {versions: newer.join(", ")}), {permanent: true});
}
