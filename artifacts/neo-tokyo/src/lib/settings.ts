import { useEffect, useState } from 'react';

export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  quality: Quality;
  rain: boolean;
  volume: number;
}

const KEY = 'neo-tokyo:settings:v1';

function defaults(): Settings {
  const coarse =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(pointer: coarse)').matches;
  return { quality: coarse ? 'low' : 'high', rain: true, volume: 0.7 };
}

export function loadSettings(): Settings {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      quality:
        p.quality === 'low' || p.quality === 'medium' || p.quality === 'high'
          ? p.quality
          : d.quality,
      rain: typeof p.rain === 'boolean' ? p.rain : d.rain,
      volume:
        typeof p.volume === 'number' && p.volume >= 0 && p.volume <= 1
          ? p.volume
          : d.volume,
    };
  } catch {
    return d;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable: settings stay in memory */
    }
  }, [settings]);
  return [settings, setSettings] as const;
}

export const QUALITY = {
  low: { dpr: [0.7, 1] as [number, number], rain: 1500, splashes: 90, reflector: false, reflectRes: 0, post: false, peds: 110, far: false },
  medium: { dpr: [1, 1.4] as [number, number], rain: 3500, splashes: 180, reflector: true, reflectRes: 256, post: true, peds: 180, far: true },
  high: { dpr: [1, 2] as [number, number], rain: 6500, splashes: 280, reflector: true, reflectRes: 512, post: true, peds: 220, far: true },
};
