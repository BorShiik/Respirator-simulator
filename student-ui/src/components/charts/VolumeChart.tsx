import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface VolumeChartProps {
  data: number[];
  targetVt?: number;
  isDark?: boolean;
}

interface ChartPoint {
  index: number;
  value: number | null;
}

const FIXED_BUFFER_SIZE = 150;

export function VolumeChart({ data, targetVt, isDark = false }: VolumeChartProps) {
  const chartData: ChartPoint[] = useMemo(() => {
    const padded = new Array(Math.max(0, FIXED_BUFFER_SIZE - data.length)).fill(null);
    const values = [...padded, ...data];
    return values.map((value, index) => ({
      index,
      value: value != null ? Math.round(value) : null,
    }));
  }, [data]);

  const yDomain = useMemo(() => {
    const validValues = chartData.filter(d => d.value !== null).map(d => d.value as number);
    if (validValues.length === 0) return [0, 600];
    const max = Math.max(...validValues);
    return [0, Math.ceil(max / 100) * 100 + 50];
  }, [chartData]);

  const colors = isDark
    ? { grid: '#1e293b', axis: '#334155', tick: '#94a3b8', line: '#22d3ee', label: '#94a3b8' }
    : { grid: '#e2e8f0', axis: '#cbd5e1', tick: '#64748b', line: '#0891b2', label: '#64748b' };

  return (
    <div className="chart-container h-full">
      <div className="flex items-center justify-between mb-1 px-2">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: colors.label }}>
          Objętość (Volume)
        </span>
        <span className="text-xs font-mono" style={{ color: 'var(--color-accent)' }}>
          mL
        </span>
      </div>
      <ResponsiveContainer width="100%" height="90%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
          <XAxis dataKey="index" type="number" domain={[0, FIXED_BUFFER_SIZE - 1]} tick={false} axisLine={{ stroke: colors.axis }} tickLine={false} />
          <YAxis domain={yDomain} tick={{ fontSize: 10, fill: colors.tick }} axisLine={{ stroke: colors.axis }} tickLine={{ stroke: colors.axis }} width={40} />
          {targetVt && <ReferenceLine y={targetVt} stroke="#059669" strokeDasharray="5 5" strokeWidth={1} />}
          <Line type="monotone" dataKey="value" stroke={colors.line} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default VolumeChart;
