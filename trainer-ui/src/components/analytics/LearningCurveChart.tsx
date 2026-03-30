import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';
import { LearningCurveDataPoint } from '../../types/trainer';

interface LearningCurveChartProps {
  data: LearningCurveDataPoint[];
}

export function LearningCurveChart({ data }: LearningCurveChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-admin-muted">
        Brak danych do wyświetlenia
      </div>
    );
  }

  const chartData = data.map((point, index) => ({
    index: index + 1,
    timeToResolve: point.timeToResolve,
    settingChanges: point.settingChanges,
    scenarioName: point.scenarioName,
    date: point.date,
    successful: point.successful,
  }));

  const avgTime = chartData
    .filter((d) => d.timeToResolve !== null)
    .reduce((sum, d) => sum + (d.timeToResolve || 0), 0) / chartData.filter((d) => d.timeToResolve !== null).length;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="index"
          label={{ value: 'Nr sesji', position: 'insideBottom', offset: -10, fill: '#64748b' }}
          tick={{ fontSize: 12, fill: '#64748b' }}
        />
        <YAxis
          yAxisId="left"
          label={{
            value: 'Czas (s)',
            angle: -90,
            position: 'insideLeft',
            fill: '#64748b',
          }}
          tick={{ fontSize: 12, fill: '#64748b' }}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          label={{
            value: 'Liczba zmian',
            angle: 90,
            position: 'insideRight',
            fill: '#64748b',
          }}
          tick={{ fontSize: 12, fill: '#64748b' }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          }}
          formatter={(value: number, name: string) => {
            if (name === 'timeToResolve') return [`${value}s`, 'Czas reakcji'];
            if (name === 'settingChanges') return [value, 'Liczba zmian'];
            return [value, name];
          }}
          labelFormatter={(label) => {
            const point = chartData[label - 1];
            return point ? `${point.scenarioName} (${point.date})` : `Sesja ${label}`;
          }}
        />
        <Legend
          verticalAlign="top"
          height={36}
          formatter={(value: string) => {
            if (value === 'timeToResolve') return 'Czas reakcji';
            if (value === 'settingChanges') return 'Liczba zmian';
            return value;
          }}
        />
        <ReferenceLine
          y={avgTime}
          yAxisId="left"
          stroke="#94a3b8"
          strokeDasharray="5 5"
          label={{
            value: `Średnia: ${Math.round(avgTime)}s`,
            fill: '#64748b',
            fontSize: 11,
          }}
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="timeToResolve"
          stroke="#0066cc"
          strokeWidth={2}
          dot={{ r: 4, fill: '#0066cc' }}
          activeDot={{ r: 6 }}
          connectNulls
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="settingChanges"
          stroke="#059669"
          strokeWidth={2}
          dot={{ r: 4, fill: '#059669' }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default LearningCurveChart;
