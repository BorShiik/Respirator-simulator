import { CanvasWaveform } from './CanvasWaveform';
import { chartBuffers, getPlaybackIndex } from '../../stores/chartBufferStore';

interface FlowChartProps {
  isDark?: boolean;
}

const FIXED_BUFFER_SIZE = 500;

export function FlowChart({ isDark = false }: FlowChartProps) {
  return (
    <CanvasWaveform
      getDataSource={() => chartBuffers.flow}
      getPlaybackIndex={getPlaybackIndex}
      bufferSize={FIXED_BUFFER_SIZE}
      color="#28A745"
      label="PRZEPŁYW"
      unit="L/min"
      isDark={isDark}
      yDomain={[-40, 40]}
      symmetric={true}
      referenceLines={[{ y: 0, color: isDark ? '#475569' : '#94a3b8', dashed: false }]}
    />
  );
}

export default FlowChart;
