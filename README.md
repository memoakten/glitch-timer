# Lightning Timer

A full-screen countdown for lightning talks: clear visual warnings near the end, followed by louder, more frequent overtime alerts. Plain HTML, CSS, and JavaScript, with no install or build step.

## Run

Requires Python 3:

```sh
./run.sh        # http://localhost:8000
./run.sh 9000   # choose another port
```

At 100% clock size, the time text fills the available screen space; the Clock size slider reduces it and previews changes live.

The script works from any directory. Open the printed URL and press **Start timer** to enable audio and begin. **Ctrl+C** stops the server. To host elsewhere, serve this folder with any static web server.

## Settings

Applied settings are saved in this browser and restored on reload, including when you open the app without a hash. URL hash values override matching saved settings; unspecified values keep your saved preferences. Browser storage is specific to the site address, including its port. Numbers mean seconds; `s` and `m` suffixes also work: `#time=600`, `#time=600s`, and `#time=10m` are equivalent.

<!-- settings:start -->
| Parameter | Default | Meaning |
| --- | --- | --- |
| `time` | `5m` | Talk duration; plain numbers mean seconds. |
| `warn` | `auto` | Time remaining at the first flash; then flash at each remaining whole minute. Set 0 to skip early warnings. |
| `beep` | `10s` | Initial repeat interval after zero, shortening as overtime grows. Set 0 to play the zero alert once without repeat sounds. |
| `ramp` | `2m` | Time overdue until full volume, continuous sound batches, and 8 flashes per second with increasingly random colors. Set 0 to keep the initial volume, interval, and flash rate. |
| `sound` | `powerUp` | Jsfxr preset, listed below. |
| `count` | `3` | Sounds per alert; integer from 1 to 100. |
| `size` | `100%` | Percentage of the largest clock text that fits the screen. |

For example: `#time=3m&warn=1m&beep=10s&ramp=2m&sound=powerUp&count=3&size=100`.
<!-- settings:end -->

<!-- warnings:start -->
Automatic warnings start with **1m left for talks of 3m to under 5m**, **2m left for talks of 5m to under 10m**, **3m left for talks of 10m or longer**. Shorter talks use 1/3 remaining, capped at 30s. The final 10s always flash the background and digits red once per second, including with `warn=0`.
<!-- warnings:end -->

At zero, an alert sounds; overtime is displayed with a minus sign. The final countdown flashes the digits and background together in red. During overtime, both pulse with a freshly randomized hue on every flash; saturation and brightness become more varied toward maximum warnings. Background colors stay bright and saturated, while the digits darken for contrast. Flash speed and color variation increase independently of mute or snooze. Sound batches never overlap or cut one another short: if a repeat is due during playback, it waits. At maximum overtime, new batches join back to back. Keep the timer tab visible; browsers can suspend animation and delay alerts in background tabs.

**Defaults** restores the fields; **Apply** saves them locally and in the URL, then resets the timer. Closing settings discards unapplied edits. If browser storage is blocked, settings still work through the URL. **Preview sound** pauses the timer and turns sound on; closing settings stops the preview. Pause, reset, mute, and scrubbing cancel active and scheduled sounds. Scrubbing works while paused or running and stops at the talk's beginning.

## Sounds

<!-- presets:start -->
Presets: `pickupCoin`, `laserShoot`, `explosion`, `powerUp`, `hitHurt`, `jump`, `blipSelect`, `synth`, `tone`, `click`, `random`.
<!-- presets:end -->

Every playback uses the included [Jsfxr library](https://sfxr.me/) to generate a fresh effect. Most presets produce variations; `tone` has fixed parameters. Nothing loops a cached recording. Volume depends on your device. The library and its license are included in this folder; no audio downloads are needed.

## Keyboard

- **Space:** start / pause. **R:** reset.
<!-- shortcuts:start -->
- **Left / right:** subtract / add 10s remaining.
- **Down / up:** subtract / add 1m remaining.
<!-- shortcuts:end -->

Shortcuts are disabled while editing settings.

## Checks

Requires Node.js:

```sh
node test.mjs
node runtime.test.mjs
node preferences.test.mjs
node sync-readme.mjs --check
```

Checks cover parsing, warnings, zero-disable settings, sound generation and scheduling, keyboard scrubbing, previews, and defaults. Audio timing tests use the real Jsfxr generator with a simulated Web Audio clock.

Configuration lives in [settings.mjs](settings.mjs). The app builds its form from that definition. After changing configuration, run `node sync-readme.mjs` to refresh the generated reference above; the website itself needs no build step.
