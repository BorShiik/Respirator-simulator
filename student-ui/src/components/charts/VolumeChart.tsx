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
}

interface ChartPoint {
  index: number;
  value: number | null;
}

const FIXED_BUFFER_SIZE = 150;

export function VolumeChart({ data, targetVt }: VolumeChartProps) {
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

  return (
    <div className="chart-container h-full">
      <div className="flex items-center justify-between mb-1 px-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-clinical-muted">
          Objętość (Volume)
        </span>
        <span className="text-xs font-mono text-clinical-accent">
          mL
        </span>
      </div>
      <ResponsiveContainer width="100%" height="90%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="index"
            type="number"
            domain={[0, FIXED_BUFFER_SIZE - 1]}
            tick={false}
            axisLine={{ stroke: '#cbd5e1' }}
            tickLine={false}
          />
          <YAxis
            domain={yDomain}
            tick={{ fontSize: 10, fill: '#64748b' }}
            axisLine={{ stroke: '#cbd5e1' }}
            tickLine={{ stroke: '#cbd5e1' }}
            width={40}
          />
          {targetVt && (
            <ReferenceLine
              y={targetVt}
              stroke="#059669"
              strokeDasharray="5 5"
              strokeWidth={1}
            />
          )}
          <Line
            type="monotone"
            dataKey="value"
            stroke="#0891b2"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default VolumeChart;

