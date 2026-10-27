import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as logic from "./logic.mjs";
import * as sounds from "./sounds.mjs";
import * as settingsDefinition from "./settings.mjs";
import { buildSettingsForm } from "./settings-view.mjs";
import { createClockView } from "./clock-view.mjs";
import * as preferences from "./preferences.mjs";

// Use the actual Jsfxr generator and record each new sound definition.
const require = createRequire(import.meta.url);
globalThis.jsfxr = require("./sfxr.js");
const generated = [];
const generate = globalThis.jsfxr.sfxr.generate;
globalThis.jsfxr.sfxr.generate = (preset) => {
  const parameters = generate(preset);
  generated.push({ preset, parameters });
  return parameters;
};

let now = 0;
let frame;
let flashes = 0;
let savedHash;
let resumePromise = Promise.resolve();
const sources = [];
const elements = new Map();
const listeners = {};
const classes = new Set();
const flashStyles = new Map();
const flashSnapshots = [];
const storedPreferences = new Map();
const browserStorage = {
  getItem(key) {
    return storedPreferences.get(key) ?? null;
  },
  setItem(key, value) {
    storedPreferences.set(key, value);
  },
};

function createElement(tagName = "div") {
  let id = "";
  const eventListeners = new Map();
  return {
    tagName: tagName.toUpperCase(),
    textContent: "",
    value: "",
    checked: false,
    style: {},
    open: false,
    children: [],
    attributes: {},
    classList: { add() {} },
    addEventListener(type, listener) {
      if (!eventListeners.has(type)) eventListeners.set(type, []);
      eventListeners.get(type).push(listener);
    },
    dispatchEvent(event) {
      for (const listener of eventListeners.get(event.type) ?? [])
        listener(event);
    },
    getBoundingClientRect() {
      if (id === "clock-frame")
        return {
          width: this.mockWidth ?? 1200,
          height: this.mockHeight ?? 600,
        };
      const size = parseFloat(this.style.fontSize) || 100;
      return { width: this.textContent.length * size * 0.6, height: size };
    },
    get id() {
      return id;
    },
    set id(value) {
      id = value;
      elements.set(value, this);
    },
    get options() {
      return this.children.filter((child) => child.tagName === "OPTION");
    },
    append(...children) {
      for (const child of children) {
        child.parentElement = this;
        this.children.push(child);
      }
    },
    replaceChildren(...children) {
      this.children = [];
      this.append(...children);
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
      this.onclose?.();
    },
  };
}

function element(id) {
  if (!elements.has(id)) {
    const node = createElement();
    node.id = id;
  }
  return elements.get(id);
}

const document = {
  getElementById: element,
  createElement,
  querySelectorAll() {
    return [];
  },
  body: {
    style: {
      setProperty(name, value) {
        flashStyles.set(name, value);
      },
    },
    offsetWidth: 0,
    classList: {
      add(name) {
        classes.add(name);
        if (name === "flash") {
          flashes++;
          flashSnapshots.push({
            overtime: classes.has("overtime"),
            urgent: classes.has("urgent"),
            background: flashStyles.get("--flash-background"),
            clock: flashStyles.get("--flash-clock"),
            duration: flashStyles.get("--flash-duration"),
          });
        }
      },
      remove(name) {
        classes.delete(name);
      },
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
    },
  },
};

// Model audio scheduling in seconds, including future starts and cancellation.
class AudioContext {
  state = "running";
  get currentTime() {
    return now / 1000;
  }
  resume() {
    return resumePromise;
  }
  createBuffer(channels, length, sampleRate) {
    const samples = new Float32Array(length);
    return {
      duration: length / sampleRate,
      getChannelData() {
        return samples;
      },
    };
  }
  createBufferSource() {
    const source = {
      generation: generated.at(-1),
      connect() {},
      disconnect() {},
      start(time) {
        this.startsAt = time;
      },
      stop(time) {
        if (time === undefined) {
          this.cancelled = true;
          this.endsAt = now / 1000;
        } else {
          this.endsAt = time;
        }
      },
    };
    sources.push(source);
    return source;
  }
  createGain() {
    return {
      connect() {},
      disconnect() {},
      gain: { setValueAtTime() {}, linearRampToValueAtTime() {} },
    };
  }
}

