# Contributing to Voyager

Voyager is open source under the MIT source-code license. Bug reports, focused fixes, controller improvements and documentation contributions are welcome.

Read [AGENTS.md](AGENTS.md) and [the AI workflow](docs/AI-WORKFLOW.md) before editing. Use the source project launcher for development. The public default catalog must remain **Controller Lab only**; personal games and controllers belong in the editable library.

For a code change, explain the user-visible problem and resulting behavior. Run `npm run typecheck`, `npm test`, and checks relevant to the change. Use `npm run test:workflow` for launcher/toolkit edits and `npm run test:e2e` for pairing or controller flows. Native gameplay tests are opt-in and require your own installations.

Use isolated data under `.local` for experiments. Never commit catalogs, executable paths from a user's machine, pairing tokens, cookies, credentials, captures of private sessions, downloaded trailers or proprietary game files. Redact connection details from screenshots.

Keep existing executable, binding, asset and IPC validation. Preserve input release on disconnect, blur, navigation and shutdown. Do not introduce arbitrary command execution through game records. Never mark gameplay/offline tests passed when only a JSON or browser test ran.

Add new assets only with a documented source and license. Reverse: 1999 materials and other third-party media are separate from this project's MIT code; do not label them as original project artwork or MIT assets.

For a release, commit the reviewed source first, then run `npm run dist`. The release organizer archives the committed public source and writes hashes under `releases/<version>`. Publish the installer, portable ZIP, source ZIP and checksum file from the same version.
