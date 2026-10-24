/**
 * Journal export: the GM writes the coming full moons and dominant realms into a journal entry only the GM can see.
 * The entry holds one page with a table of computed dates. A later export updates the same entry instead of creating a
 * new one. Only dates and the names Ember provides in this world are written.
 */

import {MODULE_ID} from "./config.mjs";
import {PEAK_PHASE, phaseSpans} from "./lunar.mjs";
import {durationLabel, phaseLabel} from "./almanac.mjs";
import {bodyName, calendarUnits, emberReady, formatDate, heroesByAttunement, scanSettings, skyBodies} from "./sky.mjs";
import {countFeature} from "./usage.mjs";

/** The flag which marks the almanac entry and its page. */
const ENTRY_FLAG = "almanac";

/** Default and limits of the days to export. */
export const EXPORT_DAYS = {initial: 90, min: 7, max: 720};

/**
 * The days to export for a value the GM entered: a whole number within the limits. An empty or unreadable value
 * takes the default; 0 and less take the minimum like every other value below it.
 * @param {*} value
 * @returns {number}
 */
export function exportDays(value) {
  const {initial, min, max} = EXPORT_DAYS;
  const n = ((value === "") || (value === null) || (value === undefined)) ? NaN : Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : initial;
}

/* -------------------------------------------- */

/**
 * @typedef PeakRow
 * @property {string} id
 * @property {"moon"|"realm"} kind
 * @property {string} name
 * @property {string} phase
 * @property {number|null} start
 * @property {number|null} end
 * @property {boolean} running
 */

/**
 * The full moons and dominant realms which overlap a time range, in time order.
 * @param {number} from
 * @param {number} to
 * @param {object} [options]
 * @param {boolean} [options.realms=true]   Include the inner realms
 * @returns {PeakRow[]}
 */
export function peakRows(from, to, {realms=true}={}) {
  const rows = [];
  for ( const {kind, body} of skyBodies() ) {
    if ( (kind === "realm") && !realms ) continue;
    const {step, precision, horizon} = scanSettings(body);
    const phase = PEAK_PHASE[kind];
    const spans = phaseSpans(t => body.animate(t).phase, phase, from, to, step, precision, horizon);
    for ( const span of spans ) rows.push({id: body.id, kind, name: bodyName(body.id, body), phase, ...span});
  }
  return sortRows(rows);
}

/**
 * Sort rows by their start; a running period comes first.
 * @param {PeakRow[]} rows
 * @returns {PeakRow[]}
 */
export function sortRows(rows) {
  const key = r => (Number.isFinite(r.start) ? r.start : -Infinity);
  return [...rows].sort((a, b) => (key(a) - key(b)) || a.name.localeCompare(b.name));
}

/**
 * An HTML table.
 * @param {string[]} headers
 * @param {string[][]} rows   Cells as plain text
 * @param {(text: string) => string} escape
 * @returns {string}
 */
