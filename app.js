import {
  milestones,
  escalation,
  format,
  warningStart,
  flashColors,
} from "./logic.mjs";
import {
  defaultSettings,
  settingFields,
  parseSettings,
  parseSetting,
  formatSetting,
  formatDuration,
  settingsParameters,
  warningBehavior,
  scrubKeys,
} from "./settings.mjs";
import { buildSettingsForm } from "./settings-view.mjs";
import { createClockView } from "./clock-view.mjs";
import { createSound } from "./sounds.mjs";
import { loadSettings, saveSettings } from "./preferences.mjs";

const $ = (id) => document.getElementById(id);
const inputs = buildSettingsForm(document);

// Elapsed time is stored when paused; startedAt marks the start of the current run.
let settings = loadSettings(location.hash);
const clockView = createClockView($("clock"), $("clock-frame"));
let warningTimes = milestones(settings);
let elapsedSeconds = 0;
let running = false;
let startedAt = 0;
let previousRemaining = settings.time;
let nextAlertAt = 0;
let audioContext;
let soundEndsAt = 0;
let audioRevision = 0;
const audioLookahead = 0.1;
const activeTones = new Set();

function remaining() {
  return (
    settings.time -
    (elapsedSeconds + (running ? (performance.now() - startedAt) / 1000 : 0))
  );
}

async function audio() {
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();
  } catch {}
}

function stopSounds() {
  audioRevision++;
  soundEndsAt = 0;
  for (const source of activeTones) {
    source.stop();
    source.disconnect();
  }
  activeTones.clear();
}

