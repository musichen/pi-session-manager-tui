import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { SessionEntry, SessionInfo } from "@earendil-works/pi-coding-agent";
import { unlink } from "node:fs/promises";

/**
 * List all sessions across every project, most recently modified first.
 */
export async function listSessions(): Promise<SessionInfo[]> {
  const sessions = await SessionManager.listAll();
  return sessions.sort((a, b) => b.modified.getTime() - a.modified.getTime());
}

/**
 * The full text a session should match against when searching.
 * Includes the display name, working directory, first message, and the
 * concatenated text of every message so keyword search reaches deep history.
 */
export function sessionSearchText(session: SessionInfo): string {
  return [
    session.name ?? "",
    session.cwd ?? "",
    session.firstMessage ?? "",
    session.allMessagesText ?? "",
  ].join("\n");
}

/**
 * Set the display name of a session by appending a `session_info` entry.
 * Returns true on success, false if the file could not be opened.
 */
export function renameSessionFile(path: string, name: string): boolean {
  try {
    SessionManager.open(path).appendSessionInfo(name);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a session file from disk. Returns true on success.
 */
export async function deleteSessionFile(path: string): Promise<boolean> {
  try {
    await unlink(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fork a session into a new file in the given working directory,
 * carrying over the full history. Returns the new session file path.
 */
export function forkSessionFile(sourcePath: string, targetCwd: string): string | undefined {
  try {
    return SessionManager.forkFrom(sourcePath, targetCwd).getSessionFile();
  } catch {
    return undefined;
  }
}

/**
 * Human friendly relative time, e.g. "now", "5m ago", "3h ago", "2d ago".
 */
export function formatRelativeTime(date: Date): string {
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/**
 * Shorten a working directory path for display: keep the last two segments
 * after the home directory when possible.
 */
export function shortenCwd(cwd: string): string {
  if (!cwd) return "(unknown)";
  const home = process.env.HOME;
  if (home && cwd.startsWith(home)) {
    const rel = cwd.slice(home.length).replace(/^\/+/, "");
    return `~/${rel}`;
  }
  const parts = cwd.split("/").filter(Boolean);
  if (parts.length <= 2) return cwd;
  return `…/${parts.slice(-2).join("/")}`;
}

// ---------------------------------------------------------------------------
// Transcript helpers for the history viewer
// ---------------------------------------------------------------------------

export interface TranscriptLine {
  role: string;
  text: string;
}

function messageText(message: unknown): string {
  const content = (message as { content?: unknown } | undefined)?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      const b = block as { type?: string; text?: string } | null;
      if (b && typeof b.text === "string" && (b.type === "text" || b.type === "input_text")) {
        parts.push(b.text);
      }
    }
    return parts.join("\n");
  }
  return "";
}

/**
 * Flatten session entries into an ordered list of role + text lines suitable
 * for a scrollable transcript. Tool and thinking blocks are intentionally
 * summarized away to keep the view readable.
 */
export function sessionToTranscript(entries: SessionEntry[]): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  for (const entry of entries) {
    switch (entry.type) {
      case "message": {
        const msg = entry.message as { role?: string };
        const role = msg.role ?? "message";
        const text = messageText(entry.message);
        if (text.trim()) lines.push({ role, text });
        break;
      }
      case "session_info":
        if (entry.name) lines.push({ role: "system", text: `session renamed to "${entry.name}"` });
        break;
      case "compaction":
        lines.push({ role: "system", text: `[compacted] ${entry.summary}` });
        break;
      case "model_change":
        lines.push({ role: "system", text: `[model] ${entry.provider}/${entry.modelId}` });
        break;
      case "thinking_level_change":
        lines.push({ role: "system", text: `[thinking] ${entry.thinkingLevel}` });
        break;
      case "branch_summary":
        lines.push({ role: "system", text: `[branch] ${entry.summary}` });
        break;
      default:
        break;
    }
  }
  return lines;
}
