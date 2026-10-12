import { useRef, useState, type MutableRefObject } from 'react';
import type { InputState } from '@/scene/world';

export function Joystick({ input, onUse }: { input: MutableRefObject<InputState>; onUse: () => void }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false });
  const idRef = useRef<number | null>(null);

  const update = (cx: number, cy: number) => {
    const el = baseRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const R = r.width / 2;
    let dx = cx - (r.left + R), dy = cy - (r.top + R);
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    input.current.joyX = dx / R;
    input.current.joyY = dy / R;
    setKnob({ x: dx, y: dy, active: true });
  };
  const end = () => {
    idRef.current = null;
    input.current.joyX = 0;
    input.current.joyY = 0;
    setKnob({ x: 0, y: 0, active: false });
  };

  return (
    <div
      ref={baseRef}
      data-testid="joystick-move"
      className="relative h-32 w-32 rounded-full touch-none select-none"
      style={{ background: 'radial-gradient(circle, hsl(258 50% 10% / 0.35), hsl(258 50% 6% / 0.55))', border: '1px solid hsl(184 95% 60% / 0.28)', backdropFilter: 'blur(8px)' }}
      onPointerDown={(e) => {
        e.stopPropagation();
        idRef.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        onUse();
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (idRef.current !== e.pointerId) return;
        e.stopPropagation();
        update(e.clientX, e.clientY);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="h-[1px] w-full bg-[hsl(184_95%_60%/0.12)]" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[1px] h-full bg-[hsl(184_95%_60%/0.12)]" />
      </div>
      <div
        className="absolute left-1/2 top-1/2 h-14 w-14 -ml-7 -mt-7 rounded-full pointer-events-none transition-[box-shadow] duration-200"
        style={{
          transform: `translate(${knob.x}px, ${knob.y}px)`,
          background: 'radial-gradient(circle at 35% 30%, hsl(8 100% 72%), hsl(8 90% 45%))',
          boxShadow: knob.active ? '0 0 0 6px hsl(8 94% 58% / 0.18)' : '0 0 0 1px hsl(8 94% 70% / 0.4)',
        }}
      />
      <span className="absolute -top-6 left-0 font-mono text-[10px] tracking-[0.3em] text-[hsl(262_18%_70%)]">MOVE</span>
    </div>
  );
}
