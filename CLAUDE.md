# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Educational mechanical ventilation simulator for training medical students/nurses to recognize and fix patient-ventilator asynchronies. Runs on Raspberry Pi hardware with physical rotary encoders (KY-040) for parameter adjustment. Polish-language UI.

## Commands

### Backend (NestJS)
```bash
cd backend && npm install
cd backend && npm run start:student:dev               # Student backend (port 8080)
cd backend && npm run start:trainer:dev                # Trainer backend (port 8081)
cd backend && npm run test                             # Jest tests
cd backend && npm run test -- --testPathPattern=simulation  # Single test file
```

### Student UI (Vite + React, default port 5173)
```bash
cd student-ui && npm install && npm run dev
cd student-ui && npm run build                        # tsc + vite build
cd student-ui && npm run lint
```

### Trainer UI (Vite + React, default port 5174)
```bash
cd trainer-ui && npm install && npm run dev
cd trainer-ui && npm run build
cd trainer-ui && npm run lint
```

## Architecture

Three independent packages (no monorepo tooling — each has its own `package.json`):

### Split-backend design
The backend has **two entry points** for distributed deployment on Raspberry Pi:
- `main-student.ts` — runs on each student RPi. Includes `SimulationModule`, `HardwareModule`, `StudentModule`. No database.
- `main-trainer.ts` — runs on master RPi. Includes `ScenariosModule`, `SessionsModule`, `TrainerModule`. Uses SQLite (`respirator-trainer.db`).

### Network discovery
Student nodes auto-discover the trainer via **UDP broadcast beacons** on port 41234 (`DiscoveryService` broadcasts, `StudentLinkService` listens). Alternatively set `TRAINER_URL` env var to skip discovery.

### Real-time data flow
1. `SimulationService` runs a physics simulation at **50 Hz** using a 3-resistance RC lung model.
2. Telemetry is batched every 5 ticks (10 Hz) and sent to the student UI via WebSocket (`/api/students/ws`).
3. `StudentLinkService` forwards telemetry to the trainer backend over a separate WebSocket.
4. Trainer UI receives aggregated updates at 2 Hz via `/api/trainer/ws`.

### Key domain concepts
- **Asynchrony types**: 7 types (INEFFECTIVE_TRIGGER, DOUBLE_TRIGGER, AUTO_TRIGGER, DELAYED_CYCLING, PREMATURE_CYCLING, FLOW_MISMATCH, REVERSE_TRIGGER). The simulation detects when a student corrects an asynchrony by comparing current settings against baseline.
- **Scenarios**: JSON blocks with timed events (asynchrony injection, parameter changes, patient physics changes). Stored in SQLite via TypeORM.
- **Sessions**: Track student activity for analytics. States: pending -> running -> completed.

### Frontend structure
- **student-ui**: Single-page app. Registration screen -> real-time waveform charts (Recharts) + settings panel. Keyboard arrows adjust selected parameter. Encoder input arrives via WebSocket.
- **trainer-ui**: Multi-page (react-router-dom). Dashboard (all students), StationDetails (per-student control), Scenarios (CRUD), Analytics (session history/logs).

## Tech stack
- Backend: NestJS 10, TypeORM, SQLite, native WebSocket (ws), Node 18+
- Frontend: React 18, TypeScript, Vite, Recharts, Tailwind CSS
- Hardware: Raspberry Pi (gpiozero for encoders)

## Branch state (as of initial setup)
Active development is on `master-logic` branch. `main` is significantly behind. `split-backend-logic` is a subset of `master-logic`.
