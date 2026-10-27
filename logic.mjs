import { parseSettings, talkProfiles, warningBehavior } from "./settings.mjs";
export { seconds, formatDuration } from "./settings.mjs";

export function config(hash) {
  return parseSettings(hash).values;
}

// Use the configured closing-stretch warning profile.
export function warningStart(settings) {
  if (settings.warn !== "auto") return Math.min(settings.warn, settings.time);
  const profile = [...talkProfiles]
    .reverse()
    .find((profile) => settings.time >= profile.duration);
  return profile
    ? profile.warning
    : Math.min(
        warningBehavior.shortTalkWarningCap,
        Math.floor(settings.time * warningBehavior.shortTalkWarningFraction),
      );
}

export function milestones(settings) {
  const start = warningStart(settings);
  const warnings = [start];

  // After the first cue, flash at each whole minute still remaining.
  for (
    let remaining = Math.ceil(start / 60) * 60 - 60;
    remaining > warningBehavior.finalSeconds;
    remaining -= 60
  ) {
    warnings.push(remaining);
  }

  return warnings.filter(
    (remaining) =>
      remaining > warningBehavior.finalSeconds && remaining < settings.time,
  );
}

export function escalation(over, settings) {
  const overtime = Math.max(0, over);
  const t = settings.ramp > 0 ? Math.min(1, overtime / settings.ramp) : 0;
  const { initialVolume, maxVolume, initialFlashRate, maxFlashRate } =
    warningBehavior;
  const flashIncrease = maxFlashRate - initialFlashRate;
  return {
    intensity: t,
    volume: initialVolume + (maxVolume - initialVolume) * t,
    interval: settings.beep * Math.pow(1 - t, 2),
    continuous: settings.ramp > 0 && t >= 1,
    flashRate: initialFlashRate + flashIncrease * t,
    // Integral of the flash rate: crossing an integer triggers one pulse.
    flashPhase:
      settings.ramp === 0
        ? initialFlashRate * overtime
        : overtime <= settings.ramp
          ? initialFlashRate * overtime +
            (flashIncrease * overtime * overtime) / (2 * settings.ramp)
          : ((initialFlashRate + maxFlashRate) / 2) * settings.ramp +
            maxFlashRate * (overtime - settings.ramp),
  };
}

export function flashColors({
  overtime = false,
  intensity = 0,
  random = Math.random,
} = {}) {
  const palette = warningBehavior.overtimePalette;
  const progress = overtime ? Math.max(0, Math.min(1, intensity)) : 0;
  // Overtime uses the full hue range immediately. Saturation and brightness
  // vary more widely as the same overtime ramp approaches maximum warnings.
  const hue = overtime ? random() * palette.hueRange : palette.baseHue;
  const varied = (base, amount) =>
    base + (random() * 2 - 1) * amount * progress;
  const saturation = varied(palette.saturation, palette.saturationVariation);
  const color = (lightness) => `hsl(${hue} ${saturation}% ${lightness}%)`;
  return {
    background: color(
      varied(palette.backgroundLightness, palette.backgroundVariation),
    ),
    clock: color(varied(palette.clockLightness, palette.clockVariation)),
    opacity: palette.clockOpacity,
  };
}

export function format(t) {
  const n = t < 0 ? Math.floor(-t) : Math.ceil(t);
  return `${t < 0 ? "-" : ""}${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}
