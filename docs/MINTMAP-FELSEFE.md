# MintMap: Urun Felsefesi ve Kavram Sozlugu

Bu belge, MintMap gelistirmelerinin ana referansidir. Yeni bir ozellik ancak
bu felsefeye hizmet ediyorsa eklenir. Once anlam ve kullanim modeli netlesir,
sonra arayuz ve kod degisir.

## Ana Felsefe

MintMap, kullanicinin zihnindeki daginik fikirleri, notlari ve sorumluluklari
tek bakista anlasilir bir ilerleme gorunumune donusturen kisisel bir kontrol
merkezidir.

Temel vaat:

> Bir bakista ne dusunuyorum, ne yapmam gerekiyor, hangi noktadayim, ne bitti
> ve siradaki en dogru adim ne, gorebilmeliyim.

Bu nedenle MintMap'in basarisi ozellik sayisiyla degil, karar verme ve harekete
gecme hiziyla olculur.

## Degismez Ilkeler

1. **Once anlam, sonra ozellik:** Her kontrol tek bir soruya cevap vermeli.
2. **Bir bakista durum:** Acik, gecikmis, tamamlanmis ve siradaki is ayrilmali.
3. **Tek gercek, coklu gorunum:** Ayni veri gorevlerde, takvimde, panoda ve
   mind map'te farkli gorunumlerde kullanilir; kopyalanmaz.
4. **Basit varsayilan, derinlik istege bagli:** Ilk ekran sade kalir; detay
   gerektiğinde acilir.
5. **Yapay zeka yardimci, yonetici degil:** AI duzenler, ozetler ve onerir;
   kullanicinin onayi olmadan onemli karar vermez.
6. **Her kayit gorunur geri bildirim verir:** Kaydedildi, esitlendi, bekliyor
   ve hata durumlari acikca gorunur.
7. **Cihazlar arasinda ayni gercek:** Telefon ve bilgisayar farkli kopyalar
   degil, ayni calisma alaninin gorunumleridir.

## Kavram Sozlugu

### 1. Dugum

Mind map'teki bir fikir, alan, proje veya konu. Ornek: `Insaat`, `Yatirim`,
`Hafta plani`.

Dugumun gorevi baglam saglamaktir. Bir dugumun notu, gorevleri, dosyalari ve
gecmisi olabilir. Dugum tek basina yapilacak is degildir.

### 2. Gorev

Sonucu tamamlanabilir ve kontrol edilebilir bir is. Ornek: `Kosgeb evraklarini
tamamla`.

Gorev; durum, oncelik, tarih, hatirlatma, not, dosya, etiket, bagimlilik ve
takvim baglantisi tasiyabilir.

### 3. Alt gorev

Bir gorevin tamamlanmasina katkida bulunan bagimsiz is. Alt gorev de gorevle
ayni imkanlara sahip olabilir: tarih, hatirlatma, not, dosya ve takvim.

Alt gorev, ust gorevin icinde gorunur; ana gorev listesini gereksiz yere
kalabaliklastirmaz.

### 4. Alt gorev agaci

Bir gorevin tamamlanmasina katkida bulunan her madde alt gorevdir. Kisa bir
kontrol maddesi olarak yazilsa bile alt gorev, ana gorevle ayni planlama
imkanlarina sahiptir: tarih, hatirlatma, not, dosya, etiket, oncelik ve takvim.

Alt gorevler sinirsiz hiyerarsiyle birbirinin altina eklenebilir. Arayuzde
`Adim` diye ayri bir veri turu yoktur; `AI ile bol` gibi bir islem de dogrudan
alt gorevler uretir.

### 5. Not

Bir konu hakkinda serbest bilgi, dusunce, aciklama veya karar kaydi. Notun
tamamlanma durumu yoktur; gorevin icindeki not, gorevi aciklar.

### 6. Kutu

Henuz anlamlandirilmamis veya daha sonra islenecek ham yakalama alani. Link,
gorsel, dosya ve serbest metin buraya gelir.

Kutu'nun amaci duzenli arşiv olmak degil, zihni bosaltmaktir. AI burada icerigi
siniflandirir, baslik ve 300 karakterlik ozet onerir, fakat kullanici isterse
degistirir.

### 7. Pano

Gorevlerin durum akisidir: bekliyor, devam ediyor, beklemede, tamamlandi gibi.
Pano, ayni gorevlerin durum odakli gorunumudur; yeni bir gorev deposu degildir.

