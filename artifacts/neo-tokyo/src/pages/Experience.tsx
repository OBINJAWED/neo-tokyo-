import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Clapperboard, CloudRain, CloudOff, Expand, Gauge, HelpCircle, Lock, Minimize, MousePointer2, Volume2, VolumeX, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { createCityAudio } from '@/lib/city-audio';
import { useSettings, type Quality } from '@/lib/settings';
import { VIEWPOINTS, createInput, type Command, type Telemetry } from '@/scene/world';
import { Compass } from '@/components/hud/Compass';
import { Joystick } from '@/components/hud/Joystick';

const Scene = lazy(() => import('@/scene/Scene'));

type CityAudio = ReturnType<typeof createCityAudio>;

function detectWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    const context = c.getContext('webgl2');
    const supported = !!context;
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return supported;
  } catch {
    return false;
  }
}

const QUALITY_LABEL: Record<Quality, string> = { low: 'Low', medium: 'Med', high: 'High' };
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);

function NoWebGL() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center p-8" data-testid="status-no-webgl">
      <div className="max-w-lg">
        <p className="font-mono text-xs tracking-[0.35em] text-[hsl(8_94%_62%)]">SIGNAL LOST / 信号なし</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">This city needs WebGL.</h1>
        <p className="mt-4 leading-relaxed text-[hsl(262_18%_72%)]">
          NEO TOKYO renders a full 3D city in real time, and your browser did not give us a WebGL context. Try enabling hardware acceleration in
          your browser settings, updating your graphics drivers, or opening this page in a current version of Chrome, Edge, Firefox or Safari.
        </p>
        <button className="hud-btn hud-glass mt-8" data-testid="button-retry-webgl" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    </div>
  );
}

function SceneSkeleton() {
  return (
    <div className="absolute inset-0 flex items-end justify-center pb-24" style={{ background: 'radial-gradient(120% 70% at 50% 100%, hsl(330 70% 22%), hsl(262 60% 8%) 60%, hsl(258 48% 4%))' }}>
      <div className="h-px w-40 overflow-hidden bg-[hsl(262_30%_25%)]">
        <div className="h-full w-1/3 bg-[hsl(8_94%_60%)]" style={{ animation: 'scan 1.2s linear infinite' }} />
      </div>
    </div>
  );
}

