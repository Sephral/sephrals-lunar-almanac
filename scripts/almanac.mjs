/**
 * The almanac window: Ember's six moons and three inner realms with their phase, how long it lasts and when the next
 * full moon comes, the heroes attuned to each of them with their moon sensitive gear, timelines of the coming days and
 * the weather. A date control shows the sky of another day without changing the world time.
 */

import {MODULE_ID, TEMPLATES, addSettingsGear, setting} from "./config.mjs";
import {moonGear} from "./gear.mjs";
import {exportJournalDialog} from "./journal.mjs";
import {PEAK_PHASE, clampOffset, phaseSegments, spanPercent, splitDuration, tickPlan, timelineTicks} from "./lunar.mjs";
import {
  bodyColor, bodyImage, bodyName, calendarUnits, emberReady, forecastBody, formatDate, heroesByAttunement,
  peakThreshold, scanSettings, secondsIntoDay, skyBodies, unboundAttunements
} from "./sky.mjs";
import {moduleLanguage} from "./language.mjs";
import {weatherReport, windText} from "./weather.mjs";
import {countFeature, markUsed} from "./usage.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

/** How far the almanac looks back and ahead, in days. */
export const OFFSET_LIMITS = {min: -360, max: 720};

/**
 * How long the almanac waits after a click on the day control before it redraws, in milliseconds. Quick clicks in a
 * row then all land on the same buttons and lead to one redraw.
 */
export const SHIFT_RENDER_DELAY = 250;

/** The phases a timeline leaves empty, by kind. */
const QUIET_PHASE = {moon: "none", realm: "dormant"};

/** The phases a timeline shows, by kind, in cycle order. */
const SHOWN_PHASES = {moon: ["waxing", "full", "waning"], realm: ["ascending", "dominant", "descending"]};

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

/**
 * What the influence of a body means, as tooltip HTML. The influence at which the peak phase begins is measured from
 * Ember's sky, not copied.
 * @param {import("./sky.mjs").SkyBody} entry
 * @param {string} name
 * @param {number} value      The influence in percent
 * @returns {string}
 */
