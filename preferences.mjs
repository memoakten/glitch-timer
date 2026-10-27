import { parseSettings, settingsParameters } from "./settings.mjs";

const settingsStorageKey = "glitch-timer.settings.v1";

export function loadSettings(hash) {
  let saved = "";
  try {
    saved = localStorage.getItem(settingsStorageKey) ?? "";
  } catch {
    // Storage may be blocked; URL settings and defaults still work.
  }

  const parameters = new URLSearchParams(saved);
  const overrides = new URLSearchParams(hash.replace(/^#/, ""));
  for (const [key, value] of overrides) parameters.set(key, value);
  return parseSettings(parameters).values;
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(
      settingsStorageKey,
      settingsParameters(settings).toString(),
    );
    return true;
  } catch {
    return false;
  }
}
