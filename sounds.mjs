import { defaultSettings, soundPresets } from "./settings.mjs";

export function createSound(context, preset = defaultSettings.sound) {
  const api = globalThis.jsfxr?.sfxr ?? globalThis.sfxr;
  if (!api)
    throw new Error("Jsfxr did not load. Reload the page to try again.");

  const name = soundPresets.includes(preset) ? preset : defaultSettings.sound;
  // Generate on every call: random alerts and previews get a fresh effect.
  const parameters = api.generate(name);
  const source = api.toWebAudio(parameters, context);

  // Match peak levels across presets; the timer gain controls escalation.
  const samples = source.buffer.getChannelData(0);
  let peak = 0;
  for (let index = 0; index < samples.length; index++) {
    // Zero-length Jsfxr envelope stages can produce a non-finite boundary sample.
    if (!Number.isFinite(samples[index])) samples[index] = 0;
    peak = Math.max(peak, Math.abs(samples[index]));
  }
  if (peak > 0) {
    for (let index = 0; index < samples.length; index++) {
      samples[index] *= 0.95 / peak;
    }
  }

  return source;
}
