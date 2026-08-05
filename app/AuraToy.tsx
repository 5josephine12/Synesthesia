"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  Download,
  Image as ImageIcon,
  Mic,
  MicOff,
  Video as VideoIcon,
  X,
} from "lucide-react";
import { PitchDetector } from "pitchy";
import { Filter, Freeverb, PolySynth, Synth, start as startTone } from "tone";

type Color = {
  h: number;
  s: number;
  l: number;
};

type NoteChoice = {
  name: string;
  midi: number;
  pc: number;
};

type Mapping = {
  seedHash: number;
  pitches: Color[];
};

type AuraShape = "bloom" | "ribbon" | "beam" | "arc" | "prism" | "veil" | "wave" | "halo" | "flare" | "mesh";

type BlobParticle = {
  id: number;
  color: Color;
  accent: Color;
  shape: AuraShape;
  repeat: number;
  x: number;
  y: number;
  radius: number;
  angle: number;
  stretch: number;
  thickness: number;
  curvature: number;
  velocity: number;
  softness: number;
  createdAt: number;
};

type KeySpec = NoteChoice & {
  id: string;
  kind: "white" | "upper";
  left?: number;
};

type AuraSynth = {
  triggerAttack: (note: string, time?: number, velocity?: number) => void;
  triggerRelease: (note: string, time?: number) => void;
  releaseAll: () => void;
  dispose: () => void;
};

type AuraReverb = {
  dispose: () => void;
};

type AuraFilter = {
  dispose: () => void;
};

type SoundModeId = "piano" | "glass" | "pad" | "pluck" | "organ";

type SoundMode = {
  id: SoundModeId;
  label: string;
  oscillator: "triangle8" | "sine4" | "sine" | "triangle" | "square4";
  envelope: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  volume: number;
  filterFrequency: number;
  filterQ: number;
  reverb: {
    roomSize: number;
    dampening: number;
    wet: number;
  };
};

type VisualMode = {
  shapeBands: readonly [readonly AuraShape[], readonly AuraShape[], readonly AuraShape[]];
  accentStep: number;
  angleBias: number;
  softness: number;
};

type ExportState = "idle" | "video";
type ExportKind = "image" | "video";
type MicrophoneState = "idle" | "requesting" | "listening" | "error" | "unsupported";
type ScaleMode = "major" | "minor";

type HarmonicContext = {
  root: number;
  mode: ScaleMode;
  confidence: number;
};

type SpectrumNote = {
  midi: number;
  score: number;
};

type MicrophoneRuntime = {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  detector: PitchDetector<Float32Array>;
  timeDomain: Float32Array;
  frequencyData: Float32Array;
  previousSpectrum: Float32Array;
  chroma: Float32Array;
  frameChroma: Float32Array;
  animationFrame: number;
  lastAnalysisAt: number;
  lastVisualAt: number;
  lastBeatAt: number;
  lastValidPitchAt: number;
  lastMidi: number | null;
  candidateMidi: number | null;
  candidateFrames: number;
  noiseFloor: number;
  smoothedEnergy: number;
  smoothedFlux: number;
  melodyPitchClass: number | null;
  melodyCandidatePitchClass: number | null;
  melodyCandidateFrames: number;
  melodyLastSeenAt: number;
  visualCursor: number;
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BASE_OCTAVE = 4;
const MIN_OCTAVE = 1;
const MAX_OCTAVE = 7;
const MIN_MIDI = (MIN_OCTAVE + 1) * 12;
const MAX_MIDI = (MAX_OCTAVE + 2) * 12 - 1;
const BLOB_ARRIVAL_DURATION = 550;
const MICROPHONE_ANALYSIS_INTERVAL = 1000 / 30;
const MICROPHONE_FFT_SIZE = 4096;
const DEFAULT_SOUND_MODE: SoundModeId = "piano";
const RADIOGRAPHIC_HUES = [338, 322, 300, 282, 260, 238, 220, 10, 18, 348, 312, 248] as const;
const MAJOR_SCALE_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88] as const;
const MINOR_SCALE_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17] as const;
const COMPOSITION_ANCHORS = [
  [0.14, 0.3],
  [0.82, 0.2],
  [0.3, 0.7],
  [0.7, 0.62],
  [0.48, 0.17],
  [0.9, 0.46],
  [0.12, 0.68],
  [0.76, 0.8],
  [0.36, 0.42],
  [0.6, 0.36],
  [0.27, 0.15],
  [0.5, 0.76],
] as const;

const VISUAL_MODES: Record<SoundModeId, VisualMode> = {
  piano: {
    shapeBands: [
      ["veil", "bloom", "arc"],
      ["mesh", "ribbon", "wave"],
      ["halo", "prism", "flare"],
    ],
    accentStep: 1,
    angleBias: -0.08,
    softness: 0.62,
  },
  glass: {
    shapeBands: [
      ["arc", "halo"],
      ["prism", "mesh"],
      ["flare", "beam"],
    ],
    accentStep: 5,
    angleBias: -0.34,
    softness: 0.38,
  },
  pad: {
    shapeBands: [
      ["veil", "bloom"],
      ["ribbon", "wave", "arc"],
      ["halo", "mesh"],
    ],
    accentStep: -1,
    angleBias: 0.14,
    softness: 0.9,
  },
  pluck: {
    shapeBands: [
      ["beam", "arc"],
      ["wave", "ribbon", "prism"],
      ["flare", "beam"],
    ],
    accentStep: 7,
    angleBias: 0.44,
    softness: 0.32,
  },
  organ: {
    shapeBands: [
      ["arc", "veil", "bloom"],
      ["halo", "ribbon", "mesh"],
      ["wave", "prism"],
    ],
    accentStep: 3,
    angleBias: 0,
    softness: 0.7,
  },
};

const SOUND_MODES: readonly SoundMode[] = [
  {
    id: "piano",
    label: "Piano",
    oscillator: "triangle8",
    envelope: { attack: 0.006, decay: 1.15, sustain: 0.06, release: 1.1 },
    volume: -8,
    filterFrequency: 5200,
    filterQ: 0.45,
    reverb: { roomSize: 0.56, dampening: 4300, wet: 0.12 },
  },
  {
    id: "glass",
    label: "Glass",
    oscillator: "sine4",
    envelope: { attack: 0.012, decay: 1.8, sustain: 0.08, release: 2.4 },
    volume: -10,
    filterFrequency: 7600,
    filterQ: 1.2,
    reverb: { roomSize: 0.82, dampening: 5200, wet: 0.34 },
  },
  {
    id: "pad",
    label: "Warm Pad",
    oscillator: "sine",
    envelope: { attack: 0.42, decay: 0.8, sustain: 0.72, release: 2.8 },
    volume: -8,
    filterFrequency: 2200,
    filterQ: 0.7,
    reverb: { roomSize: 0.86, dampening: 2500, wet: 0.3 },
  },
  {
    id: "pluck",
    label: "Pluck",
    oscillator: "triangle",
    envelope: { attack: 0.002, decay: 0.24, sustain: 0.01, release: 0.42 },
    volume: -7,
    filterFrequency: 4100,
    filterQ: 1.7,
    reverb: { roomSize: 0.42, dampening: 3600, wet: 0.08 },
  },
  {
    id: "organ",
    label: "Organ",
    oscillator: "square4",
    envelope: { attack: 0.025, decay: 0.08, sustain: 0.86, release: 0.55 },
    volume: -13,
    filterFrequency: 3300,
    filterQ: 0.35,
    reverb: { roomSize: 0.66, dampening: 3000, wet: 0.16 },
  },
];

const WHITE_KEYS = buildKeys().filter((key) => key.kind === "white");
const UPPER_KEYS = buildKeys().filter((key) => key.kind === "upper");
const KEYBOARD_ORDER = [
  "a",
  "w",
  "s",
  "e",
  "d",
  "f",
  "t",
  "g",
  "y",
  "h",
  "u",
  "j",
  "k",
  "o",
  "l",
  "p",
  ";",
  "'",
  "]",
  "\\",
  "z",
  "x",
  "c",
  "v",
];

function buildKeys(): KeySpec[] {
  const keys: KeySpec[] = [];
  const whitePitchClasses = [0, 2, 4, 5, 7, 9, 11];
  const upperSlots = [
    { pc: 1, afterWhite: 0 },
    { pc: 3, afterWhite: 1 },
    { pc: 6, afterWhite: 3 },
    { pc: 8, afterWhite: 4 },
    { pc: 10, afterWhite: 5 },
  ];

  const octave = 4;
  whitePitchClasses.forEach((pc) => {
    const note = `${NOTE_NAMES[pc]}${octave}`;
    keys.push({
      id: note,
      kind: "white",
      name: note,
      midi: (octave + 1) * 12 + pc,
      pc,
    });
  });

  upperSlots.forEach(({ pc, afterWhite }) => {
    const note = `${NOTE_NAMES[pc]}${octave}`;
    keys.push({
      id: note,
      kind: "upper",
      name: note,
      midi: (octave + 1) * 12 + pc,
      pc,
      left: (afterWhite + 1) / 7,
    });
  });

  return keys;
}

function midiToNote(midi: number): NoteChoice {
  const pc = modulo(midi, 12);
  const octave = Math.floor(midi / 12) - 1;
  return {
    name: `${NOTE_NAMES[pc]}${octave}`,
    midi,
    pc,
  };
}

function modulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    let next = (seed += 0x6d2b79f5);
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function spectralColor(index: number, rng: () => number, pale = false): Color {
  const hue = modulo(
    RADIOGRAPHIC_HUES[modulo(index, RADIOGRAPHIC_HUES.length)] + (rng() - 0.5) * 8,
    360,
  );
  return {
    h: hue,
    s: pale ? 72 + rng() * 12 : 84 + rng() * 14,
    l: pale ? 64 + rng() * 8 : 50 + rng() * 13,
  };
}

function createMapping(): Mapping {
  const seedHash = fnv1a("AURA");
  const rng = mulberry32(seedHash);
  const pitches: Color[] = [];
  const paletteOffset = seedHash % RADIOGRAPHIC_HUES.length;

  for (let index = 0; index < 12; index += 1) {
    pitches.push(spectralColor(paletteOffset + index * 5, rng));
  }

  return {
    seedHash,
    pitches,
  };
}

