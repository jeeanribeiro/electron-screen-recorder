# Releasing

Releases are built by CI for all three platforms and attached to a GitHub
Release. Auto-update is wired to those releases via electron-updater.

## Cutting a release

1. Bump `version` in `package.json` and commit.
2. Tag and push:

   ```sh
   git tag -a v1.2.3 -m "v1.2.3"
   git push origin main v1.2.3
   ```

3. Create the GitHub Release for the tag with release notes
   (`gh release create v1.2.3 --title "v1.2.3" --notes ...`).
4. The `Release` workflow builds on macOS, Windows and Linux and attaches:
   - `*-mac-*.dmg` + `*-mac-*.zip` and `latest-mac.yml`
   - `*-win-*.exe` (NSIS) and `latest.yml`
   - `*-linux-*.AppImage` + `.deb` and `latest-linux.yml`

   The `latest*.yml` files are the electron-updater feeds — do not delete them.

## Auto-update behavior (unsigned builds)

The app checks GitHub Releases on startup (`checkForUpdatesAndNotify`).
Because these are unsigned community builds, expectations differ per OS:

| OS               | Auto-update               | Caveat                                                                                                                                                         |
| ---------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows          | Works                     | SmartScreen warns on first install of a new version                                                                                                            |
| Linux (AppImage) | Works                     | The AppImage replaces itself in place                                                                                                                          |
| macOS            | **Requires code signing** | electron-updater refuses to update unsigned apps on macOS; users update manually. Gatekeeper also requires right-click → Open (or `xattr -cr`) on first launch |

## Local packaging

```sh
pnpm package             # build + electron-builder for the current OS
```

Output lands in `release/<version>/`.

## One-time setup for signed builds (future)

- **macOS**: add `CSC_LINK` / `CSC_KEY_PASSWORD` secrets (Developer ID
  certificate) and remove `identity: null` from `electron-builder.yml`, plus
  notarization credentials (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
  `APPLE_TEAM_ID`).
- **Windows**: add an Authenticode certificate (`CSC_LINK`, or Azure Trusted
  Signing config) to remove the SmartScreen warning.
