import { useEffect, useRef, useState } from "react";

/**
 * Lightweight animated waveform "strands" used while recording a voice note.
 * SVG based so it works on every device without WebGL.
 */
export default function Strands({
  colors = ["var(--ink)", "var(--peach)", "var(--line)"],
  count = 3,
  speed = 1.5,
  amplitude = 1.5,
  waviness = 1,
  thickness = 1.5,
  opacity = 1,
}: {
  colors?: string[];
  count?: number;
  speed?: number;
  amplitude?: number;
  waviness?: number;
  thickness?: number;
  glow?: number;
  taper?: number;
  spread?: number;
  intensity?: number;
  opacity?: number;
}) {
  const [t, setT] = useState(0);
  const raf = useRef<number>(0);

  useEffect(() => {
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setT((prev) => prev + dt * (speed || 0.05));
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [speed]);

  const width = 300;
  const height = 80;

  const path = (i: number) => {
    const points: string[] = [];
    const amp = (10 + i * 4) * amplitude;
    for (let x = 0; x <= width; x += 6) {
      const phase = (x / width) * Math.PI * 4 * waviness + t * 2 + i;
      const y = height / 2 + Math.sin(phase) * amp * Math.sin((x / width) * Math.PI);
      points.push(`${x === 0 ? "M" : "L"}${x},${y.toFixed(2)}`);
    }
    return points.join(" ");
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-full w-full"
      style={{ opacity }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <path
          key={i}
          d={path(i)}
          fill="none"
          stroke={colors[i % colors.length]}
          strokeWidth={thickness}
          strokeLinecap="round"
          opacity={0.9 - i * 0.2}
        />
      ))}
    </svg>
  );
}
