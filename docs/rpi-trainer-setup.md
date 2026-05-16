# Konfiguracja Raspberry Pi 4 — RPi Trenera

Krok po kroku: od pustego pudełka do działającego access pointa z backendem trenera.

## Wymagania sprzętowe

- Raspberry Pi 4 (płytka)
- Karta microSD (minimum 16GB, najlepiej 32GB)
- Zasilacz USB-C (oficjalny RPi — 5V/3A)
- Kabel micro-HDMI → HDMI (RPi 4 ma micro-HDMI, nie zwykłe!)
- Czytnik kart microSD (albo adapter SD) do podłączenia karty do laptopa
- Monitor z HDMI (tylko do pierwszej konfiguracji, potem SSH)
- Klawiatura USB (tylko do pierwszej konfiguracji)
- Opcjonalnie: kabel Ethernet, obudowa, radiatory

---

## Krok 1: Nagranie systemu na kartę SD

Robimy to na laptopie (nie na RPi).

### 1.1 Pobierz Raspberry Pi Imager

https://www.raspberrypi.com/software/ — pobierz na swój system (Windows/Mac/Linux). Zainstaluj i uruchom.

**UWAGA**: Jeśli karta ma system NOOBS — trzeba ją nadpisać. NOOBS jest przestarzały (Raspberry Pi Foundation go wycofał). Imager nagra system bezpośrednio i skonfiguruje SSH/WiFi od razu, bez potrzeby monitora.

### 1.2 Włóż kartę microSD do czytnika

Włóż kartę do czytnika i podłącz do laptopa. System powinien ją rozpoznać jako dysk.

### 1.3 Nagraj system

W Raspberry Pi Imager:

1. **Choose Device** → wybierz `Raspberry Pi 4`
2. **Choose OS** → `Raspberry Pi OS Lite (64-bit)` — wersja bez pulpitu, lżejsza, idealna dla serwera
3. **Choose Storage** → wybierz swoją kartę microSD

**WAŻNE — przed kliknięciem "Write"** pojawi się okno "Would you like to apply OS customisation settings?". Wybierz **Edit Settings**:

**General tab:**
- ✅ Set hostname: `trainer`
  - dzięki temu RPi będzie dostępne jako `trainer.local` w sieci
- ✅ Set username and password: np. username `pi`, password coś bezpiecznego
  - **zapamiętaj to hasło!**
- ✅ Configure wireless LAN: wpisz swoje domowe WiFi (SSID i hasło)
  - to tymczasowe — pozwoli łączyć się z RPi zdalnie podczas konfiguracji
  - później wyłączymy WiFi klienckie i zrobimy access point
- ✅ Set locale: timezone `Europe/Warsaw`, keyboard layout `pl`

**Services tab:**
- ✅ Enable SSH — wybierz "Use password authentication"
  - dzięki temu łączysz się z RPi z laptopa bez monitora

Kliknij **Save**, potem **Write**. Poczekaj aż się nagra i zweryfikuje (kilka minut).

### 1.4 Wyjmij kartę

Po zakończeniu nagrywania bezpiecznie wyjmij kartę z laptopa.

---

## Krok 2: Pierwsze uruchomienie

### 2.1 Złożenie

1. Włóż kartę microSD do slotu na spodzie RPi (kontaktami w górę)
2. Opcjonalnie: podłącz monitor (micro-HDMI → HDMI) i klawiaturę USB
3. Opcjonalnie: podłącz kabel Ethernet do routera (ułatwia pierwszy setup)
4. **Na końcu** podłącz zasilacz USB-C — RPi nie ma przycisku power, startuje od razu

### 2.2 Pierwszy boot

RPi uruchomi się sam (30-90 sekund). Ponieważ wybrałeś wersję Lite, zobaczysz login w terminalu. Zaloguj się username i hasłem z Imagera.

Jeśli nie masz monitora — poczekaj ~2 minuty i przejdź od razu do kroku 3 (SSH).

### 2.3 Sprawdź czy jest sieć

```bash
hostname -I
```

Powinien pokazać np. `192.168.1.45` — to jest IP w twojej domowej sieci. **Zapisz ten adres.**

---

## Krok 3: Połączenie z laptopa przez SSH

Od tego momentu nie potrzebujesz monitora ani klawiatury. Wszystko robisz z laptopa.

### 3.1 Otwórz terminal na laptopie

- **Windows**: PowerShell albo Windows Terminal
- **Mac/Linux**: Terminal

### 3.2 Połącz się

```bash
# Po nazwie hosta:
ssh pi@trainer.local

# Albo po IP:
ssh pi@192.168.1.45
```

Przy pierwszym połączeniu zapyta "Are you sure you want to continue connecting?" — wpisz `yes`.
Potem wpisz hasło.

Jeśli `trainer.local` nie działa na Windows — użyj IP.

### 3.3 Zaktualizuj system

```bash
sudo apt update && sudo apt upgrade -y
```

Może potrwać 5-15 minut.

---

## Krok 4: Instalacja Node.js

