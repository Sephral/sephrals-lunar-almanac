/**
 * Module language: like every Sephral module, the Lunar Almanac follows Foundry's language or uses a fixed German or
 * English interface (client setting "uiLanguage"). A fixed choice replaces the module's own strings (the
 * SLA namespace) in Foundry's translations, so every localize call, template and tooltip follows it.
 */

/** The languages the module ships. */
export const UI_LANGUAGES = ["en", "de"];

/** The setting value which follows Foundry's language. */
export const FOLLOW_FOUNDRY = "default";

/** The module strings as Foundry loaded them; restored when the user follows Foundry again. */
let foundryStrings = null;

/** Loaded language files by language. */
const files = new Map();

/* -------------------------------------------- */

/**
 * The language to force for a setting value, or null to follow Foundry.
 * @param {string} choice   Value of the uiLanguage setting
 * @returns {string|null}
 */
export function forcedLanguage(choice) {
  return UI_LANGUAGES.includes(choice) ? choice : null;
}

/**
 * The language the module shows: the forced one, or Foundry's if the module ships it. Any other Foundry language
 * falls back to the English strings.
 * @param {string} choice         Value of the uiLanguage setting
 * @param {string} foundryLang    Foundry's language
 * @returns {string}
 */
export function resolveLanguage(choice, foundryLang) {
  return forcedLanguage(choice) ?? (UI_LANGUAGES.includes(foundryLang) ? foundryLang : "en");
}

/**
 * The language the module shows right now.
 * @returns {string}
 */
export function moduleLanguage() {
  let choice = FOLLOW_FOUNDRY;
  try {
    choice = game.settings.get("sephrals-lunar-almanac", "uiLanguage");
  } catch {
    // Before the settings are registered the module follows Foundry
  }
  return resolveLanguage(choice, game.i18n?.lang);
}

/**
 * The module strings for a forced language: the strings of its file over the ones Foundry loaded, so a key missing
 * in the file keeps Foundry's text.
 * @param {object} loaded   The SLA strings Foundry loaded
 * @param {object} forced   The SLA strings of the forced language file
 * @returns {object}
 */
export function mergeStrings(loaded, forced) {
  const merge = (base, over) => {
    const result = {...base};
    for ( const [key, value] of Object.entries(over ?? {}) ) {
      result[key] = (value && (typeof value === "object") && !Array.isArray(value))
        ? merge(base?.[key] ?? {}, value)
        : value;
    }
    return result;
  };
  return merge(loaded ?? {}, forced ?? {});
}

/* -------------------------------------------- */

/**
 * Load one of the module's language files.
 * @param {string} lang
 * @returns {Promise<object>}
 */
async function loadFile(lang) {
  if ( !files.has(lang) ) {
    files.set(lang, fetch(new URL(`../lang/${lang}.json`, import.meta.url))
      .then(response => (response.ok ? response.json() : {}))
      .catch(err => {
        console.warn(`sephrals-lunar-almanac | Could not load lang/${lang}.json`, err);
        return {};
      }));
  }
  return files.get(lang);
}

/**
 * Apply the module language to Foundry's translations.
 * @param {string} choice   Value of the uiLanguage setting
 * @returns {Promise<void>}
 */
export async function applyModuleLanguage(choice) {
  const translations = game.i18n.translations;
  foundryStrings ??= foundry.utils.deepClone(translations.SLA ?? {});
  const lang = forcedLanguage(choice);
  if ( !lang ) {
    translations.SLA = foundry.utils.deepClone(foundryStrings);
    return;
  }
  const file = await loadFile(lang);
  translations.SLA = mergeStrings(foundryStrings, file.SLA);
}
