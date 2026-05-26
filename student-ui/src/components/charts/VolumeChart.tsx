import { CanvasWaveform } from './CanvasWaveform';
import { chartBuffers, getPlaybackIndex } from '../../stores/chartBufferStore';

interface VolumeChartProps {
  targetVt?: number;
  isDark?: boolean;
}

const FIXED_BUFFER_SIZE = 500;

export function VolumeChart({ targetVt, isDark = false }: VolumeChartProps) {
  return (
    <CanvasWaveform
      getDataSource={() => chartBuffers.volume}
      getPlaybackIndex={getPlaybackIndex}
      bufferSize={FIXED_BUFFER_SIZE}
      color="#17A2B8"
      label="OBJĘTOŚĆ"
      unit="mL"
      isDark={isDark}
      yDomain={[0, 600]}
      referenceLines={targetVt ? [{ y: targetVt, color: '#059669', dashed: true }] : []}
    />
  );
}

export default VolumeChart;
