# Voyager website

This is the WaterConsole website copied at the owner's explicit request, with Voyager branding, actual Voyager screenshots, release information and links. See [SOURCE.json](SOURCE.json) and [CREDITS.md](CREDITS.md). Keep its CSS and JavaScript unchanged unless the owner requests a design change.

```sh
node scripts/serve-website.mjs
node scripts/check-website.mjs
node scripts/build-website.mjs
npm run typecheck
```

The preview serves `http://127.0.0.1:4173/voyager/`. The checker verifies source identity, working local assets and anchors, correct Voyager links, Support us beside both download actions and the screenshot aspect-ratio rule.

GitHub Actions builds only this public directory into a content-versioned `.local/website-<hash>` artifact, then deploys it to `https://yogurtgen.github.io/voyager/`. None of the app's library or session data is uploaded. Updating HTML/CSS/JS/assets automatically changes their URL version, preventing stale cached styles.

Only Controller Lab is bundled in Voyager. The website's interactive phone/lab is an illustration, not a live PC connection. The screenshot pairing session is expired; visitors pair phones through their own Windows app.
