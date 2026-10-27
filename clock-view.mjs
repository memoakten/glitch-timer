import { defaultSettings, percentScale } from "./settings.mjs";

export function createClockView(clock, frame) {
  let percentage = defaultSettings.size;

  function fit() {
    const available = frame.getBoundingClientRect();
    if (available.width <= 0 || available.height <= 0) return;

    // Measure the actual font and current text, including the overtime sign.
    const referenceSize = 100;
    clock.style.fontSize = `${referenceSize}px`;
    const measured = clock.getBoundingClientRect();
    if (measured.width <= 0 || measured.height <= 0) return;

    const maximum =
      referenceSize *
      Math.min(
        available.width / measured.width,
        available.height / measured.height,
      );
    clock.style.fontSize = `${(maximum * percentage) / percentScale}px`;
  }

  return {
    fit,
    setSize(value) {
      percentage = value;
      fit();
    },
  };
}
