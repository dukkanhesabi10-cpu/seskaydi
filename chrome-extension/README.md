# Reklam Popup Engelleyici (Kişisel Kullanım)

Chrome için sadece **senin kullanımın** amacıyla hazırlanmış, Chrome Web
Store'a yayınlanmamış/yayınlanmayacak bir reklam popup / popunder
engelleyici. "Paketlenmemiş öğe" (unpacked) olarak yüklenir.

## Nasıl çalışır (3 katman)

1. **Ağ seviyesi engelleme** (`rules/ads.json`, `declarativeNetRequest`):
   156 bilinen reklam/popup/popunder ağının (PopAds, PropellerAds,
   ExoClick, Adcash, Taboola, doubleclick.net, googlesyndication.com vb.)
   alan adlarına giden istekleri (script, iframe, ana sayfa yüklemesi,
   XHR...) doğrudan ağ seviyesinde durdurur. Reklam scripti hiç
   yüklenemediği için popup zaten tetiklenemez.

2. **`window.open` koruması** (`content_page_hook.js`, sayfa kendi
   scriptlerini çalıştırmadan hemen önce devreye girer):
   - `window.open` çağrısı yalnızca **gerçek bir kullanıcı jesti**
     (tıklama/tuş/dokunma, tarayıcı tarafından "isTrusted" olarak
     işaretlenmiş) ile aynı anda yapılırsa izin verilir.
   - Aynı jestte birden fazla `window.open` çağrısı (klasik
     popunder zinciri) engellenir.
   - Bilinen reklam alan adlarına giden `window.open` çağrıları,
     jest olsa bile engellenir.
   - Bir sitenin **kendi alan adına** açtığı pencereler (ör. bir bankanın
     veya e-devletin kendi onay/dokuman penceresi) jest şartından muaftır
     — tıklamadan saniyeler sonra gecikmeli açılsa bile engellenmez, çünkü
     reklam enjeksiyonu neredeyse hiçbir zaman aynı siteden gelmez.
   - Google/Microsoft/Apple/PayPal/Stripe/GitHub gibi gerçek popup
     pencere kullanan giriş/ödeme akışları güvenli listede olduğu için
     hiç etkilenmez.
   - `window.open` referansı donduruldu (`configurable:false`); reklam
     scriptleri orijinalini "geri alamaz".
   - **"Eklenti aktif" kapatıldığında veya bir site beyaz listeye
     eklendiğinde bu koruma da (sekme kapatma sezgileri gibi) o site için
     tamamen devre dışı kalır** — yani beyaz liste gerçek bir "bu siteye
     hiç dokunma" garantisidir, sadece sekme kapatmayı değil.

3. **Sekme/pencere kapatma sezgileri** (`background.js`):
   - Bir sayfa yeni bir sekme/pencere açtığında (`chrome.tabs.onCreated`),
     hedef adres bilinen bir reklam alan adıysa **anında kapatılır**.
   - "Agresif mod" açıkken: eski tip `popup` pencereler (araç çubuğu/menü
     çubuğu olmayan küçük pencereler — klasik popunder imzası) ve aynı
     sekmeden kısa sürede art arda açılan yeni sekmeler de kapatılır.
   - Aynı site (aynı kök alan adı) içindeki açılışlar ve beyaz listedeki
     siteler asla dokunulmaz.

4. **DOM temizliği** (`content.js`): Sayfaya sonradan enjekte edilen,
   bilinen reklam ağlarına ait iframe/script'leri ve ekranı tamamen
   kaplayan, aşırı yüksek z-index'li "tıklama tuzağı" (clickjacking)
   katmanlarını kaldırır. Bu da "Eklenti aktif" kapalıyken veya site
   beyaz listedeyken devre dışı kalır.

## Önemli siteler (banka, e-devlet vb.) risk altında mı?

Ağ seviyesi engelleme (1. katman) yalnızca bilinen reklam/takip ağı alan
adlarını hedefler — banka veya e-devlet siteleri bu listede olmadığı
için bu katman hiçbir zaman onlara dokunmaz. `window.open` koruması
(2. katman) da bir sitenin **kendi** açtığı pencerelere karışmaz (yukarı
bakın). Yine de kritik bir site için tam garanti istiyorsan, o siteyi
araç çubuğu popup'ından **"bu sitede devre dışı bırak"** ile beyaz
listeye eklemen en kesin yoldur; bu durumda o sitede eklenti tamamen
etkisiz hale gelir.

## Kurulum (paketlenmemiş öğe olarak)

1. Chrome'da `chrome://extensions` adresine git.
2. Sağ üstten **Geliştirici modu**nu aç.
3. **Paketlenmemiş öğe yükle**'ye tıkla.
4. Bu depodaki `chrome-extension` klasörünü seç.
5. Araç çubuğunda kalkan ikonunu sabitle (isteğe bağlı).

> Not: `declarativeNetRequestFeedback` iznine dayanan gerçek zamanlı
> sayaç (araç çubuğu rozeti) yalnızca "paketlenmemiş" yüklenen
> eklentilerde çalışır — yani senin kurulumun için tam uyumlu.

## Kullanım

- **Araç çubuğu popup'ı**: Eklentiyi tamamen aç/kapat, bu sayfada kaç
  şey engellendiğini gör, mevcut siteyi beyaz listeye ekle/çıkar.
- **Ayarlar sayfası** (`chrome://extensions` → eklenti → Ayarlar, ya da
  popup'taki "Ayarlar" linki):
  - Agresif modu aç/kapat.
  - Toplam engellenen sayısını gör/sıfırla.
  - Beyaz listedeki siteleri yönet.
  - Kendi ekleyeceğin engellenecek alan adlarını gir.

## Bir site bozulursa

Bazı eski/nadir siteler gerçekten `window.open`'ı meşru amaçla
kullanabilir. Sorun yaşarsan:

1. Araç çubuğu popup'ından **"Bu sitede devre dışı bırak"**a bas, veya
2. Ayarlar sayfasından **Agresif modu** kapat.

## Sınırlamalar

- Bu, tarayıcının reklam engelleme mimarisinin izin verdiği ölçüde
  çalışan sezgisel bir araçtır; bilinmeyen/yeni reklam ağlarını veya
  çok yaratıcı yeni teknikleri (henüz listeye eklenmemiş alan adları)
  yakalamayabilir. `rules/domains.txt` dosyasına yeni alan adları
  ekleyip `rules/ads.json`'ı güncelleyerek ya da Ayarlar sayfasından
  özel alan adı ekleyerek listeyi genişletebilirsin.
- Manifest V3 gereği ağ seviyesi kurallar statik/dinamik kural listesine
  dayanır; canlı bir "filtre aboneliği" indirmez (bilinçli olarak —
  eklenti hiçbir yere internet isteği atmaz, sadece yerleşik listeyi
  kullanır).