export function influenceTooltip(entry, name, value) {
  const escape = foundry.utils.escapeHTML;
  const {kind} = entry;
  const lines = [
    `<strong>${escape(_loc("SLA.Almanac.Influence", {value}))}</strong>`,
    escape(_loc(`SLA.Influence.Meaning.${kind}`, {name}))
  ];
  const threshold = peakThreshold(entry);
  if ( threshold !== null ) lines.push(escape(_loc(`SLA.Influence.Peak.${kind}`, {value: threshold})));
  if ( kind === "moon" ) lines.push(escape(_loc("SLA.Influence.Effects")));
  return lines.map(l => `<p>${l}</p>`).join("");
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
      openCosmos: LunarAlmanac.#onOpenCosmos,
      shiftDays: LunarAlmanac.#onShiftDays,
      today: LunarAlmanac.#onToday,
      exportJournal: LunarAlmanac.#onExportJournal
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

  /**
   * How many days from the world time the almanac shows. The world time itself never changes.
   * @type {number}
   */
  offsetDays = 0;

  /**
   * Whether a pointer is pressed on the day control. A redraw then keeps the pressed control, so the click still
   * lands on it.
   * @type {boolean}
   */
  #pressed = false;

  /** Redraw after the clicks on the day control stop. */
  #renderSoon = foundry.utils.debounce(() => {
    if ( this.rendered ) this.render();
  }, SHIFT_RENDER_DELAY);

  /**
   * The moons which are full at the shown time, during a render.
   * @type {Set<string>}
   */
  #fullMoons = new Set();

  /**
   * The moon sensitive gear of each hero, during a render.
   * @type {Map<string, import("./gear.mjs").MoonGear[]>}
   */
  #gear = new Map();

  /* -------------------------------------------- */

  /** @override */
  get title() {
    return _loc("SLA.Almanac.Title");
  }

  /**
   * The time the almanac shows.
   * @type {number}
   */
  get viewTime() {
    return game.time.worldTime + (this.offsetDays * calendarUnits().secondsPerDay);
  }

  /**
   * Show the sky a number of days from the world time. 0 shows the world time again.
   * @param {number} days
   * @returns {Promise<this>}
   */
  async lookAhead(days) {
    this.offsetDays = clampOffset(days, OFFSET_LIMITS.min, OFFSET_LIMITS.max);
    if ( this.rendered ) await this.render();
    return this;
  }

  /**
   * Move the shown day from the day control: the control shows the new day at once, the almanac redraws once the
   * clicks stop. Every click counts, also while a redraw is under way, because the offset changes right away.
   * @param {number} days   Days from the world time
   */
  shiftTo(days) {
    this.offsetDays = clampOffset(days, OFFSET_LIMITS.min, OFFSET_LIMITS.max);
    this.#syncLookAhead();
    this.#renderSoon();
  }

  /**
   * Show the shown day in the day control without a redraw: the number and the today button.
   */
  #syncLookAhead() {
    const controls = this.element?.querySelector(".sla-lookahead");
    if ( !controls ) return;
    const input = controls.querySelector('input[name="offsetDays"]');
    if ( input && (Number(input.value) !== this.offsetDays) ) input.value = String(this.offsetDays);
    const today = controls.querySelector(".sla-today");
    if ( today ) {
      const preview = this.offsetDays !== 0;
      today.disabled = !preview;
      today.classList.toggle("inactive", !preview);
    }
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
    const now = this.viewTime;
    const entries = skyBodies();
    const forecasts = new Map(entries.map(entry => [entry.body.id, forecastBody(entry, now)]));
    this.#fullMoons = new Set(entries.filter(e => (e.kind === "moon") && (forecasts.get(e.body.id).phase === "full"))
      .map(e => e.body.id));
    this.#gear = new Map();
    const heroes = heroesByAttunement();
    const rows = entries.map(entry => this.#prepareBody(entry, forecasts.get(entry.body.id), now, heroes));
    context.moons = rows.filter(r => r.kind === "moon");
    context.realms = rows.filter(r => r.kind === "realm");
    context.unbound = unboundAttunements().filter(id => heroes.get(id)?.length).map(id => ({
      label: bodyName(id),
      heroes: heroes.get(id).map(h => this.#prepareHero(h))
    }));
    context.date = formatDate(now);
    context.lookAhead = this.#prepareLookAhead();
    context.isGM = game.user.isGM;
    context.showTimeline = setting("timelineDays") > 0;
    if ( context.showTimeline ) context.timeline = this.#prepareTimeline(now, "moon", setting("timelineDays"));
    context.showRealmTimeline = (setting("realmTimelineDays") > 0) && (context.realms.length > 0);
    if ( context.showRealmTimeline ) {
      context.realmTimeline = this.#prepareTimeline(now, "realm", setting("realmTimelineDays"));
    }
    // The weather belongs to the world time, so a preview of another day leaves it out
    if ( setting("showWeather") && !this.offsetDays ) context.weather = this.#prepareWeather();
    context.canOpenCosmos = !!game.scenes.get("emberCosmos00000");
    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    addSettingsGear(frame);
    return frame;
  }

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    markUsed(MODULE_ID);
    // The window element stays across redraws, so these listeners are added once
    this.element.addEventListener("change", event => {
      if ( event.target.matches?.('input[name="offsetDays"]') ) this.lookAhead(event.target.value);
    });
    this.element.addEventListener("pointerdown", event => {
      if ( !event.target.closest?.(".sla-lookahead") ) return;
      this.#pressed = true;
      const done = new AbortController();
      // The click follows the pointerup in the same task, so the flag is cleared after it
      const release = () => {
        done.abort();
        setTimeout(() => {
          this.#pressed = false;
        }, 0);
      };
      document.addEventListener("pointerup", release, {capture: true, signal: done.signal});
      document.addEventListener("pointercancel", release, {capture: true, signal: done.signal});
    });
  }

  /** @override */
  _syncPartState(partId, newElement, priorElement, state) {
    super._syncPartState(partId, newElement, priorElement, state);
    // A redraw between pointerdown and pointerup would drop the click: keep the pressed day control
    if ( !this.#pressed ) return;
    const prior = priorElement.querySelector(".sla-lookahead");
    const next = newElement.querySelector(".sla-lookahead");
    if ( prior && next ) next.replaceWith(prior);
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    // A redraw which began before the last click shows the day the control was set to since
    this.#syncLookAhead();
  }

  /* -------------------------------------------- */

  /**
   * Prepare the date control.
   * @returns {object}
   */
  #prepareLookAhead() {
    const days = this.offsetDays;
    let note = "";
    if ( days > 0 ) note = _loc("SLA.LookAhead.Ahead", {days});
    else if ( days < 0 ) note = _loc("SLA.LookAhead.Behind", {days: -days});
    return {days, preview: days !== 0, note, ...OFFSET_LIMITS};
  }

  /* -------------------------------------------- */

  /**
   * Prepare the row of a moon or realm.
   * @param {import("./sky.mjs").SkyBody} entry
   * @param {import("./sky.mjs").BodyForecast} f
   * @param {number} now
   * @param {Map<string, object[]>} heroes
   * @returns {object}
   */
  #prepareBody(entry, f, now, heroes) {
    const {kind, body} = entry;
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
    const influence = Math.round(f.influence * 100);
    return {
      id: body.id,
      kind,
      name,
      img: bodyImage(kind, body),
      color: bodyColor(body),
      phase: f.phase,
      phaseLabel: phaseLabel(f.phase),
      influence,
      influenceTooltip: influenceTooltip(entry, name, influence),
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
    const escape = foundry.utils.escapeHTML;
    // The chip sits in the row of its moon or realm, so the tooltip does not repeat the attunement
    const lines = [`<strong>${escape(h.actor.name)}</strong>`];
    if ( (h.rank !== null) && !h.blessed ) lines.push(_loc("SLA.Hero.Rank", {rank: h.rank}));
    if ( h.blessed ) {
      // Ember's blessing adds attunement points, which do not always reach the next rank
      const raised = (h.rank !== null) && (h.baseRank !== null) && (h.rank !== h.baseRank);
      if ( raised ) lines.push(_loc("SLA.Hero.Blessed", {rank: h.rank, base: h.baseRank}));
      else lines.push(_loc("SLA.Hero.BlessedSameRank", {rank: h.rank ?? "?"}));
      const remaining = h.blessing?.duration?.label;
      if ( remaining && Number.isFinite(h.blessing.duration.secondsRemaining) ) {
        lines.push(_loc("SLA.Hero.BlessingLeft", {remaining: escape(remaining)}));
      }
    }

    // Moon sensitive gear: the moons which are full at the shown time stand out
    const moons = globalThis.ember.calendar.moons;
    const gear = this.#heroGear(h.actor);
    const active = gear.flatMap(g => g.moons).filter(id => this.#fullMoons.has(id));
    if ( gear.length ) {
      lines.push(`<strong>${escape(_loc("SLA.Gear.Title"))}</strong>`);
      for ( const g of gear ) {
        const names = g.moons.map(id => {
          const label = escape(bodyName(id, moons[id]));
          return this.#fullMoons.has(id) ? `<strong>${_loc("SLA.Gear.Full", {name: label})}</strong>` : label;
        });
        lines.push(`${escape(g.name)}: ${names.join(", ")}`);
      }
    }
    return {
      id: h.actor.id,
      name: h.actor.name,
      img: h.actor.img,
      rank: h.rank,
      blessed: h.blessed,
      gear: gear.length > 0,
      gearActive: active.length > 0,
      gearColor: active.length ? bodyColor(moons[active[0]]) : "",
      canOpen: h.actor.testUserPermission(game.user, "LIMITED"),
      tooltip: lines.map(l => `<p>${l}</p>`).join("")
    };
  }

  /**
   * The moon sensitive gear of a hero, read once per render.
   * @param {Actor} actor
   * @returns {import("./gear.mjs").MoonGear[]}
   */
  #heroGear(actor) {
    if ( !this.#gear.has(actor.id) ) {
      let gear = [];
      try {
        gear = moonGear(actor);
      } catch(err) {
        console.warn(`${MODULE_ID} | Could not read the gear of ${actor.name}`, err);
      }
      this.#gear.set(actor.id, gear);
    }
    return this.#gear.get(actor.id);
  }

  /* -------------------------------------------- */

  /**
   * Prepare a timeline of the coming days: one strip per moon or per inner realm.
   * @param {number} now
   * @param {"moon"|"realm"} kind
   * @param {number} days
   * @returns {object}
   */
  #prepareTimeline(now, kind, days) {
    const {secondsPerDay} = calendarUnits();
    const end = now + (days * secondsPerDay);
    const ticks = timelineTicks(now, end, secondsIntoDay(now), secondsPerDay, tickPlan(days)).map(t => ({
      left: spanPercent(now, t.time, now, end).width,
      label: t.label ? _loc("SLA.Almanac.DayMark", {days: t.day}) : "",
      week: t.label
    }));
    const rows = skyBodies().filter(e => e.kind === kind).map(({body}) => {
      const {step, precision} = scanSettings(body);
      const name = bodyName(body.id, body);
      const segments = phaseSegments(t => body.animate(t).phase, now, end, step, precision)
        .filter(s => (s.phase !== QUIET_PHASE[kind]))
        .map(s => {
          const date = formatDate(s.start);
          const tooltip = [`${foundry.utils.escapeHTML(name)}: ${phaseLabel(s.phase)}`];
          if ( s.start > now ) tooltip.push(_loc("SLA.Almanac.StartsIn", {duration: durationLabel(s.start - now)}));
          if ( date && (s.start > now) ) tooltip.push(date);
          return {...spanPercent(s.start, s.end, now, end), phase: s.phase, tooltip: tooltip.join("<br>")};
        });
      return {id: body.id, name, color: bodyColor(body), segments};
    });
    const legend = SHOWN_PHASES[kind].map(phase => ({phase, label: phaseLabel(phase)}));
    return {days, kind, ticks, rows, legend};
  }

  /* -------------------------------------------- */

  /**
   * Prepare the weather where the party is now. The coming wind changes are for the GM only.
   * @returns {object|null}
   */
  #prepareWeather() {
    const now = game.time.worldTime;
    let report = null;
    try {
      report = weatherReport(now);
    } catch(err) {
      console.warn(`${MODULE_ID} | Could not read Ember's weather`, err);
    }
    if ( !report ) return null;
    const lang = moduleLanguage();
    const text = w => windText(w, lang, game.i18n);
    return {
      events: report.events,
      wind: report.wind ? {...report.wind, text: text(report.wind)} : null,
      forecast: game.user.isGM ? report.forecast.map(w => ({
        ...w,
        text: text(w),
        when: _loc("SLA.Almanac.StartsIn", {duration: durationLabel(w.time - now)}),
        date: formatDate(w.time)
      })) : []
    };
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
    countFeature(MODULE_ID, "openActor");
    game.actors.get(target.closest("[data-actor-id]")?.dataset.actorId)?.sheet?.render({force: true});
  }

  /**
   * Show Ember's cosmos map, like the button of Ember's calendar does.
   * @this {LunarAlmanac}
   */
  static #onOpenCosmos() {
    countFeature(MODULE_ID, "openCosmos");
    game.scenes.get("emberCosmos00000")?.view();
  }

  /**
   * Look some days further ahead or back.
   * @this {LunarAlmanac}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onShiftDays(event, target) {
    // A preview counts once when it leaves the world time, not per click
    if ( !this.offsetDays ) countFeature(MODULE_ID, "lookAhead");
    this.shiftTo(this.offsetDays + (Number(target.dataset.days) || 0));
  }

  /**
   * Show the sky of the world time again.
   * @this {LunarAlmanac}
   */
  static #onToday() {
    this.shiftTo(0);
  }

  /**
   * Write the coming full moons into a journal entry, from the shown date (GM).
   * @this {LunarAlmanac}
   */
  static #onExportJournal() {
    exportJournalDialog(this.viewTime);
  }
}
