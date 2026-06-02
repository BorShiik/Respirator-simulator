# Symulator Respiratora

Edukacyjny symulator wentylacji mechanicznej do nauki rozpoznawania i eliminacji asynchronii pacjent–respirator.

## 🚀 Szybki start

Wymagany **Node 20+** (np. `nvm use 20`).

```bash
# 1. URUCHOMIENIE PANELU INSTRUKTORA (Serwer na Raspberry Pi 4)
cd backend && npm install && npm run start:trainer:dev   # Backend (port 8081)
cd ../trainer-ui && npm install && npm run dev          # Frontend (port 3001)

# 2. URUCHOMIENIE STANOWISKA STUDENTA (Symulator na Raspberry Pi 5)
cd backend && npm install && npm run start:student:dev   # Backend (port 8080)
cd ../student-ui && npm install && npm run dev          # Frontend (port 3000)

# 3. STRONA PREZENTACYJNA / INTERAKTYWNA (Wizualizacja 3D)
cd landing-site && npm install && npm run dev          # Model 3D (port 3000)
```

---

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-20+-green.svg)
![Platform](https://img.shields.io/badge/platform-RPi%205%20%28Student%29%20%7C%20RPi%204%20%28Trainer%29-red.svg)

## 🎯 Cel projektu

System szkoleniowy dla studentów medycyny, pielęgniarek i ratowników medycznych, umożliwiający:

- Rozpoznawanie 7 typów asynchronii pacjent–respirator
- Korektę parametrów wentylacji w czasie rzeczywistym
- Pracę w scenariuszach klinicznych z rosnącym poziomem trudności
- Monitorowanie postępów przez instruktora

## ✨ Funkcje

### Panel Studenta

- 📊 Wykresy czasu rzeczywistego: ciśnienie, przepływ, objętość (50 Hz)
- 🎛️ Fizyczne enkodery do zmiany parametrów (PEEP, Pinsp, RR, Ti, Trigger)
- 🔴 Wizualna sygnalizacja asynchronii
- 👤 Identyfikacja po imieniu i nazwisku

### Panel Instruktora

- 👥 Podgląd wszystkich studentów jednocześnie
- 📋 Przypisywanie scenariuszy klinicznych
- 📈 Historia sesji i analityka
- 🎮 Zdalne sterowanie symulacjami

### Tryby wentylacji

- PC-CMV (Pressure Control - CMV)
- PC-SIMV
- VC-CMV (Volume Control - CMV)
- VC-SIMV
- PSV (Pressure Support)
- CPAP

### Typy asynchronii

| Typ                 | Opis                                             |
| ------------------- | ------------------------------------------------ |
| Ineffective Trigger | Pacjent próbuje oddychać, respirator nie reaguje |
| Double Trigger      | Dwa oddechy w szybkiej sekwencji                 |
| Auto Trigger        | Respirator wyzwala bez wysiłku pacjenta          |
| Delayed Cycling     | Inspiracja trwa za długo                         |
| Premature Cycling   | Inspiracja kończy się za wcześnie                |
| Flow Mismatch       | Przepływ nie odpowiada potrzebom pacjenta        |
| Reverse Trigger     | Respirator wyzwala wysiłek pacjenta              |

## 🏗️ Architektura Systemu

System opiera się na architekturze rozproszonej z podziałem ról na dwa fizyczne urządzenia Raspberry Pi:

*   **Raspberry Pi 5 (Główny Symulator / Stanowisko Studenta):** Odpowiada za wykonywanie pętli fizycznej symulacji płuc (50 Hz) za pomocą solvera RK4, obsługę fizycznych enkoderów obrotowych KY-040 przez interfejs GPIO (biblioteka `pigpio` w środowisku Linux) oraz wyświetlanie interfejsu pacjenta w trybie pełnoekranowym (kiosk mode).
*   **Raspberry Pi 4 (Serwer Instruktora / Trenera):** Działa jako punkt centralny sieci. Zarządza bazą danych SQLite, monitoruje stan wszystkich stanowisk studentów w czasie rzeczywistym, wysyła komendy sterujące (start, stop, reset) i dystrybuuje scenariusze kliniczne.

```
┌──────────────────────────────┐              ┌──────────────────────────────┐
│   Raspberry Pi 5 (Student)   │              │   Raspberry Pi 4 (Trainer)   │
│                              │              │                              │
│   ┌──────────────────────┐   │              │   ┌──────────────────────┐   │
│   │      Student UI      │   │              │   │      Trainer UI      │   │
│   │   (React / Port 3000)│   │              │   │   (React / Port 3001)│   │
│   └──────────┬───────────┘   │              │   └──────────┬───────────┘   │
│              │ WebSocket     │              │              │ WebSocket     │
│              │ (Local 50Hz)  │              │              │ (Local 2Hz)   │
│   ┌──────────▼───────────┐   │              │   ┌──────────▼───────────┐   │
│   │   Student Backend    │   │  WebSocket   │   │   Trainer Backend    │   │
│   │  (NestJS / Port 8080)◄───┼──────────────┼───►  (NestJS / Port 8081)│   │
│   └──────────┬───────────┘   │  (Control &  │   └──────────┬───────────┘   │
│              │ GPIO          │   Telemetry) │              │ SQL           │
│   ┌──────────▼───────────┐   │              │   ┌──────────▼───────────┐   │
│   │   KY-040 Encoders    │   │              │   │   SQLite Database    │   │
│   └──────────────────────┘   │              │   └──────────────────────┘   │
└──────────────────────────────┘              └──────────────────────────────┘
```

### 📡 Autowykrywanie w sieci (UDP Auto-Discovery)
Serwer Instruktora (RPi 4) co 3 sekundy rozgłasza pakiet UDP broadcast (beacon) na porcie **41234**. Backend studenta (RPi 5) nasłuchuje tego portu, automatycznie odczytuje adres IP trenera i bez ręcznej konfiguracji nawiązuje z nim połączenie WebSocket. Alternatywnie, adres trenera można przekazać do skryptu uruchomieniowego jako argument (np. `./start-student.sh 192.168.1.100:8081`).

### Architektura sieci

**Wariant A (≤5 stanowisk):**

```
RPi Trainer (AP + DHCP + DNS + WebServer) ─── Wi-Fi ─── RPi Klienci (Student)
```

**Wariant B (>5 stanowisk):**

```
RPi Trainer (DHCP + DNS + WebServer) ─── Ethernet ─── Access Point ─── Wi-Fi ─── RPi Klienci (Student)
```

## 🛠️ Technologie

| Warstwa  | Technologia                                        | Opis / Szczegóły |
| -------- | -------------------------------------------------- | ---------------- |
| Frontend | React 18, TypeScript, Vite, Recharts, Tailwind CSS | Interfejsy Użytkownika |
| 3D Model | Three.js, React Three Fiber, Drei, Zustand, React Spring | Prezentacja 3D (`landing-site`) |
| Backend  | NestJS, TypeORM, SQLite, WebSocket (ws)            | Silnik symulacji (solvery RK4) i API |
| Hardware (Student) | **Raspberry Pi 5**, ekran dotykowy 7", enkodery KY-040 | Stanowisko fizyczne (fizyczny pomiar obrotów enkoderów) |
| Hardware (Trainer) | **Raspberry Pi 4** | Serwer koordynujący sesje szkoleniowe |
| Sieć     | hostapd, dnsmasq, dgram (UDP broadcast auto-discovery) | Infrastruktura sieciowa i autodetekcja |

## 📦 Instalacja

### Wymagania

- Node.js 20+
- npm 10+
- Skonfigurowane biblioteki systemowe dla `pigpio` (tylko na Raspberry Pi 5 do obsługi fizycznych enkoderów)

### Uruchomienie poszczególnych modułów

#### 1. Backend (Wspólny dla obu ról)
Zależnie od maszyny, uruchamiamy backend studenta lub trenera:

```bash
cd backend
npm install

# Na Raspberry Pi 5 (Student / Symulator):
npm run start:student:dev

# Na Raspberry Pi 4 (Trainer / Serwer):
npm run start:trainer:dev
```

#### 2. Student UI (RPi 5)
```bash
cd student-ui
npm install
npm run dev # Działa na http://localhost:3000
```

#### 3. Trainer UI (RPi 4)
```bash
cd trainer-ui
npm install
npm run dev # Działa na http://localhost:3001
```

#### 4. Landing Site (Strona z prezentacją 3D)
```bash
cd landing-site
npm install
npm run dev # Działa na http://localhost:3000
```

## 🌐 Endpointy

### WebSocket

| Endpoint                              | Opis                             |
| ------------------------------------- | -------------------------------- |
| `ws://localhost:8080/api/stations/ws` | Telemetria dla studentów (50 Hz) |
| `ws://localhost:8080/api/trainer/ws`  | Updates dla instruktora (2 Hz)   |

### REST API

| Metoda | Endpoint                              | Opis                       |
| ------ | ------------------------------------- | -------------------------- |
| GET    | `/api/trainer/students`               | Lista studentów            |
| POST   | `/api/trainer/students/:name/command` | Komenda (start/stop/reset) |
| GET    | `/api/trainer/scenarios`              | Lista scenariuszy          |
| POST   | `/api/trainer/scenarios`              | Nowy scenariusz            |

## ⚡ Wymagania czasu rzeczywistego

| Metryka              | Docelowy | Fallback  |
| -------------------- | -------- | --------- |
| Czas cyklu symulacji | < 10ms   | < 20-30ms |
| Jitter               | < 2ms    | < 5ms     |
| Opóźnienie WebSocket | < 5ms    | < 10ms    |

## 📁 Struktura projektu

```
respirator-simulator/
├── backend/                 # NestJS API + fizyczna symulacja płuc
│   ├── src/
│   │   ├── simulation/      # Model matematyczny płuc i asynchronii
│   │   ├── stations/        # WebSocket dla stanowisk studentów (50 Hz)
│   │   ├── trainer/         # API i bramka WebSocket instruktora oraz UDP Discovery
│   │   ├── scenarios/       # Dystrybucja scenariuszy klinicznych
│   │   ├── sessions/        # Historia sesji szkoleniowych (zapis do bazy danych)
│   │   └── hardware/        # Odczyt GPIO dla enkoderów KY-040
│   └── package.json
├── student-ui/              # Panel dotykowy studenta (React)
│   ├── src/
│   │   ├── components/      # Wykresy fal oddechowych, kontrolki wentylacji
│   │   ├── hooks/           # useStudentWebSocket (odbiornik 50 Hz)
│   │   └── types/           # TypeScript interfaces
│   └── package.json
├── trainer-ui/              # Panel instruktora / trenera (React)
│   ├── src/
│   │   ├── components/      # Multi-podgląd stanowisk studentów w czasie rzeczywistym
│   │   └── ...
│   └── package.json
├── landing-site/            # Strona prezentacyjna z interaktywnym modelem 3D
│   ├── src/                 # Kod proceduralnego renderowania 3D (R3F, Drei, Spring)
│   └── package.json
├── start-student.sh         # Automatyczny skrypt startowy dla Raspberry Pi 5
└── README.md
```

## 🚀 Deployment na Raspberry Pi

### RPi Master (Serwer Trenera - Raspberry Pi 4)

```bash
# Instalacja hostapd i dnsmasq do postawienia dedykowanego AP w laboratorium
sudo apt install hostapd dnsmasq

# Szczegółowa konfiguracja sieci AP/DHCP - patrz docs/network-setup.md
```

### RPi Client (Stanowisko Studenta - Raspberry Pi 5)
Do automatycznego uruchomienia całego środowiska na stanowisku studenta (backend, frontend oraz Chromium w trybie kiosku z obsługą auto-discovery trenera) zaleca się użycie przygotowanego skryptu:

```bash
# Nadanie uprawnień i uruchomienie (skrypt automatycznie zainstaluje brakujące node_modules)
chmod +x start-student.sh
./start-student.sh
```

Dla wersji produkcyjnej lub ręcznej konfiguracji kiosku:
```bash
# Kiosk z Chromium wskazujący na lokalny port interfejsu studenta
chromium-browser --kiosk --noerrdialogs --disable-infobars --app=http://localhost:3000
```

## 📝 Scenariusze

Przykładowa struktura scenariusza:

```json
{
  "name": "Basic Training",
  "durationSeconds": 180,
  "events": [
    {
      "time": 30,
      "type": "asynchrony",
      "asynchronyType": "INEFFECTIVE_TRIGGER",
      "duration": 20
    },
    { "time": 90, "type": "message", "message": "Skoryguj ustawienia" }
  ]
}
```

## 🤝 Wkład

1. Fork repozytorium
2. Stwórz branch (`git checkout -b feature/nazwa`)
3. Commit (`git commit -m 'Dodaj funkcję'`)
4. Push (`git push origin feature/nazwa`)
5. Otwórz Pull Request

## 📄 Licencja

MIT License - zobacz [LICENSE](LICENSE)

## 👥 Autorzy

- Projekt edukacyjny

## 🙏 Podziękowania

- Konsultacje medyczne: [do uzupełnienia]
- Inspiracja: rzeczywiste problemy w szkoleniu personelu medycznego
