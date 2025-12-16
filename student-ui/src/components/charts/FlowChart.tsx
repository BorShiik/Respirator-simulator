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
  value: number;
}

export function FlowChart({ data }: FlowChartProps) {
  const chartData: ChartPoint[] = useMemo(() => {
    return data.map((value, index) => ({
      index,
      value: Math.round(value * 10) / 10,
    }));
  }, [data]);

  const yDomain = useMemo(() => {
    if (chartData.length === 0) return [-60, 60];
    const values = chartData.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const absMax = Math.max(Math.abs(min), Math.abs(max));
    const rounded = Math.ceil(absMax / 20) * 20 + 20;
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
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default FlowChart;