const context = vm.createContext({
  ...logic,
  ...sounds,
  ...settingsDefinition,
  buildSettingsForm,
  createClockView,
  loadSettings: (hash) => preferences.loadSettings(hash, browserStorage),
  saveSettings: (settings) =>
    preferences.saveSettings(settings, browserStorage),
  document,
  location: { hash: "#time=5m" },
  history: {
    replaceState(state, title, hash) {
      savedHash = hash;
    },
  },
  window: {
    AudioContext,
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
  },
  performance: { now: () => now },
  requestAnimationFrame(callback) {
    frame = callback;
  },
  URLSearchParams,
  console,
});
vm.runInContext(
  readFileSync(new URL("app.js", import.meta.url), "utf8").replace(
    /^import[\s\S]*?;\n/gm,
    "",
  ),
  context,
);

function advance(milliseconds) {
  assert.ok(milliseconds >= 0);
  now += milliseconds;
  for (const source of sources) {
    if (!source.ended && source.endsAt <= now / 1000) {
      source.ended = true;
      source.onended?.();
    }
  }
  frame();
}

function key(key, tagName = "BODY", repeat = false) {
  listeners.keydown({
    key,
    code: key === " " ? "Space" : key,
    repeat,
    target: { tagName },
    preventDefault() {},
  });
}

function load(hash) {
  element("dialog").close();
  context.location.hash = hash;
  listeners.hashchange();
}

function applyCurrentSettings() {
  context.FormData = class {
    [Symbol.iterator]() {
      return settingsDefinition.settingFields
        .filter(
          (field) => field.kind !== "boolean" || element(field.id).checked,
        )
        .map((field) => [field.key, element(field.id).value])
        [Symbol.iterator]();
    }
  };
  element("form").onsubmit({ preventDefault() {}, target: {} });
}

function assertBatch(batch, count, preset) {
  assert.equal(batch.length, count);
  for (let index = 0; index < batch.length; index++) {
    const source = batch[index];
    assert.equal(source.generation.preset, preset);
    assert.equal(source.loop, false);
    assert.ok(
      Math.abs(source.endsAt - source.startsAt - source.buffer.duration) < 1e-9,
      "each generated effect plays to its full scheduled end",
    );
    const samples = source.buffer.getChannelData(0);
    assert.ok(samples.every(Number.isFinite));
    assert.ok(samples.some((sample) => sample !== 0));
    if (index > 0) {
      assert.ok(
        Math.abs(source.startsAt - batch[index - 1].endsAt) < 1e-9,
        "sounds within a batch are scheduled exactly back to back",
      );
      assert.notDeepEqual(
        source.generation.parameters,
        batch[index - 1].generation.parameters,
        "each playback uses a fresh generation",
      );
    }
  }
}

// UI options, captions, help, defaults, and limits come from the shared schema.
function descendants(node) {
  return node.children.flatMap((child) => [child, ...descendants(child)]);
}
const formNodes = descendants(element("settings-fields"));
assert.equal(
  formNodes.filter((node) => node.tagName === "FIELDSET").length,
  settingsDefinition.settingGroups.length,
);
const presetOptions = element("alarm-sound").options.map(
  (option) => option.value,
);
assert.deepEqual(presetOptions, settingsDefinition.soundPresets);
assert.equal(new Set(presetOptions).size, presetOptions.length);
for (const field of settingsDefinition.settingFields) {
  const input = element(field.id);
  assert.equal(input.name, field.key);
  if (field.kind === "boolean") {
    assert.equal(input.checked, field.default);
    assert.equal(input.type, "checkbox");
    assert.equal(input.required, false);
  } else {
    assert.equal(
      input.value,
      settingsDefinition.formatSetting(field.key, field.default),
    );
  }
  const label = formNodes.find(
    (node) => node.tagName === "LABEL" && node.htmlFor === field.id,
  );
  assert.equal(label.textContent, field.label);
  if (field.kind === "integer") {
    assert.equal(Number(input.min), field.min);
    assert.equal(Number(input.max), field.max);
  }
  if (field.help) {
    assert.equal(input.attributes["aria-describedby"], `${field.id}-help`);
    assert.ok(formNodes.includes(element(`${field.id}-help`)));
  }
}
assert.equal(element("github-link").href, settingsDefinition.repositoryUrl);
assert.doesNotMatch(
  readFileSync(new URL("index.html", import.meta.url), "utf8"),
  /id="sound"/,
  "the header sound toggle is removed",
);
for (const name of settingsDefinition.soundPresets) {
  assert.equal(typeof globalThis.jsfxr.Params.prototype[name], "function");
}
const durationPresets = formNodes.find(
  (node) => node.className === "presets",
).children;
assert.deepEqual(
  durationPresets.map((button) => button.textContent),
  settingsDefinition.talkProfiles.map((profile) =>
    settingsDefinition.formatDuration(profile.duration),
  ),
);
durationPresets[0].onclick();
assert.equal(
  element("duration").value,
  settingsDefinition.formatDuration(
    settingsDefinition.talkProfiles[0].duration,
  ),
);

