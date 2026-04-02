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

interface FlowChartProps {
  data: number[];
}

interface ChartPoint {
  index: number;
  value: number | null;
}

const FIXED_BUFFER_SIZE = 200; // Должен совпадать с BUFFER_SIZE в useStudentWebSocket

export function FlowChart({ data }: FlowChartProps) {
  const chartData: ChartPoint[] = useMemo(() => {
    return data.map((value, index) => ({
      index,
      value: value != null ? Math.round(value * 10) / 10 : null,
    }));
  }, [data]);

  const yDomain = useMemo(() => {
    const validValues = chartData.filter(d => d.value !== null).map(d => d.value as number);
    if (validValues.length === 0) return [-60, 60];
    const min = Math.min(...validValues);
    const max = Math.max(...validValues);
    const absMax = Math.max(Math.abs(min), Math.abs(max));
    const rounded = Math.ceil(absMax / 20) * 20 + 10;
    return [-rounded, rounded];
  }, [chartData]);

  return (
    <div className="chart-container h-full">
      <div className="flex items-center justify-between mb-1 px-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-clinical-muted">
          Przepływ (Flow)
        </span>
        <span className="text-xs font-mono text-clinical-accent">
          L/min
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
            width={35}
          />
          <ReferenceLine
            y={0}
            stroke="#94a3b8"
            strokeWidth={1}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#7c3aed"
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

export default FlowChart;

