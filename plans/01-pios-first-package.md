# Plan 01 — PIOS İlk Güvenli Paket

MintMap'i "Kişisel ve İş Zekâsı İşletim Sistemi"ne dönüştürmenin **ilk paketi.**
Amaç: mevcut mimariye **cerrahi** eklemeler; çalışan mindmap / sürükleme / bottom
sheet / Lovable pastel his **bozulmadan**. Karpathy ilkeleri: en az kod, spekülatif
özellik yok, ilgisiz kodu düzenleme yok.

Her faz kendi içinde çalıştırılabilir ve sonunda doğrulanır. Otomatik commit yok —
paket bitince kullanıcı commit için uyarılır.

---

## Faz 0 — Gerçekler ve İzin Verilen API'ler (okundu, doğrulandı)

Bu paket, mevcut projede **var olan** şu API ve desenlerin üstüne kurulur. Yeni API icat etme.

**Store deseni (yeni store'lar bunu KOPYALAYARAK yazılacak):**
- Şablon: `src/lib/keep-store.ts` — `useSyncExternalStore` tabanlı, modül-seviyesi
  `let`, `listeners:Set`, `load()/persist()/emit()/subscribe()`, `useXxx()` hook +
  imperatif `keep` nesnesi. localStorage anahtarı `mintmap.*.v1`.
- Aynı desen `src/lib/mindmap-store.ts`'te de var (daha büyük).

**Mindmap API (değişecek/okunacak):**
- `MindNode` tipi: `src/lib/mindmap-store.ts:67-86`. Alan eklemek buraya.
- `mindmap.update(id, patch)`: `mindmap-store.ts:596`.
- `useNodes()`: `mindmap-store.ts:460`; `mindmap.allTodos()`: `mindmap-store.ts:969`.
- Node render (NodeButton), rozet alanı: `src/components/MindmapCanvas.tsx:1394-1413`
  (mevcut "X/Y görev", etiketler, "⏰ hatırlatıcı"). Yeni rozetler buraya eklenecek.

**Ekranlar:**
- Ana ekran: `src/routes/index.tsx` (header 49-82, canvas 84-109). "Bugünkü Durum"
  kartı header ile canvas arasına.
- Ayarlar diyaloğu: `src/components/SettingsDialog.tsx` — `handle(label, fn)` yardımcı
  (84), localStorage tercih deseni (72-81). İlgi alanları bölümü buraya.
- Alt menü: `src/components/BottomNav.tsx` (5 sekme). Pulse için 6. sekme opsiyonel.

**Todo alanları (rozet/özet hesapları bunları kullanır):**
`done, dueAt, reminderAt, starred, myDay, priority(1-4), status` — `mindmap-store.ts:8-31`.

**Yasaklar (anti-pattern):**
- UI bileşeninden doğrudan `localStorage` çağırma → her zaman store API'sinden geç.
- Node'u/todo'yu yerinde mutasyona uğratma → immutable rebuild (store zaten böyle).
- Mevcut sürükleme/pointer davranışına (`onPointerDown/Move/Up`, `moved.current`)
  dokunma.
- `type` alanını zorunlu yapma → **opsiyonel**; eski node'lar "genel" sayılır.

**Doğrulama komutları:**
- Build: `bun run build` — sıfır TS hatası.
- Lint: `bun run lint`.
- Birim test: `bun run test:unit`.
- Davranış: `bun run dev` → mindmap açılıyor, node sürükleniyor, bottom sheet açılıyor.

---

## Faz 1 — Node türleri temeli

**Ne yapılacak:**
1. Yeni dosya `src/lib/node-types.ts`:
   - `export type NodeType = "generic" | "area" | "goal" | "project" | "task" | "note" | "resource" | "company" | "asset";`
   - `export const NODE_TYPES: Record<NodeType, { label: string; icon: LucideIcon; tint: string }>`
     — her tür için Türkçe etiket, lucide ikon, ince renk ipucu (mevcut oklch paletiyle uyumlu).
   - Yardımcı: `nodeTypeOf(n): NodeType` → `n.type ?? "generic"`.
2. `MindNode` tipine alan ekle (`mindmap-store.ts:67-86` içine):
   `type?: NodeType;` — başka hiçbir şey değişmez, seed/clone/serialize otomatik taşır
   (spread ile). **Kontrol:** `cloneStore` ve `serializeStore` node'u spread'liyor mu
   → evet (`...n`), ekstra iş yok.
3. `NodeSheet` içine küçük bir tür seçici (opsiyonel, "extra" sekmesine): kullanıcı
   node türünü seçebilir → `mindmap.update(id, { type })`.

**Referans:** tür-ikon eşlemesi için `BottomNav.tsx:2` lucide import deseni.

**Doğrulama:**
- `bun run build` temiz.
- Eski (type'sız) node'lar hâlâ render oluyor ("generic" davranışı).
- Bir node'a tür atanıyor, reload sonrası kalıyor (localStorage'a yazıldı).

**Anti-pattern guard:** `type`'ı zorunlu yapma; `NODE_TYPES` dışında string kabul etme.

---

## Faz 2 — İlgi alanları store'u (AYRI store)

**Ne yapılacak:**
1. Yeni dosya `src/lib/interest-store.ts` — `keep-store.ts`'i KOPYALAYARAK:
   - `type Interest = { id: string; label: string; kind?: "personal" | "work" | "invest"; createdAt: number };`
   - localStorage anahtarı `mintmap.interests.v1`.
   - API: `interests.list/add/update/remove` + `useInterests()` hook.
   - Boş başlar (sabit kodlanmış liste YOK — kullanıcı ekler). İstenirse ilk açılışta
     birkaç örnek "öneri" gösterilebilir ama otomatik eklenmez.
2. `SettingsDialog.tsx`'e "İlgi alanları" bölümü: ekle (input + buton), listele
   (chip), sil. `handle()` deseniyle.

**Referans:** `keep-store.ts:37-137` (store gövdesi), `SettingsDialog.tsx:72-81` (input+localStorage değil — store kullan).

**Doğrulama:**
- İlgi alanı ekleniyor/siliniyor, reload sonrası kalıyor.
- `bun run build` + `bun run lint` temiz.

**Anti-pattern guard:** ilgi alanlarını koda gömme; component'ten `localStorage` çağırma.

---

## Faz 3 — Hedef store'u (AYRI store — kullanıcı kararı)

**Ne yapılacak:**
1. Yeni dosya `src/lib/goal-store.ts` — `keep-store.ts` desenini KOPYALAYARAK:
   - `type Goal = { id; title; why?; description?; startAt?; dueAt?; status: "active"|"paused"|"done"; priority?: 1|2|3|4; nodeIds?: string[]; todoRefs?: {nodeId;todoId}[]; createdAt; updatedAt };`
   - localStorage anahtarı `mintmap.goals.v1`.
   - API: `goals.list/get/add/update/remove` + `useGoals()`.
   - `goalProgress(goal, nodes)`: bağlı node'ların todo'larından **hesaplanır**
     (tamamlanan/toplam). Hedefte statik yüzde tutma.
2. Minimal yüzey: şimdilik ayrı ekran şart değil — "Bugünkü Durum" kartında (Faz 5)
   ve node rozetinde (Faz 4) kullanılır. Basit bir hedef listesi/bottom sheet Faz 5'te.

**Referans:** `mindmap.allTodos()` (`mindmap-store.ts:969`) ilerleme hesabı için.

**Doğrulama:**
- Hedef ekleniyor, bir node'a bağlanıyor, ilerleme node todo'larından doğru geliyor.
- `bun run build` temiz.

**Anti-pattern guard:** ilerlemeyi elle güncelleme — her zaman türet.

---

## Faz 4 — Node rozetleri

**Ne yapılacak:** `MindmapCanvas.tsx:1394-1413` bölgesine, mevcut "X/Y görev"i KORUYARAK:
1. **Geciken görev rozeti**: `node.todos.some(t => !t.done && t.dueAt && t.dueAt < Date.now())`
   → küçük kırmızı/amber nokta veya sayı (sağ üst köşe, `absolute`).
2. **İlerleme halkası**: tamamlanan/toplam > 0 ise ince SVG ring veya mevcut sayının
   yanına yüzde. (Basit tut — SVG ring opsiyonel; önce yüzde metni.)
3. **Okunmamış Pulse sayısı**: Faz 6 sonrası `pulse-store`'dan bu node'a bağlı okunmamış
   sayısı → küçük rozet. (Faz 6'dan önce 0 → görünmez.)

**Referans:** mevcut rozet JSX `MindmapCanvas.tsx:1394-1413`; renk için `node.color`/oklch.

**Doğrulama:**
- Geciken todo'lu node'da rozet çıkıyor; geçmeyende çıkmıyor.
- Sürükleme/tap davranışı **değişmedi** (rozetler `pointer-events-none`).
- `bun run build` temiz; görsel his sakin kaldı (rozet küçük, sade).

**Anti-pattern guard:** rozetlere tıklama/pointer ekleme (drag'i bozar) — sadece görsel.

---

## Faz 5 — "Bugünkü Durum" kartı

**Ne yapılacak:**
1. Yeni bileşen `src/components/DailyBrief.tsx`: mevcut verilerden hesaplar —
   - öncelikli görev sayısı (`priority<=2 && !done` veya `myDay`),
   - geciken (`dueAt < now && !done`),
   - yeni gelişme (Faz 6 sonrası pulse okunmamış; öncesi 0),
   - bekleyen karar (Faz 3+ ileride; şimdilik hedef sayısı `active`).
   - Kısa, sakin: tek satır sayı şeridi + (opsiyonel) tek cümlelik odak.
2. `routes/index.tsx`'e header (82) ile canvas (84) arasına yerleştir. Kapanabilir/sade.

**Referans:** `routes/index.tsx:40-45` (mevcut done/total hesabı), `mindmap.allTodos()`.

**Doğrulama:**
- Kart doğru sayıları gösteriyor; veri yokken zarifçe boş/gizli.
- Mindmap yüksekliği bozulmadı (`h-svh` layout korunur).
- `bun run build` temiz.

**Anti-pattern guard:** AI çağrısı ekleme (bu faz saf hesap); ekranı kartlarla boğma.

---

## Faz 6 — Pulse store + PulseList (DEMO veri)

**Ne yapılacak:**
1. Yeni dosya `src/lib/pulse-store.ts` — `keep-store.ts` deseni:
   - `type PulseItem = { id; title; summary; source; url?; publishedAt; addedAt; nodeIds: string[]; importance: 1|2|3; read: boolean; dismissed?: boolean };`
   - localStorage anahtarı `mintmap.pulse.v1`.
   - API: `pulse.list/add/markRead/dismiss/linkNode` + `usePulse()`.
   - `seedDemoPulse()`: birkaç örnek kayıt (Borsa/Arsa/Gayrimenkul temalı), sadece
     boşsa ve kullanıcı "Demo yükle" derse. Otomatik enjekte etme.
2. Yeni bileşen `src/components/PulseList.tsx`: kartlar (başlık, özet, kaynak, tarih,
   önem, okundu). Üstte **"Demo veri" rozeti** açıkça.
3. Erişim: BottomNav'a 6. sekme "Pulse" **veya** ana ekranda açılır panel (Karpathy:
   önce açılır panel, sekme sonra). Karar yürütme anında.

**Referans:** `keep-store.ts` + `routes/keep.tsx` (kart listesi UI deseni).

**Doğrulama:**
- Demo Pulse yükleniyor, "Demo veri" etiketi görünüyor.
- Okundu işaretleniyor, reload sonrası kalıyor.
- `bun run build` temiz.

**Anti-pattern guard:** sahte veriyi gerçekmiş gibi gösterme; sürekli hareket/dikkat
dağıtan animasyon ekleme.

---

## Faz 7 — Pulse kaydını node / görev / nota bağlama

**Ne yapılacak:**
1. PulseItem kartına aksiyon menüsü: **Node'a bağla** (`pulse.linkNode(id, nodeId)`),
   **Göreve dönüştür** (`mindmap.addTodo(nodeId, title)`), **Nota ekle**
   (`mindmap.update(nodeId, { note: ... })` ekleme).
2. Node seçimi için mevcut bir seçici kullan (basit liste/aramalı popover).
3. Bağlandığında node rozeti "okunmamış Pulse" (Faz 4.3) güncellenir.

**Referans:** `mindmap.addTodo` (`mindmap-store.ts:657`), araç-çağıran AI'nin node
seçme deseni (`ai.functions.ts` CHAT_TOOLS create_task).

**Doğrulama:**
- Bir Pulse → göreve dönüşüyor, ilgili node'da görev görünüyor.
- Bir Pulse → node'a bağlanıyor, node rozetinde okunmamış sayısı artıyor.
- `bun run build` temiz.

**Anti-pattern guard:** bağlama işlemini onaysız toplu uygulama; kullanıcı seçmeden node varsayma.

---

## Son Faz — Doğrulama ve regresyon

1. `bun run build` — sıfır TS hatası.
2. `bun run lint` — temiz.
3. `bun run test:unit` — geçer.
4. `bun run dev` davranış turu: mindmap açılışı, node ekle/sürükle/uzun-bas taşı,
   bottom sheet, alt menü geçişleri, Kutu, Görevler "Günüm" — **hiçbiri bozulmadı.**
5. Yeni: node türü atama, ilgi alanı ekleme, hedef+ilerleme, node rozetleri, Bugünkü
   Durum kartı, Demo Pulse, Pulse→görev/node bağlama — hepsi çalışıyor.
6. Karpathy kontrolü (`/karpathy-check`) — diff sade, cerrahi, spekülatif kod yok.
7. Kullanıcıyı **commit + push için uyar** (otomatik commit yok).

---

## Notlar
- Sıra önerisi: Faz 1→2→3→4→5→6→7. Faz 4.3 ve Faz 5'in "yeni gelişme" kısmı Faz 6'ya
  bağlı (öncesinde 0 gösterir, kırılmaz).
- Her faz ayrı, küçük commit'e uygun; ama commit'i kullanıcı yapar.
- Gelecek paketler (bu planın DIŞINDA): Odak Motoru (AI), alan modülleri
  (Borsa/Arsa/Gayrimenkul kartları), Karar kayıt sistemi, arka plan scheduler,
  düzenli özet bildirimleri, repository katmanı (Postgres/Supabase geçişi).
