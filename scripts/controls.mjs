/**
 * Ways to open the almanac: a moon button in Ember's calendar next to its cosmos button, and a tool in the token
 * controls. Each user can switch both off.
 */

import {setting} from "./config.mjs";
import {openAlmanac} from "./almanac.mjs";

/** The name of the tool in the token controls. */
const TOOL_NAME = "sla-almanac";

/**
 * Hook "getSceneControlButtons": add the almanac to the token controls.
 * @param {Record<string, SceneControl>} controls
 */
export function onGetSceneControlButtons(controls) {
  if ( !game.modules.get("ember")?.active || !setting("controlButton") ) return;
  const tokens = controls?.tokens;
  if ( !tokens?.tools ) return;
  tokens.tools[TOOL_NAME] = {
    name: TOOL_NAME,
    title: "SLA.Almanac.Open",
    icon: "fa-solid fa-moon",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: true,
    onChange: () => openAlmanac()
  };
}

/**
 * Hook "renderEmberCalendarNavigation": add a moon button to Ember's calendar.
 * @param {ApplicationV2} app
 * @param {HTMLElement} element
 */
export function onRenderEmberCalendar(app, element) {
  const root = element ?? app?.element;
  if ( !root ) return;
  root.querySelector(".sla-calendar-button")?.remove();
  if ( !setting("calendarButton") ) return;
  const anchor = root.querySelector('.controls.left [data-action="cosmos"]');
  if ( !anchor ) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "control icon fa-solid fa-moon sla-calendar-button";
  button.dataset.tooltip = _loc("SLA.Almanac.Open");
  button.ariaLabel = _loc("SLA.Almanac.Open");
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    openAlmanac();
  });
  anchor.after(button);
}

/**
 * Redraw the places which show a button after a setting changed.
 */
export function refreshButtons() {
  // Only a reset asks the getSceneControlButtons hook for the tools again
  ui.controls?.render({reset: true});
  const calendar = globalThis.ember?.ui?.calendar;
  if ( calendar?.rendered ) onRenderEmberCalendar(calendar, calendar.element);
}
