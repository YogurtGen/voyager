# Testing Voyager

The public build starts with **Controller Lab only**. Existing native adapter/preset code is retained for compatibility and isolated tests; it does not populate the shipped collection.

Use Windows 10/11 x64 and Node.js 24+. Install dependencies with `npm run setup`. `npm start` / `Voyager.cmd` builds changed source and opens fullscreen; `Voyager-Windowed.cmd` is useful for debugging.

```powershell
npm run typecheck
npm test
npm run test:workflow
npm run test:controllers
npm run build
npm run test:e2e
```

Unit tests cover server pairing, controller resolution, input release, native launch validation, artwork fallback, store import, trailers and motion geometry. Legacy preset tests use explicit fixture catalogs; `public-defaults.test.ts` separately checks the real clean default.

The workflow test uses isolated libraries. It checks build invalidation, game/controller import, backup persistence, stale revisions and invalid bindings. Close a project-launched Voyager before running it.

`test:controllers` exercises the actual React controller surface and visual binding diagrams in Chrome, then passes the resulting output through the real native report parser. It checks Xbox/PlayStation targets, every bindable keyboard key, independent LT/RT multi-touch, full trigger presses, analog dragging, keyboard activation and release. The native harness additionally verifies all 99 keyboard codes and their Windows press/release flags. It creates no virtual controllers and sends no OS input. Physical-device/game recognition remains a separate playtest.

The Electron E2E flow checks a fresh Controller Lab-only catalog, search/favorites, PC approval, four browser phones, fifth-phone rejection, navigator ownership, simultaneous input, viewport layouts, reconnect, ending a session, persistence and shutdown. It disables native execution and external trailer preparation. Chrome must be installed for its phone-browser tests.

For a controller designed by AI, also verify its phone layout on real devices and actual gameplay: action combinations, hold/release, movement, menu/Back/Pause, focus loss, player independence and the supported gamepad driver. Automated JSON/layout checks do not establish game compatibility or offline launch.

Do not run physical-input/gameplay scripts against a user's active game without explicit authorization. Never use the user's library as test data.