const AURA_MAPPING = createMapping();

function frequencyToMidi(frequency: number) {
  return 69 + 12 * Math.log2(frequency / 440);
}

function calculateRms(samples: Float32Array) {
  let energy = 0;
  for (let index = 0; index < samples.length; index += 1) {
    energy += samples[index] * samples[index];
  }
  return Math.sqrt(energy / samples.length);
}

function updateSpectrumAnalysis(
  frequencyData: Float32Array,
  previousSpectrum: Float32Array,
  chroma: Float32Array,
  frameChroma: Float32Array,
  sampleRate: number,
  fftSize: number,
) {
  frameChroma.fill(0);

  const minimumBin = Math.max(1, Math.ceil((45 * fftSize) / sampleRate));
  const maximumBin = Math.min(frequencyData.length - 1, Math.floor((4200 * fftSize) / sampleRate));
  let spectralFlux = 0;
  let peakDecibels = -Infinity;

  for (let bin = minimumBin; bin <= maximumBin; bin += 1) {
    const decibels = frequencyData[bin];
    const amplitude = Number.isFinite(decibels) ? Math.pow(10, decibels / 20) : 0;
    const previousAmplitude = previousSpectrum[bin];
    if (amplitude > previousAmplitude) spectralFlux += amplitude - previousAmplitude;
    previousSpectrum[bin] = amplitude;

    if (decibels > peakDecibels) peakDecibels = decibels;
  }

  const candidateScores = new Map<number, number>();
  const peakThreshold = Math.max(-78, peakDecibels - 30);
  const harmonicWeights = [1, 0.5, 0.32, 0.22] as const;
  for (let bin = minimumBin + 1; bin < maximumBin; bin += 1) {
    const decibels = frequencyData[bin];
    if (!Number.isFinite(decibels) || decibels < peakThreshold) continue;
    const left = frequencyData[bin - 1];
    const right = frequencyData[bin + 1];
    if (decibels < left || decibels <= right) continue;

    const frequency = (bin * sampleRate) / fftSize;
    const amplitude = Math.pow(10, decibels / 20);
    const prominence = clamp((decibels - Math.max(left, right)) / 10, 0.18, 1);
    const peakWeight = (amplitude * (0.72 + prominence * 0.28)) / Math.sqrt(1 + frequency / 1500);

    for (let harmonic = 1; harmonic <= harmonicWeights.length; harmonic += 1) {
      const fundamental = frequency / harmonic;
      const midi = Math.round(frequencyToMidi(fundamental));
      if (midi < MIN_MIDI || midi > MAX_MIDI) continue;
      const score = peakWeight * harmonicWeights[harmonic - 1];
      candidateScores.set(midi, (candidateScores.get(midi) ?? 0) + score);
      frameChroma[modulo(midi, 12)] += score;
    }
  }

  for (let pitchClass = 0; pitchClass < chroma.length; pitchClass += 1) {
    chroma[pitchClass] = chroma[pitchClass] * 0.94 + frameChroma[pitchClass];
  }

  const rankedPitchClasses = Array.from(frameChroma, (score, pitchClass) => ({ pitchClass, score })).sort(
    (first, second) => second.score - first.score,
  );
  const strongestPitchClass = rankedPitchClasses[0]?.score ?? 0;
  const totalPitchEnergy = rankedPitchClasses.reduce((sum, candidate) => sum + candidate.score, 0);
  const pitchClasses = rankedPitchClasses
    .filter(
      ({ score }) =>
        score > 0 && score >= strongestPitchClass * 0.44 && score >= Math.max(0.000001, totalPitchEnergy * 0.1),
    )
    .slice(0, 3)
    .map(({ pitchClass }) => pitchClass);

  const rankedNotes = Array.from(candidateScores, ([midi, score]) => ({ midi, score })).sort(
    (first, second) => second.score - first.score,
  );
  const noteCandidates: SpectrumNote[] = pitchClasses.flatMap((pitchClass) => {
    const candidate = rankedNotes.find(({ midi }) => modulo(midi, 12) === pitchClass);
    return candidate ? [candidate] : [];
  });

  return {
    spectralFlux,
    dominantMidi: noteCandidates[0]?.midi ?? null,
    noteCandidates,
    pitchClasses,
  };
}

function detectHarmonicContext(chroma: Float32Array): HarmonicContext | null {
  const total = chroma.reduce((sum, value) => sum + value, 0);
  if (total < 0.0001) return null;

  let best: HarmonicContext & { score: number } = { root: 0, mode: "major", confidence: 0, score: -Infinity };
  let secondScore = -Infinity;
  for (let root = 0; root < 12; root += 1) {
    for (const [mode, profile] of [
      ["major", MAJOR_SCALE_PROFILE],
      ["minor", MINOR_SCALE_PROFILE],
    ] as const) {
      let score = 0;
      for (let degree = 0; degree < 12; degree += 1) {
        score += (chroma[modulo(root + degree, 12)] / total) * profile[degree];
      }
      if (score > best.score) {
        secondScore = best.score;
        best = { root, mode, confidence: 0, score };
      } else if (score > secondScore) {
        secondScore = score;
      }
    }
  }

  return {
    root: best.root,
    mode: best.mode,
    confidence: clamp(((best.score - secondScore) / Math.max(0.001, best.score)) * 5, 0, 1),
  };
}

function blendHue(from: number, to: number, amount: number) {
  const difference = modulo(to - from + 180, 360) - 180;
  return modulo(from + difference * amount, 360);
}

function microphoneColor(base: Color, harmonicContext: HarmonicContext | null) {
  if (!harmonicContext || harmonicContext.confidence <= 0.08) return base;
  const tonic = AURA_MAPPING.pitches[harmonicContext.root];
  const confidence = (harmonicContext.confidence - 0.08) / 0.92;
  const amount = confidence * 0.14;
  return {
    h: blendHue(base.h, tonic.h, amount),
    s: clamp(base.s + confidence * 3, 0, 100),
    l: clamp(base.l + (harmonicContext.mode === "major" ? 2 : -1) * confidence, 0, 72),
  };
}

function disposeMicrophoneRuntime(runtime: MicrophoneRuntime | null) {
  if (!runtime) return;
  window.cancelAnimationFrame(runtime.animationFrame);
  runtime.source.disconnect();
  runtime.analyser.disconnect();
  runtime.stream.getTracks().forEach((track) => track.stop());
  void runtime.context.close().catch(() => undefined);
}

function colorToHslar(color: Color, alpha: number) {
  return `hsla(${Math.round(color.h)}, ${Math.round(color.s)}%, ${Math.round(color.l)}%, ${alpha})`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - clamp(value, 0, 1), 3);
}

function makeNoiseTile(size: number, alpha = 18, seed = 0x4a3035) {
  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;
  const tileContext = tile.getContext("2d");
  if (!tileContext) return tile;
  const rng = mulberry32(seed);
  const image = tileContext.createImageData(size, size);
  for (let index = 0; index < image.data.length; index += 4) {
    const value = rng() * 255;
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
    image.data[index + 3] = rng() * alpha;
  }
  tileContext.putImageData(image, 0, 0);
  return tile;
}

function drawGrain(context: CanvasRenderingContext2D, width: number, height: number, tile: HTMLCanvasElement, alpha: number) {
  const pattern = context.createPattern(tile, "repeat");
  if (!pattern) return;

  context.save();
  context.globalCompositeOperation = "overlay";
  context.globalAlpha = alpha;
  context.fillStyle = pattern;
  context.fillRect(0, 0, width, height);
  context.restore();
}

function makeLinearAuraGradient(
  context: CanvasRenderingContext2D,
  blob: BlobParticle,
  length: number,
  alpha: number,
  reverse = false,
) {
  const primary = reverse ? blob.accent : blob.color;
  const accent = reverse ? blob.color : blob.accent;
  const gradient = context.createLinearGradient(-length / 2, 0, length / 2, 0);
  gradient.addColorStop(0, colorToHslar(primary, 0));
  gradient.addColorStop(0.18, colorToHslar(primary, alpha * 0.46));
  gradient.addColorStop(0.52, colorToHslar(accent, alpha));
  gradient.addColorStop(0.78, colorToHslar(primary, alpha * 0.58));
  gradient.addColorStop(1, colorToHslar(accent, 0));
  return gradient;
}

function traceTissueLobe(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  curvature: number,
  phase: number,
) {
  const upperBend = Math.sin(phase * 1.37) * height * 0.18;
  const lowerBend = Math.cos(phase * 1.11) * height * 0.16;
  const taper = clamp(0.38 + Math.abs(curvature) * 0.12, 0.38, 0.58);

  context.beginPath();
  context.moveTo(-width * 0.5, height * 0.06);
  context.bezierCurveTo(
    -width * 0.34,
    -height * taper + upperBend,
    width * 0.16,
    -height * 0.48 - curvature * height * 0.12,
    width * 0.5,
    -height * 0.08,
  );
  context.bezierCurveTo(
    width * 0.31,
    height * 0.44 + lowerBend,
    -width * 0.18,
    height * 0.5 + curvature * height * 0.1,
    -width * 0.5,
    height * 0.06,
  );
  context.closePath();
}

function drawTissueWash(
  context: CanvasRenderingContext2D,
  blob: BlobParticle,
  radius: number,
  alpha: number,
) {
  const width = radius * (1.1 + Math.min(blob.stretch, 5.2) * 0.48);
  const height = radius * (0.92 + blob.thickness * 0.9 + blob.softness * 0.34);
  const phase = blob.id * 0.37 + blob.repeat * 0.68;

  context.save();
  context.filter = `blur(${Math.max(1.2, radius * 0.045)}px)`;
  const wash = context.createLinearGradient(-width * 0.5, height * 0.2, width * 0.5, -height * 0.18);
  wash.addColorStop(0, colorToHslar(blob.color, 0));
  wash.addColorStop(0.2, colorToHslar(blob.color, alpha * 0.15));
  wash.addColorStop(0.52, colorToHslar(blob.accent, alpha * 0.24));
  wash.addColorStop(0.78, colorToHslar(blob.color, alpha * 0.12));
  wash.addColorStop(1, colorToHslar(blob.accent, 0));
  context.fillStyle = wash;
  traceTissueLobe(context, width, height, blob.curvature, phase);
  context.fill();

  context.filter = "none";
  context.shadowBlur = 0;
  context.strokeStyle = colorToHslar(blob.accent, alpha * 0.13);
  context.lineWidth = Math.max(0.5, radius * 0.012);
  traceTissueLobe(context, width * 0.92, height * 0.82, -blob.curvature * 0.6, phase + 1.4);
  context.stroke();
  context.restore();
}

