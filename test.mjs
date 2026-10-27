import assert from "node:assert/strict";
import {
  soundPresets,
  parseSettings,
  parseSetting,
  defaultSettings,
  settingFields,
  settingsParameters,
} from "./settings.mjs";
import {
  seconds,
  config,
  milestones,
  escalation,
  format,
  formatDuration,
  flashColors,
} from "./logic.mjs";
assert.equal(seconds("5m"), 300);
assert.equal(seconds("600s"), 600);
assert.equal(seconds("600"), 600);
assert.ok(Number.isNaN(seconds("oops")));
assert.equal(config("#time=600").time, 600);
assert.equal(config("#time=5m").time, 300);
assert.equal(config("#time=-3").time, 300);
assert.deepEqual(milestones(config("")), [120, 60]);
assert.deepEqual(milestones(config("#time=3m")), [60]);
assert.deepEqual(milestones(config("#time=10m")), [180, 120, 60]);
const c = config("");
assert.equal(c.ramp, 120);
assert.equal(escalation(0, c).interval, 10);
assert.equal(escalation(c.ramp, c).continuous, true);
assert.ok(escalation(30, c).volume > escalation(0, c).volume);
assert.ok(escalation(30, c).interval < 10);
assert.equal(format(-61), "-01:01");
assert.equal(format(300), "05:00");
assert.equal(format(-0.1), "-00:00");
assert.equal(format(-1.1), "-00:01");
for (const hash of [
  "#time=0",
  "#time=nope",
  "#time=999999",
  "#beep=0",
  "#ramp=-1",
]) {
  const s = config(hash);
  assert.ok(s.time > 0 && s.beep >= 0 && s.ramp >= 0);
}
for (let t = 1; t <= c.ramp; t++) {
  assert.ok(escalation(t, c).volume >= escalation(t - 1, c).volume);
  assert.ok(escalation(t, c).interval <= escalation(t - 1, c).interval);
}
assert.deepEqual(milestones(config("#warn=0")), []);

assert.deepEqual(milestones(config("#time=30m")), [180, 120, 60]);
assert.deepEqual(milestones(config("#time=2m")), [30]);
assert.deepEqual(milestones(config("#time=5m&warn=90s")), [90, 60]);
assert.deepEqual(milestones(config("#time=10m&warn=2m")), [120, 60]);
assert.equal(config("#warn=auto").warn, "auto");
assert.equal(config("#warn=bad").warn, "auto");

assert.equal(escalation(0, c).flashRate, 1);
assert.equal(escalation(c.ramp / 2, c).flashRate, 4.5);
assert.equal(escalation(c.ramp, c).flashRate, 8);
assert.equal(escalation(c.ramp * 2, c).flashRate, 8);
assert.equal(escalation(c.ramp, c).flashPhase, 4.5 * c.ramp);
assert.equal(
  escalation(c.ramp + 1, c).flashPhase - escalation(c.ramp, c).flashPhase,
  8,
);

assert.equal(config("").sound, "powerUp");
for (const sound of soundPresets) {
  assert.equal(config(`#sound=${sound}`).sound, sound);
}
assert.equal(config("#sound=invalid").sound, "powerUp");
assert.equal(config("").audio, true);
for (const value of ["true", "1", "on"]) {
  assert.equal(config(`#audio=${value}`).audio, true);
}
for (const value of ["false", "0", "off"]) {
  assert.equal(config(`#audio=${value}`).audio, false);
}
assert.equal(config("#audio=invalid").audio, true);
assert.notEqual(parseSetting("audio", "invalid").error, "");
assert.equal(config(settingsParameters(config("#audio=0"))).audio, false);
assert.equal(escalation(0, c).volume, 0.3);
assert.equal(escalation(c.ramp, c).volume, 0.95);

assert.equal(config("").count, 3);
assert.equal(config("#count=5").count, 5);
for (const invalid of ["0", "-1", "1.5", "nope", "101"]) {
  assert.equal(config(`#count=${invalid}`).count, 3);
}

assert.equal(config("#beep=0").beep, 0);
assert.equal(config("#ramp=0").ramp, 0);
const disabledMax = config("#ramp=0");
for (const overdue of [0, 1, 60, 600]) {
  const state = escalation(overdue, disabledMax);
  assert.equal(state.continuous, false);
  assert.equal(state.volume, 0.3);
  assert.equal(state.interval, 10);
  assert.equal(state.flashRate, 1);
  assert.equal(state.flashPhase, overdue);
}

