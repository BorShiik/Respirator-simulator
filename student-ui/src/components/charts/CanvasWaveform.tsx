import { useRef, useEffect, useCallback } from 'react';

interface ReferenceLineConfig {
  y: number;
  color: string;
  dashed?: boolean;
}

interface CanvasWaveformProps {
  /** Initial data source reference (not used for drawing, just for type) */
  dataSource?: number[];
  /** Getter that returns live data array — called every frame, bypasses React */
  getDataSource: () => number[];
  bufferSize: number;
  color: string;
  label: string;
  unit: string;
  isDark?: boolean;
  referenceLines?: ReferenceLineConfig[];
  yDomain?: [number, number];
  symmetric?: boolean;
}

export function CanvasWaveform({
  getDataSource,
  bufferSize,
  color,
  label,
  unit,
  isDark = false,
  referenceLines = [],
  yDomain: fixedYDomain,
  symmetric = false,
}: CanvasWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const prevDimRef = useRef({ w: 0, h: 0 });

  // Store stable refs for values that change
  const colorRef = useRef(color);
  const isDarkRef = useRef(isDark);
  const refLinesRef = useRef(referenceLines);
  const fixedYDomainRef = useRef(fixedYDomain);
  const symmetricRef = useRef(symmetric);
  const getDataSourceRef = useRef(getDataSource);

  colorRef.current = color;
  isDarkRef.current = isDark;
  refLinesRef.current = referenceLines;
  fixedYDomainRef.current = fixedYDomain;
  symmetricRef.current = symmetric;
  getDataSourceRef.current = getDataSource;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;

    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);

    if (w <= 0 || h <= 0) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    if (prevDimRef.current.w !== w || prevDimRef.current.h !== h) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      prevDimRef.current = { w, h };
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const dark = isDarkRef.current;
    const bgColor = dark ? '#0f172a' : '#ffffff';
    const gridColor = dark ? '#1e293b' : '#e2e8f0';
    const axisColor = dark ? '#334155' : '#cbd5e1';
    const tickColor = dark ? '#94a3b8' : '#64748b';

    const MARGIN_LEFT = 45;
    const MARGIN_RIGHT = 10;
    const MARGIN_TOP = 5;
    const MARGIN_BOTTOM = 5;
    const plotW = w - MARGIN_LEFT - MARGIN_RIGHT;
    const plotH = h - MARGIN_TOP - MARGIN_BOTTOM;

    // Clear
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    // Read live data directly from the shared store (NO React involved)
    const values = getDataSourceRef.current();

    // Calculate Y domain
    let yMin: number, yMax: number;
    const fyd = fixedYDomainRef.current;
    if (fyd) {
      [yMin, yMax] = fyd;
    } else {
      let minVal = Infinity, maxVal = -Infinity;
      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (v != null && !isNaN(v)) {
          if (v < minVal) minVal = v;
          if (v > maxVal) maxVal = v;
        }
      }
      if (minVal === Infinity) {
        yMin = symmetricRef.current ? -60 : 0;
        yMax = symmetricRef.current ? 60 : 20;
      } else if (symmetricRef.current) {
        const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal));
        const rounded = Math.ceil(absMax / 15) * 15 + 10;
        yMin = -rounded;
        yMax = rounded;
      } else {
        yMin = Math.floor(minVal / 5) * 5 - 2;
        yMax = Math.ceil(maxVal / 5) * 5 + 2;
      }
    }

    const yRange = yMax - yMin || 1;
    const xScale = plotW / (bufferSize - 1);
    const yScale = plotH / yRange;

    // Grid — compute nice round tick values
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillStyle = tickColor;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    // Calculate nice tick step (multiples of 1, 2, 5, 10, 20, 25, 50, 100...)
    const targetTickCount = 6;
    const rawStep = yRange / targetTickCount;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const residual = rawStep / magnitude;
    let niceStep: number;
    if (residual <= 1.5) niceStep = 1 * magnitude;
    else if (residual <= 3) niceStep = 2 * magnitude;
    else if (residual <= 7) niceStep = 5 * magnitude;
    else niceStep = 10 * magnitude;

    const tickStart = Math.ceil(yMin / niceStep) * niceStep;
    for (let val = tickStart; val <= yMax; val += niceStep) {
      const y = MARGIN_TOP + (1 - (val - yMin) / yRange) * plotH;
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.moveTo(MARGIN_LEFT, y);
      ctx.lineTo(w - MARGIN_RIGHT, y);
      ctx.stroke();
      ctx.fillText(Math.round(val).toString(), MARGIN_LEFT - 6, y);
    }
    ctx.setLineDash([]);

    // Axis lines
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGIN_LEFT, MARGIN_TOP);
    ctx.lineTo(MARGIN_LEFT, h - MARGIN_BOTTOM);
    ctx.lineTo(w - MARGIN_RIGHT, h - MARGIN_BOTTOM);
    ctx.stroke();

    // Reference lines
    const rlines = refLinesRef.current;
    for (let r = 0; r < rlines.length; r++) {
      const rl = rlines[r];
      if (rl.y >= yMin && rl.y <= yMax) {
        const ry = MARGIN_TOP + (1 - (rl.y - yMin) / yRange) * plotH;
        ctx.strokeStyle = rl.color;
        ctx.lineWidth = 1;
        if (rl.dashed !== false) ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(MARGIN_LEFT, ry);
        ctx.lineTo(w - MARGIN_RIGHT, ry);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Waveform — clip to plot area so out-of-range values don't overflow
    ctx.save();
    ctx.beginPath();
    ctx.rect(MARGIN_LEFT, MARGIN_TOP, plotW, plotH);
    ctx.clip();

    if (values.length > 0) {
      ctx.strokeStyle = colorRef.current;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();

      const startIdx = Math.max(0, bufferSize - values.length);
      let moved = false;

      for (let i = 0; i < values.length; i++) {
        const val = values[i];
        if (val == null || isNaN(val)) {
          moved = false;
          continue;
        }
        const x = MARGIN_LEFT + (startIdx + i) * xScale;
        const y = MARGIN_TOP + (1 - (val - yMin) / yRange) * plotH;

        if (!moved) {
          ctx.moveTo(x, y);
          moved = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    ctx.restore();

    rafRef.current = requestAnimationFrame(draw);
  }, [bufferSize]); // Only bufferSize — everything else via refs

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  return (
    <div ref={containerRef} className="chart-container h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-2 h-6 shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: isDark ? '#94a3b8' : '#64748b' }}>
          {label}
        </span>
        <span className="text-xs font-mono" style={{ color: 'var(--color-accent, #3b82f6)' }}>
          {unit}
        </span>
      </div>
      <div className="flex-1 min-h-0 relative">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      </div>
    </div>
  );
}

export default CanvasWaveform;