// Clock size defaults to the maximum fit and can be previewed without saving.
assert.equal(element("clock-size").type, "range");
assert.equal(element("clock-size").value, "100");
assert.equal(element("clock-size-value").textContent, "100%");
const maximumClockSize = parseFloat(element("clock").style.fontSize);
assert.ok(maximumClockSize > 340, "clock grows beyond its old fixed cap");
element("settings").onclick();
element("clock-size").value = "50";
element("clock-size").dispatchEvent({ type: "input" });
assert.equal(element("clock-size-value").textContent, "50%");
assert.equal(parseFloat(element("clock").style.fontSize), maximumClockSize / 2);
element("dialog").close();
assert.equal(
  parseFloat(element("clock").style.fontSize),
  maximumClockSize,
  "closing without applying restores the saved size",
);
element("clock-frame").mockWidth = 600;
listeners.resize();
assert.equal(
  parseFloat(element("clock").style.fontSize),
  maximumClockSize / 2,
  "clock refits when its available width changes",
);
element("clock-frame").mockWidth = 1200;
listeners.resize();

assert.equal(element("clock").textContent, "05:00");
element("settings").onclick();
assert.equal(element("alarm-sound").value, "powerUp");
assert.equal(element("sound-count").value, "3");
element("dialog").close();
assert.equal(element("status").textContent, "READY");
assert.equal(classes.has("running"), false);
assert.equal(classes.has("paused"), false);
element("start").onclick();
assert.equal(element("status").textContent, "RUNNING");
assert.equal(classes.has("running"), true);
advance(1000);
key(" ");
assert.equal(element("status").textContent, "PAUSED");
assert.equal(classes.has("running"), false);
assert.equal(classes.has("paused"), true);
const pausedClock = element("clock").textContent;
advance(1000);
assert.equal(element("clock").textContent, pausedClock);
key(" ");
assert.equal(element("status").textContent, "RUNNING");
assert.equal(classes.has("running"), true);
assert.equal(classes.has("paused"), false);
element("reset").onclick();
assert.equal(element("status").textContent, "READY");
assert.equal(classes.has("running"), false);
assert.equal(classes.has("paused"), false);
element("start").onclick();
advance(120000);
assert.equal(flashes, 0);
assert.equal(classes.has("warning"), false);
advance(60000);
assert.equal(flashes, 1);
assert.equal(element("clock").textContent, "02:00");
advance(60000);
assert.equal(flashes, 2);
for (let second = 10; second >= 1; second--) {
  advance(second === 10 ? 50000 : 1000);
  assert.equal(classes.has("urgent"), true);
}
assert.equal(flashes, 12);
assert.equal(flashSnapshots.at(-1).urgent, true);
assert.ok(
  flashSnapshots.at(-1).clock,
  "the final countdown supplies the clock's flash color too",
);
assert.equal(flashSnapshots.at(-1).overtime, false);
assert.match(
  flashSnapshots.at(-1).background,
  /^hsl\(0 /,
  "final ten seconds stay red",
);
advance(1000);
const zeroTime = now;
assert.equal(element("status").textContent, "RUNNING · OVERTIME");
assert.equal(classes.has("running"), true);
assert.equal(flashSnapshots.at(-1).overtime, true);
assert.match(flashSnapshots.at(-1).background, /^hsl\(/);
assert.match(flashSnapshots.at(-1).clock, /^hsl\(/);
assert.notEqual(flashSnapshots.at(-1).clock, flashSnapshots.at(-1).background);
assertBatch(sources.slice(-3), 3, "powerUp");
assert.equal(
  generated.length,
  3,
  "the zero trigger generates three independent sounds",
);
assert.equal(element("clock").textContent, "00:00");
advance(1100);
assert.equal(element("clock").textContent, "-00:01");
advance(zeroTime + 9990 - now);
assert.equal(generated.length, 3);
advance(10);
assert.equal(generated.length, 6, "the next trigger is ten seconds overdue");
assertBatch(sources.slice(-3), 3, "powerUp");

element("start").onclick();
const paused = element("clock").textContent;
const beforePause = generated.length;
advance(10000);
assert.equal(element("clock").textContent, paused);
assert.equal(generated.length, beforePause);
element("start").onclick();
advance(100);
assert.equal(
  generated.length,
  beforePause,
  "resume preserves the next trigger time",
);

// Intervals shorter than a whole batch must defer the next trigger, never overlap.
load("#time=1s&beep=0.05s&ramp=10m&count=3");
const denseStart = sources.length;
element("start").onclick();
advance(1000);
const firstDenseBatch = sources.slice(-3);
advance(firstDenseBatch.at(-1).endsAt * 1000 - now - 1);
assert.equal(
  sources.length - denseStart,
  3,
  "a due trigger waits while a batch is playing",
);
for (let index = 0; index < 300; index++) advance(20);
const denseSources = sources.slice(denseStart);
assert.ok(denseSources.length >= 6);
assert.equal(denseSources.length % 3, 0);
for (let index = 1; index < denseSources.length; index++) {
  assert.ok(
    denseSources[index].startsAt >= denseSources[index - 1].endsAt - 1e-9,
    "frequent triggers never overlap any sounds",
  );
}
assertBatch(firstDenseBatch, 3, "powerUp");

// At maximum overtime, schedule the next new batch at the previous batch's end.
load("#time=1s&ramp=1s&count=3");
element("start").onclick();
advance(2000);
const maximumBatch = sources.slice(-3);
assertBatch(maximumBatch, 3, "powerUp");
const firstTail = maximumBatch.at(-1).endsAt;
const beforeMaximumRepeat = generated.length;
advance((firstTail - 0.05) * 1000 - now);
assert.equal(generated.length, beforeMaximumRepeat + 3);
const nextMaximumBatch = sources.slice(-3);
assertBatch(nextMaximumBatch, 3, "powerUp");
assert.ok(
  Math.abs(nextMaximumBatch[0].startsAt - firstTail) < 1e-9,
  "maximum-overtime batches join exactly without overlapping",
);
const pending = sources.filter((source) => !source.ended);
element("settings").onclick();
element("audio-enabled").checked = false;
element("audio-enabled").dispatchEvent({ type: "change" });
assert.equal(element("preview-sound").disabled, true);
applyCurrentSettings();
assert.ok(
  pending.every((source) => source.cancelled),
  "applying disabled sound cancels active and future sounds",
);
assert.equal(logic.config(savedHash).audio, false);
assert.equal(preferences.loadSettings("", browserStorage).audio, false);
const beforeSilent = generated.length;
const beforeSilentFlashes = flashes;
element("start").onclick();
advance(2000);
assert.equal(generated.length, beforeSilent);
assert.ok(
  flashes > beforeSilentFlashes,
  "flashes continue with sound disabled",
);
element("settings").onclick();
await element("preview-sound").onclick();
assert.equal(
  generated.length,
  beforeSilent,
  "unchecked sound prevents previews",
);
element("audio-enabled").checked = true;
element("audio-enabled").dispatchEvent({ type: "change" });
assert.equal(element("preview-sound").disabled, false);
applyCurrentSettings();
element("start").onclick();
advance(2000);
assert.equal(generated.length, beforeSilent + 3);
element("reset").onclick();
const afterReset = generated.length;
advance(2000);
assert.equal(
  generated.length,
  afterReset,
  "ended callbacks cannot restart a cancelled batch",
);

// Scrubbing and keyboard focus still work, and clear scheduled playback.
key("ArrowLeft", "BUTTON");
assert.equal(element("clock").textContent, "-00:09");
key(" ");
advance(1);
const beforeScrub = generated.length;
key("ArrowRight");
assert.ok(sources.slice(-3).every((source) => source.cancelled));
advance(1);
assert.equal(generated.length, beforeScrub);
element("reset").onclick();
key("ArrowRight", "INPUT");
assert.equal(element("clock").textContent, "00:01");

// Arrows change displayed time: right/up increase, left/down decrease.
load("#time=5m");
key("ArrowLeft");
assert.equal(element("clock").textContent, "04:50");
key("ArrowRight");
assert.equal(element("clock").textContent, "05:00");
key("ArrowDown");
assert.equal(element("clock").textContent, "04:00");
key("ArrowUp");
assert.equal(element("clock").textContent, "05:00");
key(" ");
advance(1000);
key("ArrowLeft");
assert.equal(element("clock").textContent, "04:49");
key("ArrowRight");
assert.equal(element("clock").textContent, "04:59");
key("ArrowDown");
assert.equal(element("clock").textContent, "03:59");
key("ArrowUp");
assert.equal(element("clock").textContent, "04:59");
load("#time=1m");
key("ArrowDown");
assert.equal(element("clock").textContent, "00:00");
key("ArrowLeft");
assert.equal(element("clock").textContent, "-00:10");
key("ArrowRight");
assert.equal(element("clock").textContent, "00:00");
key("ArrowUp");
assert.equal(element("clock").textContent, "01:00");

// Preview respects N and uses the actual generator for each preset.
load("#time=5m&count=1");
element("settings").onclick();
for (const preset of settingsDefinition.soundPresets) {
  element("alarm-sound").value = preset;
  const beforePreview = generated.length;
  await element("preview-sound").onclick();
  assert.equal(generated.length, beforePreview + 1);
  assertBatch(sources.slice(-1), 1, preset);
}
element("sound-count").value = "2";
element("alarm-sound").value = "powerUp";
await element("preview-sound").onclick();
assertBatch(sources.slice(-2), 2, "powerUp");
element("sound-count").value = "1.5";
const beforeInvalid = generated.length;
await element("preview-sound").onclick();
assert.equal(
  generated.length,
  beforeInvalid,
  "invalid N cannot schedule a partial batch",
);

// Applying settings stores both the selected preset and N in the URL.
const submittedSettings = [
  ["time", "5m"],
  ["warn", "auto"],
  ["beep", "10s"],
  ["ramp", "1m"],
  ["sound", "powerUp"],
  ["count", "7"],
  ["size", "75"],
];
context.FormData = class {
  [Symbol.iterator]() {
    return submittedSettings[Symbol.iterator]();
  }
};
element("form").onsubmit({ preventDefault() {}, target: {} });
assert.equal(logic.config(savedHash).count, 7);
assert.equal(logic.config(savedHash).size, 75);
assert.equal(
  preferences.loadSettings("", browserStorage).count,
  7,
  "Apply saves preferences locally",
);
assert.equal(logic.config(savedHash).sound, "powerUp");
element("settings").onclick();
assert.equal(element("sound-count").value, "7");

// Defaults restores all fields without applying or resetting the timer.
const fields = Object.fromEntries(
  settingsDefinition.settingFields.map((field) => [field.key, field.id]),
);
const timerBeforeDefaults = element("clock").textContent;
const hashBeforeDefaults = savedHash;
const storedBeforeDefaults = browserStorage.getItem(
  preferences.settingsStorageKey,
);
element("duration").value = "bad input";
element("error").textContent = "Old validation error";
element("defaults").onclick();
assert.equal(logic.seconds(element("duration").value), 300);
assert.equal(element("warn").value, "auto");
assert.equal(logic.seconds(element("beep").value), 10);
assert.equal(logic.seconds(element("ramp").value), 120);
assert.equal(element("alarm-sound").value, "powerUp");
assert.equal(element("sound-count").value, "3");
assert.equal(element("audio-enabled").checked, true);
assert.equal(element("preview-sound").disabled, false);
assert.equal(element("error").textContent, "");
assert.equal(element("dialog").open, true);
assert.equal(element("clock").textContent, timerBeforeDefaults);
assert.equal(savedHash, hashBeforeDefaults);
assert.equal(
  browserStorage.getItem(preferences.settingsStorageKey),
  storedBeforeDefaults,
  "unapplied defaults do not modify local preferences",
);
element("dialog").close();
element("settings").onclick();
assert.equal(
  element("sound-count").value,
  "7",
  "closing without applying discards defaults",
);
element("defaults").onclick();
context.FormData = class {
  [Symbol.iterator]() {
    return Object.entries(fields)
      .map(([name, id]) => [name, element(id).value])
      [Symbol.iterator]();
  }
};
element("form").onsubmit({ preventDefault() {}, target: {} });
assert.deepEqual(logic.config(savedHash), logic.config(""));
assert.deepEqual(
  preferences.loadSettings("", browserStorage),
  logic.config(""),
);
assert.equal(element("clock").textContent, "05:00");

// The audio scheduler does not change the red-flash acceleration.
load("#time=1s&ramp=1s&count=1");
element("start").onclick();
advance(2000);
const beforeRapidFlashes = flashes;
for (let index = 0; index < 100; index++) advance(10);
assert.equal(flashes - beforeRapidFlashes, 8);
const brightBackground = flashSnapshots
  .at(-1)
  .background.match(/^hsl\([^ ]+ ([\d.]+)% ([\d.]+)%/);
assert.ok(
  Number(brightBackground[2]) >= 70,
  "overtime background flashes stay bright",
);
const rapidFlashes = flashSnapshots.slice(-8);
assert.ok(
  rapidFlashes.every(
    (flash) => flash.overtime && flash.clock && flash.background,
  ),
);
assert.ok(
  new Set(rapidFlashes.map((flash) => flash.background)).size > 1,
  "maximum overtime generates new flash colors",
);
element("start").onclick();
const pausedFlashes = flashes;
advance(1000);
assert.equal(flashes, pausedFlashes);

// Snooze 0 keeps the zero alert but suppresses repeats, even past max overtime.
load("#time=1s&beep=0&ramp=1s&count=2");
const beforeDisabledSnooze = generated.length;
element("start").onclick();
advance(1000);
assert.equal(generated.length, beforeDisabledSnooze + 2);
advance(60000);
assert.equal(generated.length, beforeDisabledSnooze + 2);
element("start").onclick();
element("start").onclick();
advance(1000);
assert.equal(
  generated.length,
  beforeDisabledSnooze + 2,
  "resume does not repeat a disabled snooze",
);

// Max warnings 0 keeps normal snoozes at fixed intensity and a one-second flash.
load("#time=1s&beep=0.2s&ramp=0&count=1");
const beforeDisabledMax = sources.length;
element("start").onclick();
advance(1000);
for (let index = 0; index < 300; index++) advance(20);
assert.ok(
  sources.length > beforeDisabledMax + 1,
  "snooze still repeats when max warnings are disabled",
);
const fixedIntensity = sources.slice(beforeDisabledMax);
for (let index = 1; index < fixedIntensity.length; index++) {
  assert.ok(fixedIntensity[index].startsAt >= fixedIntensity[index - 1].endsAt);
}

// Applying settings accepts zero for either disable switch.
element("settings").onclick();
element("beep").value = "0";
element("ramp").value = "0";
element("form").onsubmit({ preventDefault() {}, target: {} });
assert.equal(logic.config(savedHash).beep, 0);
assert.equal(logic.config(savedHash).ramp, 0);

// Short timers flash immediately when starting in their final ten seconds.
load("#time=10s");
const beforeShortStart = flashes;
element("start").onclick();
assert.equal(flashes, beforeShortStart + 1);
assert.equal(classes.has("urgent"), true);

// Holding Space cannot repeatedly toggle the timer or scroll the page.
let prevented = false;
listeners.keydown({
  key: " ",
  code: "Space",
  repeat: true,
  target: { tagName: "BODY" },
  preventDefault() {
    prevented = true;
  },
});
assert.equal(prevented, true);
assert.equal(element("start").textContent, "Ⅱ Pause timer");

load("#time=1s&count=1");
element("start").onclick();
advance(1100);
element("start").onclick();
assert.equal(element("status").textContent, "PAUSED · OVERTIME");
assert.equal(classes.has("running"), false);
assert.equal(classes.has("paused"), true);
element("settings").onclick();
element("defaults").onclick();
assert.equal(element("duration").value, "5m");
assert.equal(element("ramp").value, "2m");

// Preview must not start later if reset/close/defaults/start cancels audio unlock.
for (const cancel of [
  () => element("reset").onclick(),
  () => element("dialog").close(),
  () => element("defaults").onclick(),
  () => element("start").onclick(),
  () => {
    element("audio-enabled").checked = false;
    element("audio-enabled").dispatchEvent({ type: "change" });
  },
]) {
  element("reset").onclick();
  element("settings").onclick();
  element("sound-count").value = "1";
  let unlock;
  resumePromise = new Promise((resolve) => {
    unlock = resolve;
  });
  const beforePendingPreview = generated.length;
  const pendingPreview = element("preview-sound").onclick();
  cancel();
  unlock();
  await pendingPreview;
  assert.equal(
    generated.length,
    beforePendingPreview,
    "cancelled preview stays cancelled after audio unlock",
  );
  resumePromise = Promise.resolve();
}

// A second preview supersedes the first request while audio is still unlocking.
element("reset").onclick();
element("settings").onclick();
element("sound-count").value = "1";
let unlockLatest;
resumePromise = new Promise((resolve) => {
  unlockLatest = resolve;
});
element("alarm-sound").value = "explosion";
const stalePreview = element("preview-sound").onclick();
element("alarm-sound").value = "powerUp";
const latestPreview = element("preview-sound").onclick();
const beforeUnlock = generated.length;
unlockLatest();
await Promise.all([stalePreview, latestPreview]);
assert.equal(generated.length, beforeUnlock + 1);
assert.equal(generated.at(-1).preset, "powerUp");
resumePromise = Promise.resolve();
const playingPreview = sources.at(-1);
element("dialog").close();
assert.equal(playingPreview.cancelled, true);

// A fresh application instance restores preferences even without a URL hash.
const savedForReload = logic.config(
  "#time=10m&warn=2m&beep=0&ramp=0&audio=0&sound=explosion&count=5&size=75",
);
preferences.saveSettings(savedForReload, browserStorage);
const applicationSource = readFileSync(
  new URL("app.js", import.meta.url),
  "utf8",
).replace(/^import[\s\S]*?;\n/gm, "");
function reload(hash) {
  element("dialog").close();
  const reloaded = vm.createContext({
    ...logic,
    ...sounds,
    ...settingsDefinition,
    buildSettingsForm,
    createClockView,
    loadSettings: (value) => preferences.loadSettings(value, browserStorage),
    saveSettings: (value) => preferences.saveSettings(value, browserStorage),
    document,
    location: { hash },
    history: { replaceState() {} },
    window: { AudioContext, addEventListener() {} },
    performance: { now: () => now },
    requestAnimationFrame() {},
    URLSearchParams,
    console,
  });
  vm.runInContext(applicationSource, reloaded);
  element("settings").onclick();
}
reload("");
assert.equal(element("clock").textContent, "10:00");
assert.equal(element("duration").value, "10m");
assert.equal(element("warn").value, "2m");
assert.equal(element("beep").value, "0");
assert.equal(element("ramp").value, "0");
assert.equal(element("alarm-sound").value, "explosion");
assert.equal(element("sound-count").value, "5");
assert.equal(element("clock-size").value, "75");
assert.equal(element("clock-size-value").textContent, "75%");
assert.equal(element("audio-enabled").checked, false);
assert.equal(element("preview-sound").disabled, true);
reload("#time=3m");
assert.equal(element("clock").textContent, "03:00");
assert.equal(element("alarm-sound").value, "explosion");
assert.equal(element("sound-count").value, "5");
assert.equal(element("audio-enabled").checked, false);
assert.deepEqual(preferences.loadSettings("", browserStorage), savedForReload);
reload("#audio=1");
assert.equal(element("audio-enabled").checked, true);
assert.equal(element("preview-sound").disabled, false);
assert.deepEqual(preferences.loadSettings("", browserStorage), savedForReload);

console.log(
  "Runtime checks passed: countdown flashes, default powerUp, N fresh sounds per trigger, exact batch scheduling, no overlap, maximum overtime, sound checkbox, pause/reset, scrubbing, preview, GitHub link, and URL persistence.",
);
