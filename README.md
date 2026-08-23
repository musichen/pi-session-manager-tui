# pi-session-manager-tui

A TUI session manager for [pi](https://pi.dev) - browse, fuzzy search, view
history, rename, fork, resume, and delete sessions across every project,
without leaving the terminal.

Built entirely with pi's own TUI component library
(`@earendil-works/pi-tui`) and the extension UI surface (`ctx.ui.*`).

## Features

- **Fuzzy search** across every session - matches the display name, working
  directory, first message, *and* the full text of every message in history.
- **Browse** all sessions (sorted by most recent), with message count, age,
  and project path.
- **View history** - scroll through a session transcript with `↑↓` / `PgUp` /
  `PgDn` / `Home` / `End`, then exit back.
- **Rename** any session with a quick input dialog.
- **Fork** a session into a new one carrying the full history.
- **Resume** (launch) any session.
- **Delete** sessions with a confirm guard.

## Install

```bash
pi install git:github.com/musichen/pi-session-manager-tui
```

Or try it without installing:

```bash
pi -e git:github.com/musichen/pi-session-manager-tui
```

Local dev:

```bash
pi -e ./src/index.ts
# or, for auto-discovery while editing:
#   ln -s "$(pwd)" ~/.pi/agent/extensions/pi-session-manager-tui
```

## Usage

Run `/pi-session-manager-tui` from any session. The main view opens:

```
pi session manager
search › (type to fuzzy search)▌
─────────────────────────────────
❯ refactor auth flow      42 msgs · 2h ago · ~/work/app
  fix scroll state        18 msgs · 1d ago · ~/work/app
  ...
─────────────────────────────────
↑↓ navigate · type to search · enter open · esc back/exit
```

Selecting a session opens the actions menu:

- **Resume session** - switch into it
- **View history** - scrollable transcript
- **Rename** - set a display name
- **Fork** - start a new session from this one
- **Delete** - remove the session file (with confirmation)
- **Back** - return to the list

## Keybindings

| Key | Action |
| --- | ------ |
| `↑` / `↓` | navigate |
| type | fuzzy filter the list |
| `enter` | open / choose |
| `esc` | clear search, then go back / exit |
| `backspace` | edit search |
| `PgUp` / `PgDn` | jump history |
| `Home` / `End` | start / end of history |

## How it works

- Lists sessions via `SessionManager.listAll()`, which reads
  `~/.pi/agent/sessions/`.
- Search uses pi-tui's `fuzzyFilter` over the concatenated session text.
- History is rendered from the session JSONL entries
  (`SessionManager.open(path).getEntries()`).
- Rename appends a `session_info` entry; fork uses `SessionManager.forkFrom`;
  resume uses `ctx.switchSession`.
- UI is composed from `SessionListView` / `ActionsView` / `HistoryView`
  custom components (see [`src/components.ts`](src/components.ts)).

## Structure

```
src/
├── index.ts        # registers /pi-session-manager-tui + view state machine
├── components.ts   # SessionListView, ActionsView, HistoryView
└── sessions.ts     # list/search/rename/fork/delete + transcript helpers
```

## License

MIT
