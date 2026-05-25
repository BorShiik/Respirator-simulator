import { useRef, useEffect, useState } from 'react';

interface ReferenceLineConfig {
  y: number;
  color: string;
  dashed?: boolean;
}

interface CanvasWaveformProps {
  data: number[];
  bufferSize?: number; // Default 500
  color: string;
  label: string;
  unit: string;
  isDark?: boolean;
  referenceLines?: ReferenceLineConfig[];
  yDomain?: [number, number];
  symmetric?: boolean;
}

export function CanvasWaveform({
  data,
  bufferSize = 500,
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
  const prevDimRef = useRef({ w: 0, h: 0 });
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 });

  // Handle Resize using ResizeObserver to update dimensions state
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      if (w > 0 && h > 0) {
        setDimensions({ w, h });
      }
    };

    // Initial check
    handleResize();

    const observer = new ResizeObserver(handleResize);
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;

    const { w, h } = dimensions;
    if (w <= 0 || h <= 0) return;

    const dpr = window.devicePixelRatio || 1;

    if (prevDimRef.current.w !== w || prevDimRef.current.h !== h) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      prevDimRef.current = { w, h };
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset transform to handle DPR scaling correctly
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const bgColor = isDark ? '#0f172a' : '#ffffff'; // slate-900 / white
    const gridColor = isDark ? '#1e293b' : '#f1f5f9'; // slate-800 / slate-100
    const axisColor = isDark ? '#334155' : '#cbd5e1'; // slate-700 / slate-300
    const tickColor = isDark ? '#94a3b8' : '#64748b'; // slate-400 / slate-500

    const MARGIN_LEFT = 45;
    const MARGIN_RIGHT = 15;
    const MARGIN_TOP = 15;
    const MARGIN_BOTTOM = 15;
    const plotW = w - MARGIN_LEFT - MARGIN_RIGHT;
    const plotH = h - MARGIN_TOP - MARGIN_BOTTOM;

    // Clear background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    // Filter valid data points
    const values = data.slice(-bufferSize);

    // Calculate Y domain dynamically with minimum default limits from fixedYDomain
    let yMin: number, yMax: number;
    let minVal = Infinity, maxVal = -Infinity;

    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v != null && !isNaN(v)) {
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
      }
    }

    if (minVal === Infinity) {
      if (fixedYDomain) {
        [yMin, yMax] = fixedYDomain;
      } else {
        yMin = symmetric ? -40 : 0;
        yMax = symmetric ? 40 : 20;
      }
    } else {
      if (symmetric) {
        const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal));
        yMin = -absMax;
        yMax = absMax;
      } else {
        yMin = minVal;
        yMax = maxVal;
      }

      // Expand to fit reference lines
      for (let r = 0; r < referenceLines.length; r++) {
        const rl = referenceLines[r];
        if (rl.y < yMin) yMin = rl.y;
        if (rl.y > yMax) yMax = rl.y;
      }

      // Apply padding (e.g. 10% padding or at least a few units)
      if (symmetric) {
        const absMax = Math.max(Math.abs(yMin), Math.abs(yMax));
        const paddedMax = Math.ceil((absMax * 1.1) / 5) * 5;
        yMin = -paddedMax;
        yMax = paddedMax;
      } else {
        const range = yMax - yMin || 1;
        yMin = Math.floor((yMin - range * 0.1) / 5) * 5;
        yMax = Math.ceil((yMax + range * 0.1) / 5) * 5;
        if (fixedYDomain && fixedYDomain[0] === 0 && yMin < 0) {
          yMin = 0;
        }
      }

      // Enforce minimum/default domain constraints from fixedYDomain
      if (fixedYDomain) {
        const [fydMin, fydMax] = fixedYDomain;
        if (symmetric) {
          const limit = Math.abs(fydMax);
          if (yMax < limit) {
            yMin = -limit;
            yMax = limit;
          }
        } else {
          const minRangeSize = fydMax - fydMin;
          const currentRangeSize = yMax - yMin;
          if (currentRangeSize < minRangeSize) {
            if (fydMin === 0) {
              yMin = 0;
              yMax = minRangeSize;
            } else {
              const diff = minRangeSize - currentRangeSize;
              yMin = Math.floor((yMin - diff / 2) / 5) * 5;
              yMax = yMin + minRangeSize;
            }
          }
          if (fydMin === 0 && yMin < 0) {
            yMin = 0;
          }
        }
      }
    }

    const yRange = yMax - yMin || 1;
    const xScale = plotW / (bufferSize - 1);

    // Draw Grid Lines & Tick Labels
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillStyle = tickColor;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    // Nice tick step calculation
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

    // Draw Axes
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGIN_LEFT, MARGIN_TOP);
    ctx.lineTo(MARGIN_LEFT, h - MARGIN_BOTTOM);
    ctx.lineTo(w - MARGIN_RIGHT, h - MARGIN_BOTTOM);
    ctx.stroke();

    // Draw Reference Lines
    for (let r = 0; r < referenceLines.length; r++) {
      const rl = referenceLines[r];
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

    // Draw Waveform Line
    ctx.save();
    ctx.beginPath();
    ctx.rect(MARGIN_LEFT, MARGIN_TOP, plotW, plotH);
    ctx.clip();

    if (values.length > 0) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'round';
      ctx.beginPath();

      let moved = false;
      
      // Calculate how many empty slots we have at the front to pad
      const paddingOffset = bufferSize - values.length;

      for (let i = 0; i < values.length; i++) {
        const val = values[i];
        if (val == null || isNaN(val)) {
          moved = false;
          continue;
        }

        const x = MARGIN_LEFT + (i + paddingOffset) * xScale;
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
  }, [data, bufferSize, color, isDark, referenceLines, fixedYDomain, symmetric, dimensions]);

  return (
    <div ref={containerRef} className="chart-container h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-2 h-6 shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: isDark ? '#94a3b8' : '#64748b' }}>
          {label}
        </span>
        <span className="text-xs font-mono" style={{ color }}>
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
