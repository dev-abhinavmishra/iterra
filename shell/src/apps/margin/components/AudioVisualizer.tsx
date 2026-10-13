import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  isActive: boolean;
  analyser: AnalyserNode | null;
}

/* Oscilloscope strip: thin ticks on a hairline baseline. Ink at rest,
   vermilion where there's signal. Reads colors from the CSS tokens so it
   follows light/dark automatically. */
const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isActive, analyser }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const css = () => getComputedStyle(document.documentElement);
    const token = (name: string) => css().getPropertyValue(name).trim() || css().color;
    let mark = token('--mark');
    let ink3 = token('--ink-3');
    let line = token('--line-2');

    const animate = () => {
      requestRef.current = requestAnimationFrame(animate);
      // Refresh token colors cheaply (covers theme flips)
      mark = token('--mark');
      ink3 = token('--ink-3');
      line = token('--line-2');

      ctx.clearRect(0, 0, width, height);

      const tickW = 2;
      const gap = 5;
      const count = Math.max(1, Math.floor(width / (tickW + gap)));
      const baseY = height / 2;

      // Hairline baseline
      ctx.fillStyle = line;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(0, baseY - 0.5, width, 1);
      ctx.globalAlpha = 1;

      const dataArray = analyser && isActive ? new Uint8Array(analyser.frequencyBinCount) : null;
      if (dataArray && analyser) analyser.getByteFrequencyData(dataArray);

      const t = Date.now() / 1000;

      for (let i = 0; i < count; i++) {
        const x = i * (tickW + gap);
        let h: number;
        let color: string;
        let alpha: number;

        if (isActive && dataArray) {
          // Map the tick index into the lower two-thirds of the spectrum (voice)
          const fi = Math.floor((i / count) * dataArray.length * 0.66);
          const v = (dataArray[fi] || 0) / 255;
          h = Math.max(3, v * height * 0.85);
          color = v > 0.02 ? mark : ink3;
          alpha = v > 0.02 ? 0.35 + v * 0.65 : 0.35;
        } else {
          // Resting strip: small ticks with a slow breathing wave
          h = 3 + Math.abs(Math.sin(t * 1.2 + i * 0.35)) * 3;
          color = ink3;
          alpha = 0.35;
        }

        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        ctx.fillRect(x, baseY - h / 2, tickW, h);
      }
      ctx.globalAlpha = 1;
    };

    animate();

    return () => {
      cancelAnimationFrame(requestRef.current);
      ro.disconnect();
    };
  }, [isActive, analyser]);

  return <canvas ref={canvasRef} className="w-full h-full" />;
};

export default AudioVisualizer;
