# Releasing The Arneyan Codex

Once this is set up, anyone can install the system in Foundry from one link
(Game Systems > Install System > Manifest URL), and Foundry offers updates when you publish a new release.

Nothing here has been created yet: no repository, no release. These are the steps for you to do.

## One-off setup

1. **Make a GitHub repository** for the system (public, so Foundry can download from it). Replace
   `<owner>/<repo>` below with yours, for example `kieran/arneyan-codex`.
2. **Push this project to it.** The workflow is already in `.github/workflows/release.yml`.
3. **Commit the compendium sources.** The release compiles `packs-src/` into the compendiums, but the book
   sources the build reads from are only on your computer, so `packs-src/` has to be in the repository.
   Remove the `packs-src/` line from `.gitignore`, run `python3 build/build.py`, then commit `packs-src/`.
   (Leave `arneyan/packs/` ignored: the release builds it.)
4. **Set the links in `arneyan/system.json`** (the release also stamps these, but set them once so the
   copy in the repository matches):

   ```json
   "url": "https://github.com/<owner>/<repo>",
   "manifest": "https://github.com/<owner>/<repo>/releases/latest/download/system.json",
   "download": "https://github.com/<owner>/<repo>/releases/download/v0.10.0/arneyan.zip"
   ```

5. **Check Actions are allowed** for the repository (Settings > Actions > General > "Allow all actions",
   and under "Workflow permissions", "Read and write permissions").

## Each release

1. Raise `version` in `arneyan/system.json` (for example `0.10.0`).
2. Run `python3 build/build.py` and the tests (`node test/run.mjs`, `node test/validate-packs.mjs`), then
   commit, including any changes in `packs-src/`.
3. On GitHub, **Releases > Draft a new release**, tag it with the version (`v0.10.0`), add notes, and
   **Publish**.
4. The workflow (Actions tab) compiles the compendiums, writes the version and links into `system.json`,
   and attaches `arneyan.zip` and `system.json` to the release. It takes a minute or two.

## Installing

Give players and other GMs this manifest link:

```
https://github.com/<owner>/<repo>/releases/latest/download/system.json
```

In Foundry: **Game Systems > Install System**, paste it into **Manifest URL**, then **Install**. Worlds that
already use the system get the update from **Game Systems > Update All**.

## If something goes wrong

- **The workflow says "No compendiums"**: `packs-src/` isn't committed (step 3 of the setup).
- **Foundry says the manifest is invalid**: open the manifest link in a browser; it should show the
  system.json. If it 404s, the release has no `system.json` attached yet (check the Actions tab).
- **Foundry installs an old version**: the `version` in `system.json` wasn't raised before tagging.
