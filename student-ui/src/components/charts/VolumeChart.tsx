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
  value: number;
}

export function VolumeChart({ data, targetVt }: VolumeChartProps) {
  const chartData: ChartPoint[] = useMemo(() => {
    return data.map((value, index) => ({
      index,
      value: Math.round(value),
    }));
  }, [data]);

  const yDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 600];
    const values = chartData.map(d => d.value);
    const max = Math.max(...values);
    return [0, Math.ceil(max / 100) * 100 + 100];
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
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default VolumeChart;
