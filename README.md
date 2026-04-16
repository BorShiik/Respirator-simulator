# Symulator Respiratora

Edukacyjny symulator wentylacji mechanicznej do nauki rozpoznawania i eliminacji asynchronii pacjent–respirator.

## Szybki start

Wymagany **Node 20+** (np. `nvm use 20`).

```bash
# Backend studenta (port 8080)
cd backend && npm install && npm run start:student:dev

# Backend instruktora (port 8081)
cd backend && npm install && npm run start:trainer:dev

# Frontend studenta (port 5173)
cd student-ui && npm install && npm run dev

# Frontend instruktora (port 5174)
cd trainer-ui && npm install && npm run dev
```

---

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-20+-green.svg)
![Platform](https://img.shields.io/badge/platform-Raspberry%20Pi%204-red.svg)

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

## 🏗️ Architektura

```
┌─────────────────┐     ┌─────────────────┐
│   Student UI    │     │   Trainer UI    │
│   (React)       │     │   (React)       │
└────────┬────────┘     └────────┬────────┘
         │ WebSocket 50Hz        │ WebSocket 2Hz
         └───────────┬───────────┘
                     ▼
         ┌───────────────────────┐
         │   Backend (NestJS)    │
         │   - SimulationService │
         │   - WebSocket Gateway │
         │   - REST API          │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │   SQLite Database     │
         └───────────────────────┘
```

### Architektura sieci

**Wariant A (≤5 stanowisk):**

```
RPi Master (AP + DHCP + DNS + WebServer) ─── Wi-Fi ─── RPi Klienci + Komputer Instruktora
```

**Wariant B (>5 stanowisk):**

```
RPi Master (DHCP + DNS + WebServer) ─── Ethernet ─── Access Point ─── Wi-Fi ─── Klienci
```

## 🛠️ Technologie

| Warstwa  | Technologia                                        |
| -------- | -------------------------------------------------- |
| Frontend | React 18, TypeScript, Vite, Recharts, Tailwind CSS |
| Backend  | NestJS, TypeORM, SQLite, WebSocket (ws)            |
| Hardware | Raspberry Pi 4B, wyświetlacz 7", enkodery KY-040   |
| Sieć     | hostapd, dnsmasq                                   |

## 📦 Instalacja

### Wymagania

- Node.js 18+
- npm 9+

### Backend

```bash
cd backend
npm install
npm run start:dev
```

### Student UI

```bash
cd student-ui
npm install
npm run dev
```

### Trainer UI

```bash
cd trainer-ui
npm install
npm run dev
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
├── backend/                 # NestJS API + symulacja
│   ├── src/
│   │   ├── simulation/      # Rdzeń symulacji
│   │   ├── stations/        # WebSocket dla studentów
│   │   ├── trainer/         # API dla instruktora
│   │   ├── scenarios/       # Scenariusze kliniczne
│   │   ├── sessions/        # Historia sesji
│   │   └── hardware/        # GPIO (enkodery)
│   └── package.json
├── student-ui/              # React UI dla studenta
│   ├── src/
│   │   ├── components/      # Wykresy, panele
│   │   ├── hooks/           # useStudentWebSocket
│   │   └── types/           # TypeScript interfaces
│   └── package.json
├── trainer-ui/              # React UI dla instruktora
│   └── ...
└── README.md
```

## 🚀 Deployment na Raspberry Pi

### RPi Master (serwer)

```bash
# Instalacja hostapd i dnsmasq
sudo apt install hostapd dnsmasq

# Konfiguracja - patrz docs/network-setup.md
```

### RPi Klient (stanowisko)

```bash
# Tryb kiosk z Chromium
chromium-browser --kiosk --app=http://respirator.local
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
