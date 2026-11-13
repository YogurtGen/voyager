# Changelog

## 0.1.1 — Controller trigger fixes

Normal LT/RT taps previously produced a value based on where the finger landed: a center tap sent 0.5. The control now engages fully on press, tolerates small finger movement, and returns to zero on release. Deliberate dragging still allows partial analog pressure. The same fix applies to PlayStation-labelled L2/R2 and to existing saved controllers without resetting their bindings.

Space/Enter can now hold and release a focused trigger, matching normal button activation.

Input coverage now includes all 24 assignable Xbox targets, all 24 PlayStation-labelled targets, all 96 bindable ANSI104 keys, and the native helper's 99 keyboard codes including aliases. Four-player unit checks cover hold/release of each supported output. Browser checks cover triggers, both sticks, D-pad directions/diagonals, multi-touch, both backends and portrait/landscape geometry. Native encoding checks verify the resulting XInput bitmasks, trigger bytes, stick values and key press/release flags without creating devices or sending OS input.

The public default remains Controller Lab only. Existing game/controller records are preserved. System-only buttons remain explicitly unavailable through the supported backend.

Validation: 786 unit/integration tests, eight browser matrix groups, 1,662 native encoding assertions, and 134 existing native mapping/callback checks passed. End-to-end coverage now also checks full trigger presses through a compiled browser phone and the real server in safe preview. These automated checks create no virtual controllers and send no OS input; physical game recognition still requires playtesting.

## 0.1.0 — First public release

Voyager's first public release starts with **Controller Lab only**. Personal game libraries, saved controllers, installed games, downloaded trailers and pairing/session data are excluded.

- Fullscreen Windows host, QR pairing, PC approval and up to four phone controllers.
- Space-inspired interface, rocket/disc branding, disc collection and smooth scene transitions.
- Controller Lab for input testing, simultaneous actions, reconnects and shared/two/four viewport layouts.
- Local game setup, editable media, Controller Studio, visual bindings and supported keyboard/virtual gamepad output.
- Codex and Claude Code workflow with `AGENTS.md`, `CLAUDE.md`, a shared AI guide, validated game imports and a project launcher that rebuilds source changes on reopening.
- Reverse: 1999 theme inspiration, identified Voyager character artwork and separate audio/media credits.

Validation: 198 unit/integration tests, typecheck, four workflow-check groups, and 14 end-to-end checks on both source and packaged applications. End-to-end checks use browser phones and disable native execution. Physical-phone gameplay and added games require separate playtesting.

The Windows binaries are unsigned. Gamepad output for added native games can require a separately installed supported driver. The installer and source project are separate runtimes; editing source does not automatically patch an already installed EXE.
