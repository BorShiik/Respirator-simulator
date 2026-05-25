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
import { useTheme } from '../../hooks/useTheme';
import { useMemo } from 'react';

interface LearningCurveChartProps {
  data: LearningCurveDataPoint[];
}

export function LearningCurveChart({ data }: LearningCurveChartProps) {
  const { theme } = useTheme();

  const colors = useMemo(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      accent: style.getPropertyValue('--admin-accent').trim() || '#3b82f6',
      success: style.getPropertyValue('--admin-success').trim() || '#10b981',
      grid: style.getPropertyValue('--chart-grid').trim() || '#1e293b',
      muted: style.getPropertyValue('--admin-muted').trim() || '#94a3b8',
      ref: style.getPropertyValue('--chart-ref').trim() || '#475569',
      panel: style.getPropertyValue('--admin-panel').trim() || '#111827',
      border: style.getPropertyValue('--admin-border').trim() || '#1e293b',
      text: style.getPropertyValue('--admin-text').trim() || '#f1f5f9',
    };
  }, [theme]);

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

  const sessionsWithTime = chartData.filter((d) => d.timeToResolve !== null && d.timeToResolve !== undefined);
  const avgTime = sessionsWithTime.length > 0
    ? sessionsWithTime.reduce((sum, d) => sum + (d.timeToResolve || 0), 0) / sessionsWithTime.length
    : 0;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
        <XAxis
          dataKey="index"
          label={{ value: 'Nr sesji', position: 'insideBottom', offset: -10, fill: colors.muted }}
          tick={{ fontSize: 12, fill: colors.muted }}
        />
        <YAxis
          yAxisId="left"
          label={{
            value: 'Czas (s)',
            angle: -90,
            position: 'insideLeft',
            fill: colors.muted,
          }}
          tick={{ fontSize: 12, fill: colors.muted }}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          label={{
            value: 'Liczba zmian',
            angle: 90,
            position: 'insideRight',
            fill: colors.muted,
          }}
          tick={{ fontSize: 12, fill: colors.muted }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: colors.panel,
            border: `1px solid ${colors.border}`,
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
            color: colors.text,
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
          wrapperStyle={{ color: colors.muted }}
        />
        <ReferenceLine
          y={avgTime}
          yAxisId="left"
          stroke={colors.ref}
          strokeDasharray="5 5"
          label={{
            value: `Średnia: ${Math.round(avgTime)}s`,
            fill: colors.muted,
            fontSize: 11,
          }}
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="timeToResolve"
          stroke={colors.accent}
          strokeWidth={2}
          dot={{ r: 4, fill: colors.accent }}
          activeDot={{ r: 6 }}
          connectNulls
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="settingChanges"
          stroke={colors.success}
          strokeWidth={2}
          dot={{ r: 4, fill: colors.success }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default LearningCurveChart;