### 8. Takvim

Zamana bagli islerin gorunumudur. Tarih ve saat gerektiren gorevler burada
gorunur. Takvim, gorev verisini kopyalamaz; gorevin zaman bilgisini gosterir.

### 10. Mind map

Baglam ve iliski haritasidir. Ne nereye bagli, hangi alan ne kadar yuk tasiyor
ve buyuk resimde ne var sorularini cevaplar. Detayli gorev yonetiminin yerine
gecmez.

## Mevcut Ozelliklerin Dogru Yeri

| Ihtiyac | Ana yer | Destek gorunum |
|---|---|---|
| Fikir, alan, proje baglami | Mind map | Not, gorev, dosya |
| Yapilacak is | Gorevler | Pano, takvim, mind map |
| Gorevin kucuk veya bagimsiz parcasi | Alt gorev | Gorevler, takvim, pano |
| Ham link, gorsel, dosya | Kutu | Gorev veya dugume donusturme |
| Durum akisi | Pano | Gorevler |
| Tarih ve saat | Takvim | Gorevler |
| Gunluk genel durum | Pulse / Bugun | Mind map ust ozeti |

## Karar Verilmis Sinirlar

- Yeni bir sekme, mevcut bir gorunumun aynisini yapmayacak.
- Adim ve alt gorev tek veri turudur. Her alt gorev ana gorevle ayni planlama
  imkanlarina sahiptir.
- Kutu, gorev listesine donusmeden once ham yakalama alani olarak kalacak.
- AI, Kutu'da ozetleme ve kategorizasyon; gorevlerde parcalama ve zamanlama
  onerisi; takvimde ise kullanicinin onayladigi senkronizasyon icin kullanilacak.
- Drive yedek, Google Takvim ve Google Tasks entegrasyonlari MintMap'in ana
  veritabaninin yerine gecmeyecek; dis sistemler baglanti ve yedek gorevi gorecek.

## Gelistirme Sirasi

### Asama 0: Kavramlari sabitleme

- Bu belgeyi referans kabul et.
- Arayuzde `alt gorev`, `adim`, `ust gorev` adlarini tutarli hale getir.
- Gereksiz veya ayni isi yapan kontrolleri kaldir.

### Asama 1: Gorevler ve ilerleme

- Tek alt gorev agacini kullan; eski adim kayitlarini kayipsiz donustur.
- Mobilde ust gorev, alt gorev ve tamamlanma oranini tek bakista goster.
- Surukle-birak siralamayi ve istege bagli numaralandirmayi sabitle.
- Kayit, senkronizasyon ve hata geri bildirimlerini standartlastir.

### Asama 2: Kutu, dosya ve AI

- Her ham icerigi tek kartta sade baslik, kapak, tur ve kisa ozetle goster.
- PDF ham verisini kullaniciya yansitma; dosyayi koru, okunabilir ozeti goster.
- AI onerilerini onaylanabilir ve geri alinabilir yap.

### Asama 3: Pano ve Takvim

- Pano durumlari ile gorev durumunu ayni veri modeline bagla.
- Tarih, saat, hatirlatma ve birden fazla alarmi gorev merkezli yap.
- Google Takvim/Tasks aktarimini gorunur sonuc ve tekrar deneme durumu ile sun.

### Asama 4: Ikinci calisma defteri

Ana uygulama sadeleştikten sonra ayri bir `MintMap Lab` / `Gelisim Defteri`
alanı eklenebilir. Burada `Tools`, `Sources`, deneyler, fikirler ve gelecek
ozellikleri tutulur. Bu alan ana gorev akisini ve gunluk gorunumu kirletmez.

## Bir Ozellik Eklenmeden Once Sorulacak Sorular

1. Bu hangi kavrami temsil ediyor?
2. Kullanici bunu tek bakista anlayabilir mi?
3. Mevcut bir gorunum zaten bunu yapiyor mu?
4. Bu bilgi nerede ana kayit olarak tutuluyor?
5. Mobilde en az kac dokunusla kullaniliyor?
6. AI burada zaman kazandiriyor mu, yoksa yeni karmasa mi getiriyor?
7. Kaydedildigi, esitlendiği veya hata verdigi nasil anlasiliyor?

Bu sorular cevaplanmadan yeni sekme, yeni buton veya yeni veri turu eklenmez.