function playBatch(
  volume,
  {
    sound = settings.sound,
    count = settings.count,
    queue = false,
    enabled = settings.audio,
  } = {},
) {
  if (!enabled || !audioContext || audioContext.state !== "running")
    return false;
  if (!queue && audioContext.currentTime < soundEndsAt) return false;

  let sources;
  try {
    // Every playback gets its own generation, including within one trigger.
    sources = Array.from({ length: count }, () =>
      createSound(audioContext, sound),
    );
  } catch (error) {
    $("error").textContent = error.message;
    return false;
  }

  // Capture the audio clock after generating buffers. Preserve the previous
  // batch's end time so even very frequent triggers cannot overlap sounds.
  let startsAt = Math.max(audioContext.currentTime + 0.01, soundEndsAt);
  for (const source of sources) {
    const gain = audioContext.createGain();
    const duration = source.buffer.duration;
    const endsAt = startsAt + duration;
    const attack = Math.min(0.01, duration / 4);
    const release = Math.min(0.04, duration / 4);

    source.loop = false;
    source.connect(gain);
    gain.connect(audioContext.destination);
    gain.gain.setValueAtTime(0, startsAt);
    gain.gain.linearRampToValueAtTime(volume, startsAt + attack);
    gain.gain.setValueAtTime(volume, endsAt - release);
    gain.gain.linearRampToValueAtTime(0, endsAt);

    source.onended = () => {
      activeTones.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    activeTones.add(source);
    source.start(startsAt);
    source.stop(endsAt);
    startsAt = endsAt;
  }
  soundEndsAt = startsAt;
  return true;
}

function flash(duration = warningBehavior.flashDuration) {
  const timeLeft = remaining();
  if (timeLeft <= warningBehavior.finalSeconds) {
    const intensity =
      timeLeft <= 0 ? escalation(-timeLeft, settings).intensity : 0;
    const colors = flashColors({ overtime: timeLeft <= 0, intensity });
    document.body.style.setProperty("--flash-background", colors.background);
    document.body.style.setProperty("--flash-clock", colors.clock);
    document.body.style.setProperty(
      "--flash-clock-opacity",
      String(colors.opacity),
    );
  }
  document.body.style.setProperty("--flash-duration", `${duration}s`);
  document.body.classList.remove("flash");
  // Force layout so a new flash restarts the CSS animation.
  void document.body.offsetWidth;
  document.body.classList.add("flash");
}

function setText(id, value) {
  const element = $(id);
  if (element.textContent === value) return false;
  element.textContent = value;
  return true;
}

function render() {
  const timeLeft = remaining();
  const display = format(timeLeft);
  if (setText("clock", display)) clockView.fit();
  const title = `${display} · Lightning`;
  if (document.title !== title) document.title = title;
  const paused = !running && elapsedSeconds > 0;
  document.body.classList.toggle("running", running);
  document.body.classList.toggle("paused", paused);
  document.body.classList.toggle(
    "warning",
    timeLeft > 0 && timeLeft <= warningStart(settings),
  );
  document.body.classList.toggle("overtime", timeLeft <= 0);
  document.body.classList.toggle(
    "urgent",
    timeLeft <= warningBehavior.finalSeconds,
  );
  $("clock").setAttribute(
    "aria-label",
    timeLeft <= 0 ? "Overtime" : "Time remaining",
  );

  if (paused) {
    setText("status", timeLeft <= 0 ? "PAUSED · OVERTIME" : "PAUSED");
    setText("subtitle", "Take a breath. Pick up where you left off.");
  } else if (timeLeft <= 0) {
    setText("status", "RUNNING · OVERTIME");
    setText("subtitle", "Time to bring it home.");
  } else if (running) {
    setText("status", "RUNNING");
    setText("subtitle", "The floor is yours.");
  } else {
    setText("status", "READY");
    setText(
      "subtitle",
      `${format(settings.time)} on the clock. One great idea.`,
    );
  }

  $("progress").style.width =
    `${Math.max(0, Math.min(100, (timeLeft / settings.time) * 100))}%`;
  setText(
    "start",
    running
      ? "Ⅱ Pause timer"
      : elapsedSeconds
        ? "▶ Resume timer"
        : "▶ Start timer",
  );
  const earlyWarnings = warningTimes.length
    ? `Flash at ${warningTimes.map(format).join(" · ")}  /  `
    : "";
  setText(
    "milestones",
    `${earlyWarnings}Final ${formatDuration(warningBehavior.finalSeconds)} flash red`,
  );
  return timeLeft;
}

function reset() {
  warningTimes = milestones(settings);
  running = false;
  elapsedSeconds = 0;
  previousRemaining = settings.time;
  nextAlertAt = 0;
  stopSounds();
  document.body.classList.remove("flash");
  render();
  clockView.setSize(settings.size);
}

function toggle() {
  audio();
  if (running) {
    elapsedSeconds += (performance.now() - startedAt) / 1000;
    running = false;
    stopSounds();
    document.body.classList.remove("flash");
  } else {
    stopSounds();
    running = true;
    startedAt = performance.now();
  }
  const timeLeft = render();
  if (running && timeLeft <= warningBehavior.finalSeconds) flash();
}

function scrub(delta) {
  audio();
  if (running) elapsedSeconds += (performance.now() - startedAt) / 1000;
  elapsedSeconds = Math.max(0, elapsedSeconds + delta);
  startedAt = performance.now();
  previousRemaining = remaining();
  nextAlertAt = Math.max(0, -previousRemaining);
  stopSounds();
  document.body.classList.remove("flash");
  render();
}

// Compare threshold crossings rather than relying on exact frame timing.
function tick() {
  const timeLeft = render();
  if (running) {
    if (
      warningTimes.some((n) => previousRemaining > n && timeLeft <= n) ||
      (timeLeft > 0 &&
        timeLeft <= warningBehavior.finalSeconds &&
        Math.ceil(previousRemaining) !== Math.ceil(timeLeft))
    )
      flash();
    if (timeLeft <= 0) {
      const overtime = -timeLeft;
      const warning = escalation(overtime, settings);
      if (settings.beep === 0) {
        // Snooze disabled: keep the initial alert, but never schedule repeats.
        if (nextAlertAt !== Infinity && playBatch(warning.volume))
          nextAlertAt = Infinity;
      } else if (warning.continuous) {
        // Queue only near the current batch's end, keeping playback continuous
        // without building a backlog or starting simultaneous effects.
        if (
          audioContext &&
          audioContext.currentTime + audioLookahead >= soundEndsAt
        ) {
          playBatch(warning.volume, { queue: true });
        }
      } else if (overtime >= nextAlertAt && playBatch(warning.volume)) {
        // A due trigger waits until the current batch finishes. No overlapping
        // batches, clipped effects, or accumulated missed-trigger backlog.
        nextAlertAt = overtime + warning.interval;
      }
      const previousPhase = escalation(
        Math.max(0, -previousRemaining),
        settings,
      ).flashPhase;
      if (
        previousRemaining > 0 ||
        Math.floor(warning.flashPhase) > Math.floor(previousPhase)
      ) {
        flash(warningBehavior.flashDuration / warning.flashRate);
      }
    }
    previousRemaining = timeLeft;
  }
  requestAnimationFrame(tick);
}

// Timer controls.
$("start").onclick = toggle;
$("reset").onclick = reset;
function fillSettings(values) {
  for (const field of settingFields) {
    if (field.kind === "boolean") inputs[field.key].checked = values[field.key];
    else inputs[field.key].value = formatSetting(field.key, values[field.key]);
    if (field.unit)
      setText(
        `${field.id}-value`,
        formatSetting(field.key, values[field.key], { includeUnit: true }),
      );
  }
  $("preview-sound").disabled = !inputs.audio.checked;
  clockView.setSize(values.size);
  $("error").textContent = "";
}

function openSettings() {
  fillSettings(settings);
  $("dialog").showModal();
}

// Settings and URL configuration.
$("settings").onclick = openSettings;
$("close").onclick = () => $("dialog").close();
$("defaults").onclick = () => {
  if (!running) stopSounds();
  fillSettings(defaultSettings);
};
$("dialog").onclose = () => {
  if (!$("dialog").open) {
    clockView.setSize(settings.size);
    if (!running) stopSounds();
  }
};
inputs.size.addEventListener("input", () => {
  clockView.setSize(parseSetting("size", inputs.size.value).value);
});
if (typeof window.ResizeObserver === "function") {
  new window.ResizeObserver(clockView.fit).observe($("clock-frame"));
} else {
  window.addEventListener("resize", clockView.fit);
}
inputs.audio.addEventListener("change", () => {
  if (!inputs.audio.checked && !running) stopSounds();
});
$("preview-sound").onclick = async () => {
  if (!inputs.audio.checked) return;
  if (running) toggle();
  stopSounds();
  const request = audioRevision;
  const sound = inputs.sound.value;
  const parsedCount = parseSetting("count", inputs.count.value);
  if (parsedCount.error) {
    $("error").textContent = parsedCount.error;
    return;
  }
  const count = parsedCount.value;
  $("error").textContent = "";
  await audio();
  // Reset, close, another preview, or a timer action cancels this request.
  if (request !== audioRevision || !$("dialog").open) return;
  if (!audioContext || audioContext.state !== "running") {
    $("error").textContent =
      "Audio is unavailable. Check your browser's sound settings.";
    return;
  }
  playBatch(0.7, { sound, count, enabled: true });
};
$("form").onsubmit = (e) => {
  e.preventDefault();
  const parameters = new URLSearchParams(new FormData(e.target));
  // Native forms omit unchecked checkboxes; serialize false explicitly.
  for (const field of settingFields) {
    if (field.kind === "boolean")
      parameters.set(
        field.key,
        formatSetting(field.key, inputs[field.key].checked),
      );
  }
  const parsed = parseSettings(parameters);
  if (parsed.errors.length) {
    $("error").textContent = parsed.errors[0];
    return;
  }
  settings = parsed.values;
  const normalized = settingsParameters(settings);
  const savedLocally = saveSettings(settings);
  setText(
    "save-hint",
    savedLocally
      ? "Saved in this browser and the URL."
      : "Saved in the URL only; browser storage is unavailable.",
  );
  history.replaceState(null, "", "#" + normalized);
  reset();
  $("dialog").close();
};

window.addEventListener("hashchange", () => {
  settings = loadSettings(location.hash);
  reset();
});

$("fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    $("fullscreen").textContent = "Use browser full screen";
  }
};

window.addEventListener("keydown", (e) => {
  if (
    $("dialog").open ||
    /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) ||
    e.target.isContentEditable ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey
  )
    return;
  if (e.code === "Space") {
    e.preventDefault();
    if (e.repeat) return;
    toggle();
  } else if (e.key in scrubKeys) {
    e.preventDefault();
    scrub(scrubKeys[e.key].elapsedChange);
  } else if (e.key.toLowerCase() === "r") reset();
});

fillSettings(settings);
render();
requestAnimationFrame(tick);
