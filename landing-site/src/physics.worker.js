// src/physics.worker.js

let interval = null;
let state = {
  time: 0,
  breathTime: 0.02,
  currentVolume: 0,
  filteredPressure: 5.0,
  filteredFlow: 0.0,
};

let params = {
  ipap: 15,
  epap: 5,
  rr: 12,
  ti: 1.5,
  trigger: 2.0,
  vt: 500
};

let active = false;
let paused = false;

// We can accumulate points and send them in batches, 
// or just send the full buffer back. Sending a Float32Array is extremely fast.
let pressureBuffer = new Float32Array(200).fill(5.0);
let flowBuffer = new Float32Array(200).fill(0.0);
let volumeBuffer = new Float32Array(200).fill(0.0);
let bufferIndex = 0;
let bufferFilled = false; // whether it wrapped around

function shiftBuffers() {
  // If we want a scrolling effect, we shift the arrays.
  // Float32Array.copyWithin is very fast.
  pressureBuffer.copyWithin(0, 1, 200);
  flowBuffer.copyWithin(0, 1, 200);
  volumeBuffer.copyWithin(0, 1, 200);
}

function tick() {
  if (!active || paused) return;

  const { ipap, epap, rr, ti } = params;
  const T = 60 / rr;
  const Ti = Math.min(ti, 0.9 * T);

  const dt = 0.02; // 50 Hz
  const R = 12.0;
  const C_lung = 0.04;
  const Rin = 1.0;
  const Rout = 8.0;

  const tC = state.time % T;
  const tB = state.breathTime;

  const getDerivative = (tcVal, tbVal, vol) => {
    const isInspiration = tcVal < Ti;
    const pin = isInspiration ? ipap : epap;
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

  const finalPressure = Math.max(0, state.filteredPressure);
  const finalFlow = state.filteredFlow * 60.0;
  const finalVolume = state.currentVolume * 1000.0;

  shiftBuffers();
  const lastIdx = 199;
  pressureBuffer[lastIdx] = finalPressure;
  flowBuffer[lastIdx] = finalFlow;
  volumeBuffer[lastIdx] = finalVolume;

  // Send back the data.
  // In modern JS, postMessage of Float32Array is extremely fast. We can also transfer it if we double buffer,
  // but for 200 elements (800 bytes) standard copy is completely negligible.
  self.postMessage({
    type: 'tick',
    payload: {
      pressureBuffer,
      flowBuffer,
      volumeBuffer
    }
  });
}

self.onmessage = (e) => {
  const { type, payload } = e.data;
  if (type === 'start') {
    active = true;
    if (!interval) interval = setInterval(tick, 20);
  } else if (type === 'stop') {
    active = false;
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  } else if (type === 'params') {
    params = { ...params, ...payload };
  } else if (type === 'pause') {
    paused = payload;
  }
};
