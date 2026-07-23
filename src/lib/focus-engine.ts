import type { MindNode, Todo } from "./mindmap-store";

// Odak Motoru — kullanıcıyı dağılmaktan korumak için bugünün en önemli birkaç
// işini seçer. AI YOK: geciken/öncelik/yıldız/günüm sinyallerinden basit ve
// açıklanabilir bir skor üretir. Her seçim için kısa bir Türkçe gerekçe döner.

export type FocusItem = {
  nodeId: string;
  nodeTitle: string;
  todo: Todo;
  score: number;
  reason: string;
};

const DAY = 86_400_000;

/** Bugünün en yüksek skorlu (tamamlanmamış) görevlerini döndürür. */
export function computeFocus(nodes: MindNode[], now = Date.now(), limit = 3): FocusItem[] {
  const items: FocusItem[] = [];
  for (const n of nodes) {
    for (const t of n.todos) {
      if (t.done) continue;
      let score = 0;
      let reason = "";
      if (t.dueAt && t.dueAt < now) {
        score += 100;
        reason = "gecikti";
      } else if (t.dueAt && t.dueAt < now + DAY) {
        score += 60;
        reason = "bugün son gün";
      } else if (t.dueAt && t.dueAt < now + 3 * DAY) {
        score += 30;
        reason = "yaklaşıyor";
      }
      if (t.priority === 1) {
        score += 50;
        reason ||= "çok önemli";
      } else if (t.priority === 2) {
        score += 30;
        reason ||= "önemli";
      }
      if (t.myDay) {
        score += 25;
        reason ||= "günüm";
      }
      if (t.starred) {
        score += 20;
        reason ||= "yıldızlı";
      }
      if (score === 0) continue;
      items.push({ nodeId: n.id, nodeTitle: n.title, todo: t, score, reason });
    }
  }
  return items.sort((a, b) => b.score - a.score).slice(0, limit);
}
