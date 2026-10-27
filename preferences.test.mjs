import assert from "node:assert/strict";
import { config } from "./logic.mjs";
import {
  loadSettings,
  saveSettings,
  settingsStorageKey,
} from "./preferences.mjs";

const entries = new Map();
const storage = {
  getItem(key) {
    return entries.get(key) ?? null;
  },
  setItem(key, value) {
    entries.set(key, value);
  },
};

assert.deepEqual(loadSettings("", storage), config(""));
const applied = config(
  "#time=10m&warn=2m&beep=0&ramp=0&sound=explosion&count=5",
);
assert.equal(saveSettings(applied, storage), true);
assert.deepEqual(
  loadSettings("", storage),
  applied,
  "saved settings survive a fresh visit",
);
assert.deepEqual(
  loadSettings("#time=3m", storage),
  { ...applied, time: 180 },
  "URL values override only the matching saved fields",
);
assert.deepEqual(
  loadSettings("#time=1m", storage),
  { ...applied, time: 60, warn: "auto" },
  "overrides revalidate saved warnings against the new duration",
);
assert.deepEqual(loadSettings("#sound=powerUp&count=3", storage), {
  ...applied,
  sound: "powerUp",
  count: 3,
});
assert.deepEqual(
  loadSettings("", storage),
  applied,
  "URL overrides do not overwrite saved preferences",
);

entries.set(
  settingsStorageKey,
  "time=nope&warn=bad&beep=-2&ramp=nope&sound=bogus&count=1000",
);
assert.deepEqual(
  loadSettings("", storage),
  config(""),
  "invalid stored values fall back safely",
);
const blocked = {
  getItem() {
    throw new Error("Storage blocked");
  },
  setItem() {
    throw new Error("Storage full");
  },
};
assert.deepEqual(loadSettings("#time=3m", blocked), config("#time=3m"));
assert.equal(saveSettings(applied, blocked), false);
assert.equal(saveSettings(config(""), storage), true);
assert.deepEqual(
  loadSettings("", storage),
  config(""),
  "applying defaults replaces saved preferences",
);
console.log(
  "Preference checks passed: persistence, URL overrides, zero values, defaults, and unavailable storage.",
);
