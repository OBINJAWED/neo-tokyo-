import { useEffect, useRef, type MutableRefObject } from 'react';
import { LANDMARKS, type Telemetry } from '@/scene/world';

const MARKS = [
  { id: 'N', label: 'N', x: 0, z: -1e6, kind: 'card' },
  { id: 'E', label: 'E', x: 1e6, z: 0, kind: 'card' },
  { id: 'S', label: 'S', x: 0, z: 1e6, kind: 'card' },
  { id: 'W', label: 'W', x: -1e6, z: 0, kind: 'card' },
  { id: 'tower', label: LANDMARKS.tower.short, x: LANDMARKS.tower.x, z: LANDMARKS.tower.z, kind: 'lm' },
  { id: 'skytree', label: LANDMARKS.skytree.short, x: LANDMARKS.skytree.x, z: LANDMARKS.skytree.z, kind: 'lm' },
  { id: 'cocoon', label: LANDMARKS.cocoon.short, x: LANDMARKS.cocoon.x, z: LANDMARKS.cocoon.z, kind: 'lm' },
] as const;

const AREAS = [
  { name: 'Shibuya', jp: '渋谷', x: 0, z: 0 },
  { name: 'Shiba-koen, Minato', jp: '港区', x: LANDMARKS.tower.x, z: LANDMARKS.tower.z },
  { name: 'Oshiage, Sumida', jp: '墨田区', x: LANDMARKS.skytree.x, z: LANDMARKS.skytree.z },
  { name: 'Nishi-Shinjuku', jp: '西新宿', x: LANDMARKS.cocoon.x, z: LANDMARKS.cocoon.z },
];

export function Compass({ telemetry, onLocation }: { telemetry: MutableRefObject<Telemetry>; onLocation?: (en: string, jp: string) => void }) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const distRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const headingRef = useRef<HTMLSpanElement>(null);
  const cb = useRef(onLocation);
  cb.current = onLocation;

  useEffect(() => {
    let raf = 0;
    let lastArea = '';
    const loop = () => {
      const t = telemetry.current;
      MARKS.forEach((m, i) => {
        const el = refs.current[i];
        if (!el) return;
        const ang = Math.atan2(-(m.x - t.x), -(m.z - t.z));
        const rel = Math.atan2(Math.sin(ang - t.yaw), Math.cos(ang - t.yaw));
        const x = (-rel / (Math.PI / 2)) * 50;
        el.style.left = `${50 + x}%`;
        el.style.opacity = Math.abs(rel) < Math.PI / 2 ? String(1 - Math.pow(Math.abs(rel) / (Math.PI / 2), 3)) : '0';
        const dEl = distRefs.current[i];
        if (dEl) {
          const d = Math.hypot(m.x - t.x, m.z - t.z);
          dEl.textContent = d >= 1000 ? `${(d / 1000).toFixed(1)}km` : `${Math.round(d)}m`;
        }
      });
      if (headingRef.current) {
        const deg = ((-t.yaw * 180) / Math.PI + 360) % 360;
        headingRef.current.textContent = String(Math.round(deg)).padStart(3, '0');
      }
      let best = AREAS[0], bd = Infinity;
      AREAS.forEach((a) => {
        const d = Math.hypot(a.x - t.x, a.z - t.z) * (a.name === 'Shibuya' ? 0.7 : 1);
        if (d < bd) { bd = d; best = a; }
      });
      const key = t.y > 40 ? 'air' : best.name;
      if (key !== lastArea) {
        lastArea = key;
        if (t.y > 40) cb.current?.('Above ' + best.name, '上空');
        else cb.current?.(best.name, best.jp);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [telemetry]);

  return (
    <div className="pointer-events-none relative mx-auto w-[min(520px,70vw)]" data-testid="hud-compass">
      <div className="relative h-9 overflow-hidden" style={{ maskImage: 'linear-gradient(90deg, transparent, black 18%, black 82%, transparent)', WebkitMaskImage: 'linear-gradient(90deg, transparent, black 18%, black 82%, transparent)' }}>
        <div className="absolute inset-x-0 top-[18px] h-px bg-[hsl(30_40%_90%/0.25)]" />
        {MARKS.map((m, i) => (
          <div key={m.id} ref={(el) => { refs.current[i] = el; }} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: '50%' }}>
            {m.kind === 'card' ? (
              <span className={`font-mono text-[11px] ${m.id === 'N' ? 'text-[hsl(8_100%_66%)]' : 'text-[hsl(30_40%_90%/0.8)]'}`}>{m.label}</span>
            ) : (
              <>
                <span className="block h-2 w-2 rotate-45 border border-[hsl(184_95%_62%)] bg-[hsl(184_95%_62%/0.3)]" />
                <span className="mt-1 whitespace-nowrap font-mono text-[9px] tracking-[0.18em] text-[hsl(184_95%_75%)]">
                  {m.label} <span ref={(el) => { distRefs.current[i] = el; }} className="text-[hsl(30_40%_90%/0.55)]" />
                </span>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="mt-0.5 flex justify-center">
        <span className="font-mono text-[10px] tracking-[0.25em] text-[hsl(30_40%_92%/0.7)]">
          <span ref={headingRef}>000</span>&deg;
        </span>
      </div>
      <div className="absolute left-1/2 top-[13px] h-3 w-px -translate-x-1/2 bg-[hsl(8_94%_60%)]" />
    </div>
  );
}
