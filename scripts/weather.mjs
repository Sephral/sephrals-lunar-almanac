/**
 * Ember's weather, read only. Ember simulates weather on its region map: weather events (rain, fog and so on) move
 * over the hexes, and one wind blows over the whole region. Ember keeps the weather of the party's hex ready for its
 * calendar, and it simulates the wind up to two days ahead. The almanac shows both: the weather where the party is and
 * the coming wind changes. Ember has no forecast of weather events for a hex: they drift with the wind, and where they
 * go is only decided while the time passes. Names, icons and wind speeds come from the running Ember module.
 */

/** How far ahead the wind forecast looks, in hours. Ember simulates two days ahead. */
const FORECAST_HOURS = 48;

/** How many wind changes the forecast lists. */
const FORECAST_MAX = 5;

/* -------------------------------------------- */

/**
 * The strength level of a wind speed: the strongest level whose lowest speed it reaches.
 * @param {Record<string, {speed?: number[]}>} strengths   Ember's wind levels by number
 * @param {number} speed
 * @returns {string|null}   The key of the level
 */
export function windLevel(strengths, speed) {
  let level = null;
  for ( const [key, s] of Object.entries(strengths ?? {}) ) {
    const min = Array.isArray(s?.speed) ? Number(s.speed[0]) : NaN;
    if ( Number.isFinite(min) && (min <= speed) ) level = key;
  }
  return level;
}

/**
 * The wind changes after a time, in time order.
 * @param {{time: number, direction: number, speed: number}[]} history
 * @param {number} from
 * @param {number} to
 * @param {number} [max]
 * @returns {{time: number, direction: number, speed: number}[]}
 */
export function windChanges(history, from, to, max=FORECAST_MAX) {
  if ( !Array.isArray(history) ) return [];
  return history.filter(w => Number.isFinite(w?.time) && (w.time > from) && (w.time <= to))
    .sort((a, b) => a.time - b.time)
    .slice(0, max);
}

/* -------------------------------------------- */

/**
 * The configuration of Ember's wind.
 * @returns {object|null}
 */
function windConfig() {
  const e = globalThis.ember;
  try {
    return e.weather.getConfig({slice: e.region?.slice?.id ?? "surface", type: "wind"}) ?? null;
  } catch {
    return null;
  }
}

/**
 * A wind for display.
 * @param {{direction: number, speed: number}} wind
 * @param {object|null} config
 * @returns {{label: string, speed: number, angle: number}}
 */
function describeWind(wind, config) {
  const speed = Math.round(Number(wind.speed) || 0);
  const level = windLevel(config?.strengths, speed);
  return {
    label: (level !== null) ? (config.strengths[level]?.label ?? "") : "",
    speed,
    angle: Math.round(((Number(wind.direction) || 0) * 180 / Math.PI) * 10) / 10
  };
}

/**
 * @typedef WeatherReport
 * @property {{label: string, kind: string, icon: string|null, color: string|null}[]} events   The weather at the party
 * @property {{label: string, speed: number, angle: number}|null} wind                          The wind now
 * @property {{time: number, label: string, speed: number, angle: number}[]} forecast           Coming wind changes
 */

/**
 * The weather where the party is now, and the coming wind changes.
 * @param {number} now    The world time
 * @returns {WeatherReport|null}  Null when Ember's weather cannot be read
 */
export function weatherReport(now) {
  const e = globalThis.ember;
  if ( !e?.weather || (typeof e.weather.getConfig !== "function") ) return null;
  const weather = e.scene?.weather || e.region?.weather;
  if ( !weather ) return null;

  const events = [];
  for ( const event of weather.events ?? [] ) {
    let config;
    try {
      config = e.weather.getConfig(event);
    } catch {
      config = null;
    }
    if ( !config ) continue;
    const strength = config.strengths?.[event.strength];
    events.push({
      label: strength?.label || config.label || event.type,
      kind: config.label || event.type,
      icon: config.calendarIcon || null,
      color: strength?.color || config.uiColor || null
    });
  }

  const config = windConfig();
  const state = e.weather.state?.wind;
  const wind = state && Number.isFinite(Number(state.speed)) ? describeWind(state, config) : null;
  const history = state?.history ?? [];
  const forecast = windChanges(Array.from(history), now, now + (FORECAST_HOURS * 3600))
    .map(w => ({time: w.time, ...describeWind(w, config)}));
  return {events, wind, forecast};
}
