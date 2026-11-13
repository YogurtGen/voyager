# Voyager coding instructions

Read [docs/AI-WORKFLOW.md](docs/AI-WORKFLOW.md) before editing the app, adding a game, or designing a controller. These instructions apply to the whole project.

- Use this source checkout as the editable app. Use `Voyager.cmd` / `npm start`; the launcher applies source changes on the next open. Do not replace the user's shortcut with an installer build or require a reinstall for ordinary fixes.
- The shipped catalog must contain **Controller Lab only**. Preserve existing user-added games, controllers, native integrations and user data. Check the active library locator before editing data; never overwrite a catalog with a template or a test fixture.
- For game additions, inspect the actual game's controls, then design a suitable phone controller and explicit action mappings. Use `toolkit/game.mjs` to validate and save. Do not pass off its generic starting template as a finished custom controller.
- Follow the existing Voyager navy/black/blue design and controller navigation. Preserve user-authored game/controller colors and names.
- Run typecheck and focused checks for code changes. Use isolated data for automated tests; never mark gameplay or offline checks as passed unless they were actually performed.
- Do not launch a native game, install a driver, alter firewall settings, or send OS input merely to validate a JSON controller. Do not weaken the existing executable, asset or binding validation.
