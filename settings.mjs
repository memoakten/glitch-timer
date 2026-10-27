// Shared configuration for parsing, the settings form, sounds, and documentation.
export const soundPresets = Object.freeze([
  "pickupCoin",
  "laserShoot",
  "explosion",
  "powerUp",
  "hitHurt",
  "jump",
  "blipSelect",
  "synth",
  "tone",
  "click",
  "random",
]);

export const talkProfiles = Object.freeze([
  { duration: 3 * 60, warning: 60 },
  { duration: 5 * 60, warning: 2 * 60 },
  { duration: 10 * 60, warning: 3 * 60 },
]);

export const warningBehavior = Object.freeze({
  finalSeconds: 10,
  shortTalkWarningCap: 30,
  shortTalkWarningFraction: 1 / 3,
  initialFlashRate: 1,
  maxFlashRate: 8,
  flashDuration: 0.65,
  initialVolume: 0.3,
  maxVolume: 0.95,
  overtimePalette: Object.freeze({
    baseHue: 0,
    hueRange: 360,
    saturationVariation: 10,
    backgroundVariation: 8,
    clockVariation: 5,
    saturation: 90,
    backgroundLightness: 30,
    clockLightness: 80,
    clockOpacity: 0.5,
  }),
});

export const scrubSteps = Object.freeze({ horizontal: 10, vertical: 60 });
export const scrubKeys = Object.freeze({
  ArrowLeft: { label: "←", elapsedChange: scrubSteps.horizontal },
  ArrowRight: { label: "→", elapsedChange: -scrubSteps.horizontal },
  ArrowDown: { label: "↓", elapsedChange: scrubSteps.vertical },
  ArrowUp: { label: "↑", elapsedChange: -scrubSteps.vertical },
});

export const percentScale = 100;

const maxDuration = 24 * 60 * 60;
export const settingGroups = [
  {
    label: "Timing",
    fields: [
      {
        key: "time",
        id: "duration",
        label: "Talk duration",
        kind: "duration",
        default: 5 * 60,
        min: 0,
        exclusiveMin: true,
        max: maxDuration,
        help: "Seconds or minutes, using s or m.",
        presets: talkProfiles.map((profile) => profile.duration),
        description: "Talk duration; plain numbers mean seconds.",
      },
      {
        key: "warn",
        id: "warn",
        label: "First warning at",
        kind: "warning",
        default: "auto",
        description:
          "Time remaining at the first flash; then flash at each remaining whole minute. Set 0 to skip early warnings.",
        help: `Auto: ${talkProfiles.map((profile) => `${formatDuration(profile.warning)} for ${formatDuration(profile.duration)}`).join(", ")}+ talks. Set 0 to skip these warnings.`,
      },
      {
        key: "beep",
        id: "beep",
        label: "Snooze",
        kind: "duration",
        default: 10,
        min: 0,
        max: maxDuration,
        help: "Warn repeatedly after time is up. Set 0 to disable.",
        description:
          "Initial repeat interval after zero, shortening as overtime grows. Set 0 to play the zero alert once without repeat sounds.",
      },
      {
        key: "ramp",
        id: "ramp",
        label: "Reach max warnings at",
        kind: "duration",
        default: 2 * 60,
        min: 0,
        max: maxDuration,
        help: "Set 0 to disable.",
        description: `Time overdue until full volume, continuous sound batches, and ${warningBehavior.maxFlashRate} flashes per second with increasingly random colors. Set 0 to keep the initial volume, interval, and flash rate.`,
      },
    ],
  },
  {
    label: "Sound",
    fields: [
      {
        key: "sound",
        id: "alarm-sound",
        label: "Sound preset",
        kind: "choice",
        default: "powerUp",
        options: soundPresets,
        description: "Jsfxr preset, listed below.",
        help: { text: "Uses Jsfxr", href: "https://sfxr.me/" },
      },
      {
        key: "count",
        id: "sound-count",
        label: "Sounds per alert",
        kind: "integer",
        default: 3,
        min: 1,
        max: 100,
      },
    ],
  },
  {
    label: "Display",
    fields: [
      {
        key: "size",
        id: "clock-size",
        label: "Clock size",
        kind: "integer",
        control: "range",
        unit: "%",
        default: percentScale,
        min: 10,
        max: percentScale,
        description:
          "Percentage of the largest clock text that fits the screen.",
      },
    ],
  },
];

export const settingFields = settingGroups.flatMap((group) => group.fields);
const fieldsByKey = Object.fromEntries(
  settingFields.map((field) => [field.key, field]),
);
export const defaultSettings = Object.freeze(
  Object.fromEntries(settingFields.map((field) => [field.key, field.default])),
);

export function seconds(value) {
  const match = String(value)
    .trim()
    .match(/^(\d+(?:\.\d+)?|\.\d+)\s*([sm]?)$/i);
  return match
    ? Number(match[1]) * (match[2].toLowerCase() === "m" ? 60 : 1)
    : NaN;
}

export function formatDuration(value) {
  if (value === 0) return "0";
  return value >= 60 && value % 60 === 0 ? `${value / 60}m` : `${value}s`;
}

export function formatSetting(key, value, { includeUnit = false } = {}) {
  const field = fieldsByKey[key];
  const text =
    field.kind === "duration" || (field.kind === "warning" && value !== "auto")
      ? formatDuration(value)
      : String(value);
  return text + (includeUnit ? (field.unit ?? "") : "");
}

export function parseSetting(key, raw, current = defaultSettings) {
  const field = fieldsByKey[key];
  if (raw === null || raw === undefined)
    return { value: field.default, error: "" };
  let value;
  let error = "";
  switch (field.kind) {
    case "duration":
      value = seconds(raw);
      if (!(
        value <= field.max &&
        (field.exclusiveMin ? value > field.min : value >= field.min)
      )) {
        error = `${field.label}: enter ${field.exclusiveMin ? "a positive duration" : "0 to disable or a duration"} up to ${field.max / 3600} hours.`;
      }
      break;
    case "warning":
      value =
        String(raw).trim().toLowerCase() === "auto" ? "auto" : seconds(raw);
      if (value !== "auto" && !(value >= 0 && value < current.time)) {
        error = `${field.label}: enter auto, 0, or a time shorter than the talk.`;
      }
      break;
    case "integer":
      const text = String(raw).trim();
      value = Number(
        field.unit && text.endsWith(field.unit)
          ? text.slice(0, -field.unit.length)
          : text,
      );
      if (!Number.isInteger(value) || value < field.min || value > field.max) {
        error = `${field.label}: enter a whole number from ${field.min} to ${field.max}.`;
      }
      break;
    case "choice":
      value = raw;
      if (!field.options.includes(value))
        error = `${field.label}: select a listed preset.`;
      break;
  }
  return { value: error ? field.default : value, error };
}

export function parseSettings(source) {
  const parameters =
    source instanceof URLSearchParams
      ? source
      : new URLSearchParams(String(source).replace(/^#/, ""));
  const values = {};
  const errors = [];
  for (const field of settingFields) {
    const parsed = parseSetting(field.key, parameters.get(field.key), values);
    values[field.key] = parsed.value;
    if (parsed.error) errors.push(parsed.error);
  }
  return { values, errors };
}

export function settingsParameters(values) {
  return new URLSearchParams(
    settingFields.map((field) => [
      field.key,
      formatSetting(field.key, values[field.key]),
    ]),
  );
}
