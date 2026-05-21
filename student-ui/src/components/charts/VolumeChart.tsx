import { CanvasWaveform } from './CanvasWaveform';
import { chartBuffers } from '../../stores/chartBufferStore';

interface VolumeChartProps {
  targetVt?: number;
  isDark?: boolean;
}

const FIXED_BUFFER_SIZE = 500;

export function VolumeChart({ targetVt, isDark = false }: VolumeChartProps) {
  return (
    <CanvasWaveform
      getDataSource={() => chartBuffers.volume}
      bufferSize={FIXED_BUFFER_SIZE}
      color={isDark ? '#22d3ee' : '#0891b2'}
      label="Objętość (Volume)"
      unit="mL"
      isDark={isDark}
      yDomain={[0, 1000]}
      referenceLines={targetVt ? [{ y: targetVt, color: '#059669', dashed: true }] : []}
    />
  );
}

export default VolumeChart;
