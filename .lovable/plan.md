# 3 özellik — kapsam ve plan

## 1) Toplu AI işlemleri

**Amaç:** Tüm workspace'i AI ile tek seferde işle.

**Yeni server fn'ler** (`src/lib/ai.functions.ts`):
- `aiBulkSummarize({ workspaceId? })` → tüm düğümlerin (başlık + not + görevler) toplu özeti; hiyerarşiyi düzleştirir, tek çağrıda ana temaları + eylem maddelerini döndürür.
- `aiWeeklyReport({ from, to })` → verilen aralıkta tamamlanan görevler, açık görevler, oluşturulan düğümler; markdown rapor (öne çıkanlar, ilerleme, önerilen odaklar).

**UI** — yeni `BulkAIDialog` (⌘K komut paletinden + Ayarlar → yeni "AI toplu işlemler" bölümünden):
- "Çalışma alanını özetle" → sonucu bir modal'da göster + "Yeni düğüm olarak kaydet" ve "Kopyala" butonları.
- "Haftalık rapor" → tarih aralığı seç (bu hafta / geçen hafta / özel), markdown önizleme, .md indir + kopyala.

Rapor kaynağı: `mindmap-store` üzerinden düğüm/görev sayacı + `completedAt` alanı.

## 2) Şablon kütüphanesi

**Yeni sabit şablonlar** (`src/lib/templates.ts`): Kitap özeti, Toplantı notları, OKR (Q hedefleri), Sprint retro, Seyahat planı, Yıllık plan → 4 → 10 şablon.

**Kullanıcı şablonu kaydetme:**
- Yeni `custom-templates.ts` — localStorage'da `mintmap.templates.custom` altında saklanır.
- Tip: `MindTemplate & { custom: true; createdAt: number }`. Snapshot içine dahil edilir → Drive yedeğine yazılır.
- `mindmap-store.ts`'te helper: `snapshotSubtreeAsTemplate(nodeId, name, emoji)` — seçili düğümün alt ağacını `TemplateNode` yapısına dönüştürür.
- UI: düğüm sağ-tık/action menüsünde "Şablon olarak kaydet" (isim + emoji sorar), `TemplateMenu`'de kullanıcı şablonları ayrı bölümde listelenir, uzun-basıp sil.

## 3) İki yönlü Google Calendar sync

**Mevcut:** tek yönlü `.ics` export + tek yönlü `calendarCreateEvent`.

**Genişletme** (`src/lib/calendar.functions.ts`):
- `calendarSyncPush({ items })` → her `Todo`/hatırlatıcı için Google Calendar event oluştur/güncelle; `googleEventId` döner.
- `calendarSyncPull({ syncToken? })` → `syncToken` yoksa `timeMin=now-7d`, aksi halde incremental sync; silinmiş + değişen event'leri döner.
- `calendarDeleteEvent({ eventId })`.

**Store değişikliği** (`mindmap-store.ts`):
- `Todo` tipine ekle: `googleEventId?: string; syncedAt?: number`.
- `MindNode` hatırlatıcıları için de aynı alanlar.
- Yeni store bölümü: `calendarSync: { enabled: boolean; syncToken?: string; lastSyncAt?: number }`.

**Sync akışı:**
- Ayarlar → "Google Calendar" bölümü: bağlantı durumu, "Şimdi senkronize et", "Otomatik sync (15 dk)" toggle.
- Push: `dueAt` veya `reminderAt` olan tüm görevler → event olarak yazılır (aynı id varsa PATCH).
- Pull: `syncToken` ile değişenleri çek → yerel görevi `googleEventId` ile eşleştir, saat/başlık değiştiyse güncelle, event silinmişse yerel `dueAt`'i temizle.
- Çakışma çözümü: son değişen kazanır (`updatedTime` vs `syncedAt`).

**Otomatik sync:** `src/lib/calendar-auto.ts` — mevcut `drive-auto.ts` desenine benzer, 15 dk interval, sessiz hata log.

## Teknik detaylar

- Tüm yeni AI çağrıları mevcut `callAI` + `parseJson` altyapısını kullanır; provider fallback korunur.
- Weekly report → 500 düğüm sınırı; aşarsa uyarı + ilk 500.
- Kullanıcı şablonları migration: mevcut yedekleri kırmadan `readBackupPayload` içine opsiyonel `customTemplates` alanı eklenir.
- Google Calendar connector zaten `GOOGLE_CALENDAR_API_KEY` ile bağlı; ek bağlantı gerekmez.
- Sync UI busy state + toast, mevcut Drive senkron desenini birebir izler.
- E2E test eklenmez (kullanıcı istemedi); yalnızca typecheck + manuel doğrulama.

## Uygulama sırası

1. Şablon kütüphanesi (en izole, risk düşük)
2. Toplu AI (yeni fn + dialog)
3. Calendar sync (en büyük, store şeması değişiyor)

Tahmini toplam: ~10 dosya değişiklik + 4 yeni dosya.

## Onay

Üçünü de bu turda mı yapayım, yoksa tek tek mi? Ayrıca calendar sync için TR saat dilimi (Europe/Istanbul) sabit tutulsun mu, yoksa Ayarlar'a seçici mi eklensin?