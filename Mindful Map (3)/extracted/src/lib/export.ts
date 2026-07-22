import type { MindNode } from "./mindmap-store";

export function exportMarkdown(nodes: MindNode[]): string {
  const root = nodes.find((n) => n.parentId === null);
  if (!root) return "";
  const lines: string[] = [];
  const visit = (id: string, depth: number) => {
    const n = nodes.find((x) => x.id === id);
    if (!n) return;
    const prefix = depth === 0 ? "# " : "#".repeat(Math.min(depth + 1, 6)) + " ";
    lines.push(`${prefix}${n.title}`);
    if (n.note?.trim()) lines.push("", n.note.trim(), "");
    if (n.tags?.length) lines.push(`*Etiketler:* ${n.tags.map((t) => `\`${t}\``).join(" ")}`, "");
    if (n.todos?.length) {
      for (const t of n.todos) {
        lines.push(`- [${t.done ? "x" : " "}] ${t.text}`);
        for (const s of t.steps ?? []) lines.push(`  - [${s.done ? "x" : " "}] ${s.text}`);
      }
      lines.push("");
    }
    nodes.filter((c) => c.parentId === id).forEach((c) => visit(c.id, depth + 1));
  };
  visit(root.id, 0);
  return lines.join("\n");
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function icsDate(ts: number) {
  const d = new Date(ts);
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function escIcs(s: string) {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function exportICS(nodes: MindNode[]): string {
  const now = icsDate(Date.now());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MintMap//TR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:MintMap",
  ];
  for (const n of nodes) {
    for (const t of n.todos ?? []) {
      if (!t.dueAt) continue;
      const start = t.dueAt;
      const end = start + 30 * 60_000;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${t.id}@mintmap`,
        `DTSTAMP:${now}`,
        `DTSTART:${icsDate(start)}`,
        `DTEND:${icsDate(end)}`,
        `SUMMARY:${escIcs(t.text)}`,
        `DESCRIPTION:${escIcs(n.title)}${t.steps?.length ? "\\n" + escIcs(t.steps.map((s) => "• " + s.text).join("\n")) : ""}`,
        `STATUS:${t.done ? "COMPLETED" : "CONFIRMED"}`,
      );
      if (t.reminderAt && t.reminderAt < start) {
        const mins = Math.max(1, Math.round((start - t.reminderAt) / 60_000));
        lines.push(
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          `DESCRIPTION:${escIcs(t.text)}`,
          `TRIGGER:-PT${mins}M`,
          "END:VALARM",
        );
      }
      lines.push("END:VEVENT");
    }
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadText(filename: string, text: string, type = "text/plain") {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
