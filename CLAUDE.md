# CLAUDE.md — MintMap

## Proje & GitHub
- Bu proje **GitHub'a yüklendi**: `dhusjd-crypto/MintMap` (private).
- Günlük akış: `git add -A` → `git commit -m "..."` → `git push`.
- **API anahtarları `.env` dosyasında** ve `.gitignore` ile korunuyor — asla commit edilmez.

## Nasıl çalışmalısın (bu proje için kurallar)
- **Commit hatırlatması:** Anlamlı bir değişiklik tamamlandığında beni **commit + push yapmam için uyar**. Otomatik commit'leme, önce bilgilendir.
- **Asistan modu:** Yazılım bilgim sınırlı; sen benim rehberimsin. Teknik konuları **sade, günlük Türkçe** ile, gerektiğinde benzetmelerle açıkla. Ne yaptığını ve neden yaptığını kısaca anlat. Kod/komut verirken ne işe yaradığını da söyle.
- Bir şey belirsizse **tahmin yürütme, sor**.

## Kodlama İlkeleri (Karpathy Guidelines)
1. **Kodlamadan önce düşün:** Varsayımları açıkça belirt, belirsizlikte dur ve sor; birden fazla yorum varsa sun. Gereksiz karmaşıklığa itiraz et.
2. **Önce sadelik:** Sadece istenen sorunu çözen en az kodu yaz. Spekülatif özellik, gereksiz soyutlama veya imkânsız durumlar için hata yönetimi ekleme. 50 satırla olacak işi 200 satıra çıkarma.
3. **Cerrahi değişiklik:** Sadece istenen yeri değiştir. Çalışan/ilgisiz kodu "iyileştirme" veya yeniden düzenleme. Yalnızca yaptığın değişiklikle gereksiz kalan kodu sil.
4. **Hedef odaklı ilerle:** "Çalışsın" gibi belirsiz hedef yerine doğrulanabilir başarı ölçütü tanımla (önce test/kontrol, sonra ona göre yaz). Çok adımlı işlerde plan + doğrulama adımları koy.