function drawAuraParticle(
  context: CanvasRenderingContext2D,
  blob: BlobParticle,
  centerX: number,
  centerY: number,
  radius: number,
  alpha: number,
) {
  context.save();
  context.translate(centerX, centerY);
  context.rotate(blob.angle);
  context.shadowColor = colorToHslar(blob.color, alpha * 0.42);
  context.shadowBlur = radius * (0.16 + blob.softness * 0.34);
  drawTissueWash(context, blob, radius, alpha);

  if (blob.shape === "bloom") {
    context.save();
    context.scale(blob.stretch, 1);
    const gradient = context.createRadialGradient(-radius * 0.18, -radius * 0.12, 0, 0, 0, radius);
    gradient.addColorStop(0, colorToHslar(blob.accent, alpha));
    gradient.addColorStop(0.16, colorToHslar(blob.color, alpha * 0.72));
    gradient.addColorStop(0.52 + blob.softness * 0.16, colorToHslar(blob.color, alpha * 0.2));
    gradient.addColorStop(1, colorToHslar(blob.accent, 0));
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fill();

    const nucleus = context.createRadialGradient(radius * 0.12, -radius * 0.08, 0, radius * 0.12, -radius * 0.08, radius * 0.34);
    nucleus.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.34})`);
    nucleus.addColorStop(0.2, colorToHslar(blob.accent, alpha * 0.9));
    nucleus.addColorStop(1, colorToHslar(blob.accent, 0));
    context.fillStyle = nucleus;
    context.beginPath();
    context.arc(radius * 0.12, -radius * 0.08, radius * 0.34, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  if (blob.shape === "ribbon") {
    const length = radius * blob.stretch;
    const bend = radius * blob.curvature;
    const traceRibbon = () => {
      context.beginPath();
      context.moveTo(-length / 2, 0);
      context.bezierCurveTo(-length * 0.25, bend, length * 0.14, -bend * 0.8, length / 2, 0);
    };
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = makeLinearAuraGradient(context, blob, length, alpha);
    context.lineWidth = radius * (0.22 + blob.thickness * 0.52);
    traceRibbon();
    context.stroke();

    context.shadowBlur = 0;
    context.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.28})`;
    context.lineWidth *= 0.16;
    traceRibbon();
    context.stroke();
  }

  if (blob.shape === "beam") {
    const length = radius * blob.stretch;
    const height = radius * (0.24 + blob.thickness * 0.5);
    context.fillStyle = makeLinearAuraGradient(context, blob, length, alpha * 0.9);
    context.beginPath();
    context.roundRect(-length / 2, -height / 2, length, height, height / 2);
    context.fill();

    context.shadowBlur = 0;
    const core = makeLinearAuraGradient(context, blob, length * 0.72, alpha, true);
    context.fillStyle = core;
    context.beginPath();
    context.roundRect(-length * 0.36, -height * 0.1, length * 0.72, height * 0.2, height * 0.1);
    context.fill();
  }

  if (blob.shape === "arc") {
    const startAngle = -Math.PI * (0.92 + Math.abs(blob.curvature) * 0.12);
    const endAngle = Math.PI * (0.1 + Math.abs(blob.curvature) * 0.42);
    context.save();
    context.scale(blob.stretch, 1);
    context.lineCap = "round";
    context.strokeStyle = makeLinearAuraGradient(context, blob, radius * 2, alpha);
    context.lineWidth = radius * (0.16 + blob.thickness * 0.34);
    context.beginPath();
    context.arc(0, 0, radius, startAngle, endAngle);
    context.stroke();

    context.shadowBlur = 0;
    context.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.26})`;
    context.lineWidth *= 0.14;
    context.beginPath();
    context.arc(0, 0, radius, startAngle + 0.08, endAngle - 0.08);
    context.stroke();
    context.restore();
  }

  if (blob.shape === "prism") {
    const length = radius * blob.stretch;
    const height = radius * (0.7 + blob.thickness * 0.9);
    context.fillStyle = makeLinearAuraGradient(context, blob, length, alpha * 0.86);
    context.beginPath();
    context.moveTo(-length / 2, -height * 0.18);
    context.lineTo(-length * 0.12, -height / 2);
    context.lineTo(length / 2, -height * 0.12);
    context.lineTo(length * 0.3, height / 2);
    context.lineTo(-length * 0.42, height * 0.3);
    context.closePath();
    context.fill();

    context.shadowBlur = 0;
    context.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.24})`;
    context.lineWidth = Math.max(0.5, radius * 0.025);
    context.stroke();
  }

  if (blob.shape === "veil") {
    const length = radius * blob.stretch * 1.45;
    const height = radius * (1.1 + blob.thickness * 1.5);
    const gradient = context.createLinearGradient(0, -height / 2, 0, height / 2);
    gradient.addColorStop(0, colorToHslar(blob.accent, 0));
    gradient.addColorStop(0.34, colorToHslar(blob.color, alpha * 0.28));
    gradient.addColorStop(0.72, colorToHslar(blob.accent, alpha * 0.55));
    gradient.addColorStop(1, colorToHslar(blob.color, 0));
    context.fillStyle = gradient;
    context.beginPath();
    context.roundRect(-length / 2, -height / 2, length, height, Math.min(radius * 0.36, height / 2));
    context.fill();

    context.shadowBlur = 0;
    context.fillStyle = makeLinearAuraGradient(context, blob, length * 0.84, alpha * 0.46);
    context.beginPath();
    context.roundRect(-length * 0.42, -height * 0.06, length * 0.84, height * 0.12, height * 0.06);
    context.fill();
  }

  if (blob.shape === "wave") {
    const length = radius * blob.stretch * 1.3;
    const amplitude = radius * (0.22 + blob.thickness * 0.48);
    context.lineCap = "round";
    context.lineJoin = "round";
    for (let track = -1; track <= 1; track += 1) {
      context.beginPath();
      for (let step = 0; step <= 32; step += 1) {
        const progress = step / 32;
        const x = -length / 2 + length * progress;
        const y =
          Math.sin(progress * Math.PI * (2.4 + Math.abs(blob.curvature)) + blob.repeat * 0.72 + track * 0.58) *
            amplitude +
          track * radius * 0.18;
        if (step === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle =
        track === 0
          ? `rgba(255, 255, 255, ${alpha * 0.24})`
          : makeLinearAuraGradient(context, blob, length, alpha * 0.68, track > 0);
      context.lineWidth = radius * (track === 0 ? 0.035 : 0.11 + blob.thickness * 0.08);
      context.stroke();
      context.shadowBlur = 0;
    }
  }

  if (blob.shape === "halo") {
    context.save();
    context.scale(1.15 + blob.stretch * 0.3, 0.74 + blob.thickness * 0.25);
    context.lineCap = "round";
    for (let ring = 0; ring < 3; ring += 1) {
      const ringRadius = radius * (0.48 + ring * 0.24);
      context.beginPath();
      context.arc(0, 0, ringRadius, -Math.PI * (0.86 - ring * 0.05), Math.PI * (0.96 + ring * 0.08));
      context.strokeStyle =
        ring === 1
          ? `rgba(255, 255, 255, ${alpha * 0.22})`
          : colorToHslar(ring === 0 ? blob.accent : blob.color, alpha * (0.62 - ring * 0.12));
      context.lineWidth = radius * (0.055 + blob.thickness * 0.055);
      context.stroke();
      context.shadowBlur = 0;
    }
    context.restore();
  }

  if (blob.shape === "flare") {
    const rayCount = 7 + (blob.repeat % 5);
    context.lineCap = "round";
    for (let ray = 0; ray < rayCount; ray += 1) {
      const rayAngle = (ray / rayCount) * Math.PI * 2 + blob.curvature * 0.18;
      const inner = radius * (0.12 + (ray % 2) * 0.08);
      const outer = radius * (0.7 + ((ray * 7 + blob.repeat) % 5) * 0.15) * (0.72 + blob.stretch * 0.2);
      context.beginPath();
      context.moveTo(Math.cos(rayAngle) * inner, Math.sin(rayAngle) * inner);
      context.lineTo(Math.cos(rayAngle) * outer, Math.sin(rayAngle) * outer);
      context.strokeStyle = ray % 3 === 0 ? `rgba(255, 255, 255, ${alpha * 0.24})` : colorToHslar(blob.color, alpha * 0.5);
      context.lineWidth = radius * (0.025 + blob.thickness * 0.035);
      context.stroke();
      context.shadowBlur = 0;
    }
    const core = context.createRadialGradient(0, 0, 0, 0, 0, radius * 0.36);
    core.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.3})`);
    core.addColorStop(0.28, colorToHslar(blob.accent, alpha * 0.72));
    core.addColorStop(1, colorToHslar(blob.color, 0));
    context.fillStyle = core;
    context.beginPath();
    context.arc(0, 0, radius * 0.36, 0, Math.PI * 2);
    context.fill();
  }

  if (blob.shape === "mesh") {
    const length = radius * blob.stretch * 1.15;
    const height = radius * (0.8 + blob.thickness * 0.9);
    const segmentCount = 5 + modulo(blob.id + blob.repeat, 3);
    context.shadowBlur = radius * 0.12;
    for (let index = 0; index < segmentCount; index += 1) {
      const progress = segmentCount === 1 ? 0.5 : index / (segmentCount - 1);
      const x = lerp(-length * 0.5, length * 0.5, progress);
      const phase = progress * Math.PI * 1.18 + blob.curvature * 0.8;
      const y = Math.sin(phase) * height * 0.22;
      const lobeWidth = radius * (0.34 + (index % 3) * 0.045);
      const lobeHeight = radius * (0.56 + blob.thickness * 0.28);

      context.save();
      context.translate(x, y);
      context.rotate(Math.cos(phase) * 0.24 + Math.PI * 0.5);
      const segment = context.createLinearGradient(0, -lobeHeight * 0.5, 0, lobeHeight * 0.5);
      segment.addColorStop(0, colorToHslar(blob.color, alpha * 0.28));
      segment.addColorStop(0.48, colorToHslar(blob.accent, alpha * 0.66));
      segment.addColorStop(1, colorToHslar(blob.color, alpha * 0.18));
      context.fillStyle = segment;
      traceTissueLobe(context, lobeWidth, lobeHeight, blob.curvature * 0.28, index + blob.id * 0.21);
      context.fill();
      context.shadowBlur = 0;
      context.strokeStyle = colorToHslar(blob.accent, alpha * 0.34);
      context.lineWidth = Math.max(0.5, radius * 0.014);
      context.stroke();
      context.restore();
    }
  }

  context.restore();
}

function paintArtworkBackground(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = "#f3f5fa";
  context.fillRect(0, 0, width, height);

  const wash = context.createLinearGradient(0, 0, width, height);
  wash.addColorStop(0, "rgba(255, 255, 255, 0.28)");
  wash.addColorStop(0.46, "rgba(222, 229, 246, 0.12)");
  wash.addColorStop(0.74, "rgba(246, 225, 240, 0.08)");
  wash.addColorStop(1, "rgba(255, 255, 255, 0.2)");
  context.fillStyle = wash;
  context.fillRect(0, 0, width, height);
}

function drawAuraComposition(
  context: CanvasRenderingContext2D,
  blobs: readonly BlobParticle[],
  width: number,
  height: number,
  now: number,
  replayProgress?: number,
) {
  const shortSide = Math.min(width, height);
  const replayPosition = replayProgress === undefined ? Number.POSITIVE_INFINITY : replayProgress * (blobs.length + 0.9);

  context.save();
  context.globalCompositeOperation = "lighter";
  blobs.forEach((blob, index) => {
    const replayAge = replayPosition - index;
    if (replayAge <= 0) return;

    const age = replayProgress === undefined ? Math.max(0, now - blob.createdAt) : replayAge * BLOB_ARRIVAL_DURATION;
    const arrival = easeOutCubic(age / BLOB_ARRIVAL_DURATION);
    const radius = blob.radius * shortSide * (0.46 + arrival * 0.54);
    const alpha = clamp((0.4 + blob.velocity * 0.48) * Math.min(1, replayAge), 0, 0.88);

    drawAuraParticle(context, blob, blob.x * width, blob.y * height, radius, alpha);
  });
  context.restore();
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportFileStem() {
  return "aura-composition";
}

function supportedVideoType() {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
}

export function AuraToy() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewDownloadRef = useRef<HTMLButtonElement | null>(null);
  const microphoneButtonRef = useRef<HTMLButtonElement | null>(null);
  const microphoneIntroductionShownRef = useRef(false);
  const exportLayersRef = useRef<WeakMap<HTMLCanvasElement, HTMLCanvasElement>>(new WeakMap());
  const blobsRef = useRef<BlobParticle[]>([]);
  const blobIdRef = useRef(1);
  const noteRepeatRef = useRef<Map<string, number>>(new Map());
  const grainRef = useRef<HTMLCanvasElement | null>(null);
  const reducedMotionRef = useRef(false);
  const audioGenerationRef = useRef(0);
  const visualGenerationRef = useRef(0);
  const microphoneGenerationRef = useRef(0);
  const microphoneRef = useRef<MicrophoneRuntime | null>(null);
  const resetFrameRef = useRef<number | null>(null);
  const previewFrameRef = useRef<number | null>(null);
  const dialWheelTimerRef = useRef<number | null>(null);
  const wakeRendererRef = useRef<(() => void) | null>(null);
  const releaseTimersRef = useRef<Map<string, number>>(new Map());
  const soundModeRef = useRef<SoundModeId>(DEFAULT_SOUND_MODE);
  const toneRef = useRef<{
    synth: AuraSynth | null;
    filter: AuraFilter | null;
    reverb: AuraReverb | null;
    ready: Promise<void> | null;
  }>({
    synth: null,
    filter: null,
    reverb: null,
    ready: null,
  });
  const activeToneNotesRef = useRef<Map<string, string>>(new Map());

  const [activeKeys, setActiveKeys] = useState<Set<string>>(() => new Set());
  const [octave, setOctave] = useState(BASE_OCTAVE);
  const [resetting, setResetting] = useState(false);
  const [soundMode, setSoundMode] = useState<SoundModeId>(DEFAULT_SOUND_MODE);
  const [layerCount, setLayerCount] = useState(0);
  const [exportState, setExportState] = useState<ExportState>("idle");
  const [previewKind, setPreviewKind] = useState<ExportKind | null>(null);
  const [dialDirection, setDialDirection] = useState<-1 | 1>(1);
  const [microphoneState, setMicrophoneState] = useState<MicrophoneState>("idle");
  const [microphoneMelodyPitchClass, setMicrophoneMelodyPitchClass] = useState<number | null>(null);
  const [microphoneReading, setMicrophoneReading] = useState("Listening");
  const [microphonePromptOpen, setMicrophonePromptOpen] = useState(false);

  const keyboardMap = useMemo(() => {
    const allKeys = [...WHITE_KEYS, ...UPPER_KEYS].sort((a, b) => a.midi - b.midi);
    return new Map<string, KeySpec>(
      KEYBOARD_ORDER.flatMap((keyboardKey, index) => {
        const pianoKey = allKeys[index];
        return pianoKey ? [[keyboardKey, pianoKey] as const] : [];
      }),
    );
  }, []);

  useEffect(() => {
    soundModeRef.current = soundMode;
  }, [soundMode]);

  const disposeToneEngine = useCallback(() => {
    audioGenerationRef.current += 1;
    const { synth, filter, reverb } = toneRef.current;
    toneRef.current = {
      synth: null,
      filter: null,
      reverb: null,
      ready: null,
    };
    synth?.releaseAll();
    synth?.dispose();
    filter?.dispose();
    reverb?.dispose();
    activeToneNotesRef.current.clear();
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = media.matches;
    const updateMotion = () => {
      reducedMotionRef.current = media.matches;
    };
    media.addEventListener("change", updateMotion);
    return () => {
      media.removeEventListener("change", updateMotion);
    };
  }, []);

  useEffect(
    () => () => {
      if (resetFrameRef.current !== null) window.cancelAnimationFrame(resetFrameRef.current);
      if (previewFrameRef.current !== null) window.cancelAnimationFrame(previewFrameRef.current);
      if (dialWheelTimerRef.current !== null) window.clearTimeout(dialWheelTimerRef.current);
      releaseTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      releaseTimersRef.current.clear();
      microphoneGenerationRef.current += 1;
      disposeMicrophoneRuntime(microphoneRef.current);
      microphoneRef.current = null;
      disposeToneEngine();
    },
    [disposeToneEngine],
  );

  const ensureTone = useCallback(async () => {
    if (!toneRef.current.ready) {
      const generation = audioGenerationRef.current;
      const mode = SOUND_MODES.find(({ id }) => id === soundModeRef.current) ?? SOUND_MODES[0];
      const ready = (async () => {
        await startTone();
        const filter = new Filter({
          type: "lowpass",
          frequency: mode.filterFrequency,
          Q: mode.filterQ,
          rolloff: -12,
        });
        const reverb = new Freeverb(mode.reverb);
        const synth = new PolySynth(Synth, {
          oscillator: { type: mode.oscillator },
          envelope: mode.envelope,
          volume: mode.volume,
        }).connect(filter);
        synth.maxPolyphony = 16;
        filter.connect(reverb);
        reverb.toDestination();

        if (generation !== audioGenerationRef.current) {
          synth.dispose();
          filter.dispose();
          reverb.dispose();
          return;
        }

        toneRef.current.synth = synth;
        toneRef.current.filter = filter;
        toneRef.current.reverb = reverb;
      })();
      toneRef.current.ready = ready;
    }

    const ready = toneRef.current.ready;
    try {
      await ready;
    } catch (error) {
      if (toneRef.current.ready === ready) toneRef.current.ready = null;
      throw error;
    }
  }, []);

  const triggerAttack = useCallback(
    (keyId: string, noteName: string, velocity: number) => {
      const generation = visualGenerationRef.current;
      void ensureTone()
        .then(() => {
          if (generation !== visualGenerationRef.current) return;
          activeToneNotesRef.current.set(keyId, noteName);
          toneRef.current.synth?.triggerAttack(noteName, undefined, velocity);
        })
        .catch(() => undefined);
    },
    [ensureTone],
  );

  const triggerRelease = useCallback((keyId: string) => {
    const noteName = activeToneNotesRef.current.get(keyId);
    if (!noteName) return;
    toneRef.current.synth?.triggerRelease(noteName);
    activeToneNotesRef.current.delete(keyId);
  }, []);

  const spawnBlob = useCallback((note: NoteChoice, color: Color, velocity: number) => {
    const now = performance.now();
    const id = blobIdRef.current;
    blobIdRef.current += 1;
    const mode = soundModeRef.current;
    const profile = VISUAL_MODES[mode];
    const modeIndex = SOUND_MODES.findIndex(({ id: soundModeId }) => soundModeId === mode);
    const identity = `AURA|${mode}|${note.name}`;
    const repeat = noteRepeatRef.current.get(identity) ?? 0;
    noteRepeatRef.current.set(identity, repeat + 1);

    const identitySeed = fnv1a(identity);
    const identityRng = mulberry32(identitySeed);
    const pitchNorm = clamp((note.midi - MIN_MIDI) / (MAX_MIDI - MIN_MIDI), 0, 1);
    const anchor = COMPOSITION_ANCHORS[
      modulo(note.pc * 7 + Math.floor(note.midi / 12) * 3 + modeIndex * 5 + identitySeed, COMPOSITION_ANCHORS.length)
    ];
    const pitchX = 0.1 + (note.pc / 11) * 0.8;
    const pitchY = 0.1 + (1 - pitchNorm) * 0.76;
    const baseX = clamp(lerp(pitchX, anchor[0], 0.38) + (identityRng() - 0.5) * 0.04, 0.05, 0.95);
    const baseY = clamp(lerp(pitchY, anchor[1], 0.24) + (identityRng() - 0.5) * 0.035, 0.05, 0.88);
    const baseAngle =
      profile.angleBias + (identityRng() - 0.5) * Math.PI * 0.82 + (note.pc - 5.5) * 0.045;
    const trailDirection = baseAngle + (modeIndex - 2) * 0.12;
    const trailDistance = repeat === 0 ? 0 : Math.min(0.012 + repeat * 0.012, 0.115);
    const trailBend = repeat === 0 ? 0 : Math.sin(repeat * 0.62) * Math.min(0.006 + repeat * 0.0015, 0.018);
    const x = clamp(
      baseX + Math.cos(trailDirection) * trailDistance + Math.cos(trailDirection + Math.PI / 2) * trailBend,
      0.035,
      0.965,
    );
    const y = clamp(
      baseY +
        Math.sin(trailDirection) * trailDistance * 0.74 +
        Math.sin(trailDirection + Math.PI / 2) * trailBend * 0.74,
      0.04,
      0.9,
    );
    const registerBand = pitchNorm < 0.34 ? 0 : pitchNorm < 0.68 ? 1 : 2;
    const shapeBand = profile.shapeBands[registerBand];
    const shape = shapeBand[
      modulo(note.pc * 2 + Math.floor(note.midi / 12) + modeIndex, shapeBand.length)
    ];
    const baseRadius: Record<AuraShape, number> = {
      bloom: 0.13,
      ribbon: 0.1,
      beam: 0.09,
      arc: 0.14,
      prism: 0.11,
      veil: 0.17,
      wave: 0.1,
      halo: 0.13,
      flare: 0.12,
      mesh: 0.12,
    };
    const repeatScale = 0.96 + Math.min(repeat, 9) * 0.055;
    const registerScale = lerp(1.16, 0.86, pitchNorm);
    const radius =
      baseRadius[shape] *
      (0.88 + identityRng() * 0.46) *
      (0.82 + velocity * 0.38) *
      repeatScale *
      registerScale;
    const stretchByShape: Record<AuraShape, [number, number]> = {
      bloom: [0.7, 2.2],
      ribbon: [2.4, 5.4],
      beam: [2.8, 6.2],
      arc: [1.1, 2.2],
      prism: [1.3, 3.2],
      veil: [1.8, 4.2],
      wave: [2.2, 4.8],
      halo: [0.9, 2.1],
      flare: [0.8, 1.8],
      mesh: [1.2, 2.7],
    };
    const [minimumStretch, maximumStretch] = stretchByShape[shape];
    const stretch =
      lerp(minimumStretch, maximumStretch, identityRng()) *
      (0.96 + Math.min(repeat, 8) * 0.018);
    const paletteOffset = AURA_MAPPING.seedHash % RADIOGRAPHIC_HUES.length;
    const accentHue = RADIOGRAPHIC_HUES[
      modulo(paletteOffset + note.pc * 5 + profile.accentStep, RADIOGRAPHIC_HUES.length)
    ];
    const accent = {
      h: modulo(accentHue + (identityRng() - 0.5) * 7, 360),
      s: clamp(86 + identityRng() * 13, 0, 100),
      l: clamp(51 + identityRng() * 14, 0, 69),
    };

    blobsRef.current.push({
      id,
      color,
      accent,
      shape,
      repeat,
      x,
      y,
      radius,
      angle: baseAngle + Math.sin(repeat * 0.62) * 0.055,
      stretch,
      thickness: 0.2 + identityRng() * 0.42 + velocity * 0.12 + Math.min(repeat, 8) * 0.012,
      curvature: (identityRng() - 0.5) * 1.65 + Math.sin(repeat * 0.62) * 0.14,
      velocity,
      softness: clamp(profile.softness + (identityRng() - 0.5) * 0.18, 0.24, 0.98),
      createdAt: now,
    });

    if (blobsRef.current.length === 1) setLayerCount(1);
    wakeRendererRef.current?.();
  }, []);

  const stopMicrophone = useCallback(() => {
    microphoneGenerationRef.current += 1;
    disposeMicrophoneRuntime(microphoneRef.current);
    microphoneRef.current = null;
    microphoneButtonRef.current?.style.setProperty("--mic-level", "0");
    setMicrophonePromptOpen(false);
    setMicrophoneState("idle");
    setMicrophoneMelodyPitchClass(null);
    setMicrophoneReading("Listening");
  }, []);

  const startMicrophone = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicrophoneState("unsupported");
      return;
    }

    const AudioContextConstructor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      setMicrophoneState("unsupported");
      return;
    }

    const generation = microphoneGenerationRef.current + 1;
    microphoneGenerationRef.current = generation;
    setMicrophoneState("requesting");
    setMicrophoneReading("Listening");

    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false,
        },
      });
      if (generation !== microphoneGenerationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      audioContext = new AudioContextConstructor({ latencyHint: "interactive" });
      if (audioContext.state === "suspended") await audioContext.resume();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = MICROPHONE_FFT_SIZE;
      analyser.smoothingTimeConstant = 0.22;
      analyser.minDecibels = -100;
      analyser.maxDecibels = -10;
      source.connect(analyser);

      const detector = PitchDetector.forFloat32Array(MICROPHONE_FFT_SIZE);
      detector.minVolumeDecibels = -62;
      const runtime: MicrophoneRuntime = {
        stream,
        context: audioContext,
        source,
        analyser,
        detector,
        timeDomain: new Float32Array(MICROPHONE_FFT_SIZE),
        frequencyData: new Float32Array(analyser.frequencyBinCount),
        previousSpectrum: new Float32Array(analyser.frequencyBinCount),
        chroma: new Float32Array(12),
        frameChroma: new Float32Array(12),
        animationFrame: 0,
        lastAnalysisAt: -Infinity,
        lastVisualAt: -Infinity,
        lastBeatAt: -Infinity,
        lastValidPitchAt: -Infinity,
        lastMidi: null,
        candidateMidi: null,
        candidateFrames: 0,
        noiseFloor: 0.0018,
        smoothedEnergy: 0.003,
        smoothedFlux: 0.001,
        melodyPitchClass: null,
        melodyCandidatePitchClass: null,
        melodyCandidateFrames: 0,
        melodyLastSeenAt: -Infinity,
        visualCursor: 0,
      };
      microphoneRef.current = runtime;
      setMicrophoneState("listening");

      const analyze = (now: number) => {
        if (generation !== microphoneGenerationRef.current || microphoneRef.current !== runtime) return;
        runtime.animationFrame = window.requestAnimationFrame(analyze);
        if (now - runtime.lastAnalysisAt < MICROPHONE_ANALYSIS_INTERVAL) return;
        runtime.lastAnalysisAt = now;

        analyser.getFloatTimeDomainData(runtime.timeDomain);
        analyser.getFloatFrequencyData(runtime.frequencyData);
        const rms = calculateRms(runtime.timeDomain);
        const previousEnergy = runtime.smoothedEnergy;
        const energyRise = rms / Math.max(0.0001, previousEnergy);
        runtime.smoothedEnergy = lerp(previousEnergy, rms, rms > previousEnergy ? 0.18 : 0.055);
        runtime.noiseFloor =
          rms <= runtime.noiseFloor * 1.24
            ? lerp(runtime.noiseFloor, rms, 0.1)
            : Math.min(0.012, runtime.noiseFloor + 0.000004);
        const gate = Math.max(0.0025, runtime.noiseFloor * 1.7);
        const activeSignal = rms > gate;
        const level = activeSignal ? clamp((rms - gate) / Math.max(0.012, 0.09 - gate), 0, 1) : 0;
        microphoneButtonRef.current?.style.setProperty("--mic-level", level.toFixed(3));

        const { spectralFlux, dominantMidi, noteCandidates, pitchClasses } = updateSpectrumAnalysis(
          runtime.frequencyData,
          runtime.previousSpectrum,
          runtime.chroma,
          runtime.frameChroma,
          audioContext.sampleRate,
          analyser.fftSize,
        );
        const previousFlux = runtime.smoothedFlux;
        runtime.smoothedFlux = lerp(previousFlux, spectralFlux, 0.085);
        const beatDetected =
          activeSignal &&
          now - runtime.lastBeatAt > 110 &&
          (energyRise > 1.16 || spectralFlux > Math.max(0.0007, previousFlux * 1.38));
        if (beatDetected) runtime.lastBeatAt = now;

        const [frequency, clarity] = detector.findPitch(runtime.timeDomain, audioContext.sampleRate);
        const midiFloat = frequency > 0 ? frequencyToMidi(frequency) : Number.NaN;
        const nearestMidi = Number.isFinite(midiFloat) ? Math.round(midiFloat) : null;
        const clearPitch =
          activeSignal &&
          nearestMidi !== null &&
          nearestMidi >= MIN_MIDI &&
          nearestMidi <= MAX_MIDI &&
          clarity >= 0.68 &&
          Math.abs(midiFloat - nearestMidi) <= 0.48;

        if (clearPitch && nearestMidi !== null) {
          runtime.lastValidPitchAt = now;
          if (runtime.candidateMidi === nearestMidi) runtime.candidateFrames += 1;
          else {
            runtime.candidateMidi = nearestMidi;
            runtime.candidateFrames = 1;
          }
        } else {
          runtime.candidateFrames = Math.max(0, runtime.candidateFrames - 1);
        }

        let stableMidi: number | null = null;
        if (runtime.candidateFrames >= 2 && runtime.candidateMidi !== null) {
          stableMidi = runtime.candidateMidi;
          runtime.lastMidi = stableMidi;
        } else if (now - runtime.lastValidPitchAt > 260 && runtime.lastMidi !== null) {
          runtime.lastMidi = null;
          runtime.candidateMidi = null;
          runtime.candidateFrames = 0;
        }

        const monophonicFrame = clearPitch && clarity >= 0.82 && nearestMidi !== null;
        const monophonicPitchClass = monophonicFrame ? modulo(nearestMidi, 12) : null;
        const detectedPitchClasses = !activeSignal
          ? []
          : monophonicPitchClass !== null
            ? [monophonicPitchClass]
            : pitchClasses;

        const rankedMelodyNotes = noteCandidates
          .map((candidate) => ({
            pitchClass: modulo(candidate.midi, 12),
            score:
              candidate.score *
              (1 + clamp((candidate.midi - MIN_MIDI) / (MAX_MIDI - MIN_MIDI), 0, 1) * 0.18),
          }))
          .sort((first, second) => second.score - first.score);
        const melodyLeader = rankedMelodyNotes[0] ?? null;
        const currentMelody = rankedMelodyNotes.find(
          ({ pitchClass }) => pitchClass === runtime.melodyPitchClass,
        );
        const melodyPitchClass = !activeSignal
          ? null
          : monophonicPitchClass ??
            (currentMelody && melodyLeader && currentMelody.score >= melodyLeader.score * 0.68
              ? currentMelody.pitchClass
              : melodyLeader?.pitchClass ?? null);

        if (melodyPitchClass !== null) {
          if (runtime.melodyPitchClass === melodyPitchClass) {
            runtime.melodyLastSeenAt = now;
            runtime.melodyCandidatePitchClass = null;
            runtime.melodyCandidateFrames = 0;
          } else {
            if (runtime.melodyCandidatePitchClass === melodyPitchClass) {
              runtime.melodyCandidateFrames += 1;
            } else {
              runtime.melodyCandidatePitchClass = melodyPitchClass;
              runtime.melodyCandidateFrames = 1;
            }

            const confirmationFrames = monophonicFrame ? 2 : runtime.melodyPitchClass === null ? 2 : 5;
            if (runtime.melodyCandidateFrames >= confirmationFrames) {
              runtime.melodyPitchClass = melodyPitchClass;
              runtime.melodyLastSeenAt = now;
              runtime.melodyCandidatePitchClass = null;
              runtime.melodyCandidateFrames = 0;
              setMicrophoneMelodyPitchClass(melodyPitchClass);
            }
          }
        } else if (now - runtime.melodyLastSeenAt > 360 && runtime.melodyPitchClass !== null) {
          runtime.melodyPitchClass = null;
          runtime.melodyCandidatePitchClass = null;
          runtime.melodyCandidateFrames = 0;
          setMicrophoneMelodyPitchClass(null);
        }

        if (!activeSignal) return;
        const recentStableMidi = now - runtime.lastValidPitchAt < 260 ? runtime.lastMidi : null;
        const spectralMidi =
          noteCandidates.length > 0
            ? noteCandidates[runtime.visualCursor % noteCandidates.length].midi
            : dominantMidi;
        const detectedMidi = monophonicFrame
          ? nearestMidi
          : spectralMidi ?? stableMidi ?? (clearPitch ? nearestMidi : null) ?? recentStableMidi;
        if (detectedMidi === null) return;
        const visualInterval = beatDetected ? 60 : lerp(165, 72, level);
        if (now - runtime.lastVisualAt < visualInterval) return;
        if (!clearPitch && !beatDetected && recentStableMidi === null && level < 0.1) return;

        const harmonicContext = detectHarmonicContext(runtime.chroma);
        const velocity = clamp(0.26 + level * 0.64 + (beatDetected ? 0.1 : 0), 0.26, 1);
        const beatCompanion =
          beatDetected && !monophonicFrame && noteCandidates.length > 1
            ? noteCandidates[(runtime.visualCursor + 1) % noteCandidates.length]?.midi
            : null;
        const visualMidis = beatCompanion !== null && beatCompanion !== detectedMidi
          ? [detectedMidi, beatCompanion]
          : [detectedMidi];
        visualMidis.forEach((midi, index) => {
          const note = midiToNote(clamp(midi, MIN_MIDI, MAX_MIDI));
          const baseColor = AURA_MAPPING.pitches[note.pc];
          spawnBlob(note, microphoneColor(baseColor, harmonicContext), velocity * (index === 0 ? 1 : 0.86));
        });
        runtime.visualCursor += visualMidis.length;
        runtime.lastVisualAt = now;
        const primaryNote = midiToNote(clamp(detectedMidi, MIN_MIDI, MAX_MIDI));
        const heardNotes = detectedPitchClasses.length > 1
          ? detectedPitchClasses.map((pitchClass) => NOTE_NAMES[pitchClass]).join(" + ")
          : primaryNote.name;
        setMicrophoneReading(
          harmonicContext && harmonicContext.confidence > 0.08
            ? `${heardNotes}, ${NOTE_NAMES[harmonicContext.root]} ${harmonicContext.mode}`
            : heardNotes,
        );
      };

      runtime.animationFrame = window.requestAnimationFrame(analyze);
      stream.getAudioTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          if (generation === microphoneGenerationRef.current) stopMicrophone();
        });
      });
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      if (audioContext) void audioContext.close().catch(() => undefined);
      if (generation !== microphoneGenerationRef.current) return;
      microphoneRef.current = null;
      microphoneButtonRef.current?.style.setProperty("--mic-level", "0");
      setMicrophoneState("error");
      setMicrophoneMelodyPitchClass(null);
      setMicrophoneReading("Microphone unavailable");
    }
  }, [spawnBlob, stopMicrophone]);

  const prepareMicrophone = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicrophoneState("unsupported");
      return;
    }

    try {
      const permission = await navigator.permissions?.query({ name: "microphone" as PermissionName });
      if (permission?.state === "denied") {
        setMicrophoneState("error");
        setMicrophoneReading("Microphone access is blocked");
        return;
      }
    } catch {
      // Some browsers do not expose microphone permission state.
    }

    if (microphoneIntroductionShownRef.current) {
      void startMicrophone();
      return;
    }
    setMicrophonePromptOpen(true);
  }, [startMicrophone]);

  const toggleMicrophone = useCallback(() => {
    if (microphonePromptOpen) {
      setMicrophonePromptOpen(false);
      return;
    }
    if (microphoneState === "listening" || microphoneState === "requesting") {
      stopMicrophone();
      return;
    }
    void prepareMicrophone();
  }, [microphonePromptOpen, microphoneState, prepareMicrophone, stopMicrophone]);

  const shiftedNote = useCallback(
    (key: KeySpec): NoteChoice => {
      const shifted = midiToNote(key.midi + (octave - BASE_OCTAVE) * 12);
      return shifted;
    },
    [octave],
  );

  const startKey = useCallback(
    (key: KeySpec, velocity = 0.76) => {
      const pendingRelease = releaseTimersRef.current.get(key.id);
      if (pendingRelease) {
        window.clearTimeout(pendingRelease);
        releaseTimersRef.current.delete(key.id);
      }

      const note = shiftedNote(key);
      const color = AURA_MAPPING.pitches[note.pc];
      spawnBlob(note, color, velocity);
      setActiveKeys((current) => {
        const next = new Set(current);
        next.add(key.id);
        return next;
      });
      triggerAttack(key.id, note.name, velocity);
    },
    [shiftedNote, spawnBlob, triggerAttack],
  );

  const endKey = useCallback(
    (key: KeySpec) => {
      triggerRelease(key.id);

      const pendingRelease = releaseTimersRef.current.get(key.id);
      if (pendingRelease) window.clearTimeout(pendingRelease);

      const releaseTimer = window.setTimeout(() => {
        releaseTimersRef.current.delete(key.id);
        setActiveKeys((current) => {
          const next = new Set(current);
          next.delete(key.id);
          return next;
        });
      }, 520);
      releaseTimersRef.current.set(key.id, releaseTimer);
    },
    [triggerRelease],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, key: KeySpec) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const bounds = event.currentTarget.getBoundingClientRect();
      const strikePosition = clamp((event.clientY - bounds.top) / Math.max(1, bounds.height), 0, 1);
      const pressure = event.pressure > 0 ? event.pressure : 0.5;
      const velocity = clamp(0.46 + strikePosition * 0.38 + pressure * 0.12, 0.46, 0.98);
      startKey(key, velocity);
    },
    [startKey],
  );

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, key: KeySpec) => {
      event.preventDefault();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      endKey(key);
    },
    [endKey],
  );

  useEffect(() => {
    const downKeys = new Set<string>();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (previewKind) return;
      if (event.repeat || event.metaKey || event.altKey || event.ctrlKey) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const key = keyboardMap.get(event.key.toLowerCase());
      if (!key || downKeys.has(event.key)) return;
      downKeys.add(event.key);
      startKey(key, 0.7);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      const key = keyboardMap.get(event.key.toLowerCase());
      if (!key) return;
      downKeys.delete(event.key);
      endKey(key);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [endKey, keyboardMap, previewKind, startKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !context) return;

    const offscreen = document.createElement("canvas");
    const offscreenContext = offscreen.getContext("2d", { alpha: true });
    const settled = document.createElement("canvas");
    const settledContext = settled.getContext("2d", { alpha: true });
    if (!offscreenContext || !settledContext) return;

    grainRef.current = makeNoiseTile(160, 20);
    let width = 1;
    let height = 1;
    let dpr = 1;
    let frame = 0;
    let running = false;
    let lastDrawAt = -Infinity;
    let settledCount = 0;

    const syncOffscreenSize = () => {
      const layerTotal = blobsRef.current.length;
      const renderScale = layerTotal > 320 ? 0.34 : layerTotal > 140 ? 0.42 : 0.5;
      const targetWidth = Math.max(1, Math.round(width * renderScale));
      const targetHeight = Math.max(1, Math.round(height * renderScale));
      if (offscreen.width !== targetWidth || offscreen.height !== targetHeight) {
        offscreen.width = targetWidth;
        offscreen.height = targetHeight;
        settled.width = targetWidth;
        settled.height = targetHeight;
        settledCount = 0;
      }
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      syncOffscreenSize();
    };

    const drawEmptyAura = () => {
      if (blobsRef.current.length > 0) return;
      const gradient = context.createRadialGradient(width * 0.5, height * 0.28, 0, width * 0.5, height * 0.28, width * 0.34);
      gradient.addColorStop(0, "rgba(230, 234, 250, 0.06)");
      gradient.addColorStop(0.54, "rgba(235, 220, 244, 0.028)");
      gradient.addColorStop(1, "rgba(243, 245, 250, 0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
    };

    const wakeRenderer = () => {
      if (running || document.hidden) return;
      running = true;
      frame = window.requestAnimationFrame(animate);
    };

    const animate = (now: number) => {
      running = false;

      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        resize();
      }

      const frameInterval = 1000 / 30;
      if (now - lastDrawAt < frameInterval) {
        wakeRenderer();
        return;
      }
      lastDrawAt = now;

      context.clearRect(0, 0, width, height);
      drawEmptyAura();

      syncOffscreenSize();
      if (blobsRef.current.length < settledCount) {
        settledContext.clearRect(0, 0, settled.width, settled.height);
        settledCount = 0;
      }
      while (settledCount < blobsRef.current.length) {
        const blob = blobsRef.current[settledCount];
        if (!reducedMotionRef.current && now - blob.createdAt < BLOB_ARRIVAL_DURATION) break;
        drawAuraComposition(
          settledContext,
          [blob],
          settled.width,
          settled.height,
          blob.createdAt + BLOB_ARRIVAL_DURATION,
        );
        settledCount += 1;
      }

      offscreenContext.clearRect(0, 0, offscreen.width, offscreen.height);
      offscreenContext.drawImage(settled, 0, 0);
      if (settledCount < blobsRef.current.length) {
        const newestBlob = blobsRef.current.at(-1);
        const effectiveNow = reducedMotionRef.current && newestBlob ? newestBlob.createdAt + BLOB_ARRIVAL_DURATION : now;
        drawAuraComposition(
          offscreenContext,
          blobsRef.current.slice(settledCount),
          offscreen.width,
          offscreen.height,
          effectiveNow,
        );
      }

      context.save();
      context.globalCompositeOperation = "lighter";
      context.filter = reducedMotionRef.current ? "blur(4px)" : "blur(7px)";
      context.drawImage(offscreen, 0, 0, width, height);
      context.restore();

      if (grainRef.current) {
        drawGrain(context, width, height, grainRef.current, 0.055);
      }

      const hasArrivingBlob =
        !reducedMotionRef.current &&
        blobsRef.current.some((blob) => now - blob.createdAt < BLOB_ARRIVAL_DURATION);
      if (hasArrivingBlob) {
        wakeRenderer();
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) wakeRenderer();
    };
    const handleResize = () => {
      resize();
      wakeRenderer();
    };
    const resizeObserver = new ResizeObserver(handleResize);

    resize();
    wakeRendererRef.current = wakeRenderer;
    window.addEventListener("resize", handleResize);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    resizeObserver.observe(canvas);
    wakeRenderer();

    return () => {
      wakeRendererRef.current = null;
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      resizeObserver.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, []);

  const renderArtwork = useCallback((output: HTMLCanvasElement, replayProgress?: number) => {
    const outputContext = output.getContext("2d", { alpha: false });
    if (!outputContext) return;

    let auraLayer = exportLayersRef.current.get(output);
    if (!auraLayer) {
      auraLayer = document.createElement("canvas");
      exportLayersRef.current.set(output, auraLayer);
    }
    const layerScale = 0.5;
    const layerWidth = Math.max(1, Math.round(output.width * layerScale));
    const layerHeight = Math.max(1, Math.round(output.height * layerScale));
    if (auraLayer.width !== layerWidth || auraLayer.height !== layerHeight) {
      auraLayer.width = layerWidth;
      auraLayer.height = layerHeight;
    }
    const layerContext = auraLayer.getContext("2d", { alpha: true });
    if (!layerContext) return;

    layerContext.clearRect(0, 0, layerWidth, layerHeight);
    const settledAt = (blobsRef.current.at(-1)?.createdAt ?? performance.now()) + BLOB_ARRIVAL_DURATION;
    drawAuraComposition(
      layerContext,
      blobsRef.current,
      layerWidth,
      layerHeight,
      settledAt,
      replayProgress,
    );

    paintArtworkBackground(outputContext, output.width, output.height);
    outputContext.save();
    outputContext.globalCompositeOperation = "source-over";
    outputContext.filter = `blur(${clamp(Math.min(output.width, output.height) * 0.008, 4, 10)}px)`;
    outputContext.drawImage(auraLayer, 0, 0, output.width, output.height);
    outputContext.restore();
    if (grainRef.current) {
      drawGrain(outputContext, output.width, output.height, grainRef.current, 0.035);
    }
  }, []);

  const createExportCanvas = useCallback((replayProgress?: number) => {
    const sourceBounds = canvasRef.current?.getBoundingClientRect();
    const sourceWidth = Math.max(1, sourceBounds?.width ?? 1440);
    const sourceHeight = Math.max(1, sourceBounds?.height ?? 900);
    const maxDimension = replayProgress === undefined ? 1920 : blobsRef.current.length > 160 ? 960 : 1280;
    const scale = Math.min(2, maxDimension / Math.max(sourceWidth, sourceHeight));
    const output = document.createElement("canvas");
    output.width = Math.max(1, Math.round(sourceWidth * scale));
    output.height = Math.max(1, Math.round(sourceHeight * scale));
    renderArtwork(output, replayProgress);
    return output;
  }, [renderArtwork]);

  useEffect(() => {
    if (!previewKind) return;
    const preview = previewCanvasRef.current;
    const sourceBounds = canvasRef.current?.getBoundingClientRect();
    if (!preview || !sourceBounds) return;

    const maxDimension = blobsRef.current.length > 160 ? 900 : 1200;
    const scale = Math.min(1.5, maxDimension / Math.max(sourceBounds.width, sourceBounds.height));
    preview.width = Math.max(1, Math.round(sourceBounds.width * scale));
    preview.height = Math.max(1, Math.round(sourceBounds.height * scale));
    previewDownloadRef.current?.focus({ preventScroll: true });

    if (previewKind === "image" || reducedMotionRef.current || exportState === "video") {
      renderArtwork(preview);
      return;
    }

    const revealDuration = clamp(1800 + blobsRef.current.length * 75, 2800, 4800);
    const holdDuration = 1100;
    const loopDuration = revealDuration + holdDuration;
    const startedAt = performance.now();
    let lastDrawAt = -Infinity;
    const renderPreviewFrame = (now: number) => {
      if (now - lastDrawAt < 1000 / 24) {
        previewFrameRef.current = window.requestAnimationFrame(renderPreviewFrame);
        return;
      }
      lastDrawAt = now;
      const elapsed = (now - startedAt) % loopDuration;
      const progress = clamp(elapsed / revealDuration, 0, 1);
      renderArtwork(preview, progress);
      previewFrameRef.current = window.requestAnimationFrame(renderPreviewFrame);
    };
    previewFrameRef.current = window.requestAnimationFrame(renderPreviewFrame);

    return () => {
      if (previewFrameRef.current !== null) window.cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = null;
    };
  }, [exportState, previewKind, renderArtwork]);

  useEffect(() => {
    if (!previewKind) return;
    const handlePreviewKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && exportState === "idle") setPreviewKind(null);
    };
    window.addEventListener("keydown", handlePreviewKeyDown);
    return () => window.removeEventListener("keydown", handlePreviewKeyDown);
  }, [exportState, previewKind]);

  const downloadStill = useCallback(() => {
    if (blobsRef.current.length === 0) return;
    const output = createExportCanvas();
    output.toBlob((blob) => {
      if (!blob) return;
      downloadBlob(blob, `${exportFileStem()}.png`);
      setPreviewKind(null);
    }, "image/png");
  }, [createExportCanvas]);

  const downloadVideo = useCallback(async () => {
    if (blobsRef.current.length === 0 || exportState !== "idle") return;
    if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement.prototype.captureStream !== "function") return;

    setExportState("video");
    const output = createExportCanvas(0);
    const outputContext = output.getContext("2d", { alpha: false });
    if (!outputContext) {
      setExportState("idle");
      return;
    }

    const mimeType = supportedVideoType();
    const stream = output.captureStream(24);
    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 7_500_000,
    });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    try {
      const revealDuration = clamp(1800 + blobsRef.current.length * 75, 2800, 4800);
      const holdDuration = 900;
      await new Promise<void>((resolve, reject) => {
        recorder.onerror = () => reject(new Error("Unable to record Aura video"));
        recorder.onstop = () => resolve();
        recorder.start(250);
        const startedAt = performance.now();

        const renderFrame = (now: number) => {
          const elapsed = now - startedAt;
          const replayProgress = clamp(elapsed / revealDuration, 0, 1);
          renderArtwork(output, replayProgress);

          if (elapsed < revealDuration + holdDuration) {
            window.requestAnimationFrame(renderFrame);
          } else {
            recorder.stop();
          }
        };

        window.requestAnimationFrame(renderFrame);
      });

      const video = new Blob(chunks, { type: mimeType || "video/webm" });
      downloadBlob(video, `${exportFileStem()}.webm`);
      setPreviewKind(null);
    } finally {
      stream.getTracks().forEach((track) => track.stop());
      setExportState("idle");
    }
  }, [createExportCanvas, exportState, renderArtwork]);

  const shiftOctave = useCallback((direction: -1 | 1) => {
    toneRef.current.synth?.releaseAll();
    activeToneNotesRef.current.clear();
    setActiveKeys(new Set());
    setOctave((current) => clamp(current + direction, MIN_OCTAVE, MAX_OCTAVE));
  }, []);

  const selectSoundMode = useCallback(
    (nextMode: SoundModeId, direction?: -1 | 1) => {
      if (nextMode === soundModeRef.current) return;

      const currentIndex = SOUND_MODES.findIndex(({ id }) => id === soundModeRef.current);
      const nextIndex = SOUND_MODES.findIndex(({ id }) => id === nextMode);
      let distance = nextIndex - currentIndex;
      if (distance > SOUND_MODES.length / 2) distance -= SOUND_MODES.length;
      if (distance < -SOUND_MODES.length / 2) distance += SOUND_MODES.length;
      setDialDirection(direction ?? (distance >= 0 ? 1 : -1));

      visualGenerationRef.current += 1;
      releaseTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      releaseTimersRef.current.clear();
      disposeToneEngine();
      soundModeRef.current = nextMode;
      setSoundMode(nextMode);
      setActiveKeys(new Set());
    },
    [disposeToneEngine],
  );

  const cycleSoundMode = useCallback(
    (direction: -1 | 1) => {
      const currentIndex = SOUND_MODES.findIndex(({ id }) => id === soundModeRef.current);
      const nextMode = SOUND_MODES[modulo(currentIndex + direction, SOUND_MODES.length)];
      selectSoundMode(nextMode.id, direction);
    },
    [selectSoundMode],
  );

  useEffect(() => {
    const handleModeKeyboard = (event: KeyboardEvent) => {
      if (previewKind || event.metaKey || event.altKey || event.ctrlKey || event.repeat) return;
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      cycleSoundMode(event.key === "ArrowUp" ? -1 : 1);
    };
    window.addEventListener("keydown", handleModeKeyboard);
    return () => window.removeEventListener("keydown", handleModeKeyboard);
  }, [cycleSoundMode, previewKind]);

  const resetAura = useCallback(() => {
    stopMicrophone();
    visualGenerationRef.current += 1;
    releaseTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    releaseTimersRef.current.clear();
    disposeToneEngine();
    blobsRef.current = [];
    blobIdRef.current = 1;
    noteRepeatRef.current.clear();
    if (resetFrameRef.current !== null) window.cancelAnimationFrame(resetFrameRef.current);
    setResetting(true);
    setActiveKeys(new Set());
    setOctave(BASE_OCTAVE);
    soundModeRef.current = DEFAULT_SOUND_MODE;
    setSoundMode(DEFAULT_SOUND_MODE);
    setPreviewKind(null);
    setLayerCount(0);
    setExportState("idle");
    wakeRendererRef.current?.();
    resetFrameRef.current = window.requestAnimationFrame(() => {
      resetFrameRef.current = null;
      setResetting(false);
    });
  }, [disposeToneEngine, stopMicrophone]);

  const activeSoundMode = SOUND_MODES.find(({ id }) => id === soundMode) ?? SOUND_MODES[0];
  const microphoneLabel =
    microphoneState === "listening"
      ? `Stop microphone listening, detecting ${microphoneReading}`
      : microphoneState === "requesting"
        ? "Cancel microphone request"
        : microphonePromptOpen
          ? "Close microphone setup"
        : microphoneState === "error"
          ? "Retry microphone listening"
          : microphoneState === "unsupported"
            ? "Microphone listening is unsupported"
            : "Start microphone listening";
  return (
    <main className={`aura-page ${resetting ? "is-resetting" : ""}`}>
      <canvas ref={canvasRef} className="aura-canvas" aria-hidden="true" />

      <section className="instrument-zone" aria-label="Aura instrument">
        <div className="instrument-body">
          <div className="instrument-header">
            <button
              type="button"
              className="power-led"
              aria-label="Reset aura"
              title="Reset aura"
              onClick={resetAura}
            />
            <div
              className="mode-dial"
              onWheel={(event) => {
                event.preventDefault();
                if (dialWheelTimerRef.current !== null || event.deltaY === 0) return;
                const direction = event.deltaY > 0 ? 1 : -1;
                cycleSoundMode(direction);
                dialWheelTimerRef.current = window.setTimeout(() => {
                  dialWheelTimerRef.current = null;
                }, 180);
              }}
            >
              <div
                className="mode-screen"
                role="status"
                aria-live="polite"
                aria-label={`Sound mode: ${activeSoundMode.label}`}
              >
                <span className="mode-screen-glass" aria-hidden="true">
                  <span
                    key={`${soundMode}-${dialDirection}`}
                    className={`mode-readout ${dialDirection > 0 ? "is-forward" : "is-backward"}`}
                  >
                    {activeSoundMode.label}
                  </span>
                </span>
                <div className="mode-stepper" aria-label="Sound mode controls">
                  <button
                    type="button"
                    className="mode-step-button"
                    aria-label="Previous sound mode"
                    title="Previous sound mode"
                    onClick={() => cycleSoundMode(-1)}
                  >
                    <span className="filled-triangle is-up" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="mode-step-button"
                    aria-label="Next sound mode"
                    title="Next sound mode"
                    onClick={() => cycleSoundMode(1)}
                  >
                    <span className="filled-triangle is-down" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
            <span className="header-rule" aria-hidden="true" />
            <div className="transport" aria-label="Octave controls">
              <button
                type="button"
                className="transport-button"
                aria-label="Shift octave down"
                title="Lower octave"
                disabled={octave === MIN_OCTAVE}
                onClick={() => shiftOctave(-1)}
              >
                <span className="filled-triangle is-left" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="transport-button"
                aria-label="Shift octave up"
                title="Raise octave"
                disabled={octave === MAX_OCTAVE}
                onClick={() => shiftOctave(1)}
              >
                <span className="filled-triangle is-right" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="keybed" data-octave={octave}>
            <div className="white-keys">
              {WHITE_KEYS.map((key) => (
                <button
                  key={key.id}
                  type="button"
                  className={`piano-key white-key ${
                    activeKeys.has(key.id) || shiftedNote(key).pc === microphoneMelodyPitchClass ? "is-active" : ""
                  }`}
                  aria-label={shiftedNote(key).name}
                  onPointerDown={(event) => handlePointerDown(event, key)}
                  onPointerUp={(event) => handlePointerEnd(event, key)}
                  onPointerCancel={(event) => handlePointerEnd(event, key)}
                  onLostPointerCapture={() => endKey(key)}
                />
              ))}
            </div>

            {UPPER_KEYS.map((key) => (
              <div
                key={key.id}
                className="upper-key-slot"
                style={{ "--upper-left": `${(key.left ?? 0) * 100}%` } as CSSProperties}
              >
                <button
                  type="button"
                  className={`piano-key upper-key ${
                    activeKeys.has(key.id) || shiftedNote(key).pc === microphoneMelodyPitchClass ? "is-active" : ""
                  }`}
                  aria-label={shiftedNote(key).name}
                  onPointerDown={(event) => handlePointerDown(event, key)}
                  onPointerUp={(event) => handlePointerEnd(event, key)}
                  onPointerCancel={(event) => handlePointerEnd(event, key)}
                  onLostPointerCapture={() => endKey(key)}
                />
              </div>
            ))}
          </div>
        </div>

      </section>

      <div className="microphone-dock" aria-label="Microphone input">
        <button
          ref={microphoneButtonRef}
          type="button"
          className={`export-button microphone-button is-${microphoneState}`}
          aria-label={microphoneLabel}
          aria-pressed={microphoneState === "listening"}
          disabled={microphoneState === "unsupported"}
          onClick={toggleMicrophone}
        >
          {microphoneState === "error" || microphoneState === "unsupported" ? (
            <MicOff className="control-icon" size={14} strokeWidth={1.6} aria-hidden="true" />
          ) : (
            <Mic className="control-icon" size={14} strokeWidth={1.6} aria-hidden="true" />
          )}
        </button>
        <span className="sr-only" role="status" aria-live="polite">
          {microphoneState === "listening" ? microphoneReading : microphoneLabel}
        </span>
      </div>

      {microphonePromptOpen ? (
        <div
          className="microphone-permission-backdrop"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setMicrophonePromptOpen(false);
          }}
        >
          <section
            className="microphone-permission"
            role="dialog"
            aria-modal="true"
            aria-labelledby="microphone-permission-title"
          >
            <header className="microphone-permission-header">
              <h2 id="microphone-permission-title">Microphone</h2>
              <button
                type="button"
                className="preview-control"
                aria-label="Close microphone setup"
                onClick={() => setMicrophonePromptOpen(false)}
              >
                <X className="control-icon" size={14} strokeWidth={1.6} aria-hidden="true" />
              </button>
            </header>
            <div className="microphone-permission-screen">
              <span className="microphone-permission-icon" aria-hidden="true">
                <Mic className="control-icon" size={18} strokeWidth={1.5} />
              </span>
              <p>Aura listens locally to pitch, rhythm, and volume. Audio is never saved.</p>
            </div>
            <button
              type="button"
              className="microphone-permission-action"
              onClick={() => {
                microphoneIntroductionShownRef.current = true;
                setMicrophonePromptOpen(false);
                void startMicrophone();
              }}
            >
              Allow microphone
            </button>
          </section>
        </div>
      ) : null}

      <div className={`export-dock ${layerCount > 0 ? "is-ready" : ""}`} aria-label="Export visual">
        <button
          type="button"
          className="export-button"
          aria-label="Preview visual as PNG"
          title="Preview PNG"
          disabled={layerCount === 0 || exportState !== "idle"}
          onClick={() => setPreviewKind("image")}
        >
          <ImageIcon className="control-icon" size={14} strokeWidth={1.6} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`export-button ${exportState === "video" ? "is-exporting" : ""}`}
          aria-label={exportState === "video" ? "Rendering video" : "Preview visual as video"}
          title={exportState === "video" ? "Rendering video" : "Preview WebM video"}
          disabled={layerCount === 0 || exportState !== "idle"}
          onClick={() => setPreviewKind("video")}
        >
          <VideoIcon className="control-icon" size={14} strokeWidth={1.6} aria-hidden="true" />
        </button>
        <span className="sr-only" aria-live="polite">
          {exportState === "video" ? "Rendering Aura video" : ""}
        </span>
      </div>

      {previewKind ? (
        <div
          className="export-preview-backdrop"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget && exportState === "idle") setPreviewKind(null);
          }}
        >
          <section
            className="export-preview"
            role="dialog"
            aria-modal="true"
            aria-label={previewKind === "image" ? "Image export preview" : "Video export preview"}
          >
            <header className="export-preview-header">
              <span className="export-preview-label">{previewKind === "image" ? "Still" : "Motion"}</span>
              <div className="export-preview-actions">
                <button
                  ref={previewDownloadRef}
                  type="button"
                  className={`preview-control ${exportState === "video" ? "is-exporting" : ""}`}
                  aria-label={previewKind === "image" ? "Download PNG" : "Download WebM video"}
                  title={previewKind === "image" ? "Download PNG" : "Download WebM video"}
                  disabled={exportState !== "idle"}
                  onClick={() => {
                    if (previewKind === "image") downloadStill();
                    else void downloadVideo();
                  }}
                >
                  <Download className="control-icon" size={15} strokeWidth={1.5} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="preview-control"
                  aria-label="Close export preview"
                  title="Close preview"
                  disabled={exportState !== "idle"}
                  onClick={() => setPreviewKind(null)}
                >
                  <X className="control-icon" size={16} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
            </header>
            <div className="export-preview-screen">
              <canvas ref={previewCanvasRef} aria-label="Artwork to be saved" />
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
