# Lightning Timer

A full-screen countdown that helps lightning talks stay on schedule. Large digits, visual warnings, and escalating overtime sounds make the remaining time hard to miss.

Plain HTML, CSS, and browser JavaScript. No install or build step.

## Use

- Open **Settings** to choose the duration, warnings, sounds, and clock size.
- **Apply** saves settings in this browser and resets the timer. **Defaults** restores the fields; apply to save them.
- **Space** starts or pauses. **R** resets. The clock and progress bar dim when stopped.
- **Left / right** subtract / add ten seconds remaining; **down / up** subtract / add one minute. These also work while paused for testing. Shortcuts are disabled in settings.

Set the duration through the URL hash: `#time=5m`, `#time=600s`, or `#time=600`. Plain numbers mean seconds. Hash values override matching saved settings; they overwrite saved preferences only when you press **Apply**.

**First warning at** is the time remaining when early flashes begin; `auto` adapts to the talk length. The final ten seconds flash red each second. Overtime shows a minus sign, with bright random flashes that accelerate.

**Snooze** sets the first sound repeat interval after zero. Repeats get faster and louder until **Reach max warnings at**, when fresh sounds play continuously. Sounds play back to back without overlapping. Set Snooze to `0` for just the initial alert, or max warnings to `0` to keep a fixed intensity.

Sound is enabled by default; disable it in settings for a silent timer. Each playback generates a fresh effect using the included [Jsfxr](https://sfxr.me/) library. Keep the tab visible for reliable alerts.

Defaults, limits, and settings fields are defined once in [settings.mjs](settings.mjs). The other `.mjs` files are plain JavaScript modules loaded directly by the browser.