export function htmlTable(headers, rows, escape) {
  const head = headers.map(h => `<th>${escape(h)}</th>`).join("");
  const body = rows.map(cells => `<tr>${cells.map(c => `<td>${escape(c)}</td>`).join("")}</tr>`).join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/* -------------------------------------------- */

/**
 * The HTML of the almanac page.
 * @param {number} from
 * @param {number} to
 * @param {{realms?: boolean}} options
 * @returns {string}
 */
function pageContent(from, to, options) {
  const escape = foundry.utils.escapeHTML;
  const heroes = heroesByAttunement();
  const dash = "–";
  const rows = peakRows(from, to, options).map(r => [
    (r.start !== null) ? formatDate(r.start) : dash,
    (r.end !== null) ? formatDate(r.end) : dash,
    r.name,
    phaseLabel(r.phase),
    ((r.start !== null) && (r.end !== null)) ? durationLabel(r.end - r.start) : dash,
    (heroes.get(r.id) ?? []).map(h => h.actor.name).join(", ")
  ]);
  const headers = ["Start", "End", "Body", "Phase", "Duration", "Heroes"].map(k => _loc(`SLA.Export.Column.${k}`));
  const intro = _loc("SLA.Export.Range", {from: formatDate(from), to: formatDate(to)});
  const table = rows.length ? htmlTable(headers, rows, escape) : `<p>${escape(_loc("SLA.Export.Nothing"))}</p>`;
  return `<p>${escape(intro)}</p>${table}`;
}

/**
 * The journal entry of earlier exports.
 * @returns {JournalEntry|undefined}
 */
function findEntry() {
  return game.journal.find(j => foundry.utils.getProperty(j, `flags.${MODULE_ID}.${ENTRY_FLAG}`));
}

/**
 * Write the coming full moons and dominant realms into the almanac journal entry.
 * @param {object} [options]
 * @param {number} [options.from]           Start time, the world time by default
 * @param {number} [options.days=90]        How many days to cover
 * @param {boolean} [options.realms=true]   Include the inner realms
 * @param {boolean} [options.open=true]     Show the entry afterwards
 * @returns {Promise<JournalEntry|null>}
 */
export async function exportJournal({from=game.time.worldTime, days=EXPORT_DAYS.initial, realms=true, open=true}={}) {
  if ( !game.user.isGM || !emberReady() ) return null;
  days = exportDays(days);
  const to = from + (days * calendarUnits().secondsPerDay);
  const content = pageContent(from, to, {realms});
  const pageName = _loc("SLA.Export.PageName");
  const flags = {[MODULE_ID]: {[ENTRY_FLAG]: true}};
  const format = CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML;

  let entry = findEntry();
  if ( entry ) {
    const page = entry.pages.find(p => foundry.utils.getProperty(p, `flags.${MODULE_ID}.${ENTRY_FLAG}`))
      ?? entry.pages.find(p => p.type === "text");
    if ( page ) await page.update({name: pageName, "text.content": content, "text.format": format});
    else await entry.createEmbeddedDocuments("JournalEntryPage", [{name: pageName, type: "text", flags,
      text: {content, format}}]);
  }
  else {
    entry = await foundry.documents.JournalEntry.implementation.create({
      name: _loc("SLA.Export.EntryName"),
      ownership: {default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE},
      flags,
      pages: [{name: pageName, type: "text", flags, text: {content, format}}]
    });
  }
  if ( !entry ) return null;
  countFeature(MODULE_ID, "journalExport");
  ui.notifications.info(_loc("SLA.Export.Done", {name: entry.name}));
  if ( open ) entry.sheet?.render({force: true});
  return entry;
}

/**
 * Ask the GM how many days to export, then export.
 * @param {number} [from]   Start time, the world time by default
 * @returns {Promise<JournalEntry|null>}
 */
export async function exportJournalDialog(from=game.time.worldTime) {
  if ( !game.user.isGM || !emberReady() ) return null;
  const escape = foundry.utils.escapeHTML;
  const {initial, min, max} = EXPORT_DAYS;
  const existing = findEntry();
  const content = document.createElement("div");
  content.innerHTML = `
    <p class="hint">${escape(_loc("SLA.Export.Hint", {date: formatDate(from)}))}</p>
    <div class="form-group">
      <label for="sla-export-days">${escape(_loc("SLA.Export.Days"))}</label>
      <div class="form-fields">
        <input type="number" id="sla-export-days" name="days" value="${initial}" min="${min}" max="${max}" step="1">
      </div>
    </div>
    <div class="form-group">
      <label for="sla-export-realms">${escape(_loc("SLA.Export.Realms"))}</label>
      <div class="form-fields">
        <input type="checkbox" id="sla-export-realms" name="realms" checked>
      </div>
    </div>
    ${existing ? `<p class="hint">${escape(_loc("SLA.Export.Update", {name: existing.name}))}</p>` : ""}`;
  const options = await foundry.applications.api.DialogV2.wait({
    window: {title: _loc("SLA.Export.Title"), icon: "fa-solid fa-book"},
    position: {width: 420},
    content,
    buttons: [
      {action: "export", label: _loc("SLA.Export.Write"), icon: "fa-solid fa-feather", default: true,
        callback: (event, button) => ({
          days: button.form.elements.days.value,
          realms: button.form.elements.realms.checked
        })},
      {action: "cancel", label: _loc("SLA.Dialog.Cancel"), icon: "fa-solid fa-xmark", callback: () => null}
    ],
    rejectClose: false
  });
  if ( !options || (typeof options !== "object") ) return null;
  return exportJournal({from, ...options});
}
