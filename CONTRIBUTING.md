# Contributing to pi-session-manager-tui

## Setup

```bash
npm install
pi -e ./src/index.ts
```

That loads the extension from your checkout. See Local dev in the README [Install](README.md#install) section for auto-discovery while editing.

## Checks

```bash
npm run typecheck
```

This runs `tsc --noEmit` and is the only script in `package.json`. There is no test script yet, so also exercise the UI by hand: open `/pi-session-manager-tui`, search, view history, and try rename or fork on a throwaway session.

## Layout

- `src/index.ts` - registers the command and the view state machine
- `src/components.ts` - SessionListView, ActionsView, HistoryView
- `src/sessions.ts` - list, search, rename, fork, delete, transcript helpers

## Pull requests

Create a branch from `main` and describe the manual UI test you ran in the PR.
