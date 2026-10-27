import { readFile, writeFile } from "node:fs/promises";
import {
  settingFields,
  defaultSettings,
  soundPresets,
  talkProfiles,
  warningBehavior,
  scrubSteps,
  formatDuration,
  formatSetting,
  settingsParameters,
} from "./settings.mjs";

const table = [
  "| Parameter | Default | Meaning |",
  "| --- | --- | --- |",
  ...settingFields.map((field) => {
    const description =
      field.description ??
      `${field.label}; integer from ${field.min} to ${field.max}.`;
    return `| \`${field.key}\` | \`${formatSetting(field.key, field.default, { includeUnit: true })}\` | ${description} |`;
  }),
].join("\n");
const example = {
  ...defaultSettings,
  time: talkProfiles[0].duration,
  warn: talkProfiles[0].warning,
};
const warnings = talkProfiles.map((profile, index) => {
  const next = talkProfiles[index + 1];
  const range = next
    ? `${formatDuration(profile.duration)} to under ${formatDuration(next.duration)}`
    : `${formatDuration(profile.duration)} or longer`;
  return `**${formatDuration(profile.warning)} left for talks of ${range}**`;
});
const finalPulses =
  warningBehavior.initialFlashRate === 1
    ? "once per second"
    : `${warningBehavior.initialFlashRate} times per second`;
const fraction = warningBehavior.shortTalkWarningFraction;
const shortShare = Number.isInteger(1 / fraction)
  ? `1/${1 / fraction}`
  : fraction.toLocaleString("en-US", { style: "percent" });
const sections = {
  settings: `${table}\n\nFor example: \`#${settingsParameters(example)}\`.`,
  warnings: `Automatic warnings start with ${warnings.join(", ")}. Shorter talks use ${shortShare} remaining, capped at ${formatDuration(warningBehavior.shortTalkWarningCap)}. The final ${formatDuration(warningBehavior.finalSeconds)} always flash the background and digits red ${finalPulses}, including with \`warn=0\`.`,
  presets: `Presets: ${soundPresets.map((name) => `\`${name}\``).join(", ")}.`,
  shortcuts: `- **Left / right:** subtract / add ${formatDuration(scrubSteps.horizontal)} remaining.\n- **Down / up:** subtract / add ${formatDuration(scrubSteps.vertical)} remaining.`,
};

const path = new URL("./README.md", import.meta.url);
const original = await readFile(path, "utf8");
let updated = original;
for (const [name, content] of Object.entries(sections)) {
  const start = `<!-- ${name}:start -->`;
  const end = `<!-- ${name}:end -->`;
  const first = updated.indexOf(start);
  const last = updated.indexOf(end, first);
  if (first < 0 || last < 0) throw new Error(`Missing README section: ${name}`);
  updated =
    updated.slice(0, first) +
    `${start}\n${content}\n${end}` +
    updated.slice(last + end.length);
}

if (process.argv.includes("--check")) {
  if (updated !== original) {
    console.error("README reference is out of date. Run node sync-readme.mjs.");
    process.exitCode = 1;
  } else {
    console.log("README reference matches the shared configuration.");
  }
} else {
  await writeFile(path, updated);
  console.log("README reference updated from settings.mjs.");
}
