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
