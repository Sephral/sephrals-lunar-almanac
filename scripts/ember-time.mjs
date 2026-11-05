/**
 * Foundry 14.370 hands a calendar the time difference as a new second argument: onUpdateWorldTime(worldTime, deltaTime,
 * options, userId). Ember 0.6.3 still reads the options there and throws on the number. Foundry then skips the hook
 * updateWorldTime, so the sky, the weather, the phase notices and the recovery of the almanac stand still. Until Ember
 * follows, its calendar gets the arguments it expects. Later Ember versions are left alone.
 */

const FIRST_NEW_CORE = "14.370";
const LAST_OLD_EMBER = "0.6.3";

/**
 * Adapt Ember's calendar once Ember is ready.
 * @returns {boolean} Whether the calendar was adapted
 */
export function adaptEmberCalendar() {
  const {isNewerVersion} = foundry.utils;
  const version = game.modules.get("ember")?.version;
  if ( !version || isNewerVersion(FIRST_NEW_CORE, game.version) || isNewerVersion(version, LAST_OLD_EMBER) ) return false;
  const calendar = Object.getPrototypeOf(ember.calendar);
  const original = calendar.onUpdateWorldTime;
  calendar.onUpdateWorldTime = function(worldTime, ...args) {
    if ( typeof args[0] === "number" ) args.shift(); // Ember's own calls pass the options right away
    return original.call(this, worldTime, ...args);
  };
  return true;
}
