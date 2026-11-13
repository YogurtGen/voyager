# Changelog

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
