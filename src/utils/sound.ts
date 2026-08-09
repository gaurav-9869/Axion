class SoundEngine {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  constructor() {
    // Read initial disabled flag from localStorage
    try {
      const stored = localStorage.getItem('axion_ui_sounds_disabled');
      if (stored === 'true') {
        this.enabled = false;
      }
    } catch {}
  }

  private initCtx() {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private playTone({
    frequency,
    type = 'sine',
    duration = 0.1,
    gainStart = 0.1,
    gainEnd = 0,
    frequencyEnd = null
  }: {
    frequency: number;
    type?: OscillatorType;
    duration?: number;
    gainStart?: number;
    gainEnd?: number;
    frequencyEnd?: number | null;
  }) {
    if (!this.enabled) return;

    try {
      const context = this.initCtx();
      if (!context) return;

      const osc = context.createOscillator();
      const gainNode = context.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, context.currentTime);
      if (frequencyEnd !== null) {
        osc.frequency.exponentialRampToValueAtTime(frequencyEnd, context.currentTime + duration);
      }

      gainNode.gain.setValueAtTime(gainStart, context.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(Math.max(gainEnd, 0.0001), context.currentTime + duration);

      osc.connect(gainNode);
      gainNode.connect(context.destination);

      osc.start();
      osc.stop(context.currentTime + duration);
    } catch (e) {
      console.warn("Web Audio API not supported or blocked:", e);
    }
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
    try {
      localStorage.setItem('axion_ui_sounds_disabled', (!val).toString());
    } catch {}
  }

  public playClick() {
    this.playTone({
      frequency: 1200,
      type: 'sine',
      duration: 0.04,
      gainStart: 0.08,
      gainEnd: 0.001
    });
  }

  public playTick() {
    this.playTone({
      frequency: 800,
      type: 'triangle',
      duration: 0.02,
      gainStart: 0.05,
      gainEnd: 0.001
    });
  }

  public playSwoosh() {
    if (!this.enabled) return;
    try {
      const context = this.initCtx();
      if (!context) return;
      
      const duration = 0.25;
      const osc = context.createOscillator();
      const gainNode = context.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, context.currentTime + duration);
      
      gainNode.gain.setValueAtTime(0.001, context.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.08, context.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      
      osc.connect(gainNode);
      gainNode.connect(context.destination);
      
      osc.start();
      osc.stop(context.currentTime + duration);
    } catch {}
  }

  public playChime() {
    if (!this.enabled) return;
    try {
      const context = this.initCtx();
      if (!context) return;

      const playChimeTone = (freq: number, startDelay: number, dur: number) => {
        const osc = context.createOscillator();
        const gainNode = context.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, context.currentTime + startDelay);
        gainNode.gain.setValueAtTime(0.0001, context.currentTime + startDelay);
        gainNode.gain.linearRampToValueAtTime(0.12, context.currentTime + startDelay + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + startDelay + dur);
        
        osc.connect(gainNode);
        gainNode.connect(context.destination);
        osc.start(context.currentTime + startDelay);
        osc.stop(context.currentTime + startDelay + dur);
      };

      playChimeTone(523.25, 0, 0.4);
      playChimeTone(659.25, 0.1, 0.4);
      playChimeTone(783.99, 0.2, 0.6);
    } catch {}
  }

  public playError() {
    if (!this.enabled) return;
    try {
      const context = this.initCtx();
      if (!context) return;
      
      const playBuzz = (freq: number, delay: number, dur: number) => {
        const osc = context.createOscillator();
        const gainNode = context.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, context.currentTime + delay);
        gainNode.gain.setValueAtTime(0.05, context.currentTime + delay);
        gainNode.gain.linearRampToValueAtTime(0.001, context.currentTime + delay + dur);
        
        osc.connect(gainNode);
        gainNode.connect(context.destination);
        osc.start(context.currentTime + delay);
        osc.stop(context.currentTime + delay + dur);
      };

      playBuzz(120, 0, 0.15);
      playBuzz(100, 0.2, 0.2);
    } catch {}
  }

  public playSuccess() {
    this.playChime();
  }
}

export const audioManager = new SoundEngine();
export const sound = audioManager;

if (typeof window !== 'undefined') {
  (window as any).sound = audioManager;
}
