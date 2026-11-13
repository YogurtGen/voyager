# Asset and dependency licenses

Voyager's application source is covered by the root MIT license. Media and dependencies have the separate notices below.

| Material | Origin | License / notice |
| --- | --- | --- |
| Rocket/disc mark, procedural application icon, starfield, original controller-test illustrations and hardware diagrams | Voyager / WaterConsole contributors | MIT source license. |
| Procedural UI interaction sounds | Local Web Audio synthesis in src/renderer/sounds.ts | MIT source license; separate from sampled recordings. |
| Reverse: 1999 character illustration and sampled startup/background audio | Bluepoch / original rights holders | **Not MIT**; see [media credits](../docs/MEDIA-CREDITS.md) and [audio sources](licenses/audio-sources.txt). No blanket redistribution license is asserted. |
| Controller icon pack | Tabler / Paweł Kuna | MIT; adjacent public/assets/controller-icons/LICENSE.txt. |
| Inter and Nunito Sans | Font contributors via the locked @fontsource packages | SIL Open Font License 1.1; notices included in generated build/notices. |
| Adapted disc-carousel and liquid-glass components; rotating-slider motion reference | Credited 21st.dev authors | See licenses/21st-components-MIT.txt. Demo photography and GSAP are not bundled. |
| ViGEmClient 1.21.231.0, Windows x64 | Nefarius / Benjamin Höglinger-Stelzer | MIT; adjacent native/vigem/LICENSE and SOURCE.json pin its provenance and SHA256. User-mode client only; no driver is installed automatically. |
| npm dependencies | Their respective maintainers | Locked in package-lock.json; generated notices included with the build. |

The build produces build/notices/THIRD-PARTY-NOTICES.txt and dependencies.json. Keep these and the relevant adjacent notices with distributions.

The public app starts with Controller Lab only. Commercial game binaries, private posters, imported user controllers/catalogs, downloaded trailers, pairing secrets, raw research captures and personal settings are excluded. Existing game-specific adapter code does not include the games themselves.

Official character artwork in the README is an identified inspiration reference, not an original Voyager application asset. User-imported media retains its own terms. Public availability of a media file is not a grant of copyright ownership or an MIT license.
