# herdr örnek yapılandırması

[herdr](https://github.com/herdrdev/herdr) (v0.9.x) için örnek config ve agent orkestrasyon script'i.

## Kurulum

```bash
curl -fsSL https://herdr.dev/install.sh | sh   # veya: brew install herdr / mise use -g herdr
mkdir -p ~/.config/herdr
cp config.toml ~/.config/herdr/config.toml
herdr server reload-config                     # server çalışıyorsa
```

## Dosyalar

| Dosya | İçerik |
| --- | --- |
| `config.toml` | Headless boyut, worktree dizini, oturum geri yükleme, tuşlar, popup komutları, tema, sidebar ve bildirim ayarları |
| `orchestrate.sh` | Worktree + 3 pane: implementer (claude), reviewer (codex), test watcher |

## Orkestrasyon

```bash
./orchestrate.sh ~/proje "Görev açıklaması"
```

Gereksinim: `herdr`, `jq`, `git`, kurulu ve oturum açılmış `claude` ile `codex` CLI'ları.
Script `make test-watch` hedefini varsayar; projenize göre değiştirin.
Agent onay isterse (`blocked`) script durur ve son çıktıyı gösterir; onayı otomatik vermez.

## Doğrulama durumu

Config anahtarları herdr kaynak kodundaki tanımlarla karşılaştırıldı, TOML ve bash sözdizimi kontrol edildi.
Gerçek bir herdr kurulumunda çalıştırılarak test edilmedi.
