/**
 * The almanac window: Ember's six moons and three inner realms with their phase, how long it lasts and when the next
 * full moon comes, the heroes attuned to each of them, and a timeline of the coming days.
 */

import {TEMPLATES, setting} from "./config.mjs";
import {PEAK_PHASE, dayStarts, phaseSegments, spanPercent, splitDuration} from "./lunar.mjs";
import {
  bodyColor, bodyImage, bodyName, calendarUnits, emberReady, forecastBody, formatDate, heroesByAttunement,
  scanSettings, secondsIntoDay, skyBodies, unboundAttunements
} from "./sky.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

/* -------------------------------------------- */

/**
 * A duration as text, for example "3 d 4 h".
 * @param {number|null} seconds
 * @returns {string}
 */
export function durationLabel(seconds) {
  if ( !Number.isFinite(seconds) ) return "";
  const {days, hours} = splitDuration(seconds, calendarUnits());
  if ( days > 0 ) return _loc(hours ? "SLA.Duration.DaysHours" : "SLA.Duration.Days", {days, hours});
  if ( hours > 0 ) return _loc("SLA.Duration.Hours", {hours});
  return _loc("SLA.Duration.LessThanHour");
}

/**
 * The label of a phase.
 * @param {string} phase
 * @returns {string}
 */
export function phaseLabel(phase) {
  const key = `SLA.Phase.${phase}`;
  return game.i18n.has(key) ? _loc(key) : phase;
}

/* -------------------------------------------- */

/**
 * Open the almanac, or bring it to the front.
 * @returns {Promise<LunarAlmanac>}
 */
export async function openAlmanac() {
  const existing = foundry.applications.instances.get(LunarAlmanac.DEFAULT_OPTIONS.id);
  if ( existing?.rendered ) {
    existing.bringToFront();
    return existing;
  }
  const app = existing ?? new LunarAlmanac();
  await app.render({force: true});
  return app;
}

/**
 * Redraw the almanac if it is open.
 */
export function refreshAlmanac() {
  const app = foundry.applications.instances.get(LunarAlmanac.DEFAULT_OPTIONS.id);
  if ( app?.rendered ) app.render();
}

/** Redraw soon; a time change and the actor updates it causes collapse into one redraw. */
export const scheduleRefresh = foundry.utils.debounce(refreshAlmanac, 200);

/**
 * Let the rows of bodies which just changed their phase light up.
 * @param {string[]} ids
 */
export function highlightBodies(ids) {
  const app = foundry.applications.instances.get(LunarAlmanac.DEFAULT_OPTIONS.id);
  if ( !app?.rendered ) return;
  app.highlight = new Set(ids);
  setTimeout(() => {
    app.highlight = null;
  }, 4000);
}

/* -------------------------------------------- */

/**
 * The almanac application.
 */
