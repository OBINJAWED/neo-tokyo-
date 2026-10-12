export interface CityAudio {
  /** Invoke from a click/tap so browsers can grant audio playback. */
  setEnabled(enabled: boolean): Promise<boolean>;
  setRain(enabled: boolean): void;
  setVolume(value: number): void;
  dispose(): void;
}

type AudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

/**
 * A quiet, procedural city soundscape. No audio, tracking or external services
 * are downloaded. The AudioContext is only created after a user asks for sound.
 */
export function createCityAudio(): CityAudio {
  let context: AudioContext | null = null;
  let output: GainNode | null = null;
  let rainLevel: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let enabled = false;
  let rainy = true;
  let disposed = false;
  let volume = 0.55;
  let revision = 0;
  let transitTimer: ReturnType<typeof setTimeout> | null = null;
  let suspendTimer: ReturnType<typeof setTimeout> | null = null;
  const sources = new Set<AudioScheduledSourceNode>();

  const approach = (parameter: AudioParam, value: number, time = 0.12) => {
    if (!context || context.state === "closed") return;
    parameter.cancelScheduledValues(context.currentTime);
    parameter.setTargetAtTime(value, context.currentTime, time);
  };

  const track = <T extends AudioScheduledSourceNode>(source: T): T => {
    sources.add(source);
    source.addEventListener("ended", () => {
      sources.delete(source);
      source.disconnect();
    }, { once: true });
    return source;
  };

  const clearTransitTimer = () => {
    if (transitTimer !== null) clearTimeout(transitTimer);
    transitTimer = null;
  };

  const scheduleTransit = () => {
    clearTransitTimer();
    if (!enabled || disposed || document.hidden) return;
    transitTimer = setTimeout(() => {
      if (!context || !output || !noise || !enabled || document.hidden) return;

      const start = context.currentTime;
      const source = track(context.createBufferSource());
      const filter = context.createBiquadFilter();
      const envelope = context.createGain();
      const pan = context.createStereoPanner();
      source.buffer = noise;
      source.loop = true;
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(130, start);
      filter.frequency.exponentialRampToValueAtTime(410, start + 3);
      filter.frequency.exponentialRampToValueAtTime(100, start + 7);
      filter.Q.value = 0.75;
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(0.22, start + 3);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + 8);
      const direction = Math.random() > 0.5 ? 1 : -1;
      pan.pan.setValueAtTime(-0.8 * direction, start);
      pan.pan.linearRampToValueAtTime(0.8 * direction, start + 8);
      source.connect(filter).connect(envelope).connect(pan).connect(output);
      source.start();
      source.stop(start + 8.1);
      source.addEventListener("ended", () => {
        filter.disconnect();
        envelope.disconnect();
        pan.disconnect();
      }, { once: true });
      scheduleTransit();
    }, 9_000 + Math.random() * 7_000);
  };

  const initialize = () => {
    const AudioConstructor = window.AudioContext
      ?? (window as AudioWindow).webkitAudioContext;
    if (!AudioConstructor) {
      throw new Error("Ambient sound is not supported by this browser.");
    }
    context = new AudioConstructor({ latencyHint: "playback" });
    output = context.createGain();
    output.gain.value = 0;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.knee.value = 24;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.01;
    limiter.release.value = 0.3;
    output.connect(limiter).connect(context.destination);

    noise = context.createBuffer(2, context.sampleRate * 5, context.sampleRate);
    for (let channel = 0; channel < noise.numberOfChannels; channel++) {
      const samples = noise.getChannelData(channel);
      for (let index = 0; index < samples.length; index++) {
        samples[index] = Math.random() * 2 - 1;
      }
    }

    const rain = track(context.createBufferSource());
    rain.buffer = noise;
    rain.loop = true;
    const rainFilter = context.createBiquadFilter();
    rainFilter.type = "highpass";
    rainFilter.frequency.value = 1_650;
    const rainSoftener = context.createBiquadFilter();
    rainSoftener.type = "lowpass";
    rainSoftener.frequency.value = 8_000;
    rainLevel = context.createGain();
    rainLevel.gain.value = rainy ? 0.12 : 0;
    rain.connect(rainFilter).connect(rainSoftener).connect(rainLevel).connect(output);
    rain.start();

    const city = track(context.createBufferSource());
    city.buffer = noise;
    city.loop = true;
    city.playbackRate.value = 0.73;
    const cityFilter = context.createBiquadFilter();
    cityFilter.type = "lowpass";
    cityFilter.frequency.value = 240;
    const cityLevel = context.createGain();
    cityLevel.gain.value = 0.3;
    city.connect(cityFilter).connect(cityLevel).connect(output);
    city.start();

    // Low machinery and electrical hum: deliberately subtle, not a loud tone.
    for (const [frequency, level] of [[55, 0.021], [82.4069, 0.011], [110, 0.006]]) {
      const oscillator = track(context.createOscillator());
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.value = level;
      oscillator.connect(gain).connect(output);
      oscillator.start();
    }
  };

  const onVisibilityChange = () => {
    if (!output) return;
    approach(output.gain, enabled && !document.hidden ? volume : 0);
    if (document.hidden) clearTransitTimer();
    else if (enabled) scheduleTransit();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  return {
    async setEnabled(nextEnabled) {
      if (disposed) throw new Error("This sound session has ended. Reload to start a new session.");
      const requestRevision = ++revision;
      if (suspendTimer !== null) clearTimeout(suspendTimer);
      suspendTimer = null;

      if (!nextEnabled) {
        enabled = false;
        clearTransitTimer();
        if (output) approach(output.gain, 0, 0.035);
        suspendTimer = setTimeout(() => {
          if (!enabled && context?.state === "running") {
            void context.suspend().catch(() => {
              // The master is already muted; disposal can close the context.
            });
          }
        }, 200);
        return false;
      }

      try {
        if (!context) initialize();
        const activeContext = context!;
        await activeContext.resume();
        if (disposed || requestRevision !== revision) return enabled;
        if (activeContext.state !== "running") {
          throw new Error("Sound is paused by your browser. Click sound again to enable it.");
        }
        enabled = true;
        if (output) approach(output.gain, document.hidden ? 0 : volume, 0.35);
        scheduleTransit();
        return true;
      } catch (error) {
        if (!disposed && requestRevision === revision) {
          enabled = false;
          if (output) approach(output.gain, 0);
        }
        throw error instanceof Error
          ? error
          : new Error("Could not start sound. Check your browser's audio permissions.");
      }
    },
    setRain(nextRainy) {
      rainy = nextRainy;
      if (rainLevel) approach(rainLevel.gain, rainy ? 0.12 : 0, 0.4);
    },
    setVolume(value) {
      if (!Number.isFinite(value)) return;
      volume = Math.max(0, Math.min(1, value));
      if (output) approach(output.gain, enabled && !document.hidden ? volume : 0);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      enabled = false;
      revision++;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearTransitTimer();
      if (suspendTimer !== null) clearTimeout(suspendTimer);
      if (output) output.gain.value = 0;
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          // A finite transit source may already have reached its scheduled stop.
        }
        source.disconnect();
      }
      sources.clear();
      if (context && context.state !== "closed") void context.close().catch(() => {});
      context = null;
      output = null;
      rainLevel = null;
      noise = null;
    },
  };
}
