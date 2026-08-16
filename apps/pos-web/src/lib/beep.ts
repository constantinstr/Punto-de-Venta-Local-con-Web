// Feedback sonoro corto para el lector de código de barras — sin archivos de
// audio, generado con Web Audio API. Un beep agudo y corto para éxito, dos
// beeps graves para error (patrón distinguible sin mirar la pantalla).
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  audioContext ??= new AudioContextCtor();
  return audioContext;
}

function tone(ctx: AudioContext, frequency: number, startAt: number, durationMs: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.frequency.value = frequency;
  oscillator.type = "sine";
  gain.gain.setValueAtTime(0.15, ctx.currentTime + startAt);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + durationMs / 1000);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(ctx.currentTime + startAt);
  oscillator.stop(ctx.currentTime + startAt + durationMs / 1000);
}

export function playScanSuccessBeep() {
  const ctx = getAudioContext();
  if (!ctx) return;
  tone(ctx, 880, 0, 100);
}

export function playScanErrorBeep() {
  const ctx = getAudioContext();
  if (!ctx) return;
  tone(ctx, 220, 0, 150);
  tone(ctx, 220, 0.18, 150);
}
