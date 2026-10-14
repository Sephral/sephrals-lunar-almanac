/**
 * Pure helpers for the almanac: they scan a phase function over time. The phase function comes from Ember at runtime
 * (EmberMoon#animate), so the module never copies Ember's orbital rules. Nothing here touches Foundry globals, so the
 * tests can run in Node.
 */

/** The phases of Ember's six moons, in cycle order. */
export const MOON_PHASES = ["none", "waxing", "full", "waning"];

/** The phases of Ember's three inner realms, in cycle order. */
export const REALM_PHASES = ["dormant", "ascending", "dominant", "descending"];

/** The phase a body is strongest in, by kind. */
export const PEAK_PHASE = {moon: "full", realm: "dominant"};

/* -------------------------------------------- */

/**
 * Narrow down the moment a phase ends between two times by bisection.
 * @param {(time: number) => string} sample
 * @param {string} phase    The phase at `lo`
 * @param {number} lo       A time in the phase
 * @param {number} hi       A time after the phase ended
 * @param {number} precision
 * @returns {number}        The first time found outside the phase
 */
function refine(sample, phase, lo, hi, precision) {
  while ( (hi - lo) > precision ) {
    const mid = Math.floor((lo + hi) / 2);
    if ( sample(mid) === phase ) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * When does the phase at a time end?
 * @param {(time: number) => string} sample   The phase of the body at a time
 * @param {number} from                       Start time in seconds
 * @param {number} horizon                    How far to look ahead in seconds
 * @param {number} step                       Scan step in seconds, shorter than the shortest phase
 * @param {number} [precision=60]             Accuracy of the result in seconds
 * @returns {number|null}                     The first time in the next phase, or null beyond the horizon
 */
export function findChange(sample, from, horizon, step, precision=60) {
  if ( !(step > 0) || !(horizon > 0) ) return null;
  const phase = sample(from);
  const end = from + horizon;
  let previous = from;
  for ( let t = Math.min(from + step, end); ; t = Math.min(t + step, end) ) {
    if ( sample(t) !== phase ) return refine(sample, phase, previous, t, precision);
    if ( t >= end ) return null;
    previous = t;
  }
}

/**
 * When does a phase start next? A phase that is already running counts only when it starts again.
 * @param {(time: number) => string} sample
 * @param {string} target
 * @param {number} from
 * @param {number} horizon
 * @param {number} step
 * @param {number} [precision=60]
 * @returns {number|null}
 */
export function nextStart(sample, target, from, horizon, step, precision=60) {
  const end = from + horizon;
  let t = from;
  let first = true;
  while ( t < end ) {
    if ( !first && (sample(t) === target) ) return t;
    first = false;
    const change = findChange(sample, t, end - t, step, precision);
    if ( change === null ) return null;
    t = change;
  }
  return null;
}

/**
 * The phases of a body between two times, as consecutive segments.
 * @param {(time: number) => string} sample
 * @param {number} from
 * @param {number} to
 * @param {number} step
 * @param {number} [precision=60]
 * @returns {{phase: string, start: number, end: number}[]}
 */
export function phaseSegments(sample, from, to, step, precision=60) {
  const segments = [];
  let t = from;
  while ( t < to ) {
    const phase = sample(t);
    const change = findChange(sample, t, to - t, step, precision);
    segments.push({phase, start: t, end: change ?? to});
    if ( change === null ) break;
    t = change;
  }
  return segments;
}

/**
 * The phases a body entered after one time up to another, in (from, to]. The last one still runs at `to`; the others
 * ended in between, for example the full moons of a long rest.
 * @param {(time: number) => string} sample
 * @param {number} from
 * @param {number} to
 * @param {number} step
 * @param {number} [precision=60]
 * @returns {{phase: string, start: number, end: number, current: boolean}[]}
 */
export function phaseStarts(sample, from, to, step, precision=60) {
  if ( !(to > from) ) return [];
  const segments = phaseSegments(sample, from, to, step, precision);
  // A change found right at the end yields no segment of its own
  const last = segments.at(-1);
  const final = sample(to);
  if ( last && (last.phase !== final) ) segments.push({phase: final, start: last.end, end: to});
  return segments.slice(1).map((s, i, entered) => ({...s, current: i === entered.length - 1}));
}

/**
 * The latest entries of a list in time order, and how many earlier ones are left out.
 * @template T
 * @param {T[]} items
 * @param {number} max
 * @returns {{shown: T[], hidden: number}}
 */
export function keepLatest(items, max) {
  const hidden = Math.max(items.length - max, 0);
  return {shown: items.slice(hidden), hidden};
}

/* -------------------------------------------- */

/**
 * Split a duration into calendar days, hours and minutes.
 * @param {number} seconds
 * @param {{secondsPerDay: number, secondsPerHour: number, secondsPerMinute?: number}} units
 * @returns {{days: number, hours: number, minutes: number}}
 */
export function splitDuration(seconds, {secondsPerDay, secondsPerHour, secondsPerMinute=60}) {
  seconds = Math.max(Math.round(seconds), 0);
  const days = Math.floor(seconds / secondsPerDay);
  const rest = seconds - (days * secondsPerDay);
  const hours = Math.floor(rest / secondsPerHour);
  const minutes = Math.floor((rest - (hours * secondsPerHour)) / secondsPerMinute);
  return {days, hours, minutes};
}

/**
 * Position a time span on a timeline, in percent of its width.
 * @param {number} start
 * @param {number} end
 * @param {number} from    Start of the timeline
 * @param {number} to      End of the timeline
 * @returns {{left: number, width: number}}
 */
export function spanPercent(start, end, from, to) {
  const range = to - from;
  if ( !(range > 0) ) return {left: 0, width: 0};
  const clamp = t => Math.min(Math.max(t, from), to);
  const left = ((clamp(start) - from) / range) * 100;
  const width = ((clamp(end) - clamp(start)) / range) * 100;
  return {left: Math.round(left * 100) / 100, width: Math.round(width * 100) / 100};
}

/**
 * The start times of the calendar days in a range.
 * @param {number} from
 * @param {number} to
 * @param {number} secondsIntoDay   Seconds since the start of the day at `from`
 * @param {number} secondsPerDay
 * @returns {number[]}
 */
export function dayStarts(from, to, secondsIntoDay, secondsPerDay) {
  const starts = [];
  for ( let t = from - secondsIntoDay + secondsPerDay; t <= to; t += secondsPerDay ) starts.push(t);
  return starts;
}

/* -------------------------------------------- */

/**
 * When did the phase at a time begin? The counterpart of findChange, looking back.
 * @param {(time: number) => string} sample
 * @param {number} at                 A time in the phase
 * @param {number} horizon            How far to look back in seconds
 * @param {number} step               Scan step in seconds, shorter than the shortest phase
 * @param {number} [precision=60]
 * @returns {number|null}             The earliest time found in the phase, or null beyond the horizon
 */
export function findStart(sample, at, horizon, step, precision=60) {
  if ( !(step > 0) || !(horizon > 0) ) return null;
  const phase = sample(at);
  const end = at - horizon;
  let inside = at;
  for ( let t = Math.max(at - step, end); ; t = Math.max(t - step, end) ) {
    if ( sample(t) !== phase ) {
      let outside = t;
      while ( (inside - outside) > precision ) {
        const mid = Math.floor((outside + inside) / 2);
        if ( sample(mid) === phase ) inside = mid;
        else outside = mid;
      }
      return inside;
    }
    if ( t <= end ) return null;
    inside = t;
  }
}

/**
 * The periods of one phase which overlap a time range, with their true start and end even outside the range.
 * @param {(time: number) => string} sample
 * @param {string} phase
 * @param {number} from
 * @param {number} to
 * @param {number} step
 * @param {number} [precision=60]
 * @param {number} [horizon]          How far to look beyond the range for the true start and end
 * @returns {{start: number|null, end: number|null, running: boolean}[]}  A null start or end lies beyond the horizon;
 *                                    running marks the period which already runs at `from`
 */
export function phaseSpans(sample, phase, from, to, step, precision=60, horizon=to - from) {
  const spans = [];
  for ( const s of phaseSegments(sample, from, to, step, precision) ) {
    if ( s.phase !== phase ) continue;
    const running = s.start <= from;
    const start = running ? findStart(sample, from, horizon, step, precision) : s.start;
    const end = (s.end >= to) ? findChange(sample, to, horizon, step, precision) : s.end;
    spans.push({start, end, running});
  }
  return spans;
}

/**
 * How dense the marks of a timeline are: a tick every few days and a label on some of them.
 * @param {number} days     The length of the timeline
 * @returns {{every: number, labelEvery: number}}
 */
export function tickPlan(days) {
  if ( days <= 60 ) return {every: 1, labelEvery: 7};
  if ( days <= 180 ) return {every: 10, labelEvery: 30};
  return {every: 30, labelEvery: 60};
}

/**
 * The marks of a timeline: the starts of every few calendar days.
 * @param {number} from
 * @param {number} to
 * @param {number} secondsIntoDay   Seconds since the start of the day at `from`
 * @param {number} secondsPerDay
 * @param {{every: number, labelEvery: number}} plan
 * @returns {{time: number, day: number, label: boolean}[]}   day counts the days from `from`
 */
export function timelineTicks(from, to, secondsIntoDay, secondsPerDay, {every, labelEvery}) {
  return dayStarts(from, to, secondsIntoDay, secondsPerDay)
    .map((time, i) => ({time, day: i + 1}))
    .filter(({day}) => (day % every) === 0)
    .map(tick => ({...tick, label: (tick.day % labelEvery) === 0}));
}

/**
 * A day offset entered by the user, as a whole number within limits.
 * @param {*} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clampOffset(value, min, max) {
  const n = Math.round(Number(value));
  if ( !Number.isFinite(n) ) return 0;
  return Math.min(Math.max(n, min), max);
}

/* -------------------------------------------- */

/**
 * Which moons does the source text of an item's hooks read? Code which reads the moons of the calendar counts as
 * moon sensitive; the moons it names are those whose ids appear in it. Code which picks the moon at runtime names
 * none and so depends on every moon.
 * @param {string} source       The source of the hook functions and the data they carry
 * @param {string[]} moonIds    The ids of the moons of the calendar
 * @returns {string[]|null}     The moon ids, or null when the code does not read the moons
 */
export function moonReferences(source, moonIds) {
  if ( !source || !/calendar\s*\.\s*moons\b/.test(source) ) return null;
  const named = moonIds.filter(id => {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`).test(source);
  });
  return named.length ? named : [...moonIds];
}

/**
 * The source text of a hook object: its functions and the plain data next to them.
 * @param {object|null|undefined} hooks
 * @returns {string}
 */
export function hookSource(hooks) {
  if ( !hooks || (typeof hooks !== "object") ) return "";
  const parts = [];
  for ( const value of Object.values(hooks) ) {
    if ( typeof value === "function" ) parts.push(Function.prototype.toString.call(value));
    else if ( value && (typeof value === "object") ) {
      try {
        parts.push(JSON.stringify(value));
      } catch {}
    }
  }
  return parts.join("\n");
}

/**
 * Merge lists of moon ids into one, in the order of the calendar. Ids the calendar does not know are dropped.
 * @param {string[]} order      The moon ids of the calendar
 * @param {...(string[]|null|undefined)} lists
 * @returns {string[]}
 */
export function mergeMoons(order, ...lists) {
  const wanted = new Set(lists.flatMap(list => (Array.isArray(list) ? list : [])));
  return order.filter(id => wanted.has(id));
}
