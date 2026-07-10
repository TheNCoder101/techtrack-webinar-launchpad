// Tiny procedural SFX via WebAudio oscillators — no audio assets to
// download, works offline, negligible CPU cost on mobile.
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
  }

  private tone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType,
    gainPeak: number
  ): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + duration);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(gainPeak, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private noiseBurst(duration: number, gainPeak: number): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainPeak, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(gain);
    gain.connect(this.master);
    src.start(t0);
  }

  shoot(): void {
    this.tone(760, 220, 0.09, "square", 0.22);
  }

  reload(): void {
    this.tone(300, 500, 0.12, "triangle", 0.15);
  }

  hitBot(): void {
    this.tone(180, 60, 0.14, "sawtooth", 0.25);
  }

  impact(): void {
    this.noiseBurst(0.08, 0.12);
  }

  harvestHit(): void {
    this.tone(500, 300, 0.08, "square", 0.15);
  }

  jump(): void {
    this.tone(240, 420, 0.1, "sine", 0.18);
  }

  build(): void {
    this.tone(220, 340, 0.16, "square", 0.2);
  }

  playerHurt(): void {
    this.tone(150, 80, 0.2, "sawtooth", 0.28);
  }

  botKill(): void {
    this.tone(500, 900, 0.18, "triangle", 0.25);
  }

  pickaxeSwing(): void {
    this.tone(220, 140, 0.09, "square", 0.18);
  }

  switchWeapon(): void {
    this.tone(400, 600, 0.06, "square", 0.12);
  }

  pickupWeapon(): void {
    this.tone(400, 800, 0.22, "triangle", 0.22);
  }

  airdropLand(): void {
    this.noiseBurst(0.25, 0.22);
    this.tone(160, 60, 0.3, "sawtooth", 0.2);
  }
}
