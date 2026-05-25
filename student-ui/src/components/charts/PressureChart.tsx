import { CanvasWaveform } from './CanvasWaveform';
import { chartBuffers, getPlaybackIndex } from '../../stores/chartBufferStore';

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
      getPlaybackIndex={getPlaybackIndex}
      bufferSize={FIXED_BUFFER_SIZE}
      color="#D4A017"
      label="CIŚNIENIE"
      unit="cmH₂O"
      isDark={isDark}
      yDomain={[0, 30]}
      referenceLines={referenceLines}
    />
  );
}

export default PressureChart;
