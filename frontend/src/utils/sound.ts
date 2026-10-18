/**
 * Small UI sounds. One AudioContext is shared by the whole app and created lazily inside the
 * first click handler that plays a sound, so the very first click is audible and contexts don't
 * pile up across page visits. Browsers without Web Audio just stay silent.
 */
let context: AudioContext | null | undefined;

function getContext(): AudioContext | null {
  if (context === undefined) {
    try {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      context = Ctor ? new Ctor() : null;
    } catch {
      context = null;
    }
  }
  if (context?.state === 'suspended') {
    void context.resume().catch(() => {});
  }
  return context;
}

export function playTick(frequency = 800, duration = 0.1, volume = 0.1): void {
  const ctx = getContext();
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + duration);
}

export function playSelectionTick(): void {
  playTick(1200, 0.08, 0.06);
}

export function playSuccessChime(): void {
  playTick(600, 0.15, 0.08);
  setTimeout(() => playTick(800, 0.15, 0.06), 50);
  setTimeout(() => playTick(1000, 0.2, 0.04), 100);
}