```bash
# Zainstaluj nvm (Node Version Manager)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Przeładuj shell
source ~/.bashrc

# Zainstaluj Node 20
nvm install 20

# Sprawdź
node -v    # v20.x.x
npm -v     # 10.x.x
```

Dlaczego nvm a nie `apt install nodejs`? Bo w repo Debiana jest stara wersja. nvm pozwala zainstalować dokładnie tę której potrzebujemy.

---

## Krok 5: Wgranie kodu projektu

### Opcja A: Git clone

```bash
sudo apt install git -y
git clone <URL_REPO> ~/Respirator-Simulator
cd ~/Respirator-Simulator
```

### Opcja B: Kopiowanie z laptopa (SCP)

Na laptopie:
```bash
scp -r /sciezka/do/Respirator-Simulator pi@trainer.local:~/
```

### 5.1 Instalacja zależności i test

```bash
cd ~/Respirator-Simulator/backend
npm install
npm run build
npm run start:trainer:dev    # test — powinien wystartować na porcie 8081
# Ctrl+C żeby zatrzymać
```

### 5.2 Zbuduj Trainer UI (póki masz internet!)

**WAŻNE**: zrób to TERAZ, zanim w kroku 6 RPi przestanie mieć internet. Po skonfigurowaniu access pointa wlan0 nie łączy się już do domowego WiFi i `npm install` przestanie działać.

```bash
cd ~/Respirator-Simulator/trainer-ui
npm install
npm run build

# Zainstaluj 'serve' globalnie — będzie potrzebny w kroku 8
npm install -g serve
which serve    # potwierdź — np. /home/pi/.nvm/versions/node/v18.20.4/bin/serve
```

**Jeśli już zrobiłeś krok 6 i nie masz internetu**: podłącz telefon kablem USB do RPi i włącz **Tethering USB** w ustawieniach telefonu. RPi dostanie internet przez interfejs `usb0` bez ruszania access pointa. Sprawdź `ping -c 2 8.8.8.8`, zrób `npm install`, odłącz telefon.

---

## Krok 6: Konfiguracja Access Point

Po tym kroku RPi tworzy własną sieć WiFi `Respirator-Lab`.

**UWAGA**: Po tym kroku RPi przestanie łączyć się do domowego WiFi! Jeśli masz Ethernet — podłącz kabel do routera, żebyś miał SSH po kablu. Jeśli nie masz — zrób wszystko poniżej w jednej sesji SSH.

### 6.1 Zainstaluj oprogramowanie

```bash
sudo apt install hostapd dnsmasq -y
```

- **hostapd** — zamienia kartę WiFi w access point
- **dnsmasq** — serwer DHCP, rozdaje adresy IP

### 6.2 Zatrzymaj usługi na czas konfiguracji

```bash
sudo systemctl stop hostapd
sudo systemctl stop dnsmasq
```

### 6.3 Ustaw statyczny IP na wlan0

```bash
sudo nano /etc/dhcpcd.conf
```

Dodaj na końcu pliku:
```
interface wlan0
    static ip_address=192.168.4.1/24
    nohook wpa_supplicant
```

Co to znaczy:
- `static ip_address=192.168.4.1/24` — RPi zawsze ma IP 192.168.4.1. /24 = maska 255.255.255.0
- `nohook wpa_supplicant` — nie łącz się do innych sieci WiFi na tym interfejsie

Zapisz: `Ctrl+O`, `Enter`, `Ctrl+X`.

### 6.4 Skonfiguruj hostapd

```bash
sudo nano /etc/hostapd/hostapd.conf
```

Wpisz:
```
interface=wlan0
driver=nl80211
ssid=Respirator-Lab
hw_mode=g
channel=7
wmm_enabled=0
macaddr_acl=0
auth_algs=1
wpa=2
wpa_passphrase=Respirator2024
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
```

Co to znaczy:
- `interface=wlan0` — wbudowana karta WiFi
- `driver=nl80211` — standardowy driver WiFi w Linuxie
- `ssid=Respirator-Lab` — nazwa sieci
- `hw_mode=g` — 2.4 GHz (lepszy zasięg, wystarczy)
- `channel=7` — kanał WiFi
- `wpa=2` — szyfrowanie WPA2
- `wpa_passphrase=Respirator2024` — hasło do sieci (**zmień na swoje!**)

Powiedz systemowi gdzie jest config:
```bash
sudo nano /etc/default/hostapd
```

Znajdź `#DAEMON_CONF=""` i zmień na:
```
DAEMON_CONF="/etc/hostapd/hostapd.conf"
```

### 6.5 Skonfiguruj dnsmasq

```bash
sudo mv /etc/dnsmasq.conf /etc/dnsmasq.conf.orig
sudo nano /etc/dnsmasq.conf
```

Wpisz:
```
interface=wlan0
dhcp-range=192.168.4.10,192.168.4.50,255.255.255.0,24h

# RPi jest też serwerem DNS dla swojej sieci
dhcp-option=6,192.168.4.1
no-resolv

# trainer.lab → 192.168.4.1 (żeby trener mógł wpisać nazwę zamiast IP)
address=/trainer.lab/192.168.4.1
```