// The URL and form accept the same warning range, and readable units round-trip.
assert.equal(seconds(".5m"), 30);
assert.equal(formatDuration(300), "5m");
assert.equal(formatDuration(60), "1m");
assert.equal(formatDuration(10), "10s");
assert.equal(formatDuration(90), "90s");
assert.equal(formatDuration(0), "0");
for (const value of [0, 0.5, 10, 60, 90, 300, 86400]) {
  assert.equal(seconds(formatDuration(value)), value);
}
assert.equal(config("#time=3m&warn=5m").warn, "auto");
assert.equal(config("#time=3m&warn=3m").warn, "auto");
assert.equal(config("#time=3m&warn=90s").warn, 90);
assert.equal(config("#warn=%20AUTO%20").warn, "auto");

// Both form validation and URL normalization use these field rules.
assert.deepEqual(parseSettings("").values, defaultSettings);
for (const field of settingFields) {
  assert.equal(parseSetting(field.key, null).value, field.default);
  assert.equal(parseSetting(field.key, String(field.default)).error, "");
  if (field.kind === "integer" || field.kind === "duration") {
    assert.equal(parseSetting(field.key, String(field.max)).error, "");
    assert.notEqual(parseSetting(field.key, String(field.max + 1)).error, "");
  }
}
assert.notEqual(parseSetting("time", "0").error, "");
assert.equal(parseSetting("beep", "0").error, "");
assert.equal(parseSetting("ramp", "0").error, "");
assert.notEqual(parseSetting("count", "1.5").error, "");
assert.notEqual(parseSettings("#time=3m&warn=3m").errors.length, 0);
assert.equal(parseSettings("#time=3m&warn=2m").errors.length, 0);

assert.equal(config("").size, 100);
assert.equal(config("#size=50").size, 50);
assert.equal(config("#size=75%25").size, 75);
assert.notEqual(parseSetting("size", "101").error, "");
assert.notEqual(parseSetting("size", "0").error, "");

// Final-second flashes stay red; every overtime flash starts with a random hue.
const hsl = (color) =>
  color
    .match(/^hsl\(([-\d.]+) ([-\d.]+)% ([-\d.]+)%/)
    .slice(1)
    .map(Number);
const finalA = flashColors({ random: () => 0.25 });
const finalB = flashColors({ random: () => 0.75 });
assert.deepEqual(finalA, finalB);
assert.equal(hsl(finalA.background)[0], 0);
const initialA = flashColors({ overtime: true, random: () => 0.25 });
const initialB = flashColors({ overtime: true, random: () => 0.75 });
assert.notEqual(
  hsl(initialA.background)[0],
  hsl(initialB.background)[0],
  "the background uses distinct random hues immediately after zero",
);
const halfway = flashColors({
  overtime: true,
  intensity: 0.5,
  random: () => 0.75,
});
const maximum = flashColors({
  overtime: true,
  intensity: 1,
  random: () => 0.75,
});
assert.equal(hsl(halfway.background)[0], hsl(maximum.background)[0]);
assert.ok(hsl(maximum.background)[1] > hsl(halfway.background)[1]);
assert.ok(hsl(halfway.background)[1] > hsl(initialB.background)[1]);
assert.ok(hsl(maximum.background)[2] > hsl(halfway.background)[2]);
assert.equal(hsl(maximum.clock)[0], hsl(maximum.background)[0]);
assert.ok(
  hsl(maximum.clock)[2] < hsl(maximum.background)[2],
  "digits contrast with bright flash backgrounds",
);
assert.equal(maximum.opacity, 1);
assert.deepEqual(
  flashColors({ overtime: true, intensity: 2, random: () => 0.75 }),
  maximum,
);

// Every possible hue stays bright, even at the widest random variation.
for (const intensity of [0, 0.5, 1]) {
  for (const sample of [0, 0.25, 0.5, 0.75, 1]) {
    const colors = flashColors({
      overtime: true,
      intensity,
      random: () => sample,
    });
    const [, saturation, lightness] = hsl(colors.background);
    assert.ok(saturation >= 90 && saturation <= 100);
    assert.ok(lightness >= 70 && lightness <= 80);
    assert.ok(hsl(colors.clock)[2] <= 10);
    assert.equal(colors.opacity, 1);
  }
}

assert.equal(escalation(0, c).intensity, 0);
assert.equal(escalation(c.ramp, c).intensity, 1);
assert.equal(escalation(600, disabledMax).intensity, 0);

console.log(
  "Logic checks passed: durations, URL validation, warning thresholds, escalation, and disabled settings.",
);
