import React, { useEffect, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useRespiratorStore } from './store';

/**
 * ScreenDisplay Component
 * 
 * Renders a pixel-perfect, high-fidelity clone of the real student UI screen 
 * matching the user's provided screenshot.
 * 
 * Spacing, grid layout, fonts, colors, and visual styles are aligned:
 *   - Dark Slate/Blue colors: #0F172A (bg), #1E293B (cards), #334155 (borders)
 *   - Left Panel: Parameter cards with correct labels, values, and units.
 *   - Center Panel: Stacked charts with dotted grids, Y-axis labels, limit lines.
 *   - Right Panel: Connection status, Scenariusz/Poziom indicators, green Synchronia ring, action buttons.
 *   - Local 50Hz RC model physics engine (RK4 integration) responding to the dial knob.
 */
export default function ScreenDisplay() {
  const mode = useRespiratorStore((state) => state.mode);
  const inspiratoryPressure = useRespiratorStore((state) => state.inspiratoryPressure);

  // References to canvas elements
  const canvasPressureRef = useRef(null);
  const canvasFlowRef = useRef(null);
  const canvasVolumeRef = useRef(null);

  // Simulation physics state
  const stateRef = useRef({
    time: 0,
    breathTime: 0.02,
    currentVolume: 0,
    filteredPressure: 5.0,
    filteredFlow: 0.0,

    // Buffers to hold 200 samples (4 seconds at 50Hz)
    pressureBuffer: new Array(200).fill(5.0),
    flowBuffer: new Array(200).fill(0.0),
    volumeBuffer: new Array(200).fill(0.0),
  });

  // 1. 50Hz Physics Loop (Euler + RK4 Solver of the dual-parameter RC lung model)
  useEffect(() => {
    const tick = () => {
      const state = stateRef.current;
      // Get the live value of the knob-controlled inspiratory pressure from Zustand
      const ipap = useRespiratorStore.getState().inspiratoryPressure;

      const dt = 0.02; // 50 Hz
      const R = 12.0;  // Airway Resistance
      const C = 0.04;  // Compliance (40 mL/cmH2O -> 0.04 L/cmH2O)
      const Rin = 1.0; // Inhalation valve resistance
      const Rout = 8.0; // Exhalation valve resistance
      
      const T = 4.0;   // Inhalation period (60s / 15 RR = 4.0s)
      const Ti = 1.0;  // Inspiratory time = 1.0s

      const tC = state.time % T;
      const tB = state.breathTime;

      // Physics equation derivatives
      const getDerivative = (tcVal, tbVal, vol) => {
        const isInspiration = tcVal < Ti;
        const pin = isInspiration ? ipap : 5.0; // PEEP = 5.0 cmH2O
        
        // Spontaneous breathing effort (Pmus)
        const tBreathCycle = tbVal % 4.0; // 15 breaths per minute cycle
        let pm = 0;
        if (tBreathCycle < 1.0) { // Neural Ti = 1.0s
          const fv = 60 / 4.0;
          const p01 = 2.0;
          // Calculate max diaphragm pressure curve (sine squared)
          const Pmax = p01 / (1 - Math.exp(-(0.1 * (fv + 4 * p01)) / 10));
          pm = Pmax * Math.sin((Math.PI * tBreathCycle) / 1.0) ** 2;
        }

        const denom = (1 / R + 1 / Rin + 1 / Rout);
        const Pp = (vol / (R * C) + pin / Rin - pm / R) / denom;
        const Iout = Pp / Rout;
        const Iin = (pin - Pp) / Rin;
        
        return { dV: Iin - Iout, Pp, pm };
      };

      // RK4 numerical integration for volume
      const V0 = state.currentVolume;
      const res1 = getDerivative(tC, tB, V0);
      const k1 = res1.dV;

      const res2 = getDerivative(tC + dt / 2, tB + dt / 2, V0 + k1 * dt / 2);
      const k2 = res2.dV;

      const res3 = getDerivative(tC + dt / 2, tB + dt / 2, V0 + k2 * dt / 2);
      const k3 = res3.dV;

      const res4 = getDerivative(tC + dt, tB + dt, V0 + k3 * dt);
      const k4 = res4.dV;

      const V_new = Math.max(0, V0 + (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4));
      state.currentVolume = V_new;

      const finalRes = getDerivative(tC + dt, tB + dt, V_new);
      const Pp_new = finalRes.Pp;
      const dV_new = finalRes.dV;
      const pm_new = finalRes.pm;

      state.time += dt;
      state.breathTime += dt;

      // display pressure: alveolar pressure minus muscle effort dip (servo impedance)
      const rawDisplayPressure = Pp_new - pm_new * 0.3;
      const noise = (Math.random() - 0.5) * 0.015;
      const rawFlow = dV_new + noise;

      // Exponential moving average filter for smooth display
      const alpha = 0.25;
      state.filteredPressure = alpha * rawDisplayPressure + (1 - alpha) * state.filteredPressure;
      state.filteredFlow = alpha * rawFlow + (1 - alpha) * state.filteredFlow;

      const finalPressure = Math.max(0, state.filteredPressure);
      const finalFlow = state.filteredFlow * 60.0; // L/s -> L/min
      const finalVolume = state.currentVolume * 1000.0; // L -> mL

      // Push to buffers
      state.pressureBuffer.push(finalPressure);
      state.flowBuffer.push(finalFlow);
      state.volumeBuffer.push(finalVolume);

      if (state.pressureBuffer.length > 200) {
        state.pressureBuffer.shift();
        state.flowBuffer.shift();
        state.volumeBuffer.shift();
      }
    };

    const interval = setInterval(tick, 20); // 50 Hz
    return () => clearInterval(interval);
  }, []);

  // 2. 60 FPS Drawing Loop (Canvas Drawing in requestAnimationFrame)
  useEffect(() => {
    let animId;

    const draw = () => {
      const state = stateRef.current;

      const drawChart = (canvas, data, color, minVal, maxVal, isSymmetric, refLines = [], ticks = []) => {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = canvas.clientWidth;
        const h = canvas.clientHeight;

        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }

        ctx.clearRect(0, 0, w, h);

        // Fill background
        ctx.fillStyle = '#111827'; // Slate-900 matching card background
        ctx.fillRect(0, 0, w, h);

        const MARGIN_LEFT = 40;
        const MARGIN_RIGHT = 10;
        const MARGIN_TOP = 8;
        const MARGIN_BOTTOM = 8;
        const plotW = w - MARGIN_LEFT - MARGIN_RIGHT;
        const plotH = h - MARGIN_TOP - MARGIN_BOTTOM;

        // Draw dotted gridlines and Y-axis tick labels
        ctx.strokeStyle = '#1e293b'; // Grid color
        ctx.lineWidth = 0.8;
        ctx.font = '8px Inter, sans-serif';
        ctx.fillStyle = '#94a3b8'; // Tick text color
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        ticks.forEach((tickVal) => {
          let ry;
          if (isSymmetric) {
            ry = MARGIN_TOP + plotH / 2 - (tickVal / maxVal) * (plotH / 2);
          } else {
            ry = MARGIN_TOP + plotH - ((tickVal - minVal) / (maxVal - minVal)) * plotH;
          }
          
          // Draw grid line
          ctx.strokeStyle = '#1e293b';
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(MARGIN_LEFT, ry);
          ctx.lineTo(w - MARGIN_RIGHT, ry);
          ctx.stroke();

          // Draw text label
          ctx.fillText(tickVal.toString(), MARGIN_LEFT - 6, ry);
        });
        ctx.setLineDash([]);

        // Draw Reference lines
        refLines.forEach((ref) => {
          let ry;
          if (isSymmetric) {
            ry = MARGIN_TOP + plotH / 2 - (ref.val / maxVal) * (plotH / 2);
          } else {
            ry = MARGIN_TOP + plotH - ((ref.val - minVal) / (maxVal - minVal)) * plotH;
          }
          ctx.strokeStyle = ref.color;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(MARGIN_LEFT, ry);
          ctx.lineTo(w - MARGIN_RIGHT, ry);
          ctx.stroke();
        });
        ctx.setLineDash([]);

        // Draw Waveform Line
        if (data.length > 0) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.8;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();

          for (let i = 0; i < data.length; i++) {
            const x = MARGIN_LEFT + (i / (data.length - 1)) * plotW;
            const val = data[i];
            let y;
            if (isSymmetric) {
              const clamped = Math.max(-maxVal, Math.min(maxVal, val));
              y = MARGIN_TOP + plotH / 2 - (clamped / maxVal) * (plotH / 2);
            } else {
              const clamped = Math.max(minVal, Math.min(maxVal, val));
              y = MARGIN_TOP + plotH - ((clamped - minVal) / (maxVal - minVal)) * plotH;
            }

            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
        }
      };

      // Draw Pressure (Orange/Yellow), Flow (Green), Volume (Cyan)
      const currentIpap = useRespiratorStore.getState().inspiratoryPressure;
      drawChart(
        canvasPressureRef.current, 
        state.pressureBuffer, 
        '#f59e0b', // Paw color
        0, 30, false, 
        [{ val: 5.0, color: '#10b981' }, { val: currentIpap, color: '#ef4444' }], // PEEP (green) & IPAP (red)
        [0, 5, 10, 15, 20, 25, 30]
      );
      
      drawChart(
        canvasFlowRef.current, 
        state.flowBuffer, 
        '#10b981', // Flow color
        -80, 80, true, 
        [{ val: 0.0, color: '#475569' }], 
        [-80, -60, -40, -20, 0, 20, 40, 60, 80]
      );
      
      drawChart(
        canvasVolumeRef.current, 
        state.volumeBuffer, 
        '#06b6d4', // Volume color
        0, 700, false, 
        [{ val: 500.0, color: '#059669' }], 
        [0, 100, 200, 300, 400, 500, 600, 700]
      );

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <Html
      transform
      scale={0.08}
      position={[0, 0, 0.005]}
    >
      <div 
        style={{
          width: '800px',
          height: '500px',
          background: '#0a0f1a', // Deep navy-black matching student-ui
          padding: '12px 16px',
          boxSizing: 'border-box',
          fontFamily: "'Inter', system-ui, sans-serif",
          color: '#e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          userSelect: 'none',
        }}
      >
        {/* TOP STATUS BAR: Simulator Title and Theme indicator */}
        <div 
          style={{
            height: '36px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #1e3a5f',
            paddingBottom: '6px',
            marginBottom: '8px',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Medical respirator logo */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 19v4M8 23h8" />
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
              <span style={{ fontSize: '13px', fontWeight: '900', letterSpacing: '1px', color: '#F8FAFC' }}>
                SYMULATOR
              </span>
              <span style={{ fontSize: '8px', color: '#3b82f6', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                PulmoFlow
              </span>
            </div>
          </div>
          
          <div 
            style={{ 
              width: '26px', 
              height: '26px', 
              borderRadius: '50%', 
              backgroundColor: '#111827', 
              border: '1px solid #1e3a5f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f59e0b',
              fontSize: '12px'
            }}
          >
            ☀
          </div>
        </div>

        {/* MAIN BODY: 3 Panels */}
        <div style={{ flex: 1, display: 'flex', gap: '12px', minHeight: 0 }}>
          
          {/* LEFT PANEL: Settings card stack */}
          <div 
            style={{
              width: '165px',
              backgroundColor: '#111827',
              border: '1px solid #1e3a5f',
              borderRadius: '10px',
              padding: '10px',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              height: '100%',
              minHeight: 0
            }}
          >
            {/* Tryb Wentylacji title */}
            <div style={{ textAlign: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                TRYB WENTYLACJI
              </div>
              <div style={{ fontSize: '16px', fontWeight: '900', color: '#3b82f6', marginTop: '1px' }}>
                {mode}
              </div>
            </div>

            {/* Parameter Cards Grid Stack */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minHeight: 0 }}>
              
              {/* Card 1: IPAP/PINSP (Active, adjustable) */}
              <div 
                style={{
                  flex: 1,
                  background: 'rgba(59, 130, 246, 0.08)',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  border: '1.5px solid #3b82f6',
                  boxShadow: '0 0 8px rgba(59, 130, 246, 0.3)',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  minHeight: 0
                }}
              >
                {/* Pointer indicator */}
                <div style={{
                  position: 'absolute',
                  left: '-5px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '0',
                  height: '0',
                  borderTop: '5px solid transparent',
                  borderBottom: '5px solid transparent',
                  borderRight: '5px solid #3b82f6'
                }}></div>
                <div style={{ fontSize: '8px', color: '#3b82f6', fontWeight: 'bold', textTransform: 'uppercase' }}>
                  IPAP / PINSP
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', marginTop: '1px' }}>
                  <span style={{ fontSize: '20px', fontWeight: '900', color: '#FFFFFF', fontFamily: 'monospace' }}>
                    {Math.round(inspiratoryPressure)}
                  </span>
                  <span style={{ fontSize: '8px', color: '#94a3b8', marginLeft: '3px' }}>cmH₂O</span>
                </div>
              </div>

              {/* Card 2: EPAP / PEEP */}
              <div 
                style={{
                  flex: 1,
                  background: '#111827',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  border: '1px solid #1e3a5f',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  minHeight: 0
                }}
              >
                <div style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 'semibold', textTransform: 'uppercase' }}>EPAP / PEEP</div>
                <div style={{ display: 'flex', alignItems: 'baseline', marginTop: '1px' }}>
                  <span style={{ fontSize: '18px', fontWeight: '800', color: '#e2e8f0', fontFamily: 'monospace' }}>5</span>
                  <span style={{ fontSize: '8px', color: '#94a3b8', marginLeft: '3px' }}>cmH₂O</span>
                </div>
              </div>

              {/* Card 3: Częstość (RR) */}
              <div 
                style={{
                  flex: 1,
                  background: '#111827',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  border: '1px solid #1e3a5f',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  minHeight: 0
                }}
              >
                <div style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 'semibold', textTransform: 'uppercase' }}>CZĘSTOŚĆ (RR)</div>
                <div style={{ display: 'flex', alignItems: 'baseline', marginTop: '1px' }}>
                  <span style={{ fontSize: '18px', fontWeight: '800', color: '#e2e8f0', fontFamily: 'monospace' }}>15</span>
                  <span style={{ fontSize: '8px', color: '#94a3b8', marginLeft: '3px' }}>/min</span>
                </div>
              </div>

              {/* Card 4: Czas Wdechu (Ti) */}
              <div 
                style={{
                  flex: 1,
                  background: '#111827',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  border: '1px solid #1e3a5f',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  minHeight: 0
                }}
              >
                <div style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 'semibold', textTransform: 'uppercase' }}>CZAS WDECHU (TI)</div>
                <div style={{ display: 'flex', alignItems: 'baseline', marginTop: '1px' }}>
                  <span style={{ fontSize: '18px', fontWeight: '800', color: '#e2e8f0', fontFamily: 'monospace' }}>1.0</span>
                  <span style={{ fontSize: '8px', color: '#94a3b8', marginLeft: '3px' }}>s</span>
                </div>
              </div>

              {/* Card 5: Wyzwalacz */}
              <div 
                style={{
                  flex: 1,
                  background: '#111827',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  border: '1px solid #1e3a5f',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  minHeight: 0
                }}
              >
                <div style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 'semibold', textTransform: 'uppercase' }}>WYZWALACZ</div>
                <div style={{ display: 'flex', alignItems: 'baseline', marginTop: '1px' }}>
                  <span style={{ fontSize: '18px', fontWeight: '800', color: '#e2e8f0', fontFamily: 'monospace' }}>2.0</span>
                  <span style={{ fontSize: '8px', color: '#94a3b8', marginLeft: '3px' }}>cmH₂O</span>
                </div>
              </div>

              {/* Card 6: Obj. Oddechowa (VT) - Disabled / Greyed-out in PC-CMV */}
              <div 
                style={{
                  flex: 1,
                  background: '#111827',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  border: '1px solid #1e3a5f',
                  opacity: 0.35,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  minHeight: 0
                }}
              >
                <div style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 'semibold', textTransform: 'uppercase' }}>OBJ. ODDECHOWA (VT)</div>
                <div style={{ display: 'flex', alignItems: 'baseline', marginTop: '1px' }}>
                  <span style={{ fontSize: '18px', fontWeight: '800', color: '#e2e8f0', fontFamily: 'monospace' }}>500</span>
                  <span style={{ fontSize: '8px', color: '#94a3b8', marginLeft: '3px' }}>mL</span>
                </div>
              </div>

            </div>
          </div>

          {/* CENTER PANEL: Stacked Canvas Charts */}
          <div 
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              height: '100%',
              minWidth: 0,
              minHeight: 0
            }}
          >
            {/* Paw Chart */}
            <div 
              style={{ 
                flex: 1, 
                backgroundColor: '#111827',
                border: '1px solid #1e3a5f',
                borderRadius: '10px',
                padding: '8px 12px 10px 12px',
                boxSizing: 'border-box',
                display: 'flex', 
                flexDirection: 'column', 
                minHeight: 0
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '14px', flexShrink: 0 }}>
                <span style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>CIŚNIENIE</span>
                <span style={{ fontSize: '9px', color: '#3b82f6', fontFamily: 'monospace', fontWeight: 'bold' }}>cmH₂O</span>
              </div>
              <div style={{ flex: 1, position: 'relative', marginTop: '4px', minHeight: 0 }}>
                <canvas ref={canvasPressureRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'block', borderRadius: '6px' }} />
              </div>
            </div>

            {/* Flow Chart */}
            <div 
              style={{ 
                flex: 1, 
                backgroundColor: '#111827',
                border: '1px solid #1e3a5f',
                borderRadius: '10px',
                padding: '8px 12px 10px 12px',
                boxSizing: 'border-box',
                display: 'flex', 
                flexDirection: 'column', 
                minHeight: 0
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '14px', flexShrink: 0 }}>
                <span style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>PRZEPŁYW</span>
                <span style={{ fontSize: '9px', color: '#3b82f6', fontFamily: 'monospace', fontWeight: 'bold' }}>L/min</span>
              </div>
              <div style={{ flex: 1, position: 'relative', marginTop: '4px', minHeight: 0 }}>
                <canvas ref={canvasFlowRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'block', borderRadius: '6px' }} />
              </div>
            </div>

            {/* Volume Chart */}
            <div 
              style={{ 
                flex: 1, 
                backgroundColor: '#111827',
                border: '1px solid #1e3a5f',
                borderRadius: '10px',
                padding: '8px 12px 10px 12px',
                boxSizing: 'border-box',
                display: 'flex', 
                flexDirection: 'column', 
                minHeight: 0
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '14px', flexShrink: 0 }}>
                <span style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>OBJĘTOŚĆ</span>
                <span style={{ fontSize: '9px', color: '#3b82f6', fontFamily: 'monospace', fontWeight: 'bold' }}>mL</span>
              </div>
              <div style={{ flex: 1, position: 'relative', marginTop: '4px', minHeight: 0 }}>
                <canvas ref={canvasVolumeRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'block', borderRadius: '6px' }} />
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: Status info & controls */}
          <div 
            style={{
              width: '215px',
              backgroundColor: '#111827',
              border: '1px solid #1e3a5f',
              borderRadius: '10px',
              padding: '10px',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              height: '100%',
              minHeight: 0
            }}
          >
            {/* Top network row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: '#10B981', fontWeight: 'bold' }}>
                <span style={{ 
                  width: '7px', 
                  height: '7px', 
                  borderRadius: '50%', 
                  background: '#10B981', 
                  display: 'inline-block',
                  boxShadow: '0 0 6px #10B981'
                }}></span>
                Połączono
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>www.aaaaaww</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ cursor: 'pointer' }}>
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
              </div>
            </div>

            {/* Scenario block */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0, marginTop: '6px' }}>
              {/* Scenario */}
              <div 
                style={{ 
                  background: 'rgba(226, 232, 240, 0.05)', 
                  border: '1px solid rgba(226, 232, 240, 0.08)',
                  borderRadius: '8px', 
                  padding: '6px 10px' 
                }}
              >
                <div style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 'bold', letterSpacing: '0.05em' }}>SCENARIUSZ</div>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#FFFFFF', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Free Practice
                </div>
              </div>

              {/* Difficulty Level */}
              <div 
                style={{ 
                  background: 'rgba(226, 232, 240, 0.03)', 
                  border: '1px solid rgba(226, 232, 240, 0.08)',
                  borderRadius: '8px', 
                  padding: '6px 10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 'bold', letterSpacing: '0.05em' }}>POZIOM</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: '#10B981', fontSize: '10px' }}>●</span>
                  <span style={{ color: '#10B981', fontSize: '10px' }}>●</span>
                  <span style={{ color: '#475569', fontSize: '10px' }}>●</span>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#10B981', marginLeft: '2px' }}>Łatwy</span>
                </div>
              </div>
            </div>

            {/* Synchronia circle panel */}
            <div 
              style={{
                flex: 1,
                margin: '8px 0',
                background: 'rgba(16, 185, 129, 0.03)',
                border: '1px solid rgba(16, 185, 129, 0.12)',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '10px 0',
                minHeight: 0
              }}
            >
              {/* Outer double glowing ring */}
              <div 
                style={{
                  width: '74px',
                  height: '74px',
                  borderRadius: '50%',
                  border: '4px solid #10B981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 15px rgba(16, 185, 129, 0.35), inset 0 0 8px rgba(16, 185, 129, 0.15)',
                  boxSizing: 'border-box'
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', fontWeight: '900', color: '#10B981', letterSpacing: '0.5px' }}>
                  SYNCHRONIA
                </div>
                <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '1px' }}>
                  Poprawna interakcja
                </div>
              </div>
            </div>

            {/* Bottom Button Panel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flexShrink: 0 }}>
              {/* Patient Parameters Button */}
              <button 
                style={{
                  background: 'rgba(226, 232, 240, 0.05)',
                  color: '#94a3b8',
                  border: '1px solid rgba(226, 232, 240, 0.08)',
                  borderRadius: '8px',
                  padding: '6px 0',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  transition: 'background 0.2s'
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7z" />
                </svg>
                PARAMETRY PACJENTA
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              
              {/* PAUZA + RESET buttons */}
              <div style={{ display: 'flex', gap: '5px' }}>
                <button 
                  style={{
                    background: 'rgba(217, 119, 6, 0.15)',
                    color: '#f59e0b',
                    border: '1px solid rgba(217, 119, 6, 0.3)',
                    borderRadius: '8px',
                    padding: '6px 0',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    width: '65%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="4" />
                  </svg>
                  PAUZA
                </button>
                <button 
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px',
                    padding: '6px 0',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    width: '32%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                  </svg>
                  RESET
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </Html>
  );
}
