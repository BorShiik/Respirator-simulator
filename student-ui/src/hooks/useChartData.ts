import { useState, useEffect, useRef } from 'react';

export function useChartData(getBuffer: () => number[]) {
  const [data, setData] = useState<{ idx: number; value: number }[]>([]);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    let frameId = 0;

    const update = (time: number) => {
      // Throttle to ~20 FPS (50ms interval) for smoother Recharts performance
      if (time - lastTimeRef.current >= 50) {
        lastTimeRef.current = time;
        const buffer = getBuffer();
        
        // Downsample by 2 to halve Recharts rendering load (from 500 to 250 points)
        const downsampled = [];
        for (let i = 0; i < buffer.length; i += 2) {
          downsampled.push({ idx: i / 2, value: buffer[i] });
        }
        setData(downsampled);
      }
      frameId = requestAnimationFrame(update);
    };

    frameId = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [getBuffer]);

  return data;
}

export default useChartData;
