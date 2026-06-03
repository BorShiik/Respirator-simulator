import React, { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useRespiratorStore, PARAM_META, SELECTABLE, PATIENT_PARAMS } from './store';
import logoUrl from '../assets/logo.png';

/**
 * ScreenDisplay — the student-UI screen as a real textured 3D mesh.
 * Interactive (raycast → UV → hit-test): tap a card to select it (the knob
 * adjusts it), PAUZA/RESET, the PARAMETRY PACJENTA panel, and the ☀/☾ theme
 * toggle. Colours mirror the real student-ui light/dark themes.
 */

// Project logo (transparent PNG) — only the lungs symbol is drawn (the
// "PulmoFlow" wordmark below it in the source image is cropped out).
const logoImg = new Image();
let logoReady = false;
logoImg.onload = () => { logoReady = true; };
logoImg.src = logoUrl;
const LOGO_SRC = { x: 282, y: 45, w: 460, h: 400 };

// ── Design-space layout (800 × 500) ──────────────────────────────
const DW = 800;
const DH = 500;
const PADX = 16;
const PADY = 12;
const INX = PADX;
const INW = DW - 2 * PADX;
const STATUS_H = 36;
const BODY_Y = PADY + STATUS_H + 14;
const BODY_H = DH - PADY - BODY_Y;
const GAP = 12;
const LEFT_W = 165;
const RIGHT_W = 215;
const LEFT_X = INX;
const CENTER_X = LEFT_X + LEFT_W + GAP;
const CENTER_W = INW - LEFT_W - RIGHT_W - 2 * GAP;
const RIGHT_X = CENTER_X + CENTER_W + GAP;

const CARD_COUNT = 6;
const CARDS_TOP = BODY_Y + 48;
const CARDS_BOTTOM = BODY_Y + BODY_H - 10;
const CARD_GAP = 6;
const CARD_H = (CARDS_BOTTOM - CARDS_TOP - CARD_GAP * (CARD_COUNT - 1)) / CARD_COUNT;
const CARD_X = LEFT_X + 10;
const CARD_W = LEFT_W - 20;
const cardRect = (i) => ({ x: CARD_X, y: CARDS_TOP + i * (CARD_H + CARD_GAP), w: CARD_W, h: CARD_H });

const RPX = RIGHT_X + 10;
const RPW = RIGHT_W - 20;
const BTN_PARAM_Y = BODY_Y + BODY_H - 64;
const BTN_ROW_Y = BTN_PARAM_Y + 30;
const PAUSE_W = RPW * 0.64;
const RESET_X = RPX + PAUSE_W + 6;
const RESET_W = RPW - PAUSE_W - 6;
const PAUSE_RECT = { x: RPX, y: BTN_ROW_Y, w: PAUSE_W, h: 24 };
const RESET_RECT = { x: RESET_X, y: BTN_ROW_Y, w: RESET_W, h: 24 };
const PARAM_BTN_RECT = { x: RPX, y: BTN_PARAM_Y, w: RPW, h: 24 };
const THEME_RECT = { x: INX + INW - 26, y: PADY + 4, w: 26, h: 26 };
const hit = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

const SYNC_TOP = BODY_Y + 108;
const PARAMS_BOTTOM = BTN_PARAM_Y - 8;
const PARAMS_H = 178;

const SS = 2;

// ── Themes (exact values from student-ui/src/index.css) ──────────
const THEMES = {
  dark: {
    bg: '#0a0f1a', panel: '#111827', panel2: '#0d1623', border: '#1e3a5f',
    text: '#e2e8f0', heading: '#f8fafc', muted: '#94a3b8',
    accent: '#3b82f6', green: '#10b981', orange: '#f59e0b', red: '#ef4444',
    cyan: '#06b6d4', axis: '#334155', grid: '#1e293b', refGreen: '#059669',
    moon: '#818cf8',
  },
  light: {
    bg: '#f0f4f8', panel: '#ffffff', panel2: '#e9eef5', border: '#d1dce8',
    text: '#1a365d', heading: '#0f2747', muted: '#64748b',
    accent: '#0066cc', green: '#059669', orange: '#d97706', red: '#dc2626',
    cyan: '#0891b2', axis: '#cbd5e1', grid: '#e2e8f0', refGreen: '#047857',
    moon: '#6366f1',
  },
};

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ── Canvas helpers ───────────────────────────────────────────────
function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function text(ctx, str, x, y, font, color, align = 'left', baseline = 'alphabetic') {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(str, x, y);
}

