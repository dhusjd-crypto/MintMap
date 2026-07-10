export type MindTemplate = {
  id: string;
  name: string;
  emoji: string;
  /** Children of the chosen parent. Each can have nested children. */
  nodes: TemplateNode[];
};

export type TemplateNode = {
  title: string;
  color?: string;
  todos?: string[];
  children?: TemplateNode[];
};

export const TEMPLATES: MindTemplate[] = [
  {
    id: "weekly",
    name: "Haftalık Plan",
    emoji: "📅",
    nodes: [
      { title: "Pazartesi", color: "oklch(0.86 0.06 230)", todos: ["Haftalık plan"] },
      { title: "Salı", color: "oklch(0.86 0.06 200)" },
      { title: "Çarşamba", color: "oklch(0.86 0.06 170)" },
      { title: "Perşembe", color: "oklch(0.86 0.07 110)" },
      { title: "Cuma", color: "oklch(0.86 0.08 70)" },
      { title: "Hafta sonu", color: "oklch(0.84 0.08 30)", todos: ["Dinlen", "Doğa yürüyüşü"] },
    ],
  },
  {
    id: "project",
    name: "Proje",
    emoji: "🚀",
    nodes: [
      { title: "Keşif", color: "oklch(0.86 0.06 230)", todos: ["Hedef tanımı", "Hedef kitle"] },
      { title: "Tasarım", color: "oklch(0.86 0.07 280)", todos: ["Akış", "Wireframe"] },
      { title: "Geliştirme", color: "oklch(0.86 0.07 150)", todos: ["MVP", "Test"] },
      { title: "Lansman", color: "oklch(0.86 0.08 60)", todos: ["Tanıtım", "Geri bildirim"] },
    ],
  },
  {
    id: "brainstorm",
    name: "Beyin Fırtınası",
    emoji: "💡",
    nodes: [
      { title: "Sorun", color: "oklch(0.86 0.08 30)" },
      { title: "Fikirler", color: "oklch(0.86 0.07 110)" },
      { title: "Engeller", color: "oklch(0.86 0.07 280)" },
      { title: "Aksiyon", color: "oklch(0.86 0.08 60)" },
    ],
  },
  {
    id: "goals",
    name: "Hedefler",
    emoji: "🎯",
    nodes: [
      { title: "Sağlık", color: "oklch(0.86 0.07 150)", todos: ["Su", "Uyku", "Spor"] },
      { title: "İş", color: "oklch(0.86 0.06 230)" },
      { title: "Öğrenme", color: "oklch(0.86 0.07 280)" },
      { title: "Kişisel", color: "oklch(0.84 0.08 30)" },
    ],
  },
  {
    id: "book",
    name: "Kitap Özeti",
    emoji: "📖",
    nodes: [
      { title: "Ana fikir", color: "oklch(0.86 0.06 230)" },
      { title: "Bölüm notları", color: "oklch(0.86 0.07 150)" },
      { title: "Alıntılar", color: "oklch(0.86 0.07 280)" },
      { title: "Aksiyonlar", color: "oklch(0.86 0.08 60)", todos: ["Uygula", "Paylaş"] },
    ],
  },
  {
    id: "meeting",
    name: "Toplantı Notları",
    emoji: "🗣️",
    nodes: [
      { title: "Gündem", color: "oklch(0.86 0.06 230)" },
      { title: "Kararlar", color: "oklch(0.86 0.07 150)" },
      { title: "Aksiyon maddeleri", color: "oklch(0.86 0.08 60)", todos: ["Sorumlu ata", "Tarih belirle"] },
      { title: "Sonraki adım", color: "oklch(0.86 0.07 280)" },
    ],
  },
  {
    id: "okr",
    name: "OKR (Çeyrek)",
    emoji: "🧭",
    nodes: [
      {
        title: "Hedef 1",
        color: "oklch(0.86 0.06 230)",
        todos: ["KR1", "KR2", "KR3"],
      },
      {
        title: "Hedef 2",
        color: "oklch(0.86 0.07 150)",
        todos: ["KR1", "KR2", "KR3"],
      },
      {
        title: "Hedef 3",
        color: "oklch(0.86 0.08 60)",
        todos: ["KR1", "KR2", "KR3"],
      },
    ],
  },
  {
    id: "retro",
    name: "Sprint Retro",
    emoji: "🔁",
    nodes: [
      { title: "İyi giden", color: "oklch(0.86 0.07 150)" },
      { title: "İyileştirilecek", color: "oklch(0.86 0.08 30)" },
      { title: "Denenecek", color: "oklch(0.86 0.06 230)" },
      { title: "Aksiyonlar", color: "oklch(0.86 0.08 60)", todos: ["Sorumlu ata"] },
    ],
  },
  {
    id: "travel",
    name: "Seyahat Planı",
    emoji: "✈️",
    nodes: [
      { title: "Ulaşım", color: "oklch(0.86 0.06 230)", todos: ["Bilet", "Transfer"] },
      { title: "Konaklama", color: "oklch(0.86 0.07 280)", todos: ["Rezervasyon"] },
      { title: "Yapılacaklar", color: "oklch(0.86 0.07 150)" },
      { title: "Bütçe", color: "oklch(0.86 0.08 60)" },
      { title: "Bagaj", color: "oklch(0.84 0.08 30)", todos: ["Belgeler", "Şarj aletleri"] },
    ],
  },
  {
    id: "year",
    name: "Yıllık Plan",
    emoji: "🗓️",
    nodes: [
      { title: "Q1", color: "oklch(0.86 0.06 230)" },
      { title: "Q2", color: "oklch(0.86 0.07 150)" },
      { title: "Q3", color: "oklch(0.86 0.08 60)" },
      { title: "Q4", color: "oklch(0.84 0.08 30)" },
    ],
  },
];