export default function Experience() {
  const { toast } = useToast();
  const [settings, setSettings] = useSettings();
  const [webgl] = useState(detectWebGL);
  const [contextLost, setContextLost] = useState(false);
  const [cinematic, setCinematic] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [intro, setIntro] = useState(true);
  const [soundOn, setSoundOn] = useState(false);
  const [soundBusy, setSoundBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [fs, setFs] = useState(false);
  const [activeVp, setActiveVp] = useState(0);
  const [pendingVp, setPendingVp] = useState<number | null>(null);
  const [touch, setTouch] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [location, setLocation] = useState({ en: 'Shibuya', jp: '渋谷' });

  const input = useRef(createInput());
  const command = useRef<Command | null>(null);
  const telemetry = useRef<Telemetry>({
    x: VIEWPOINTS[0].pos[0], y: VIEWPOINTS[0].pos[1], z: VIEWPOINTS[0].pos[2], yaw: VIEWPOINTS[0].yaw,
  });
  const wrapRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<CityAudio | null>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const cineRef = useRef(cinematic);
  cineRef.current = cinematic;

  useEffect(() => {
    document.title = 'NEO TOKYO — After Dark';
    const t = setTimeout(() => setIntro(false), 5200);
    const mq = window.matchMedia('(pointer: coarse)');
    setTouch(mq.matches || 'ontouchstart' in window);
    return () => clearTimeout(t);
  }, []);

  // audio lifecycle
  useEffect(() => () => { audioRef.current?.dispose(); audioRef.current = null; }, []);
  useEffect(() => { audioRef.current?.setRain(settings.rain); }, [settings.rain]);
  useEffect(() => { audioRef.current?.setVolume(settings.volume); }, [settings.volume]);

  const toggleSound = useCallback(async () => {
    if (soundBusy) return;
    setSoundBusy(true);
    try {
      if (!audioRef.current) {
        audioRef.current = createCityAudio();
        audioRef.current.setVolume(settings.volume);
        audioRef.current.setRain(settings.rain);
      }
      const target = !soundOn;
      const ok = await audioRef.current.setEnabled(target);
      setSoundOn(ok);
      if (target && !ok) toast({ title: 'Sound stayed off', description: 'The browser did not allow audio to start. Tap the sound button again.' });
    } catch (err) {
      setSoundOn(false);
      toast({ title: 'Audio unavailable', description: err instanceof Error ? err.message : 'This browser could not start the city soundscape.', variant: 'destructive' });
    } finally {
      setSoundBusy(false);
    }
  }, [soundBusy, soundOn, settings.volume, settings.rain, toast]);

  const exitCinematic = useCallback(() => {
    if (cineRef.current) setCinematic(false);
  }, []);
  const dismissIntro = useCallback(() => setIntro(false), []);

  const goViewpoint = useCallback((i: number) => {
    setCinematic(false);
    setIntro(false);
    command.current = { type: 'viewpoint', index: i };
    setPendingVp(i);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    try {
      if (document.fullscreenElement || doc.webkitFullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else doc.webkitExitFullscreen?.();
      } else if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      } else throw new Error('unsupported');
    } catch {
      toast({ title: 'Fullscreen blocked', description: 'Your browser or the embedding frame does not allow fullscreen here. Open the app in its own tab to use it.' });
    }
  }, [toast]);

  const lockFail = useCallback(() => {
    toast({ title: 'Mouse lock unavailable', description: 'This frame or browser blocked pointer lock. Click and drag to look around instead.' });
  }, [toast]);

  const toggleLock = useCallback(() => {
    if (document.pointerLockElement) {
      document.exitPointerLock();
      return;
    }
    const el = wrapRef.current;
    if (!el || !el.requestPointerLock) return lockFail();
    try {
      const res = el.requestPointerLock() as unknown as Promise<void> | undefined;
      if (res && typeof res.then === 'function') res.catch(lockFail);
    } catch {
      lockFail();
    }
  }, [lockFail]);

  useEffect(() => {
    const onChange = () => setLocked(document.pointerLockElement === wrapRef.current && !!wrapRef.current);
    const onFs = () => setFs(!!document.fullscreenElement);
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement === wrapRef.current) {
        input.current.lookDX += e.movementX;
        input.current.lookDY += e.movementY;
        if (cineRef.current) setCinematic(false);
      }
    };
    document.addEventListener('pointerlockchange', onChange);
    document.addEventListener('pointerlockerror', lockFail);
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('mousemove', onMove);
    return () => {
      document.removeEventListener('pointerlockchange', onChange);
      document.removeEventListener('pointerlockerror', lockFail);
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('mousemove', onMove);
    };
  }, [lockFail]);

  // keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (MOVE_KEYS.has(e.code)) {
        if (e.code.startsWith('Arrow')) e.preventDefault();
        input.current.keys.add(e.code);
        setIntro(false);
        if (cineRef.current && !e.code.startsWith('Shift')) setCinematic(false);
        return;
      }
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.code) {
        case 'KeyC': setCinematic((c) => !c); setIntro(false); break;
        case 'KeyR': setSettings((s) => ({ ...s, rain: !s.rain })); break;
        case 'KeyM': void toggleSound(); break;
        case 'KeyF': void toggleFullscreen(); break;
        case 'KeyH': case 'Slash': setHelp((h) => !h); break;
        case 'KeyQ': setSettings((s) => ({ ...s, quality: s.quality === 'high' ? 'low' : s.quality === 'low' ? 'medium' : 'high' })); break;
        case 'Escape': setHelp(false); setQualityOpen(false); break;
        default:
          if (/^Digit[1-5]$/.test(e.code)) goViewpoint(Number(e.code.slice(5)) - 1);
      }
    };
    const up = (e: KeyboardEvent) => input.current.keys.delete(e.code);
    const blur = () => input.current.keys.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [setSettings, toggleSound, toggleFullscreen, goViewpoint]);

  const onShot = useCallback((name: string | null) => setShot(name), []);
  const onArrive = useCallback((i: number) => { setActiveVp(i); setPendingVp(null); }, []);
  const onContextLost = useCallback(() => setContextLost(true), []);

  if (!webgl) return <NoWebGL />;

  const q = settings.quality;

  return (
    <div className="vignette-rain fixed inset-0 overflow-hidden select-none" data-testid="experience-root">
      <div
        ref={wrapRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
        data-testid="canvas-city"
        onPointerDown={(e) => {
          if (drag.current || document.pointerLockElement) return;
          drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
          setIntro(false);
          setQualityOpen(false);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const dx = e.clientX - d.x, dy = e.clientY - d.y;
          d.x = e.clientX; d.y = e.clientY;
          const mult = e.pointerType === 'touch' ? 1.5 : 1;
          input.current.lookDX += dx * mult;
          input.current.lookDY += dy * mult;
          if (cineRef.current && Math.abs(dx) + Math.abs(dy) > 2) setCinematic(false);
        }}
        onPointerUp={(e) => { if (drag.current?.id === e.pointerId) drag.current = null; }}
        onPointerCancel={(e) => { if (drag.current?.id === e.pointerId) drag.current = null; }}
      >
        <Suspense fallback={<SceneSkeleton />}>
          <Scene
            quality={q}
            rain={settings.rain}
            cinematic={cinematic}
            input={input}
            command={command}
            telemetry={telemetry}
            onShot={onShot}
            onArrive={onArrive}
            onContextLost={onContextLost}
          />
        </Suspense>
      </div>

      {/* Cinematic letterbox */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[11vh] bg-[hsl(258_60%_3%)] transition-transform duration-[900ms] ease-[cubic-bezier(.7,0,.2,1)]" style={{ transform: cinematic ? 'translateY(0)' : 'translateY(-100%)' }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[11vh] bg-[hsl(258_60%_3%)] transition-transform duration-[900ms] ease-[cubic-bezier(.7,0,.2,1)]" style={{ transform: cinematic ? 'translateY(0)' : 'translateY(100%)' }} />

      {/* Top bar */}
      <header className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 p-4 md:p-6 transition-opacity duration-700 ${cinematic ? 'opacity-0' : 'opacity-100'}`}>
        <div className="pointer-events-auto">
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-bold tracking-[0.32em] md:text-xl" data-testid="text-title">
              NEO<span className="text-[hsl(8_94%_60%)]">/</span>TOKYO
            </h1>
            <span className="font-jp hidden text-xs text-[hsl(262_18%_70%)] sm:inline">ネオ東京</span>
          </div>
          <div className="mt-1 flex items-center gap-2 font-mono text-[10px] tracking-[0.22em] text-[hsl(262_18%_72%)]">
            <span className="blink inline-block h-1.5 w-1.5 rounded-full bg-[hsl(8_94%_60%)]" />
            <span data-testid="text-location">{location.en.toUpperCase()}</span>
            <span className="font-jp tracking-normal text-[hsl(184_95%_72%)]">{location.jp}</span>
            <span className="hidden md:inline">/ 02:47 / {settings.rain ? 'RAIN 雨' : 'CLEAR 晴'}</span>
          </div>
        </div>
        <div className="hidden pt-1 md:block flex-1">
          <Compass telemetry={telemetry} onLocation={(en, jp) => setLocation({ en, jp })} />
        </div>
        <div className="pointer-events-auto hud-glass flex items-center rounded-[3px]" data-testid="toolbar">
          <button className="hud-btn" data-testid="button-help" aria-label="Controls guide" onClick={() => setHelp((h) => !h)} data-on={help}>
            <HelpCircle className="h-4 w-4" />
          </button>
          <button className="hud-btn" data-testid="button-fullscreen" aria-label="Fullscreen" onClick={() => void toggleFullscreen()}>
            {fs ? <Minimize className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* Mobile compass */}
      <div className={`pointer-events-none absolute inset-x-0 top-[74px] z-20 md:hidden transition-opacity duration-700 ${cinematic ? 'opacity-0' : ''}`}>
        <Compass telemetry={telemetry} />
      </div>

      {/* Intro title card */}
      <div className={`pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center transition-opacity duration-[1400ms] ${intro ? 'opacity-100' : 'opacity-0'}`} data-testid="intro-card">
        <p className="intro-title font-mono text-[10px] tracking-[0.6em] text-[hsl(184_95%_72%)]" style={{ animationDelay: '0.2s' }}>02:47 &middot; 雨 &middot; 渋谷区</p>
        <h2 className="intro-title mt-4 text-center text-5xl font-bold tracking-[0.24em] md:text-8xl" style={{ textShadow: '0 0 40px hsl(330 90% 50% / 0.45)' }}>
          NEO TOKYO
        </h2>
        <p className="intro-title font-jp mt-3 text-sm tracking-[0.8em] text-[hsl(8_94%_66%)]" style={{ animationDelay: '0.5s' }}>アフターダーク</p>
        <p className="intro-title mt-10 font-mono text-[11px] tracking-[0.3em] text-[hsl(30_40%_92%/0.75)]" style={{ animationDelay: '1s' }}>
          {touch ? 'DRAG TO LOOK  /  STICK TO WALK' : 'DRAG TO LOOK  /  WASD TO WALK  /  C FOR CINEMATIC'}
        </p>
      </div>

      {/* Cinematic caption */}
      <div className={`pointer-events-none absolute bottom-[13vh] left-6 z-20 transition-all duration-700 md:left-12 ${cinematic && shot ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}>
        <p className="font-mono text-[10px] tracking-[0.4em] text-[hsl(8_94%_64%)]">CINEMATIC</p>
        <p key={shot ?? ''} className="intro-title mt-2 text-xl font-semibold tracking-[0.2em] md:text-3xl" data-testid="text-shot">{shot}</p>
      </div>
      {cinematic && (
        <button className="hud-btn hud-glass absolute right-4 bottom-[13vh] z-30 md:right-12" data-testid="button-exit-cinematic" onClick={() => setCinematic(false)}>
          <X className="h-4 w-4" /> Take control
        </button>
      )}

      {/* Bottom HUD */}
      <div className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 p-4 md:flex-row md:items-end md:justify-between md:p-6 transition-all duration-700 ${cinematic ? 'translate-y-6 opacity-0' : 'opacity-100'}`}>
        {/* Viewpoints */}
        <nav className="pointer-events-auto order-2 -mx-4 overflow-x-auto px-4 md:order-1 md:mx-0 md:px-0" aria-label="Landmark viewpoints">
          <div className="flex w-max gap-1.5">
            {VIEWPOINTS.map((v, i) => {
              const on = (pendingVp ?? activeVp) === i;
              return (
                <button
                  key={v.id}
                  data-testid={`button-viewpoint-${v.id}`}
                  onClick={() => goViewpoint(i)}
                  className={`hud-glass group relative min-w-[104px] rounded-[3px] px-3 py-2 text-left transition-all duration-300 hover:-translate-y-0.5 ${on ? 'border-[hsl(8_94%_60%/0.7)]' : ''}`}
                >
                  <span className="flex items-center justify-between font-mono text-[9px] tracking-[0.25em] text-[hsl(262_18%_66%)]">
                    0{i + 1}
                    {pendingVp === i && <span className="blink text-[hsl(184_95%_70%)]">EN ROUTE</span>}
                  </span>
                  <span className={`mt-0.5 block whitespace-nowrap text-[12px] font-semibold tracking-[0.12em] ${on ? 'text-[hsl(8_100%_70%)]' : ''}`}>{v.name.toUpperCase()}</span>
                  <span className="font-jp block text-[10px] text-[hsl(262_18%_66%)]">{v.jp}</span>
                  <span className={`absolute inset-x-3 bottom-0 h-px origin-left bg-[hsl(8_94%_60%)] transition-transform duration-500 ${on ? 'scale-x-100' : 'scale-x-0'}`} />
                </button>
              );
            })}
          </div>
        </nav>

        <div className="order-1 flex items-end justify-between gap-3 md:order-2">
          {touch ? (
            <div className="pointer-events-auto md:hidden">
              <Joystick input={input} onUse={() => { dismissIntro(); exitCinematic(); }} />
            </div>
          ) : <span />}
          <div className="pointer-events-auto relative hud-glass flex flex-wrap items-center rounded-[3px]">
            <button className="hud-btn hot" data-on={cinematic} data-testid="button-cinematic" onClick={() => { setCinematic((c) => !c); setIntro(false); }} aria-label="Cinematic camera">
              <Clapperboard className="h-4 w-4" /><span className="hidden lg:inline">Cinematic</span>
            </button>
            <button className="hud-btn" data-on={settings.rain} data-testid="button-rain" onClick={() => setSettings((s) => ({ ...s, rain: !s.rain }))} aria-label="Toggle rain">
              {settings.rain ? <CloudRain className="h-4 w-4" /> : <CloudOff className="h-4 w-4" />}<span className="hidden lg:inline">Rain</span>
            </button>
            <button className="hud-btn" data-on={soundOn} data-testid="button-sound" onClick={() => void toggleSound()} aria-label="Toggle sound" disabled={soundBusy}>
              {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}<span className="hidden lg:inline">{soundBusy ? '...' : 'Sound'}</span>
            </button>
            <button className="hud-btn" data-testid="button-quality" onClick={() => setQualityOpen((o) => !o)} aria-label="Quality settings" data-on={qualityOpen}>
              <Gauge className="h-4 w-4" /><span className="font-mono">{QUALITY_LABEL[q]}</span>
            </button>
            {!touch && (
              <button className="hud-btn" data-on={locked} data-testid="button-pointer-lock" onClick={toggleLock} aria-label="Mouse look lock">
                {locked ? <Lock className="h-4 w-4" /> : <MousePointer2 className="h-4 w-4" />}<span className="hidden lg:inline">{locked ? 'Locked' : 'Mouse lock'}</span>
              </button>
            )}

            {qualityOpen && (
              <div className="hud-glass absolute bottom-[calc(100%+8px)] right-0 w-64 rounded-[3px] p-4" data-testid="panel-settings">
                <p className="font-mono text-[10px] tracking-[0.3em] text-[hsl(262_18%_66%)]">RENDER QUALITY</p>
                <div className="mt-2 grid grid-cols-3 gap-1">
                  {(['low', 'medium', 'high'] as Quality[]).map((k) => (
                    <button
                      key={k}
                      data-testid={`button-quality-${k}`}
                      onClick={() => setSettings((s) => ({ ...s, quality: k }))}
                      className={`rounded-[2px] border py-2 font-mono text-[11px] tracking-[0.15em] transition-colors ${q === k ? 'border-[hsl(184_95%_58%)] bg-[hsl(184_95%_58%/0.14)] text-[hsl(184_95%_78%)]' : 'border-[hsl(262_30%_30%)] hover:bg-[hsl(262_40%_50%/0.12)]'}`}
                    >
                      {k.toUpperCase()}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] leading-snug text-[hsl(262_18%_66%)]">
                  {q === 'low' && 'No reflections or bloom, lighter rain. Best for phones and older laptops.'}
                  {q === 'medium' && 'Wet reflections and bloom at reduced resolution.'}
                  {q === 'high' && 'Full reflections, bloom, dense rain and distant skyline.'}
                </p>
                <label className="mt-4 block font-mono text-[10px] tracking-[0.3em] text-[hsl(262_18%_66%)]" htmlFor="volume">
                  VOLUME <span className="text-[hsl(30_40%_90%)]">{Math.round(settings.volume * 100)}</span>
                </label>
                <input
                  id="volume"
                  data-testid="input-volume"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={settings.volume}
                  onChange={(e) => setSettings((s) => ({ ...s, volume: Number(e.target.value) }))}
                  className="mt-2 w-full accent-[hsl(8_94%_58%)]"
                />
                {!soundOn && <p className="mt-1 text-[11px] text-[hsl(262_18%_60%)]">Sound is off. Use the speaker button to start it.</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls guide */}
      <div className={`absolute inset-0 z-40 flex items-center justify-center p-4 transition-opacity duration-300 ${help ? 'opacity-100' : 'pointer-events-none opacity-0'}`} onClick={() => setHelp(false)} data-testid="panel-help">
        <div className="hud-glass relative w-full max-w-xl rounded-[3px] p-6 md:p-8" onClick={(e) => e.stopPropagation()} style={{ transform: help ? 'none' : 'translateY(10px)', transition: 'transform .35s cubic-bezier(.2,.7,.1,1)' }}>
          <span className="corner-tick left-0 top-0 border-l border-t" />
          <span className="corner-tick right-0 top-0 border-r border-t" />
          <span className="corner-tick bottom-0 left-0 border-b border-l" />
          <span className="corner-tick bottom-0 right-0 border-b border-r" />
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono text-[10px] tracking-[0.35em] text-[hsl(8_94%_64%)]">FIELD GUIDE / 操作</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[0.12em]">How to move through the city</h3>
            </div>
            <button className="hud-btn" data-testid="button-close-help" onClick={() => setHelp(false)} aria-label="Close guide"><X className="h-4 w-4" /></button>
          </div>
          <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            {[
              ['Look', 'Click / touch and drag'],
              ['Walk', 'W A S D  or  arrow keys'],
              ['Run', 'Hold Shift'],
              ['Turn', 'Left / Right arrows'],
              ['Mobile walk', 'Left thumbstick'],
              ['Viewpoints', 'Keys 1 to 5'],
              ['Cinematic camera', 'C'],
              ['Rain', 'R'],
              ['Sound', 'M'],
              ['Quality', 'Q to cycle'],
              ['Fullscreen', 'F'],
              ['This guide', 'H'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3 border-b border-[hsl(262_30%_70%/0.1)] pb-2">
                <dt className="text-[hsl(262_18%_72%)]">{k}</dt>
                <dd className="font-mono text-[12px] text-[hsl(184_95%_76%)]">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-[12px] leading-relaxed text-[hsl(262_18%_66%)]">
            Mouse lock is optional: if the browser or frame refuses it, drag-to-look keeps working. From the Skyline viewpoint, start walking and you will drift down to the rooftops and streets.
          </p>
        </div>
      </div>

      {contextLost && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[hsl(258_60%_4%/0.85)] p-6" data-testid="status-context-lost">
          <div className="max-w-md text-center">
            <p className="font-mono text-[10px] tracking-[0.35em] text-[hsl(8_94%_64%)]">GRAPHICS CONTEXT LOST</p>
            <p className="mt-3 text-[hsl(262_18%_76%)]">The GPU dropped the scene, which can happen under memory pressure. Lower quality usually avoids this.</p>
            <button className="hud-btn hud-glass mt-6" data-testid="button-reload" onClick={() => { setSettings((s) => ({ ...s, quality: 'low' })); setTimeout(() => window.location.reload(), 50); }}>
              Reload on Low quality
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