Co to znaczy:
- `dhcp-range` — rozdawaj IP w zakresie 192.168.4.10-50 (max 40 studentów), lease 24h
- `dhcp-option=6,192.168.4.1` — przy rozdawaniu IP mów klientom "wasz DNS to też ja"
- `no-resolv` — nie próbuj forwardować zapytań DNS do upstream (nie mamy internetu)
- `address=/trainer.lab/192.168.4.1` — każde zapytanie o `trainer.lab` rozwiąż na 192.168.4.1

Dzięki temu trener z dowolnego urządzenia w sieci `Respirator-Lab` wpisze w przeglądarce `http://trainer.lab/` i trafi prosto na UI trenera.

### 6.6 Włącz i uruchom

```bash
sudo systemctl unmask hostapd
sudo systemctl enable hostapd dnsmasq
sudo reboot
```

### 6.7 Weryfikacja

Po reboocie: na laptopie/telefonie sprawdź czy widzisz sieć **Respirator-Lab**.
Połącz się hasłem i:
```bash
ssh pi@192.168.4.1
sudo systemctl status hostapd    # powinien być active (running)
hostname -I                      # powinien pokazać 192.168.4.1
```

---

## Krok 7: Autostart backendu (systemd)

```bash
# Sprawdź pełną ścieżkę do node
which node
# np. /home/pi/.nvm/versions/node/v20.18.0/bin/node
```

```bash
sudo nano /etc/systemd/system/respirator-trainer.service
```

```ini
[Unit]
Description=Respirator Trainer Backend
After=network-online.target hostapd.service
Wants=network-online.target

[Service]
WorkingDirectory=/home/pi/Respirator-Simulator/backend
ExecStart=/home/pi/.nvm/versions/node/v20.18.0/bin/node dist/main-trainer.js
Restart=always
RestartSec=5
Environment=PORT=8081

[Install]
WantedBy=multi-user.target
```

**UWAGA**: wstaw swoją ścieżkę do `node` w ExecStart!

```bash
sudo systemctl enable respirator-trainer
sudo systemctl start respirator-trainer
sudo systemctl status respirator-trainer    # sprawdź
journalctl -u respirator-trainer -f         # logi (Ctrl+C żeby wyjść)
```

---

## Krok 8: Serwowanie Trainer UI

UI już zbudowane w kroku 5.2 (`trainer-ui/dist/`) i `serve` zainstalowany globalnie. Zostaje tylko podpiąć to do systemd na **port 80** (żeby URL nie wymagał numeru portu).

```bash
# Sprawdź ścieżkę do 'serve'
which serve
# np. /home/pi/.nvm/versions/node/v18.20.4/bin/serve
```

```bash
sudo nano /etc/systemd/system/trainer-ui.service
```

```ini
[Unit]
Description=Trainer UI
After=respirator-trainer.service

[Service]
ExecStart=/home/pi/.nvm/versions/node/v18.20.4/bin/serve -s /home/pi/Respirator-Simulator/trainer-ui/dist -l 80
Restart=always

[Install]
WantedBy=multi-user.target
```

**UWAGA**: wstaw swoją ścieżkę do `serve` w ExecStart! (z `which serve` powyżej)

Dlaczego port 80? Bo wtedy w przeglądarce wpisujesz **`http://trainer.lab/`** (bez `:5174`), co jest dużo wygodniejsze. Port <1024 wymaga roota — systemd domyślnie uruchamia usługę jako root, więc OK.

```bash
sudo systemctl daemon-reload
sudo systemctl enable trainer-ui
sudo systemctl start trainer-ui
sudo systemctl status trainer-ui
```

**Test z laptopa/telefonu** (najpierw połączony do sieci `Respirator-Lab`):
- Otwórz przeglądarkę → wpisz `http://trainer.lab/` → powinno otworzyć UI trenera

Awaryjnie (jakby DNS nie zadziałał) — wpisz `http://192.168.4.1/` i działa.

---

## Wynik końcowy

```
RPi Trenera (trainer.lab → 192.168.4.1)
├── Sieć WiFi "Respirator-Lab" (hostapd)
├── DHCP 192.168.4.10-50 (dnsmasq)
├── DNS: trainer.lab → 192.168.4.1 (dnsmasq)
├── Backend trenera :8081 (autostart)
└── Trainer UI :80 (autostart) — http://trainer.lab/

RPi Studenta (192.168.4.x)
├── Łączy się do "Respirator-Lab"
├── TRAINER_URL=ws://192.168.4.1:8081/api/trainer/ws
├── Backend studenta :8080 (autostart)
└── Student UI :5173 (autostart/kiosk)
```



# Hasla i konfiguracje (zmienic na produkcji)
hostname : trainer 
username : pi 
password : trainer 
haslo do sieci Respirator-Lab : Respirator2024