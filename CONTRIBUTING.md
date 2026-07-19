# Contributing

Thanks for taking an interest! This is a small project and contributions are welcome.

## Setup

```sh
pnpm install
pnpm dev          # electron-vite dev server + Electron with HMR
```

Node 24+ and pnpm 10 are the supported toolchain (`corepack enable` handles pnpm).

## Before you open a PR

```sh
pnpm lint         # ESLint (flat config)
pnpm typecheck    # tsc (main/preload/shared) + vue-tsc (renderer)
pnpm test         # Vitest unit tests
pnpm build        # electron-vite production build
pnpm test:e2e     # Playwright Electron smoke test (needs the build)
```

All five must pass — CI runs exactly these.

## Ground rules

- **Renderer stays sandboxed.** No new `webPreferences` loosening, no Node
  access in the renderer, ever. New IPC goes through the typed contract in
  `src/shared/ipc.ts` and the preload bridge.
- Pure logic (ffmpeg args, parsing, formatting, validation) lives in
  `src/shared/` so it can be unit-tested without Electron.
- Keep commits focused and use conventional commit messages
  (`feat:`, `fix:`, `docs:`, ...).

## Releasing (maintainers)

See [RELEASING.md](RELEASING.md).
