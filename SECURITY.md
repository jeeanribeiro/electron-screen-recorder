# Security policy

## Supported versions

Only the [latest release](https://github.com/jeeanribeiro/electron-screen-recorder/releases/latest) receives fixes.

## Reporting a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/jeeanribeiro/electron-screen-recorder/security/advisories/new) rather than a public issue. Reports get a response within a week.

Of particular interest: anything that breaks the renderer sandbox, bypasses the typed IPC contract, escapes the recordings-directory path validation, or executes code through the ffmpeg invocation.
