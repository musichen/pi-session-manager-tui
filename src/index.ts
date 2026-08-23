import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { SessionEntry, SessionInfo } from "@earendil-works/pi-coding-agent";
import {
  listSessions,
  renameSessionFile,
  deleteSessionFile,
  forkSessionFile,
} from "./sessions";
import {
  SessionListView,
  ActionsView,
  HistoryView,
  type SessionAction,
  type ThemeLike,
} from "./components";

type View = "list" | "actions" | "history";

interface ListResult {
  kind: "select";
  session: SessionInfo;
}

function viewportHeight(rows: number): number {
  return Math.max(8, rows - 6);
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("pi-session-manager-tui", {
    description: "Browse, search, rename, fork, resume, and delete pi sessions",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("pi-session-manager-tui requires interactive TUI mode", "warning");
        return;
      }
      await run(pi, ctx);
    },
  });
}

async function run(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
  let sessions = await listSessions();
  let view: View = "list";
  let selected: SessionInfo | null = null;
  let query = "";

  for (;;) {
    if (view === "list") {
      const result = await ctx.ui.custom<ListResult | null>((tui, theme, _kb, done) => {
        const list = new SessionListView(
          sessions,
          query,
          theme as ThemeLike,
          viewportHeight(tui.terminal.rows),
          {
            onSelect: (session) => done({ kind: "select", session }),
            onExit: () => done(null),
          },
        );
        return {
          render: (w: number) => list.render(w),
          handleInput: (data: string) => {
            list.handleInput(data);
            tui.requestRender();
          },
          invalidate: () => list.invalidate(),
        };
      });

      if (!result) return;
      selected = result.session;
      query = "";
      view = "actions";
      continue;
    }

    if (view === "actions" && selected) {
      const current: SessionInfo = selected;
      const action = await ctx.ui.custom<SessionAction | null>((tui, theme, _kb, done) => {
        const actions = new ActionsView(current, theme as ThemeLike, {
          onPick: (a) => done(a),
          onCancel: () => done(null),
        });
        return {
          render: (w: number) => actions.render(w),
          handleInput: (data: string) => {
            actions.handleInput(data);
            tui.requestRender();
          },
          invalidate: () => actions.invalidate(),
        };
      });

      if (!action || action === "back") {
        view = "list";
        continue;
      }

      if (action === "resume") {
        await ctx.switchSession(current.path, {
          withSession: async (next) => {
            next.ui.notify("Resumed session", "info");
          },
        });
        return;
      }

      if (action === "history") {
        view = "history";
        continue;
      }

      if (action === "rename") {
        const newName = await ctx.ui.input("Rename session:", current.name ?? "");
        if (newName !== undefined && newName !== null && newName !== current.name) {
          const isCurrent = ctx.sessionManager.getSessionFile() === current.path;
          if (isCurrent) {
            pi.setSessionName(newName);
          } else {
            renameSessionFile(current.path, newName);
          }
          ctx.ui.notify(`Renamed to "${newName}"`, "info");
          sessions = await listSessions();
          selected = sessions.find((s) => s.path === current.path) ?? current;
        }
        continue;
      }

      if (action === "fork") {
        const newPath = forkSessionFile(current.path, current.cwd || ctx.cwd);
        if (newPath) {
          await ctx.switchSession(newPath, {
            withSession: async (next) => {
              next.ui.notify("Forked session", "info");
            },
          });
        } else {
          ctx.ui.notify("Fork failed", "error");
        }
        return;
      }

      if (action === "delete") {
        const ok = await ctx.ui.confirm(
          "Delete session?",
          `Delete ${current.path}? This cannot be undone.`,
        );
        if (ok) {
          const deleted = await deleteSessionFile(current.path);
          ctx.ui.notify(
            deleted ? "Session deleted" : "Delete failed",
            deleted ? "info" : "error",
          );
          sessions = await listSessions();
          selected = null;
          view = "list";
        }
        continue;
      }
    }

    if (view === "history" && selected) {
      const current: SessionInfo = selected;
      let entries: SessionEntry[];
      try {
        entries = SessionManager.open(current.path).getEntries();
      } catch {
        ctx.ui.notify("Could not open session history", "error");
        view = "actions";
        continue;
      }

      await ctx.ui.custom<"back" | null>((tui, theme, _kb, done) => {
        const history = new HistoryView(entries, theme as ThemeLike, viewportHeight(tui.terminal.rows), {
          onExit: () => done("back"),
        });
        return {
          render: (w: number) => history.render(w),
          handleInput: (data: string) => {
            history.handleInput(data);
            tui.requestRender();
          },
          invalidate: () => history.invalidate(),
        };
      });

      view = "actions";
      continue;
    }
  }
}
