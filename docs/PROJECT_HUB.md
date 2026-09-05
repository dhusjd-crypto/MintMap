# MintMap — Kalıcı Proje Merkezi

> Bu belge, MintMap’in sohbetten, kişisel bağlamdan veya geçmiş aramasından bağımsız kalıcı proje özetidir. Ürün amacı, mimari fikirler, kararlar, problemler ve yön burada tutulur.

**Son güncelleme:** 2026-09-05

## 1. Projenin amacı

MintMap, dağınık fikirleri, notları ve sorumlulukları tek bakışta anlaşılır bir ilerleme görünümüne dönüştüren kişisel çalışma işletim sistemidir. Başarı ölçüsü özellik sayısı değil, karar verme ve harekete geçme hızıdır.

## 2. Güncel durum

- Uygulama React 19, TanStack Start/Router, Vite, TypeScript, Tailwind/Radix UI ve Cloudflare Worker server functions üzerine kuruludur.
- Mind Map, Tasks, Pulse, Borsa, Kutu, Pano, Takvim, paylaşım ve unlock alanları vardır; bu repo native Windows veya Android paketi değildir.
- Local-first kullanım; localStorage, IndexedDB ve sürümlü canonical alanlar üzerinden ilerler. Cloudflare D1, Drive, Calendar ve Tasks entegrasyonları ana veritabanının yerine geçmez.
- Phase 2 shared foundations, Phase 3 Execution Domain, Phase 4 Finance Domain, Phase 6 Trigger Engine, Phase 7 Planner, Phase 8 Notification, Phase 9 Focus ve Phase 10 Reset/routines kayıtlarında tamamlanmıştır; bazı entegrasyonlar kasıtlı olarak partial kalır.
- Quick Capture ve Finance application workflows ilerlemektedir; Smart Views/Command Center kısmi durumdadır; browser voice, native delivery, takvim adapter’ı ve bazı ileri entegrasyonlar tamamlanmış kabul edilmez.
- Bu özetin kaynak mimari denetimi 2026-08-14 tarihli dosyalara dayanır; yeni durum her değişiklikte roadmap ve kabul kanıtıyla birlikte güncellenmelidir.

## 3. Ana fikirler

- Önce anlam, sonra özellik.
- Tek gerçek, çoklu görünüm: görev, pano, takvim ve mind map aynı canonical kaydı farklı gösterir.
- Basit varsayılan, ihtiyaç olduğunda açılan derinlik.
- Deterministik kurallar önce; AI yalnızca özet, sınıflandırma ve onaylanabilir öneri üretir.
- Kullanıcıya kayıt, senkronizasyon, bekleme ve hata durumları görünür geri bildirilir.
- Telefon ve bilgisayar aynı çalışma alanının farklı görünümleridir.

## 4. Temel kararlar

1. Task, Project, Goal ve finans varlıklarının tek canonical kimliği vardır; ekranlar kopya veri tutmaz.
2. Execution, Finance, Knowledge/Mind Map, Planning, Trigger, Notification, Capture, Analytics ve Integration bounded context’leri kendi sınırlarını korur.
3. Domain kodu React, browser API, Google SDK, AI SDK, Tauri veya Cloudflare ayrıntılarına doğrudan bağlanmaz.
4. AI önemli durum, para, tarih, bağımlılık, skor veya bildirim kararını kullanıcı/onay mekanizması olmadan değiştiremez.
5. Yeni SQLite/local database çalışması; backup, versioned migration ve recovery kanıtlanmadan başlatılmaz.
6. Yeni sekme veya veri türü, mevcut bir görünümü kopyalamıyorsa ve tek bir kullanıcı sorusunu netleştiriyorsa eklenir.

## 5. Temel değişiklikler

- Legacy steps verisinin kayıpsız alt görev ağacına taşınması ve silinen kayıtlar için tombstone yaklaşımı kalıcı güvenlik sınırı oldu.
- Application commands/queries ile mevcut store/adapters arasında kademeli strangler migration başlatıldı.
- Execution Domain; görev durumu, tarih, actionability, waiting, dependency ve execution metadata için pure domain katmanı sağladı.
- Finance, Capture, Trigger, Planner ve Notification alanları aynı kaydı paylaşacak şekilde ayrıştırıldı; entegrasyonlar port/adapter olarak tutuldu.
- Canonical local IndexedDB alanı, migration journal ve backup/restore yaklaşımı mevcut legacy persistence ile geriye dönük uyumluluk gözetilerek ekleniyor.

## 6. En sık problemler ve kalıcı çözümler

| Problem | Kalıcı çözüm |
|---|---|
| Aynı bilginin ekranlarda kopyalanması | Tek canonical kayıt; ekranlar projection olsun. |
| Migration’da eski verinin kaybolması | Version, idempotency, unknown field koruması ve export/rollback yolu. |
| AI’ın yetkili hale gelmesi | AI proposal üretir; application/domain doğrular ve kullanıcı onayı gerekir. |
| Store içinde domain kuralı ve entegrasyon karmaşası | Domain/application/infrastructure/UI sınırlarını koru. |
| Google, Drive veya AI yokken uygulamanın bozulması | Core davranışı adapter’lardan bağımsız ve local-first tut. |
| Tarayıcı kapalıyken hatırlatıcıyı garanti sanmak | Browser timer’ın best-effort olduğunu açıkça göster; native delivery’yi ayrı kabul et. |
| Büyük finance/Android/AI işine foundation sırasında başlamak | Roadmap sırasını ve feature registry kayıtlarını takip et. |

## 7. Fikirler ve sonraki yön

- Mind Map’i canonical Execution/Knowledge verisinin daha güçlü bir visual projection’ı yapmak.
- Quick Capture review akışını deterministik öneri, kullanıcı onayı ve geri alma ile güçlendirmek.
- Smart Views ve Command Center sinyallerini tekil kaynaklardan üretmek; yeni kopya veri oluşturmamak.
- Local-first backup/recovery kanıtlarını mobil ve masaüstü adapter’larına taşımak.
- Yeni özellikleri owner, dependency, test, migration impact, platform scope ve feature flag ile registry’ye almak.

## 8. Güncelleme kuralı

Her MintMap sohbeti veya Codex çalışması:

1. Önce bu belgeyi ve gerekirse kalıcı mimari belgelerini okur.
2. Yeni fikri doğrudan kod değişikliği olarak değil, doğru bounded context ve feature registry kaydı olarak konumlandırır.
3. Anlamlı bir değişiklikten sonra yalnızca ilgili durum, karar veya sonraki adımı günceller.
4. Test, build veya E2E çalışmadıysa sonucu PASS olarak yazmaz.
5. MintMap dışındaki projelerin durumunu bu belgeye eklemez.

## 9. Kaynaklar

- [MintMap felsefesi](MINTMAP-FELSEFE.md)
- [Architecture](ARCHITECTURE.md)
- [Bounded contexts](BOUNDED_CONTEXTS.md)
- [Data model](DATA_MODEL.md)
- [Migration strategy](MIGRATION_STRATEGY.md)
- [Domain events](DOMAIN_EVENTS.md)
- [Feature registry](FEATURE_REGISTRY.md)
- [Roadmap](ROADMAP.md)
- [Repository constitution](../AGENTS.md)
