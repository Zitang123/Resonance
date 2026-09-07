/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Interactive canvas has an accessible table equivalent. */
'use client';
import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Minus, Plus } from 'lucide-react';
type Cell = { day: number; hour: number; count: number };
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export function ListeningTerrain({ cells }: { cells: Cell[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState({ angle: -0.55, tilt: 0.72, zoom: 1 });
  const [selected, setSelected] = useState<Cell | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    angle: number;
    tilt: number;
  } | null>(null);
  const hit = useRef<{ x: number; y: number; cell: Cell }[]>([]);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const draw = () => {
      const ctx = el.getContext('2d');
      if (!ctx) return;
      const w = el.clientWidth,
        h = el.clientHeight,
        dpr = Math.min(devicePixelRatio || 1, 2);
      el.width = w * dpr;
      el.height = h * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);
      const size = Math.min(w / 32, h / 24) * view.zoom,
        max = Math.max(1, ...cells.map((c) => c.count));
      const project = (x: number, z: number, y = 0) => {
        const rx = x * Math.cos(view.angle) - z * Math.sin(view.angle),
          rz = x * Math.sin(view.angle) + z * Math.cos(view.angle);
        return {
          x: w / 2 + rx * size,
          y: h * 0.55 + rz * size * view.tilt - y * size,
          z: rz,
        };
      };
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = '#414a43';
      for (let x = -12; x <= 12; x += 3) {
        const a = project(x, -6),
          b = project(x, 6);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      for (let z = -6; z <= 6; z += 2) {
        const a = project(-12, z),
          b = project(12, z);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      const projected = cells
        .map((cell) => ({
          cell,
          ...project(
            cell.hour - 11.5,
            (cell.day - 3) * 2,
            (cell.count / max) * 7,
          ),
        }))
        .sort((a, b) => a.z - b.z);
      hit.current = [];
      for (const p of projected) {
        const base = project(p.cell.hour - 11.5, (p.cell.day - 3) * 2),
          height = (p.cell.count / max) * 7;
        const width = Math.max(2, size * 0.28);
        ctx.strokeStyle = p.cell.count
          ? `rgba(173,200,224,${0.32 + (0.62 * p.cell.count) / max})`
          : '#3b433d';
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        if (height) {
          ctx.fillStyle = '#e1bea0';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, width * 0.55, width * 0.25, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        hit.current.push({ x: p.x, y: p.y, cell: p.cell });
      }
      ctx.font = '11px Arial';
      ctx.fillStyle = '#a5aaa4';
      ctx.textAlign = 'center';
      for (const hour of [0, 6, 12, 18, 23]) {
        const p = project(hour - 11.5, 8);
        ctx.fillText(`${String(hour).padStart(2, '0')}:00`, p.x, p.y);
      }
      for (let d = 0; d < 7; d++) {
        const p = project(-14, (d - 3) * 2);
        ctx.fillText(days[d], p.x, p.y);
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = '#e1bea0';
      ctx.fillText(`HEIGHT / ${max.toLocaleString()} listens at peak`, 20, 28);
    };
    const observer = new ResizeObserver(draw);
    observer.observe(el);
    draw();
    return () => observer.disconnect();
  }, [cells, view]);
  return (
    <div className="terrain-wrap">
      <canvas
        ref={canvas}
        className="listening-terrain"
        tabIndex={0}
        role="img"
        aria-label="3D listening chart. Horizontal axis: hour in UTC. Depth: weekday. Height: recorded listens. Drag to rotate; arrow keys rotate; plus or minus zoom. A data table follows."
        onPointerDown={(e) => {
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            angle: view.angle,
            tilt: view.tilt,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current) {
            const d = drag.current;
            setView((v) => ({
              ...v,
              angle: d.angle + (e.clientX - d.x) * 0.006,
              tilt: Math.max(
                0.2,
                Math.min(1.15, d.tilt + (e.clientY - d.y) * 0.003),
              ),
            }));
          } else {
            const box = e.currentTarget.getBoundingClientRect();
            const p = hit.current.findLast(
              (p) =>
                Math.hypot(
                  p.x - e.clientX + box.left,
                  p.y - e.clientY + box.top,
                ) < 12,
            );
            setSelected(p?.cell || null);
          }
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={(e) => {
          if (
            [
              'ArrowLeft',
              'ArrowRight',
              'ArrowUp',
              'ArrowDown',
              '+',
              '-',
            ].includes(e.key)
          ) {
            e.preventDefault();
            setView((v) => ({
              ...v,
              angle:
                v.angle +
                (e.key === 'ArrowLeft'
                  ? -0.12
                  : e.key === 'ArrowRight'
                    ? 0.12
                    : 0),
              tilt: Math.max(
                0.2,
                Math.min(
                  1.15,
                  v.tilt +
                    (e.key === 'ArrowUp'
                      ? -0.05
                      : e.key === 'ArrowDown'
                        ? 0.05
                        : 0),
                ),
              ),
              zoom: Math.max(
                0.7,
                Math.min(
                  1.4,
                  v.zoom + (e.key === '+' ? 0.1 : e.key === '-' ? -0.1 : 0),
                ),
              ),
            }));
          }
        }}
      />
      <div className="terrain-controls">
        <span>
          {selected
            ? `${days[selected.day]} · ${selected.hour}:00 UTC · ${selected.count} listens`
            : 'Drag to explore · height = listens'}
        </span>
        <button
          className="icon-button"
          aria-label="Zoom out"
          onClick={() =>
            setView((v) => ({ ...v, zoom: Math.max(0.7, v.zoom - 0.1) }))
          }
        >
          <Minus size={15} />
        </button>
        <button
          className="icon-button"
          aria-label="Zoom in"
          onClick={() =>
            setView((v) => ({ ...v, zoom: Math.min(1.4, v.zoom + 0.1) }))
          }
        >
          <Plus size={15} />
        </button>
        <button
          className="icon-button"
          aria-label="Reset chart view"
          onClick={() => setView({ angle: -0.55, tilt: 0.72, zoom: 1 })}
        >
          <RotateCcw size={15} />
        </button>
      </div>
      <details className="terrain-table">
        <summary>Read the chart as a table</summary>
        <div className="table-scroll">
          <table>
            <caption>Recorded listens by weekday and hour (UTC)</caption>
            <thead>
              <tr>
                <th>Hour</th>
                {days.map((d) => (
                  <th key={d}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 24 }, (_, hour) => (
                <tr key={hour}>
                  <th>{hour}:00</th>
                  {days.map((d, day) => (
                    <td key={d}>
                      {cells.find((c) => c.day === day && c.hour === hour)
                        ?.count || 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