function drawPanel(ctx, C, x, y, w, h) {
  ctx.fillStyle = C.panel;
  rr(ctx, x, y, w, h, 10); ctx.fill();
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  rr(ctx, x, y, w, h, 10); ctx.stroke();
}

function drawChart(ctx, C, x, y, w, h, data, color, minVal, maxVal, isSymmetric, refLines, ticks) {
  ctx.save();
  ctx.translate(x, y);

  const ML = 40, MR = 10, MT = 8, MB = 8;
  const plotW = w - ML - MR;
  const plotH = h - MT - MB;

  const toY = (v) => isSymmetric
    ? MT + plotH / 2 - (v / maxVal) * (plotH / 2)
    : MT + plotH - ((v - minVal) / (maxVal - minVal)) * plotH;

  ctx.lineWidth = 0.8;
  ctx.font = '8px Inter, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ticks.forEach((t) => {
    const ry = toY(t);
    ctx.strokeStyle = C.grid;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(ML, ry);
    ctx.lineTo(w - MR, ry);
    ctx.stroke();
    ctx.fillStyle = C.muted;
    ctx.fillText(String(t), ML - 6, ry);
  });
  ctx.setLineDash([]);

  refLines.forEach((ref) => {
    const ry = toY(ref.val);
    ctx.strokeStyle = ref.color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(ML, ry);
    ctx.lineTo(w - MR, ry);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  if (data.length > 0) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const px = ML + (i / (data.length - 1)) * plotW;
      const clamped = isSymmetric
        ? Math.max(-maxVal, Math.min(maxVal, data[i]))
        : Math.max(minVal, Math.min(maxVal, data[i]));
      const py = toY(clamped);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// SYNCHRONIA indicator — adapts to box height (compact when short).
function drawSync(ctx, C, x, y, w, h, paused) {
  const color = paused ? C.orange : C.green;
  ctx.fillStyle = rgba(color, 0.04);
  rr(ctx, x, y, w, h, 8); ctx.fill();
  ctx.strokeStyle = rgba(color, 0.13);
  rr(ctx, x, y, w, h, 8); ctx.stroke();

  const drawGlyph = (cx, cy, r) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2.5, r * 0.18);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    if (paused) {
      ctx.moveTo(cx - r * 0.28, cy - r * 0.4); ctx.lineTo(cx - r * 0.28, cy + r * 0.4);
      ctx.moveTo(cx + r * 0.28, cy - r * 0.4); ctx.lineTo(cx + r * 0.28, cy + r * 0.4);
    } else {
      ctx.moveTo(cx - r * 0.38, cy + r * 0.02);
      ctx.lineTo(cx - r * 0.08, cy + r * 0.32);
      ctx.lineTo(cx + r * 0.42, cy - r * 0.3);
    }
    ctx.stroke();
  };

  const label = paused ? 'PAUZA' : 'SYNCHRONIA';
  if (h >= 96) {
    const r = Math.min(22, (h - 46) / 2);
    const cy = y + h / 2 - 12;
    drawGlyph(x + w / 2, cy, r);
    text(ctx, label, x + w / 2, cy + r + 18, '900 12px Inter, sans-serif', color, 'center', 'middle');
    if (h >= 120) {
      text(ctx, paused ? 'Symulacja wstrzymana' : 'Poprawna interakcja',
        x + w / 2, cy + r + 32, '9px Inter, sans-serif', C.muted, 'center', 'middle');
    }
  } else {
    const r = Math.max(9, Math.min(13, h / 2 - 7));
    const cy = y + h / 2;
    drawGlyph(x + 16 + r, cy, r);
    text(ctx, label, x + 24 + r * 2, cy, '900 11px Inter, sans-serif', color, 'left', 'middle');
  }
}

