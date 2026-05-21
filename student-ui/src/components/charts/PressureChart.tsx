import { CanvasWaveform } from './CanvasWaveform';
import { chartBuffers } from '../../stores/chartBufferStore';

interface PressureChartProps {
  peep?: number;
  pip?: number;
  isDark?: boolean;
}

const FIXED_BUFFER_SIZE = 500;

export function PressureChart({ peep = 5, pip, isDark = false }: PressureChartProps) {
  const referenceLines = [
    { y: peep, color: '#059669', dashed: true },
    ...(pip ? [{ y: pip, color: '#dc2626', dashed: true }] : []),
  ];

  return (
    <CanvasWaveform
      getDataSource={() => chartBuffers.pressure}
      bufferSize={FIXED_BUFFER_SIZE}
      color={isDark ? '#3b82f6' : '#0066cc'}
      label="Ciśnienie (P)"
      unit="cmH₂O"
      isDark={isDark}
      yDomain={[0, 20]}
      referenceLines={referenceLines}
    />
  );
}

export default PressureChart;
