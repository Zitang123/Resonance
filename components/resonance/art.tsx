'use client';
/* eslint-disable jsx-a11y/prefer-tag-over-role -- An accessible procedural SVG is intentionally exposed as an image. */
import { useEffect, useId, useRef } from 'react';
export function Artwork({
  seed = '',
  theme,
  large = false,
}: {
  seed?: string;
  theme?: string;
  large?: boolean;
}) {
  const uid = useId().replaceAll(':', '');
  const hash = Array.from(seed).reduce((a, c) => a + c.charCodeAt(0), 0);
  const variant = hash % 4;
  const palettes: Record<string, string[]> = {
    copper: ['#493329', '#d2a57b', '#a57152'],
    blue: ['#233641', '#a5c2cc', '#4e7c92'],
    sage: ['#303c30', '#c4c9a2', '#738b6d'],
    plum: ['#392f3d', '#c4a9bb', '#8d6981'],
  };
  const p =
    palettes[theme || ['copper', 'blue', 'sage', 'plum'][hash % 4]] ||
    palettes.copper;
  return (
    <svg
      viewBox="0 0 300 300"
      className={`artwork ${large ? 'large' : ''}`}
      aria-label="Original abstract cover"
      role="img"
    >
      <defs>
        <radialGradient id={uid}>
          <stop stopColor={p[2]} stopOpacity=".5" />
          <stop offset="1" stopColor={p[0]} />
        </radialGradient>
      </defs>
      <rect width="300" height="300" fill={p[0]} />
      <rect width="300" height="300" fill={`url(#${uid})`} />
      {variant === 0
        ? Array.from({ length: 28 }, (_, i) => (
            <ellipse
              key={i}
              cx="150"
              cy="148"
              rx={30 + i * 3.4}
              ry={30 + i * 1.4}
              transform={`rotate(${i * 4} 150 150)`}
              fill="none"
              stroke={p[1]}
              opacity={0.17 + i * 0.019}
              strokeWidth=".8"
            />
          ))
        : variant === 1
          ? Array.from({ length: 27 }, (_, i) => (
              <path
                key={i}
                d={`M-20 ${i * 6 + 38} Q85 ${260 - i * 3} 160 ${90 + i * 5} T325 ${i * 5 + 145}`}
                stroke={p[1]}
                fill="none"
                opacity={0.22 + i * 0.014}
                strokeWidth=".9"
              />
            ))
          : variant === 2
            ? Array.from({ length: 25 }, (_, i) => (
                <circle
                  key={i}
                  cx={130 + i * 1.6}
                  cy={145 - i * 1.3}
                  r={25 + i * 3.3}
                  stroke={p[1]}
                  fill="none"
                  opacity={0.23 + i * 0.02}
                  strokeWidth=".8"
                />
              ))
            : Array.from({ length: 24 }, (_, i) => (
                <path
                  key={i}
                  d={`M${40 + i * 9} -10 C${-40 + i * 10} 150 ${260 - i * 6} 105 ${50 + i * 9} 310`}
                  stroke={p[1]}
                  fill="none"
                  opacity={0.28 + i * 0.015}
                  strokeWidth=".8"
                />
              ))}
      <path d="M20 22h14M27 15v14M266 278h14" stroke={p[1]} opacity=".6" />
      <text
        x="22"
        y="280"
        fill={p[1]}
        opacity=".7"
        fontSize="7"
        letterSpacing="2"
      >
        RESONANCE / ORIGINAL STUDY {String(variant + 1).padStart(2, '0')}
      </text>
    </svg>
  );
}
export function Ribbon({ quiet = false }: { quiet?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let width = 0,
      height = 0,
      frame = 0,
      energy = 0,
      phase = 0,
      x = 0.6,
      y = 0.5,
      visible = true;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, width, height);
      for (let line = 0; line < 34; line++) {
        ctx.beginPath();
        for (let s = 0; s <= 150; s++) {
          const t = s / 150;
          const spread = (line - 17) * 2.9;
          const envelope = Math.sin(t * Math.PI);
          const ripple =
            Math.sin(t * 7 + line * 0.08 + phase) *
            envelope *
            (29 + energy * 36);
          const px = t * width;
          const py =
            height * 0.5 +
            spread * envelope +
            ripple +
            Math.sin(t * 3.2 + line * 0.04) * 45 +
            (y - 0.5) * energy * 30 * Math.cos((t - x) * 4);
          if (s) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        }
        ctx.strokeStyle =
          line < 16
            ? `rgba(161,190,200,${0.2 + line * 0.014})`
            : `rgba(210,169,132,${0.6 - line * 0.009})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
    function tick() {
      frame = 0;
      if (!visible || document.hidden || quiet || reduce.matches) return;
      phase += energy * 0.03;
      energy *= 0.963;
      draw();
      if (energy > 0.006) frame = requestAnimationFrame(tick);
    }
    function wake(amount = 0.6) {
      if (quiet || reduce.matches || !visible || document.hidden) return;
      energy = Math.min(1, energy + amount);
      if (!frame) frame = requestAnimationFrame(tick);
    }
    function resize() {
      const r = canvas!.getBoundingClientRect();
      width = r.width;
      height = r.height;
      const d = Math.min(devicePixelRatio, 2);
      canvas!.width = width * d;
      canvas!.height = height * d;
      ctx!.setTransform(d, 0, 0, d, 0, 0);
      draw();
    }
    const pointer = (e: PointerEvent) => {
      const r = canvas!.getBoundingClientRect();
      x = (e.clientX - r.left) / r.width;
      y = (e.clientY - r.top) / r.height;
      wake(0.12);
    };
    const scroll = () => wake(0.025);
    const visibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else draw();
    };
    const motion = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      energy = 0;
      draw();
    };
    const observer = new IntersectionObserver((es) => {
      visible = es[0].isIntersecting;
      if (!visible) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else draw();
    });
    observer.observe(canvas);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    canvas.addEventListener('pointermove', pointer);
    canvas.addEventListener('pointerdown', pointer);
    window.addEventListener('scroll', scroll, { passive: true });
    document.addEventListener('visibilitychange', visibility);
    reduce.addEventListener('change', motion);
    resize();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      ro.disconnect();
      canvas.removeEventListener('pointermove', pointer);
      canvas.removeEventListener('pointerdown', pointer);
      window.removeEventListener('scroll', scroll);
      document.removeEventListener('visibilitychange', visibility);
      reduce.removeEventListener('change', motion);
    };
  }, [quiet]);
  return (
    <canvas
      ref={ref}
      className="ribbon"
      data-parallax="24"
      aria-hidden="true"
    />
  );
}
