"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
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

type AuraShape = "bloom" | "ribbon" | "beam" | "arc" | "prism" | "veil";

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
  shapes: readonly AuraShape[];
  accentOffset: number;
  angleBias: number;
  softness: number;
};

type ExportState = "idle" | "video";
type ExportKind = "image" | "video";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BASE_OCTAVE = 4;
const MIN_OCTAVE = 1;
const MAX_OCTAVE = 7;
const MIN_MIDI = (MIN_OCTAVE + 1) * 12;
const MAX_MIDI = (MAX_OCTAVE + 2) * 12 - 1;
const BLOB_ARRIVAL_DURATION = 550;
const DEFAULT_SOUND_MODE: SoundModeId = "piano";
const SPECTRAL_HUES = [330, 286, 250, 220, 188, 156, 112, 72, 48, 24, 4, 350] as const;
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
    shapes: ["ribbon", "bloom", "arc", "prism", "veil", "beam"],
    accentOffset: 18,
    angleBias: -0.08,
    softness: 0.62,
  },
  glass: {
    shapes: ["prism", "beam", "arc", "bloom", "ribbon", "veil"],
    accentOffset: -20,
    angleBias: -0.34,
    softness: 0.38,
  },
  pad: {
    shapes: ["veil", "bloom", "ribbon", "arc", "prism", "beam"],
    accentOffset: 12,
    angleBias: 0.14,
    softness: 0.9,
  },
  pluck: {
    shapes: ["beam", "prism", "arc", "ribbon", "bloom", "veil"],
    accentOffset: -14,
    angleBias: 0.44,
    softness: 0.32,
  },
  organ: {
    shapes: ["arc", "ribbon", "veil", "bloom", "beam", "prism"],
    accentOffset: 22,
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
  const hue = modulo(SPECTRAL_HUES[modulo(index, SPECTRAL_HUES.length)] + (rng() - 0.5) * 16, 360);
  return {
    h: hue,
    s: pale ? 68 + rng() * 14 : 80 + rng() * 16,
    l: pale ? 62 + rng() * 8 : 50 + rng() * 14,
  };
}

function createMapping(): Mapping {
  const seedHash = fnv1a("AURA");
  const rng = mulberry32(seedHash);
  const pitches: Color[] = [];
  const paletteOffset = seedHash % SPECTRAL_HUES.length;

  for (let index = 0; index < 12; index += 1) {
    pitches.push(spectralColor(paletteOffset + index * 5, rng));
  }

  return {
    seedHash,
    pitches,
  };
}

const AURA_MAPPING = createMapping();

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
  gradient.addColorStop(0.47, colorToHslar(accent, alpha * 0.88));
  gradient.addColorStop(0.53, `rgba(255, 255, 255, ${alpha * 0.24})`);
  gradient.addColorStop(0.62, colorToHslar(accent, alpha));
  gradient.addColorStop(0.78, colorToHslar(primary, alpha * 0.58));
  gradient.addColorStop(1, colorToHslar(accent, 0));
  return gradient;
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

  context.restore();
}