// Patient parameters expanded inline (grows bottom→up, clipped to height).
function drawPatientInline(ctx, C, x, y, w, h) {
  ctx.save();
  rr(ctx, x, y, w, h, 8); ctx.clip();

  ctx.fillStyle = C.panel2;
  rr(ctx, x, y, w, h, 8); ctx.fill();
  ctx.strokeStyle = C.border; ctx.lineWidth = 1;
  rr(ctx, x, y, w, h, 8); ctx.stroke();

  const padX = 7, padY = 7;
  const cols = 2, rows = 5;
  const gapX = 5, gapY = 4;
  const cellW = (w - 2 * padX - gapX) / cols;
  const cellH = (PARAMS_H - 2 * padY - gapY * (rows - 1)) / rows;
  const baseTop = y + h - PARAMS_H;

  PATIENT_PARAMS.forEach((pp, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = x + padX + col * (cellW + gapX);
    const cy = baseTop + padY + row * (cellH + gapY);
    ctx.fillStyle = C.panel;
    rr(ctx, cx, cy, cellW, cellH, 6); ctx.fill();
    ctx.strokeStyle = C.border; ctx.lineWidth = 1;
    rr(ctx, cx, cy, cellW, cellH, 6); ctx.stroke();
    text(ctx, pp.label, cx + 7, cy + cellH / 2 - 7, 'bold 7px Inter, sans-serif', C.muted, 'left', 'middle');
    const vs = Number.isInteger(pp.value) ? String(pp.value) : pp.value.toFixed(1);
    text(ctx, vs, cx + 7, cy + cellH / 2 + 7, '800 12px monospace', C.text, 'left', 'middle');
    const vw = ctx.measureText(vs).width;
    text(ctx, pp.unit, cx + 10 + vw, cy + cellH / 2 + 8, '6px Inter, sans-serif', C.muted, 'left', 'middle');
  });

  ctx.restore();
}

