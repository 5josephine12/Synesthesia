import type { BlobParticle } from "./AuraToy";

// Full precision is intentional: export geometry must match the live particles.
// Fixed-size pages avoid copying an ever-growing array during recording.
const PAGE_SIZE = 256;
const NUMBER_FIELDS = [
  "id", "midi", "repeat", "compositionIndex", "styleEpoch", "x", "y", "radius",
  "angle", "stretch", "thickness", "curvature", "velocity", "softness", "createdAt",
] as const;
const STRIDE = NUMBER_FIELDS.length + 11;
const STYLE_OFFSET = NUMBER_FIELDS.length + 6;
const FROZEN_OFFSET = STRIDE - 1;

export class ParticleHistory {
  private pages: Float64Array[] = [];
  private strings: string[] = [];
  private stringIds = new Map<string, number>();
  length = 0;

  get byteLength() { return this.pages.length * PAGE_SIZE * STRIDE * 8; }

  private intern(value: string) {
    const existing = this.stringIds.get(value);
    if (existing !== undefined) return existing;
    const id = this.strings.length;
    this.strings.push(value);
    this.stringIds.set(value, id);
    return id;
  }

  append(particle: BlobParticle) {
    const pageIndex = Math.floor(this.length / PAGE_SIZE);
    const page = this.pages[pageIndex] ?? (this.pages[pageIndex] = new Float64Array(PAGE_SIZE * STRIDE));
    let offset = (this.length % PAGE_SIZE) * STRIDE;
    for (const field of NUMBER_FIELDS) page[offset++] = particle[field];
    for (const color of [particle.color, particle.accent]) {
      page[offset++] = color.h;
      page[offset++] = color.s;
      page[offset++] = color.l;
    }
    page[offset++] = this.intern(particle.artStyle);
    page[offset++] = this.intern(particle.shape);
    page[offset++] = this.intern(particle.note);
    page[offset++] = this.intern(particle.blendMode);
    page[offset] = particle.frozenAt ?? Number.NaN;
    this.length++;
  }

  freezeStyleFrom(start: number, style: BlobParticle["artStyle"], frozenAt: number) {
    const styleId = this.stringIds.get(style);
    if (styleId === undefined) return;
    for (let index = start; index < this.length; index++) {
      const page = this.pages[Math.floor(index / PAGE_SIZE)];
      const offset = (index % PAGE_SIZE) * STRIDE;
      if (page[offset + STYLE_OFFSET] === styleId && Number.isNaN(page[offset + FROZEN_OFFSET])) {
        page[offset + FROZEN_OFFSET] = frozenAt;
      }
    }
  }

  snapshot(): BlobParticle[] {
    const result = new Array<BlobParticle>(this.length);
    for (let index = 0; index < this.length; index++) {
      const page = this.pages[Math.floor(index / PAGE_SIZE)];
      let offset = (index % PAGE_SIZE) * STRIDE;
      const particle = {} as BlobParticle;
      for (const field of NUMBER_FIELDS) particle[field] = page[offset++];
      particle.color = { h: page[offset++], s: page[offset++], l: page[offset++] };
      particle.accent = { h: page[offset++], s: page[offset++], l: page[offset++] };
      particle.artStyle = this.strings[page[offset++]] as BlobParticle["artStyle"];
      particle.shape = this.strings[page[offset++]] as BlobParticle["shape"];
      particle.note = this.strings[page[offset++]];
      particle.blendMode = this.strings[page[offset++]] as BlobParticle["blendMode"];
      const frozenAt = page[offset];
      if (!Number.isNaN(frozenAt)) particle.frozenAt = frozenAt;
      result[index] = particle;
    }
    return result;
  }

  clear() {
    this.pages = [];
    this.strings = [];
    this.stringIds.clear();
    this.length = 0;
  }
}