function paintArtworkBackground(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = "#f5f5f7";
  context.fillRect(0, 0, width, height);

  const wash = context.createRadialGradient(
    width * 0.5,
    height * 0.3,
    0,
    width * 0.5,
    height * 0.3,
    Math.max(width, height) * 0.62,
  );
  wash.addColorStop(0, "rgba(255, 250, 238, 0.22)");
  wash.addColorStop(0.58, "rgba(246, 244, 248, 0.1)");
  wash.addColorStop(1, "rgba(245, 245, 247, 0)");
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
  context.globalCompositeOperation = "source-over";
  blobs.forEach((blob, index) => {
    const replayAge = replayPosition - index;
    if (replayAge <= 0) return;

    const age = replayProgress === undefined ? Math.max(0, now - blob.createdAt) : replayAge * BLOB_ARRIVAL_DURATION;
    const arrival = easeOutCubic(age / BLOB_ARRIVAL_DURATION);
    const radius = blob.radius * shortSide * (0.46 + arrival * 0.54);
    const alpha = clamp((0.24 + blob.velocity * 0.31) * Math.min(1, replayAge), 0, 0.56);

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
  const soundPickerRef = useRef<HTMLDivElement | null>(null);
  const soundTriggerRef = useRef<HTMLButtonElement | null>(null);
  const blobsRef = useRef<BlobParticle[]>([]);
  const blobIdRef = useRef(1);
  const noteRepeatRef = useRef<Map<string, number>>(new Map());
  const grainRef = useRef<HTMLCanvasElement | null>(null);
  const reducedMotionRef = useRef(false);
  const audioGenerationRef = useRef(0);
  const visualGenerationRef = useRef(0);
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
  const [soundMenuOpen, setSoundMenuOpen] = useState(false);
  const [layerCount, setLayerCount] = useState(0);
  const [exportState, setExportState] = useState<ExportState>("idle");
  const [previewKind, setPreviewKind] = useState<ExportKind | null>(null);
  const [dialDirection, setDialDirection] = useState<-1 | 1>(1);

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

  useEffect(() => {
    if (!soundMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!soundPickerRef.current?.contains(event.target as Node)) {
        setSoundMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSoundMenuOpen(false);
      soundTriggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [soundMenuOpen]);

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
    const repeatRng = mulberry32(identitySeed ^ Math.imul(repeat + 1, 0x9e3779b1));
    const pitchNorm = clamp((note.midi - MIN_MIDI) / (MAX_MIDI - MIN_MIDI), 0, 1);
    const anchor = COMPOSITION_ANCHORS[
      modulo(note.pc * 7 + Math.floor(note.midi / 12) * 3 + modeIndex * 5 + identitySeed, COMPOSITION_ANCHORS.length)
    ];
    const pitchX = 0.1 + (note.pc / 11) * 0.8;
    const pitchY = 0.1 + (1 - pitchNorm) * 0.76;
    const baseX = clamp(lerp(pitchX, anchor[0], 0.38) + (identityRng() - 0.5) * 0.04, 0.05, 0.95);
    const baseY = clamp(lerp(pitchY, anchor[1], 0.24) + (identityRng() - 0.5) * 0.035, 0.05, 0.88);
    const orbit = repeat === 0 ? 0 : Math.min(0.024 + repeat * 0.008, 0.105);
    const orbitAngle = repeat * 2.399963 + identityRng() * Math.PI * 2;
    const x = clamp(baseX + Math.cos(orbitAngle) * orbit * (0.72 + repeatRng() * 0.5), 0.035, 0.965);
    const y = clamp(baseY + Math.sin(orbitAngle) * orbit * (0.58 + repeatRng() * 0.45), 0.04, 0.9);
    const primaryShapeIndex = Math.floor(identityRng() * profile.shapes.length);
    const shape = profile.shapes[modulo(primaryShapeIndex + repeat, profile.shapes.length)];
    const baseRadius: Record<AuraShape, number> = {
      bloom: 0.13,
      ribbon: 0.1,
      beam: 0.09,
      arc: 0.14,
      prism: 0.11,
      veil: 0.17,
    };
    const repeatScale = 0.92 + repeatRng() * 0.2 + Math.min(repeat, 7) * 0.025;
    const radius = baseRadius[shape] * (0.84 + identityRng() * 0.56) * (0.82 + velocity * 0.38) * repeatScale;
    const stretchByShape: Record<AuraShape, [number, number]> = {
      bloom: [0.7, 2.2],
      ribbon: [2.4, 5.4],
      beam: [2.8, 6.2],
      arc: [1.1, 2.2],
      prism: [1.3, 3.2],
      veil: [1.8, 4.2],
    };
    const [minimumStretch, maximumStretch] = stretchByShape[shape];
    const stretch = lerp(minimumStretch, maximumStretch, identityRng()) * (0.9 + repeatRng() * 0.22);
    const accent = {
      h: modulo(color.h + profile.accentOffset + (identityRng() - 0.5) * 8, 360),
      s: clamp(color.s + 4 + identityRng() * 6, 0, 100),
      l: clamp(color.l + 3 + identityRng() * 6, 0, 69),
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
      angle:
        profile.angleBias +
        (identityRng() - 0.5) * Math.PI * 1.15 +
        (note.pc - 5.5) * 0.045 +
        (repeatRng() - 0.5) * 0.22,
      stretch,
      thickness: 0.2 + identityRng() * 0.42 + velocity * 0.12 + repeatRng() * 0.08,
      curvature: (identityRng() - 0.5) * 1.65 + (repeatRng() - 0.5) * 0.28,
      velocity,
      softness: clamp(profile.softness + (identityRng() - 0.5) * 0.18, 0.24, 0.98),
      createdAt: now,
    });

    setLayerCount(blobsRef.current.length);
    wakeRendererRef.current?.();
  }, []);

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
      gradient.addColorStop(0, "rgba(255, 246, 222, 0.054)");
      gradient.addColorStop(0.54, "rgba(255, 217, 160, 0.025)");
      gradient.addColorStop(1, "rgba(245, 245, 247, 0)");
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
      context.globalCompositeOperation = "source-over";
      context.filter = reducedMotionRef.current ? "blur(3px)" : "blur(5px)";
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

    paintArtworkBackground(outputContext, output.width, output.height);
    const settledAt = (blobsRef.current.at(-1)?.createdAt ?? performance.now()) + BLOB_ARRIVAL_DURATION;
    drawAuraComposition(
      outputContext,
      blobsRef.current,
      output.width,
      output.height,
      settledAt,
      replayProgress,
    );
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
          paintArtworkBackground(outputContext, output.width, output.height);
          drawAuraComposition(
            outputContext,
            blobsRef.current,
            output.width,
            output.height,
            now,
            replayProgress,
          );
          if (grainRef.current) {
            drawGrain(outputContext, output.width, output.height, grainRef.current, 0.035);
          }

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
  }, [createExportCanvas, exportState]);

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

  const resetAura = useCallback(() => {
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
    setSoundMenuOpen(false);
    setPreviewKind(null);
    setLayerCount(0);
    setExportState("idle");
    wakeRendererRef.current?.();
    resetFrameRef.current = window.requestAnimationFrame(() => {
      resetFrameRef.current = null;
      setResetting(false);
    });
  }, [disposeToneEngine]);

  const activeSoundMode = SOUND_MODES.find(({ id }) => id === soundMode) ?? SOUND_MODES[0];
  const activeSoundModeIndex = SOUND_MODES.findIndex(({ id }) => id === soundMode);

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
              ref={soundPickerRef}
              className="sound-picker"
              style={{ "--mode-length": activeSoundMode.label.length } as CSSProperties}
              onWheel={(event) => {
                event.preventDefault();
                if (dialWheelTimerRef.current !== null || event.deltaY === 0) return;
                const direction = event.deltaY > 0 ? 1 : -1;
                cycleSoundMode(direction);
                setSoundMenuOpen(true);
                dialWheelTimerRef.current = window.setTimeout(() => {
                  dialWheelTimerRef.current = null;
                }, 180);
              }}
            >
              <button
                ref={soundTriggerRef}
                type="button"
                className="mode-screen"
                aria-label={`Sound mode: ${activeSoundMode.label}`}
                aria-haspopup="listbox"
                aria-expanded={soundMenuOpen}
                title="Choose sound mode"
                onClick={() => setSoundMenuOpen((open) => !open)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    cycleSoundMode(1);
                    setSoundMenuOpen(true);
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    cycleSoundMode(-1);
                    setSoundMenuOpen(true);
                  }
                }}
              >
                <span className="mode-screen-glass" aria-hidden="true">
                  <span
                    key={`${soundMode}-${dialDirection}`}
                    className={`mode-readout ${dialDirection > 0 ? "is-forward" : "is-backward"}`}
                  >
                    {activeSoundMode.label}
                  </span>
                </span>
              </button>
              {soundMenuOpen ? (
                <div className="sound-wheel" role="listbox" aria-label="Sound modes">
                  <span className="sound-wheel-focus" aria-hidden="true" />
                  {SOUND_MODES.map((mode, index) => {
                    let offset = index - activeSoundModeIndex;
                    if (offset > SOUND_MODES.length / 2) offset -= SOUND_MODES.length;
                    if (offset < -SOUND_MODES.length / 2) offset += SOUND_MODES.length;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        role="option"
                        aria-selected={mode.id === soundMode}
                        className={`sound-wheel-option ${mode.id === soundMode ? "is-selected" : ""}`}
                        style={
                          {
                            "--mode-offset": offset,
                            "--mode-distance": Math.abs(offset),
                          } as CSSProperties
                        }
                        onClick={() => selectSoundMode(mode.id)}
                      >
                        {mode.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
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
                <span className="triangle is-left" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="transport-button"
                aria-label="Shift octave up"
                title="Raise octave"
                disabled={octave === MAX_OCTAVE}
                onClick={() => shiftOctave(1)}
              >
                <span className="triangle is-right" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="keybed" data-octave={octave}>
            <div className="white-keys">
              {WHITE_KEYS.map((key) => (
                <button
                  key={key.id}
                  type="button"
                  className={`piano-key white-key ${activeKeys.has(key.id) ? "is-active" : ""}`}
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
                  className={`piano-key upper-key ${activeKeys.has(key.id) ? "is-active" : ""}`}
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

      <div className={`export-dock ${layerCount > 0 ? "is-ready" : ""}`} aria-label="Export visual">
        <button
          type="button"
          className="export-button"
          aria-label="Preview visual as PNG"
          title="Preview PNG"
          disabled={layerCount === 0 || exportState !== "idle"}
          onClick={() => setPreviewKind("image")}
        >
          <span className="export-icon is-still" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`export-button ${exportState === "video" ? "is-exporting" : ""}`}
          aria-label={exportState === "video" ? "Rendering video" : "Preview visual as video"}
          title={exportState === "video" ? "Rendering video" : "Preview WebM video"}
          disabled={layerCount === 0 || exportState !== "idle"}
          onClick={() => setPreviewKind("video")}
        >
          <span className="export-icon is-video" aria-hidden="true" />
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
                  type="button"
                  className="preview-control"
                  aria-label="Close export preview"
                  title="Close preview"
                  disabled={exportState !== "idle"}
                  onClick={() => setPreviewKind(null)}
                >
                  <span className="close-icon" aria-hidden="true" />
                </button>
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
                  <span className="download-icon" aria-hidden="true" />
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
