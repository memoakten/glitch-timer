import { config } from "./logic.mjs";
import { settingsParameters } from "./settings.mjs";

export const settingsStorageKey = "glitch-timer.settings.v1";

export function loadSettings(hash, storage) {
  let saved = "";
  try {
    const browserStorage = storage ?? globalThis.localStorage;
    saved = browserStorage?.getItem(settingsStorageKey) ?? "";
  } catch {
    // Storage may be blocked; URL settings and defaults still work.
  }

  const parameters = new URLSearchParams(saved);
  const overrides = new URLSearchParams(hash.replace(/^#/, ""));
  for (const [key, value] of overrides) parameters.set(key, value);
  return config(parameters.toString());
}

export function saveSettings(settings, storage) {
  try {
    const browserStorage = storage ?? globalThis.localStorage;
    if (!browserStorage) return false;
    browserStorage.setItem(
      settingsStorageKey,
      settingsParameters(settings).toString(),
    );
    return true;
  } catch {
    return false;
  }
}
