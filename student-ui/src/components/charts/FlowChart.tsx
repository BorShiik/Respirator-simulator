import { CanvasWaveform } from './CanvasWaveform';
import { chartBuffers } from '../../stores/chartBufferStore';

interface FlowChartProps {
  isDark?: boolean;
}

const FIXED_BUFFER_SIZE = 500;

export function FlowChart({ isDark = false }: FlowChartProps) {
  return (
    <CanvasWaveform
      getDataSource={() => chartBuffers.flow}
      bufferSize={FIXED_BUFFER_SIZE}
      color={isDark ? '#a78bfa' : '#7c3aed'}
      label="Przepływ (Flow)"
      unit="L/min"
      isDark={isDark}
      yDomain={[-100, 100]}
      symmetric={true}
      referenceLines={[{ y: 0, color: isDark ? '#475569' : '#94a3b8', dashed: false }]}
    />
  );
}

export default FlowChart;
