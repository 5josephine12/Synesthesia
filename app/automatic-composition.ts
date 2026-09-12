/** Musical direction only: existing renderers still own every graphic and animation. */
export class AutomaticComposition {
  enabled = false;
  private activeTime = 0;
  private lastAudioAt = Number.NEGATIVE_INFINITY;
  private audioWasActive = false;
  private lastNoteAt = Number.NEGATIVE_INFINITY;
  private styleChangedAt = 0;
  private visited = 1;
  private energy = 0.5;
  private brightness = 0.5;
  private bass = 0.5;
  private beatInterval = 500;
  private nextOverlayAt = 18_000;
  private nextResetAt = 60_000;
  private overlayEndsAt = Number.POSITIVE_INFINITY;

  start(style: number, overlay: boolean) {
    this.enabled = true;
    this.activeTime = 0;
    this.styleChangedAt = 0;
    this.visited = 1 << style;
    this.energy = this.brightness = this.bass = 0.5;
    this.beatInterval = 500;
    this.nextOverlayAt = 18_000;
    this.nextResetAt = 60_000;
    this.overlayEndsAt = overlay ? 6500 : Number.POSITIVE_INFINITY;
    this.pause();
  }

  stop() { this.enabled = false; this.pause(); }

  /** No catch-up transitions after silence, a hidden tab, or a modal preview. */
  pause() {
    this.lastAudioAt = this.lastNoteAt = Number.NEGATIVE_INFINITY;
    this.audioWasActive = false;
  }

  manualStyle(style: number) {
    this.styleChangedAt = this.activeTime;
    this.visited |= 1 << style;
  }

  manualOverlay(overlay: boolean) {
    this.overlayEndsAt = overlay ? this.activeTime + 6500 : Number.POSITIVE_INFINITY;
    this.nextOverlayAt = this.activeTime + 18_000;
  }

  observeAudio(now: number, active: boolean, level: number, midi: number | null, bassMidi: number | null) {
    if (!this.enabled || !Number.isFinite(now)) return;
    const elapsed = now - this.lastAudioAt;
    if (active && this.audioWasActive && elapsed > 0 && elapsed <= 500) this.activeTime += elapsed;
    this.lastAudioAt = now;
    this.audioWasActive = active;
    if (!active) return;
    // Reuse the existing audio analysis; there is no extra FFT or audio stream.
    const amount = 1 - Math.exp(-Math.min(100, Math.max(0, elapsed)) / 700);
    this.energy += (clamp(level) - this.energy) * amount;
    if (midi !== null) this.brightness += (clamp((midi - 36) / 48) - this.brightness) * amount;
    const low = bassMidi === null ? 0 : clamp((65 - bassMidi) / 35);
    this.bass += (low - this.bass) * amount;
  }

  note(now: number, midi: number, velocity: number, style: number, overlay: boolean) {
    if (!this.enabled || !Number.isFinite(now)) return null;
    const gap = now - this.lastNoteAt;
    if (gap < 90) return null; // One musical gesture, including companion notes and chords.
    const hasAudio = now - this.lastAudioAt >= -100 && now - this.lastAudioAt < 500;
    if (!hasAudio) {
      // Keyboard/MIDI input also works. A long gap is silence, not elapsed music.
      if (gap > 0 && gap <= 1800) this.activeTime += gap;
      this.energy += (clamp(velocity) - this.energy) * 0.2;
      this.brightness += (clamp((midi - 36) / 48) - this.brightness) * 0.2;
      this.bass += (clamp((65 - midi) / 35) - this.bass) * 0.2;
    }
    this.lastNoteAt = now;
    if (gap >= 160 && gap <= 1800) this.beatInterval += (gap - this.beatInterval) * 0.2;

    let nextStyle = style;
    let nextOverlay = overlay;
    // Strong passages move sooner; gentle passages get more room. The decision
    // is applied immediately before this note is drawn, never by a free-running timer.
    const dwell = 9000 - this.energy * 3500;
    if (this.activeTime - this.styleChangedAt >= dwell) {
      if ((this.visited & 15) === 15) this.visited = 1 << style;
      const pace = clamp((900 - this.beatInterval) / 650);
      let bestScore = Number.NEGATIVE_INFINITY;
      for (let candidate = 0; candidate < 4; candidate += 1) {
        if (candidate === style || (this.visited & (1 << candidate))) continue;
        // Aura: spacious; Pixel: bright rhythm; Metalheart: bass/impact;
        // Halftone: layered, mid-energy detail. Every round visits all four.
        const score = candidate === 0 ? (1 - this.energy) * 1.3 + (1 - pace) * 0.6
          : candidate === 1 ? this.brightness * 0.9 + pace * 0.8
          : candidate === 2 ? this.bass * 1.1 + this.energy * 0.9
          : (1 - Math.abs(this.energy - 0.6)) * 0.9 + (1 - this.bass) * 0.4;
        if (score > bestScore) { bestScore = score; nextStyle = candidate; }
      }
      this.styleChangedAt = this.activeTime;
      this.visited |= 1 << nextStyle;
    }
    if (overlay && this.activeTime >= this.overlayEndsAt) {
      nextOverlay = false;
      this.overlayEndsAt = Number.POSITIVE_INFINITY;
      this.nextOverlayAt = this.activeTime + 18_000 + (1 - this.energy) * 6000;
    } else if (!overlay && this.activeTime >= this.nextOverlayAt) {
      nextOverlay = true;
      this.overlayEndsAt = this.activeTime + 5000 + (1 - this.energy) * 2500;
    }
    // Start a fresh canvas on a note after each minute of actual musical activity.
    // Do not restart this director or the audio pipeline when the canvas clears.
    const reset = this.activeTime >= this.nextResetAt;
    if (reset) this.nextResetAt = this.activeTime + 60_000;
    return nextStyle !== style || nextOverlay !== overlay || reset
      ? { style: nextStyle, overlay: nextOverlay, reset } : null;
  }
}

function clamp(value: number) { return Math.max(0, Math.min(1, value)); }