export default function ScreenDisplay({ width = 1.6, height = 1.0 }) {
  const { gl } = useThree();

  const canvas = useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = DW * SS;
    cv.height = DH * SS;
    return cv;
  }, []);

  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = gl.capabilities.getMaxAnisotropy();
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    return t;
  }, [canvas, gl]);

  const stateRef = useMemo(() => ({
    current: {
      time: 0,
      breathTime: 0.02,
      currentVolume: 0,
      filteredPressure: 5.0,
      filteredFlow: 0.0,
      pressureBuffer: new Array(200).fill(5.0),
      flowBuffer: new Array(200).fill(0.0),
      volumeBuffer: new Array(200).fill(0.0),
      patientAnim: 0,
    },
  }), []);

  // 50 Hz physics loop — driven by live store params
  useEffect(() => {
    const tick = () => {
      const store = useRespiratorStore.getState();
      if (store.paused) return;

      const state = stateRef.current;
      const p = store.params;
      const ipap = p.ipap;
      const peep = p.epap;
      const T = 60 / p.rr;
      const Ti = Math.min(p.ti, 0.9 * T);

      const dt = 0.02;
      const R = 12.0;
      const C_lung = 0.04;
      const Rin = 1.0;
      const Rout = 8.0;

      const tC = state.time % T;
      const tB = state.breathTime;

      const getDerivative = (tcVal, tbVal, vol) => {
        const isInspiration = tcVal < Ti;
        const pin = isInspiration ? ipap : peep;
        const tBreathCycle = tbVal % 4.0;
        let pm = 0;
        if (tBreathCycle < 1.0) {
          const fv = 60 / 4.0;
          const p01 = 2.0;
          const Pmax = p01 / (1 - Math.exp(-(0.1 * (fv + 4 * p01)) / 10));
          pm = Pmax * Math.sin((Math.PI * tBreathCycle) / 1.0) ** 2;
        }
        const denom = (1 / R + 1 / Rin + 1 / Rout);
        const Pp = (vol / (R * C_lung) + pin / Rin - pm / R) / denom;
        const Iout = Pp / Rout;
        const Iin = (pin - Pp) / Rin;
        return { dV: Iin - Iout, Pp, pm };
      };

      const V0 = state.currentVolume;
      const k1 = getDerivative(tC, tB, V0).dV;
      const k2 = getDerivative(tC + dt / 2, tB + dt / 2, V0 + k1 * dt / 2).dV;
      const k3 = getDerivative(tC + dt / 2, tB + dt / 2, V0 + k2 * dt / 2).dV;
      const k4 = getDerivative(tC + dt, tB + dt, V0 + k3 * dt).dV;

      const V_new = Math.max(0, V0 + (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4));
      state.currentVolume = V_new;

      const finalRes = getDerivative(tC + dt, tB + dt, V_new);
      state.time += dt;
      state.breathTime += dt;

      const rawDisplayPressure = finalRes.Pp - finalRes.pm * 0.3;
      const noise = (Math.random() - 0.5) * 0.015;
      const rawFlow = finalRes.dV + noise;

      const alpha = 0.25;
      state.filteredPressure = alpha * rawDisplayPressure + (1 - alpha) * state.filteredPressure;
      state.filteredFlow = alpha * rawFlow + (1 - alpha) * state.filteredFlow;

      state.pressureBuffer.push(Math.max(0, state.filteredPressure));
      state.flowBuffer.push(state.filteredFlow * 60.0);
      state.volumeBuffer.push(state.currentVolume * 1000.0);

      if (state.pressureBuffer.length > 200) {
        state.pressureBuffer.shift();
        state.flowBuffer.shift();
        state.volumeBuffer.shift();
      }
    };

    const interval = setInterval(tick, 20);
    return () => clearInterval(interval);
  }, [stateRef]);

  // Paint the whole UI to the canvas every frame
  useFrame(() => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const state = stateRef.current;
    const store = useRespiratorStore.getState();
    const p = store.params;
    const selected = store.selected;
    const paused = store.paused;
    const mode = store.mode;
    const dark = store.dark;
    const C = dark ? THEMES.dark : THEMES.light;
    const fmt = (key, v) => v.toFixed(PARAM_META[key].decimals);

    ctx.setTransform(SS, 0, 0, SS, 0, 0);
    ctx.save();

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, DW, DH);

    /* ── STATUS BAR ── */
    const sbY = PADY + 4;
    if (logoReady) {
      const bw = 26, bh = 26, bx = INX, by = sbY - 1;
      const ar = LOGO_SRC.w / LOGO_SRC.h;
      const dw = ar > 1 ? bw : bh * ar;
      const dh = ar > 1 ? bw / ar : bh;
      ctx.drawImage(logoImg, LOGO_SRC.x, LOGO_SRC.y, LOGO_SRC.w, LOGO_SRC.h,
        bx + (bw - dw) / 2, by + (bh - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = C.accent;
      rr(ctx, INX, sbY + 2, 22, 22, 5); ctx.fill();
    }
    text(ctx, 'SYMULATOR', INX + 34, sbY + 9, '900 13px Inter, sans-serif', C.heading, 'left', 'middle');
    text(ctx, 'PulmoFlow', INX + 34, sbY + 21, 'bold 8px Inter, sans-serif', C.accent, 'left', 'middle');

    // theme toggle button (☀ in dark, ☾ in light)
    ctx.strokeStyle = C.border; ctx.lineWidth = 1;
    ctx.fillStyle = C.panel;
    ctx.beginPath(); ctx.arc(INX + INW - 13, sbY + 13, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    text(ctx, dark ? '☀' : '☾', INX + INW - 13, sbY + 14, '13px Inter, sans-serif',
      dark ? C.orange : C.moon, 'center', 'middle');

    ctx.strokeStyle = C.border;
    ctx.beginPath();
    ctx.moveTo(INX, PADY + STATUS_H + 4);
    ctx.lineTo(INX + INW, PADY + STATUS_H + 4);
    ctx.stroke();

    /* ── LEFT PANEL ── */
    drawPanel(ctx, C, LEFT_X, BODY_Y, LEFT_W, BODY_H);
    text(ctx, 'TRYB WENTYLACJI', LEFT_X + LEFT_W / 2, BODY_Y + 18, 'bold 8px Inter, sans-serif', C.muted, 'center', 'middle');
    text(ctx, mode, LEFT_X + LEFT_W / 2, BODY_Y + 34, '900 16px Inter, sans-serif', C.accent, 'center', 'middle');

    const cards = [
      { key: 'ipap', value: fmt('ipap', p.ipap), unit: 'cmH₂O' },
      { key: 'epap', value: fmt('epap', p.epap), unit: 'cmH₂O' },
      { key: 'rr', value: fmt('rr', p.rr), unit: '/min' },
      { key: 'ti', value: fmt('ti', p.ti), unit: 's' },
      { key: 'trigger', value: fmt('trigger', p.trigger), unit: 'cmH₂O' },
      { key: 'vt', value: fmt('vt', p.vt), unit: 'mL' },
    ];
    cards.forEach((card, i) => {
      const r = cardRect(i);
      const active = card.key === selected;
      const label = PARAM_META[card.key].label;
      if (active) {
        ctx.fillStyle = rgba(C.accent, 0.10);
        rr(ctx, r.x, r.y, r.w, r.h, 8); ctx.fill();
        ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5;
        rr(ctx, r.x, r.y, r.w, r.h, 8); ctx.stroke();
        ctx.fillStyle = C.accent;
        ctx.beginPath();
        ctx.moveTo(r.x - 5, r.y + r.h / 2);
        ctx.lineTo(r.x, r.y + r.h / 2 - 5);
        ctx.lineTo(r.x, r.y + r.h / 2 + 5);
        ctx.closePath(); ctx.fill();
      } else {
        ctx.fillStyle = C.panel;
        rr(ctx, r.x, r.y, r.w, r.h, 8); ctx.fill();
        ctx.strokeStyle = C.border; ctx.lineWidth = 1;
        rr(ctx, r.x, r.y, r.w, r.h, 8); ctx.stroke();
      }
      text(ctx, label, r.x + 10, r.y + r.h / 2 - 8, 'bold 8px Inter, sans-serif', active ? C.accent : C.muted, 'left', 'middle');
      text(ctx, card.value, r.x + 10, r.y + r.h / 2 + 8, `800 ${active ? 20 : 18}px monospace`, active ? C.heading : C.text, 'left', 'middle');
      const vw = ctx.measureText(card.value).width;
      text(ctx, card.unit, r.x + 14 + vw, r.y + r.h / 2 + 10, '8px Inter, sans-serif', C.muted, 'left', 'middle');
    });

    /* ── CENTER PANEL: 3 charts ── */
    const chartCount = 3;
    const chartGap = 10;
    const chartH = (BODY_H - chartGap * (chartCount - 1)) / chartCount;
    const charts = [
      { title: 'CIŚNIENIE', unit: 'cmH₂O', buf: state.pressureBuffer, color: C.orange, min: 0, max: 30, sym: false,
        refs: [{ val: p.epap, color: C.green }, { val: p.ipap, color: C.red }], ticks: [0, 5, 10, 15, 20, 25, 30] },
      { title: 'PRZEPŁYW', unit: 'L/min', buf: state.flowBuffer, color: C.green, min: -80, max: 80, sym: true,
        refs: [{ val: 0, color: C.axis }], ticks: [-80, -40, 0, 40, 80] },
      { title: 'OBJĘTOŚĆ', unit: 'mL', buf: state.volumeBuffer, color: C.cyan, min: 0, max: 1000, sym: false,
        refs: [{ val: p.vt, color: C.refGreen }], ticks: [0, 250, 500, 750, 1000] },
    ];
    charts.forEach((ch, i) => {
      const y = BODY_Y + i * (chartH + chartGap);
      drawPanel(ctx, C, CENTER_X, y, CENTER_W, chartH);
      text(ctx, ch.title, CENTER_X + 12, y + 14, 'bold 9px Inter, sans-serif', C.muted, 'left', 'middle');
      text(ctx, ch.unit, CENTER_X + CENTER_W - 12, y + 14, 'bold 9px monospace', C.accent, 'right', 'middle');
      drawChart(ctx, C, CENTER_X + 8, y + 24, CENTER_W - 16, chartH - 32, ch.buf, ch.color, ch.min, ch.max, ch.sym, ch.refs, ch.ticks);
    });

    /* ── RIGHT PANEL ── */
    drawPanel(ctx, C, RIGHT_X, BODY_Y, RIGHT_W, BODY_H);
    ctx.fillStyle = C.green;
    ctx.beginPath(); ctx.arc(RPX + 4, BODY_Y + 16, 3.5, 0, Math.PI * 2); ctx.fill();
    text(ctx, 'Połączono', RPX + 12, BODY_Y + 17, 'bold 10px Inter, sans-serif', C.green, 'left', 'middle');
    text(ctx, 'www.pulmoflow', RIGHT_X + RIGHT_W - 10, BODY_Y + 17, '10px Inter, sans-serif', C.muted, 'right', 'middle');

    let ry = BODY_Y + 30;
    ctx.fillStyle = rgba(C.text, 0.05);
    rr(ctx, RPX, ry, RPW, 34, 8); ctx.fill();
    ctx.strokeStyle = rgba(C.text, 0.08); ctx.lineWidth = 1;
    rr(ctx, RPX, ry, RPW, 34, 8); ctx.stroke();
    text(ctx, 'SCENARIUSZ', RPX + 10, ry + 12, 'bold 8px Inter, sans-serif', C.muted, 'left', 'middle');
    text(ctx, 'Free Practice', RPX + 10, ry + 24, 'bold 13px Inter, sans-serif', C.heading, 'left', 'middle');

    ry += 42;
    ctx.fillStyle = rgba(C.text, 0.03);
    rr(ctx, RPX, ry, RPW, 28, 8); ctx.fill();
    ctx.strokeStyle = rgba(C.text, 0.08);
    rr(ctx, RPX, ry, RPW, 28, 8); ctx.stroke();
    text(ctx, 'POZIOM', RPX + 10, ry + 14, 'bold 8px Inter, sans-serif', C.muted, 'left', 'middle');
    [C.green, C.green, C.axis].forEach((col, k) => {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(RPX + RPW - 64 + k * 12, ry + 14, 3.5, 0, Math.PI * 2); ctx.fill();
    });
    text(ctx, 'Łatwy', RPX + RPW - 10, ry + 14, 'bold 11px Inter, sans-serif', C.green, 'right', 'middle');

    // SYNCHRONIA + inline patient panel (expands up from the button)
    const anim = state.patientAnim = (state.patientAnim ?? 0)
      + ((store.patientOpen ? 1 : 0) - (state.patientAnim ?? 0)) * 0.25;
    const ph = anim * PARAMS_H;
    const paramsTop = PARAMS_BOTTOM - ph;
    const syncBottom = ph > 1 ? paramsTop - 8 : PARAMS_BOTTOM;
    drawSync(ctx, C, RPX, SYNC_TOP, RPW, syncBottom - SYNC_TOP, paused);
    if (ph > 1) drawPatientInline(ctx, C, RPX, paramsTop, RPW, ph);

    // PARAMETRY PACJENTA
    const pOpen = store.patientOpen;
    ctx.fillStyle = pOpen ? rgba(C.accent, 0.12) : rgba(C.text, 0.05);
    rr(ctx, RPX, BTN_PARAM_Y, RPW, 24, 8); ctx.fill();
    ctx.strokeStyle = pOpen ? rgba(C.accent, 0.4) : rgba(C.text, 0.08);
    rr(ctx, RPX, BTN_PARAM_Y, RPW, 24, 8); ctx.stroke();
    text(ctx, `PARAMETRY PACJENTA ${pOpen ? '▴' : '▾'}`, RIGHT_X + RIGHT_W / 2, BTN_PARAM_Y + 13, 'bold 10px Inter, sans-serif', pOpen ? C.accent : C.muted, 'center', 'middle');

    // PAUZA / WZNÓW
    const pc = paused ? C.green : C.orange;
    ctx.fillStyle = rgba(pc, 0.15);
    rr(ctx, PAUSE_RECT.x, PAUSE_RECT.y, PAUSE_RECT.w, PAUSE_RECT.h, 8); ctx.fill();
    ctx.strokeStyle = rgba(pc, 0.35);
    rr(ctx, PAUSE_RECT.x, PAUSE_RECT.y, PAUSE_RECT.w, PAUSE_RECT.h, 8); ctx.stroke();
    text(ctx, paused ? '▶  WZNÓW' : '❚❚ PAUZA', PAUSE_RECT.x + PAUSE_RECT.w / 2, PAUSE_RECT.y + 13, 'bold 10px Inter, sans-serif', pc, 'center', 'middle');

    // RESET
    ctx.fillStyle = rgba(C.red, 0.15);
    rr(ctx, RESET_RECT.x, RESET_RECT.y, RESET_RECT.w, RESET_RECT.h, 8); ctx.fill();
    ctx.strokeStyle = rgba(C.red, 0.35);
    rr(ctx, RESET_RECT.x, RESET_RECT.y, RESET_RECT.w, RESET_RECT.h, 8); ctx.stroke();
    text(ctx, 'RESET', RESET_RECT.x + RESET_RECT.w / 2, RESET_RECT.y + 13, 'bold 10px Inter, sans-serif', C.red, 'center', 'middle');

    ctx.restore();
    texture.needsUpdate = true;
  });

  // Click handling: raycast UV → design space → hit-test
  const onScreenClick = (e) => {
    if (!e.uv) return;
    e.stopPropagation();
    const x = e.uv.x * DW;
    const y = (1 - e.uv.y) * DH;
    const store = useRespiratorStore.getState();

    if (hit(THEME_RECT, x, y)) { store.toggleTheme(); return; }
    if (hit(PARAM_BTN_RECT, x, y)) { store.togglePatient(); return; }
    if (hit(PAUSE_RECT, x, y)) { store.togglePause(); return; }
    if (hit(RESET_RECT, x, y)) { store.reset(); return; }
    for (let i = 0; i < SELECTABLE.length; i++) {
      if (hit(cardRect(i), x, y)) { store.selectParam(SELECTABLE[i]); return; }
    }
  };

  return (
    <mesh onClick={onScreenClick}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}
