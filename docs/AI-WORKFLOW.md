# Editing Voyager with Codex or Claude Code

Open the cloned or extracted `voyager` folder as the project. Describe the fix or the game you want to add. Both assistants can edit the source and create game-specific phone controllers using the existing runtime; Voyager does not need an embedded AI service or an AI API key for this workflow.

## Running code changes

`Voyager.cmd` runs this checkout through `scripts/launch-project.ps1`. `npm start` uses the same Node launcher. When source inputs are newer than the build, it builds first, then opens Electron in fullscreen. Closing and reopening applies changes; an already open window keeps its current code until closed. The first open after a change takes longer while the build runs. There is no installer step.

Keep Node.js, `node_modules`, and this project folder available. Use `npm run setup` only if dependencies are missing or need restoring. Build and runtime messages go to `.local/project-launch.log`; startup failures also write `.local/project-launch-error.log`. `Voyager-Windowed.cmd` opens a window for debugging.

For code edits, run `npm run typecheck` and checks relevant to the change. `npm run test:workflow` checks the launcher build cache and AI game import without using the real library. Native gameplay tests remain opt-in. Make an installer only when the user asks for a distribution package.

## Find the active library

Read `%APPDATA%\Voyager\library-location.json` and its `directory` field. That is the **base** directory; the catalog is `<directory>\library\catalog.json`, and image assets are under `<directory>\library\images`. If no locator exists, a source checkout uses `.local\user-data` inside that checkout. A packaged app uses a `Voyager-data` folder beside its installation directory. Voyager's Choose storage action can change it, so always read the locator again. An explicit `VOYAGER_LIBRARY_DIR` or `VOYAGER_DATA_DIR` overrides the locator.

Preferences and local trailer media stay in `%APPDATA%\Voyager`. For an installed app, first use its library storage setting to choose a shared folder. This writes the locator so the app and toolkit agree on the active catalog. If no locator exists, do not assume the source checkout's default is the installed app's library: explicitly set `VOYAGER_LIBRARY_DIR` to the verified base directory or configure storage first. Do not move, overwrite or merge a library merely to establish this connection.

The public default catalog contains **Controller Lab only**. Native preset/adapter code remains available in source for compatibility, but those entries are not preloaded. Add user games through validated local records; keep the shipped catalog clean.

Close Voyager before writing library data. The import tool refuses to save while the project launcher has an active session. Do not bypass that guard: the UI holds an in-memory copy and may have an unsaved draft. If an old installed copy is running outside this launcher, close that too.

## Adding a game and its custom controller

1. Inspect the actual installed executable and store metadata. Determine supported gamepad/keyboard input, local player count, shared/split screen, and required actions. Use the game's own controls/settings or official documentation as evidence; record unresolved mappings as untested. Do not invent local multiplayer support or silently change the game's settings.
2. Create a draft with `node toolkit/game.mjs --template .local/my-game.json`. This creates a unique ID and the current schema. It refuses to overwrite an existing draft. Read `LocalGameRecord`, `ControllerDefinition`, and `OutputBinding` in `src/shared/studio-model.ts` and the rules in `src/shared/studio-validation.ts` before editing the JSON.
3. Replace the generic starting layout with a controller designed for this game. Keep only useful modes (for example Menu + Driving, Menu + Combat, or a single simple layout). Choose analog sticks, D-pad, triggers, and buttons according to how the game is actually played. Keep frequent actions within thumb reach, separate opposing actions, label buttons by their purpose, and provide Confirm, Back and Pause where needed. The design canvas is 960 × 540; controls must fit, with a minimum size of 44. Preserve Voyager theme defaults unless the user asks otherwise.
4. Map every used action and analog axis explicitly under `bindings.gamepad` / `bindings.keyboard`, indexed by player slot `1`–`4` and mode ID. Set the supported `inputMethod`. Remove unused generic actions. Check simultaneous actions and held/released behavior: movement + attack, throttle + steering + brake, and so on. Do not create conflicting keyboard mappings for simultaneous local players. Virtual gamepad input requires the existing supported driver; do not install one automatically. A controller JSON can configure only the input primitives the runtime already supports.
5. Set the real executable, working directory and argument array; never use a shell or interpreter as the launch target. Fill in the title, description, player range, connection and display modes based on evidence. Keep `tests.launch`, `menu`, `gameplay` and `offline` false until verified. Use `tests.notes` to record control references, layout decisions, and remaining manual checks. Do not copy another game's test-passed flags.
6. Save with `node toolkit/game.mjs .local/my-game.json`. This uses Voyager's actual `LibraryStore`: schema, mappings, executable and asset validation, revision checks, atomic catalog replacement and previous-catalog backup. It does not launch the game or send input.
7. Reopen Voyager, check the new game in Collection / Game Edit and preview its phone layout in Controller Studio. Test layout fit and resolved mappings in isolation first. Actual gameplay, multi-touch on a phone, player independence, input release and offline launch need real testing; clearly say which checks remain.

The tool handles validated game/controller records. It does not automatically research the game, design its controller, import arbitrary image paths, or install the game. The assistant performs those design decisions. Use existing image import/crop APIs or Game Edit for artwork; JSON artwork references must be existing content-hashed local assets. Set a valid Steam `storeRef` when verified so the app can use its normal metadata/trailer flow. The user can replace banner/trailer media in Game Edit.

## Updating an existing game

Read the **current** record from the active catalog, copy it to a draft file, and preserve its ID and revision. Change only the requested parts; save through the same tool. A stale revision is rejected so one assistant cannot silently overwrite a newer edit. Binding, launch or input-method changes reset the relevant test flags automatically. The saved record remains fully editable through Game Edit and Controller Studio.

Do not hand-edit `catalog.json` or reset it to add a game. Do not remove unknown fields or unrelated games as cleanup. For experiments use a separate `VOYAGER_LIBRARY_DIR` under `.local/tests`, and never repoint the user's persistent locator to a test fixture.

## Fixing an installed app

Code edits affect the source checkout, not an already installed EXE. Use the project launcher for the edit → close → reopen workflow. To distribute a fix, validate it, increment the public package version and build a new installer/portable package. Keep user data outside the application package; never include a private library or temporary test records in a release.
