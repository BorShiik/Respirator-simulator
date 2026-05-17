/**
 * Module-level chart buffer store with Smooth Playback Queue.
 */

const BUFFER_SIZE = 500; // 10 seconds at 50Hz
const SAMPLE_RATE = 50; // 50Hz
const POINTS_PER_MS = SAMPLE_RATE / 1000;

export const chartBuffers = {
  pressure: [] as number[],
  flow: [] as number[],
  volume: [] as number[],
};

// Queue for incoming data from WebSocket (bursts of 5 points every 100ms)
const queues = {
  pressure: [] as number[],
  flow: [] as number[],
  volume: [] as number[],
};

export function pushChartData(pressure: number[], flow: number[], volume: number[]) {
  queues.pressure.push(...pressure);
  queues.flow.push(...flow);
  queues.volume.push(...volume);
}

export function resetChartBuffers() {
  chartBuffers.pressure = [];
  chartBuffers.flow = [];
  chartBuffers.volume = [];
  queues.pressure = [];
  queues.flow = [];
  queues.volume = [];
}

let lastFrameTime = performance.now();
let fractionalPoints = 0;
let rafId: number | null = null;

function drainQueue() {
  const now = performance.now();
  const dt = Math.min(now - lastFrameTime, 100); // cap dt at 100ms to prevent massive jumps if tab was inactive
  lastFrameTime = now;

  // We expect a base rate of 50Hz (0.05 points per ms)
  // But backend Node.js setInterval(20ms) is imprecise and network adds jitter.
  // So we dynamically adjust our playback speed based on how full our queue is.
  // Target buffer depth: 10 points (200ms of data)
  const targetDepth = 10;
  const currentDepth = queues.pressure.length;
  
  // Proportional control: if depth > target, speed up. If < target, slow down.
  const error = currentDepth - targetDepth;
  const dynamicRate = Math.max(0.01, POINTS_PER_MS + (error * 0.002));
  
  fractionalPoints += dt * dynamicRate;

  let pointsToDrain = Math.floor(fractionalPoints);

  if (pointsToDrain > 0 && currentDepth > 0) {
    fractionalPoints -= pointsToDrain;
    
    // Safety clamp
    const count = Math.min(pointsToDrain, currentDepth);
    
    const p = chartBuffers.pressure.concat(queues.pressure.splice(0, count));
    chartBuffers.pressure = p.length > BUFFER_SIZE ? p.slice(p.length - BUFFER_SIZE) : p;

    const f = chartBuffers.flow.concat(queues.flow.splice(0, count));
    chartBuffers.flow = f.length > BUFFER_SIZE ? f.slice(f.length - BUFFER_SIZE) : f;

    const v = chartBuffers.volume.concat(queues.volume.splice(0, count));
    chartBuffers.volume = v.length > BUFFER_SIZE ? v.slice(v.length - BUFFER_SIZE) : v;
  }

  rafId = requestAnimationFrame(drainQueue);
}

// Start loop
if (rafId !== null) cancelAnimationFrame(rafId);
rafId = requestAnimationFrame(drainQueue);