export class LunarAlmanac extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "sla-almanac",
    classes: ["sla-almanac"],
    window: {title: "SLA.Almanac.Title", icon: "fa-solid fa-moon", resizable: true},
    position: {width: 600, height: "auto"},
    actions: {
      openActor: LunarAlmanac.#onOpenActor,
      openCosmos: LunarAlmanac.#onOpenCosmos
    }
  };

  /** @override */
  static PARTS = {
    almanac: {template: `${TEMPLATES}/almanac.hbs`, scrollable: [".sla-body"]}
  };

  /**
   * Ids of bodies to highlight in the next render.
   * @type {Set<string>|null}
   */
  highlight = null;

  /* -------------------------------------------- */

  /** @override */
  get title() {
    return _loc("SLA.Almanac.Title");
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.ready = emberReady();
    if ( !context.ready ) {
      context.notReady = _loc(game.modules.get("ember")?.active ? "SLA.Almanac.NoCalendar" : "SLA.Almanac.NoEmber");
      return context;
    }
    const now = game.time.worldTime;
    const heroes = heroesByAttunement();
    const rows = skyBodies().map(entry => this.#prepareBody(entry, now, heroes));
    context.moons = rows.filter(r => r.kind === "moon");
    context.realms = rows.filter(r => r.kind === "realm");
    context.unbound = unboundAttunements().filter(id => heroes.get(id)?.length).map(id => ({
      label: bodyName(id),
      heroes: heroes.get(id).map(h => this.#prepareHero(h))
    }));
    context.date = formatDate(now);
    context.showTimeline = setting("timelineDays") > 0;
    if ( context.showTimeline ) context.timeline = this.#prepareTimeline(now);
    context.canOpenCosmos = !!game.scenes.get("emberCosmos00000");
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Prepare the row of a moon or realm.
   * @param {import("./sky.mjs").SkyBody} entry
   * @param {number} now
   * @param {Map<string, object[]>} heroes
   * @returns {object}
   */
  #prepareBody(entry, now, heroes) {
    const {kind, body} = entry;
    const f = forecastBody(entry, now);
    const peak = PEAK_PHASE[kind];
    const isPeak = f.phase === peak;
    const name = bodyName(body.id, body);
    let status = "";
    if ( f.endsAt !== null ) status = _loc("SLA.Almanac.EndsIn", {duration: durationLabel(f.endsAt - now)});
    let next = "";
    let nextTooltip = "";
    if ( !isPeak && (f.peakAt !== null) ) {
      next = _loc(`SLA.Almanac.PeakIn.${kind}`, {duration: durationLabel(f.peakAt - now)});
      const date = formatDate(f.peakAt);
      if ( date ) nextTooltip = _loc("SLA.Almanac.PeakOn", {date});
    }
    else if ( isPeak && (f.endsAt !== null) ) {
      const date = formatDate(f.endsAt);
      if ( date ) nextTooltip = _loc("SLA.Almanac.EndsOn", {date});
    }
    return {
      id: body.id,
      kind,
      name,
      img: bodyImage(kind, body),
      color: bodyColor(body),
      phase: f.phase,
      phaseLabel: phaseLabel(f.phase),
      influence: Math.round(f.influence * 100),
      isPeak,
      status,
      next,
      nextTooltip,
      highlight: !!this.highlight?.has(body.id),
      heroes: (heroes.get(body.id) ?? []).map(h => this.#prepareHero(h))
    };
  }

  /* -------------------------------------------- */

  /**
   * Prepare the chip of an attuned hero.
   * @param {import("./sky.mjs").HeroAttunement} h
   * @returns {object}
   */
  #prepareHero(h) {
    // The chip sits in the row of its moon or realm, so the tooltip does not repeat the attunement
    const lines = [`<strong>${foundry.utils.escapeHTML(h.actor.name)}</strong>`];
    if ( (h.rank !== null) && !h.blessed ) lines.push(_loc("SLA.Hero.Rank", {rank: h.rank}));
    if ( h.blessed ) {
      lines.push(_loc("SLA.Hero.Blessed", {rank: h.rank ?? "?", base: h.baseRank ?? "?"}));
      const remaining = h.blessing?.duration?.label;
      if ( remaining && Number.isFinite(h.blessing.duration.secondsRemaining) ) {
        lines.push(_loc("SLA.Hero.BlessingLeft", {remaining: foundry.utils.escapeHTML(remaining)}));
      }
    }
    return {
      id: h.actor.id,
      name: h.actor.name,
      img: h.actor.img,
      rank: h.rank,
      blessed: h.blessed,
      canOpen: h.actor.testUserPermission(game.user, "LIMITED"),
      tooltip: lines.map(l => `<p>${l}</p>`).join("")
    };
  }

  /* -------------------------------------------- */

  /**
   * Prepare the timeline of the coming days for the moons.
   * @param {number} now
   * @returns {object}
   */
  #prepareTimeline(now) {
    const {secondsPerDay} = calendarUnits();
    const days = setting("timelineDays");
    const end = now + (days * secondsPerDay);
    const ticks = dayStarts(now, end, secondsIntoDay(now), secondsPerDay).map((t, i) => ({
      left: spanPercent(now, t, now, end).width,
      label: ((i + 1) % 7 === 0) ? _loc("SLA.Almanac.DayMark", {days: i + 1}) : "",
      week: (i + 1) % 7 === 0
    }));
    const rows = skyBodies().filter(e => e.kind === "moon").map(({body}) => {
      const {step, precision} = scanSettings(body);
      const segments = phaseSegments(t => body.animate(t).phase, now, end, step, precision)
        .filter(s => (s.phase !== "none"))
        .map(s => {
          const date = formatDate(s.start);
          const tooltip = [`${foundry.utils.escapeHTML(bodyName(body.id, body))}: ${phaseLabel(s.phase)}`];
          if ( s.start > now ) tooltip.push(_loc("SLA.Almanac.StartsIn", {duration: durationLabel(s.start - now)}));
          if ( date && (s.start > now) ) tooltip.push(date);
          return {...spanPercent(s.start, s.end, now, end), phase: s.phase, tooltip: tooltip.join("<br>")};
        });
      return {id: body.id, name: bodyName(body.id, body), color: bodyColor(body), segments};
    });
    return {days, ticks, rows};
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /**
   * Open the sheet of an attuned hero.
   * @this {LunarAlmanac}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onOpenActor(event, target) {
    game.actors.get(target.closest("[data-actor-id]")?.dataset.actorId)?.sheet?.render({force: true});
  }

  /**
   * Show Ember's cosmos map, like the button of Ember's calendar does.
   * @this {LunarAlmanac}
   */
  static #onOpenCosmos() {
    game.scenes.get("emberCosmos00000")?.view();
  }
}

