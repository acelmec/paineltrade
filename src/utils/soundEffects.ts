export const PATTERN_SOUND_PRESETS = [
  { label: '🔇 Sem Som', value: 'none' },
  { label: '🔔 Padrão Axion (Beep 440Hz)', value: 'default_axion' },
  { label: '✨ Chime Cristalino (900Hz Suave)', value: 'crystal_chime' },
  { label: '⚡ Pulso Cyberpunk (Bip Duplo 650Hz)', value: 'cyber_pulse' },
  { label: '🔮 Gongo Zen (320Hz Ressonante)', value: 'zen_gong' },
  { label: '🚀 Alerta Radar (Acorde Tríade 520Hz)', value: 'radar_ping' }
];

export function playPatternSound(soundType: string = 'default_axion') {
  if (!soundType || soundType === 'none' || typeof window === 'undefined') return;

  try {
    const beepsSetting = localStorage.getItem('vortex_resource_sound_beeps_enabled');
    if (beepsSetting === 'false') return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;

    switch (soundType) {
      case 'crystal_chime': {
        // High melodious sine chime with sparkle
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
        osc.frequency.exponentialRampToValueAtTime(1760, now + 0.28);
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.45);
        break;
      }
      case 'cyber_pulse': {
        // Dual energetic beep (650Hz + 880Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(650, now);
        gain1.gain.setValueAtTime(0.18, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.09);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(880, now + 0.11);
        gain2.gain.setValueAtTime(0.18, now + 0.11);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.11);
        osc2.stop(now + 0.24);
        break;
      }
      case 'zen_gong': {
        // Deep resonant soothing tone (320Hz + 640Hz harmonic)
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(320, now);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(640, now);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.65);
        osc2.stop(now + 0.65);
        break;
      }
      case 'radar_ping': {
        // Triad ping chord (520Hz + 650Hz + 780Hz)
        [520, 650, 780].forEach(freq => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now);
          gain.gain.setValueAtTime(0.1, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.35);
        });
        break;
      }
      case 'default_axion':
      default: {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.18);
        break;
      }
    }
  } catch (e) {
    console.warn('[AUDIO] Erro ao reproduzir som de padrão:', e);
  }
}
