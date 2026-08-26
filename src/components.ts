import {
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
  fuzzyFilter,
} from "@earendil-works/pi-tui";
import type { Component, SelectItem } from "@earendil-works/pi-tui";
import type { SessionEntry, SessionInfo } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Container, SelectList, Text } from "@earendil-works/pi-tui";
import {
  sessionSearchText,
  formatRelativeTime,
  shortenCwd,
  sessionToTranscript,
} from "./sessions";

/**
 * Minimal shape of the pi theme object used for styling. We only depend on
 * the color/weight/background helpers we actually call.
 */
export interface ThemeLike {
  fg(color: string, text: string): string;
  bg(color: string, text: string): string;
  bold(text: string): string;
  inverse(text: string): string;
}

export interface ListCallbacks {
  onSelect: (session: SessionInfo) => void;
  onExit: () => void;
}

function isTextInput(data: string): boolean {
  if (data.length === 0) return false;
  if (data.startsWith("\x1b")) return false;
  const code = data.charCodeAt(0);
  return code >= 32 || code === 9;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Pad a string to the given visible width with spaces (ANSI-safe). */
function padRight(text: string, width: number): string {
  const safeText = truncateToWidth(text, Math.max(0, width));
  const extra = width - visibleWidth(safeText);
  return extra > 0 ? safeText + " ".repeat(extra) : safeText;
}

/** A horizontal line of box-drawing characters. */
function rule(width: number, theme: ThemeLike, left: string, right: string, fill = "─"): string {
  return theme.fg("borderAccent", left + fill.repeat(Math.max(0, width - 2)) + right);
}

// ---------------------------------------------------------------------------
// Session list view: fuzzy search + keyboard navigation
// ---------------------------------------------------------------------------

export class SessionListView implements Component {
  private sessions: SessionInfo[];
  private filtered: SessionInfo[];
  private query: string;
  private selected = 0;
  private theme: ThemeLike;
  private maxVisible: number;
  private callbacks: ListCallbacks;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    sessions: SessionInfo[],
    query: string,
    theme: ThemeLike,
    maxVisible: number,
    callbacks: ListCallbacks,
  ) {
    this.sessions = sessions;
    this.query = query;
    this.theme = theme;
    this.maxVisible = Math.max(4, maxVisible);
    this.callbacks = callbacks;
    this.filtered = sessions;
    this.selected = 0;
    this.applyFilter();
  }

  private applyFilter(): void {
    const q = this.query.trim();
    this.filtered = q === "" ? this.sessions : fuzzyFilter(this.sessions, q, sessionSearchText);
    this.selected = clamp(this.selected, 0, Math.max(0, this.filtered.length - 1));
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up)) {
      if (this.selected > 0) this.selected--;
      this.invalidate();
      return;
    }
    if (matchesKey(data, Key.down)) {
      if (this.selected < this.filtered.length - 1) this.selected++;
      this.invalidate();
      return;
    }
    if (matchesKey(data, Key.escape)) {
      if (this.query.length > 0) {
        this.query = "";
        this.applyFilter();
        this.invalidate();
      } else {
        this.callbacks.onExit();
      }
      return;
    }
    if (matchesKey(data, Key.backspace)) {
      if (this.query.length > 0) {
        this.query = this.query.slice(0, -1);
        this.applyFilter();
        this.invalidate();
      }
      return;
    }
    if (matchesKey(data, Key.enter)) {
      const session = this.filtered[this.selected];
      if (session) this.callbacks.onSelect(session);
      return;
    }
    if (isTextInput(data)) {
      this.query += data;
      this.selected = 0;
      this.applyFilter();
      this.invalidate();
    }
  }

  /** The search field: a full-width, high-contrast highlighted input. */
  private searchBar(width: number): string {
    const theme = this.theme;
    const innerWidth = Math.max(4, width - 4);
    const icon = theme.fg("accent", "🔍");
    const text = this.query
      ? theme.bold(this.query)
      : theme.fg("dim", "type keywords to fuzzy search…");
    const cursor = this.query ? theme.inverse(" ") : "";
    const body = truncateToWidth(` ${icon}  ${text}${cursor} `, innerWidth);
    return theme.bg("searchMatchBg", `  ${padRight(body, innerWidth)}  `);
  }

  /** A single session row. */
  private sessionRow(session: SessionInfo, isSelected: boolean, width: number): string {
    const theme = this.theme;
    const prefix = isSelected ? theme.fg("accent", "❯") : " ";
    const label = session.name || session.firstMessage || "(unnamed)";
    const meta = [
      `${session.messageCount} msgs`,
      formatRelativeTime(session.modified),
      shortenCwd(session.cwd),
    ].join(" · ");

    // Reserve the two outer spaces before calculating columns. The renderer
    // rejects any line wider than the terminal, and styled text can still have
    // its visible width measured independently from its ANSI escape length.
    const contentWidth = Math.max(1, width - 2);
    const labelWidth = Math.max(10, Math.floor(contentWidth * 0.42));
    const metaWidth = Math.max(1, contentWidth - labelWidth - 4);

    const labelText = truncateToWidth(label, labelWidth);
    const metaText = truncateToWidth(meta, metaWidth);

    const line = `${prefix} ${isSelected ? theme.bold(labelText) : labelText}  ${theme.fg("muted", metaText)}`;
    const padded = padRight(truncateToWidth(line, contentWidth), contentWidth);

    return isSelected ? theme.bg("selectedBg", ` ${padded} `) : ` ${padded} `;
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    const theme = this.theme;
    const lines: string[] = [];

    // Header
    const left = `  ${theme.bold("pi session manager")}`;
    const right = `${theme.fg("dim", `${this.sessions.length} sessions`)}  `;
    const middle = " ".repeat(Math.max(0, width - 2 - visibleWidth(left) - visibleWidth(right)));
    lines.push(rule(width, theme, "┌", "┐"));
    lines.push(`│${left}${middle}${right}│`);
    lines.push(rule(width, theme, "├", "┤"));

    // Search input (always clearly visible)
    lines.push(this.searchBar(width));
    lines.push(rule(width, theme, "├", "┤"));

    // Session list
    if (this.filtered.length === 0) {
      lines.push(padRight(theme.fg("warning", "  no sessions match your query"), width));
    } else {
      const start = this.selected >= this.maxVisible ? this.selected - this.maxVisible + 1 : 0;
      const visible = this.filtered.slice(start, start + this.maxVisible);

      visible.forEach((session, i) => {
        const index = start + i;
        lines.push(this.sessionRow(session, index === this.selected, width));
      });

      if (this.filtered.length > this.maxVisible) {
        const remaining = this.filtered.length - this.maxVisible;
        lines.push(padRight(theme.fg("dim", `  … ${remaining} more (↑↓ to scroll)`), width));
      }
    }

    // Footer
    lines.push(rule(width, theme, "├", "┤"));
    lines.push(
      padRight(
        theme.fg(
          "dim",
          " ↑↓ move · type to search · enter open · esc back/exit ",
        ),
        width,
      ),
    );
    lines.push(rule(width, theme, "└", "┘"));

    // Keep a final width guard at the component boundary. Individual rows
    // already budget their columns, but styled wide glyphs and terminal
    // implementations can disagree by a cell. The TUI renderer treats an
    // over-wide line as fatal, so never return one from this component.
    const safeLines = lines.map((line) => {
      const safe = truncateToWidth(line, Math.max(0, width));
      return padRight(safe, Math.max(0, width));
    });

    this.cachedLines = safeLines;
    this.cachedWidth = width;
    return safeLines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

// ---------------------------------------------------------------------------
// Actions view: what to do with a selected session (uses SelectList)
// ---------------------------------------------------------------------------

export type SessionAction = "resume" | "history" | "rename" | "fork" | "delete" | "back";

export interface ActionCallbacks {
  onPick: (action: SessionAction) => void;
  onCancel: () => void;
}

export class ActionsView implements Component {
  private container: Container;
  private selectList: SelectList;
  private onPick: (action: SessionAction) => void;
  private onCancel: () => void;

  constructor(session: SessionInfo, theme: ThemeLike, callbacks: ActionCallbacks) {
    this.onPick = callbacks.onPick;
    this.onCancel = callbacks.onCancel;

    const items: SelectItem[] = [
      { value: "resume", label: "▶ Resume session", description: "Switch into this session" },
      { value: "history", label: "☰ View history", description: "Scroll through the transcript" },
      { value: "rename", label: "✎ Rename", description: "Set a display name" },
      { value: "fork", label: "⑂ Fork", description: "Start a new session from this one" },
      { value: "delete", label: "✕ Delete", description: "Remove the session file (cannot be undone)" },
      { value: "back", label: "← Back", description: "Return to the session list" },
    ];

    const selectList = new SelectList(items, items.length, {
      selectedPrefix: (t) => theme.fg("accent", t),
      selectedText: (t) => theme.fg("accent", t),
      description: (t) => theme.fg("muted", t),
      scrollInfo: (t) => theme.fg("dim", t),
      noMatch: (t) => theme.fg("warning", t),
    });
    selectList.onSelect = (item) => this.onPick(item.value as SessionAction);
    selectList.onCancel = () => this.onCancel();

    this.selectList = selectList;
    this.container = new Container();

    const title = session.name || session.firstMessage || "(unnamed session)";
    this.container.addChild(new Text(theme.fg("accent", theme.bold(title)), 1, 0));
    this.container.addChild(
      new Text(theme.fg("dim", `${shortenCwd(session.cwd)} · ${session.messageCount} msgs`), 1, 0),
    );
    this.container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
    this.container.addChild(selectList);
    this.container.addChild(new Text(theme.fg("dim", "↑↓ navigate · enter choose · esc back"), 1, 0));
    this.container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
  }

  render(width: number): string[] {
    return this.container.render(width);
  }

  handleInput(data: string): void {
    this.selectList.handleInput(data);
  }

  invalidate(): void {
    this.container.invalidate();
  }
}

// ---------------------------------------------------------------------------
// History view: scrollable transcript (ScrollView for mouse-wheel support)
// ---------------------------------------------------------------------------

export interface HistoryCallbacks {
  onExit: () => void;
}

export class HistoryView implements Component {
  private entries: SessionEntry[];
  private offset = 0;
  private theme: ThemeLike;
  private maxHeight: number;
  private callbacks: HistoryCallbacks;
  private cachedWidth?: number;
  private cachedOffset?: number;
  private cachedLines?: string[];

  constructor(
    entries: SessionEntry[],
    theme: ThemeLike,
    maxHeight: number,
    callbacks: HistoryCallbacks,
  ) {
    this.entries = entries;
    this.theme = theme;
    this.maxHeight = Math.max(4, maxHeight);
    this.callbacks = callbacks;
  }

  private rolePrefix(role: string, theme: ThemeLike): string {
    switch (role) {
      case "user":
        return theme.fg("accent", theme.bold("you"));
      case "assistant":
        return theme.fg("success", theme.bold("agent"));
      case "tool":
        return theme.fg("warning", "tool");
      case "system":
        return theme.fg("dim", "·");
      default:
        return theme.fg("dim", role);
    }
  }

  private buildLines(width: number): string[] {
    const transcript = sessionToTranscript(this.entries);
    const lines: string[] = [];
    const wrapWidth = Math.max(20, width - 6);

    for (const item of transcript) {
      const prefix = this.rolePrefix(item.role, this.theme);
      const wrapped = wrapTextWithAnsi(item.text, wrapWidth);
      for (const raw of wrapped) {
        const cleaned = raw.replace(/\x1b\[[0-9;]*m/g, "");
        lines.push(truncateToWidth(`${prefix} ${cleaned}`, width));
      }
    }

    if (lines.length === 0) {
      lines.push(truncateToWidth(this.theme.fg("dim", "  (empty session)"), width));
    }

    return lines;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up)) {
      this.offset = Math.max(0, this.offset - 1);
      this.invalidate();
      return;
    }
    if (matchesKey(data, Key.down)) {
      this.offset++;
      this.invalidate();
      return;
    }
    if (matchesKey(data, Key.pageUp)) {
      this.offset = Math.max(0, this.offset - this.maxHeight);
      this.invalidate();
      return;
    }
    if (matchesKey(data, Key.pageDown)) {
      this.offset += this.maxHeight;
      this.invalidate();
      return;
    }
    if (matchesKey(data, Key.home)) {
      this.offset = 0;
      this.invalidate();
      return;
    }
    if (matchesKey(data, Key.end)) {
      this.offset = Number.MAX_SAFE_INTEGER;
      this.invalidate();
      return;
    }
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.enter) || matchesKey(data, Key.left)) {
      this.callbacks.onExit();
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width && this.cachedOffset === this.offset) {
      return this.cachedLines;
    }

    const theme = this.theme;
    const allLines = this.buildLines(width);
    const maxOffset = Math.max(0, allLines.length - this.maxHeight);
    this.offset = clamp(this.offset, 0, maxOffset);

    const position = allLines.length === 0 ? "empty" : `${this.offset + 1}/${allLines.length}`;
    const lines: string[] = [];

    lines.push(rule(width, theme, "┌", "┐"));
    lines.push(
      padRight(
        theme.fg("accent", theme.bold("  history  ")) + theme.fg("dim", ` · ${position}`),
        width,
      ),
    );
    lines.push(rule(width, theme, "├", "┤"));

    const window = allLines.slice(this.offset, this.offset + this.maxHeight);
    lines.push(...window);

    lines.push(rule(width, theme, "├", "┤"));
    lines.push(
      padRight(
        theme.fg("dim", " ↑↓/PgUp/PgDn scroll · Home/End jump · esc/← back "),
        width,
      ),
    );
    lines.push(rule(width, theme, "└", "┘"));

    this.cachedLines = lines;
    this.cachedWidth = width;
    this.cachedOffset = this.offset;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedOffset = undefined;
    this.cachedLines = undefined;
  }
}
