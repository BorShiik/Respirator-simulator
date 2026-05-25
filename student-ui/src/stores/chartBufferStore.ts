/**
 * Module-level chart buffer store with Smooth Playback Queue.
 */

const BUFFER_SIZE = 500; // 10 seconds at 50Hz
const SAMPLE_RATE = 50; // 50Hz
const POINTS_PER_MS = SAMPLE_RATE / 1000;

export const chartBuffers = {
  pressure: Array(BUFFER_SIZE).fill(5) as number[], // default PEEP = 5
  flow: Array(BUFFER_SIZE).fill(0) as number[],
  volume: Array(BUFFER_SIZE).fill(0) as number[],
};

let playbackIndex = BUFFER_SIZE - 1;

export function getPlaybackIndex() {
  return playbackIndex;
}

export function pushChartData(pressure: number[], flow: number[], volume: number[]) {
  chartBuffers.pressure.push(...pressure);
  chartBuffers.flow.push(...flow);
  chartBuffers.volume.push(...volume);

  const MAX_HISTORY = 2000;
  if (chartBuffers.pressure.length > MAX_HISTORY) {
    const overflow = chartBuffers.pressure.length - MAX_HISTORY;
    chartBuffers.pressure.splice(0, overflow);
    chartBuffers.flow.splice(0, overflow);
    chartBuffers.volume.splice(0, overflow);
    playbackIndex -= overflow;
  }
}

export function resetChartBuffers() {
  chartBuffers.pressure = Array(BUFFER_SIZE).fill(5);
  chartBuffers.flow = Array(BUFFER_SIZE).fill(0);
  chartBuffers.volume = Array(BUFFER_SIZE).fill(0);
  playbackIndex = BUFFER_SIZE - 1;
  lastFrameTime = performance.now();
}

let lastFrameTime = performance.now();
let rafId: number | null = null;

function updatePlayback() {
  const now = performance.now();
  const dt = Math.min(now - lastFrameTime, 100); // cap dt at 100ms to prevent massive jumps if tab was inactive
  lastFrameTime = now;

  const currentLength = chartBuffers.pressure.length;
  // How many points are in the buffer that have been received but not yet played back
  const currentDepth = currentLength - 1 - playbackIndex;

  // Target buffer depth: 8 points (160ms of data)
  const targetDepth = 8;
  const error = currentDepth - targetDepth;

  // Proportional control: speed up if we have too much data, slow down if running out
  const dynamicRate = Math.max(0.01, POINTS_PER_MS + (error * 0.002));

  playbackIndex += dt * dynamicRate;

  // Clamps
  if (playbackIndex > currentLength - 1) {
    playbackIndex = currentLength - 1;
  }
  if (playbackIndex < 0) {
    playbackIndex = 0;
  }

  rafId = requestAnimationFrame(updatePlayback);
}

// Start loop
if (rafId !== null) cancelAnimationFrame(rafId);
rafId = requestAnimationFrame(updatePlayback);

