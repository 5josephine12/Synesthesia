"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { PitchDetector } from "pitchy";
import { drawDottedSigil } from "./art-styles/style-2";
import { drawTelemetryOverlay, telemetryNextFrameAt } from "./art-styles/telemetry";

type SolidControlIconName =
  | "check"
  | "close"
  | "download"
  | "external-input"
  | "fullscreen"
  | "image"
  | "mic"
  | "mic-off"
  | "system-audio"
  | "video"
  | "exit-fullscreen";

function SolidControlIcon({
  name,
  size = 15,
}: {
  name: SolidControlIconName;
  size?: number;
}) {
  return (
    <svg
      className={`control-icon solid-control-icon ${
        name === "close" || name === "download" ? "is-linear" : ""
      }`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      data-solid-icon={name}
    >
      {name === "mic" || name === "mic-off" ? (
        <>
          <path d="M12 14.25a3.5 3.5 0 0 0 3.5-3.5V5.5a3.5 3.5 0 1 0-7 0v5.25a3.5 3.5 0 0 0 3.5 3.5Z" />
          <path d="M18.75 10.25h-2a4.75 4.75 0 0 1-9.5 0h-2A6.75 6.75 0 0 0 11 16.93V20H8.5v2h7v-2H13v-3.07a6.75 6.75 0 0 0 5.75-6.68Z" />
          {name === "mic-off" ? (
            <path d="m3.55 4.96 1.41-1.41 15.49 15.49-1.41 1.41Z" />
          ) : null}
        </>
      ) : null}
      {name === "image" ? (
        <>
          <circle cx="8.1" cy="7.7" r="2.35" />
          <path d="m2.75 20 6.7-8.2 3.55 4.1 2.55-3.1L21.25 20Z" />
        </>
      ) : null}
      {name === "system-audio" ? (
        <>
          <path d="M3.25 3.75h10.5A2.25 2.25 0 0 1 16 6v8.75H1V6a2.25 2.25 0 0 1 2.25-2.25ZM4.5 16.5h8v2h-8Z" />
          <path d="M18.1 8.1a3.2 3.2 0 0 1 0 4.8l1.35 1.35a5.1 5.1 0 0 0 0-7.5Zm2.55-2.55a6.8 6.8 0 0 1 0 9.9L22 16.8a8.7 8.7 0 0 0 0-12.6Z" />
        </>
      ) : null}
      {name === "external-input" ? (
        <path d="M7 2h3v5h4V2h3v5h2v4a7 7 0 0 1-6 6.93V22h-2v-4.07A7 7 0 0 1 5 11V7h2V2Z" />
      ) : null}
      {name === "exit-fullscreen" ? (
        <path d="M3 8h5V3h2v7H3V8Zm11-5h2v5h5v2h-7V3ZM3 14h7v7H8v-5H3v-2Zm11 0h7v2h-5v5h-2v-7Z" />
      ) : null}
      {name === "video" ? (
        <>
          <rect x="2.5" y="5.5" width="13.5" height="13" rx="2.5" />
          <path d="m17.5 9 4-2.3v10.6l-4-2.3Z" />
        </>
      ) : null}
      {name === "fullscreen" ? (
        <path d="M3 3h7v2H5v5H3V3Zm11 0h7v7h-2V5h-5V3ZM3 14h2v5h5v2H3v-7Zm16 0h2v7h-7v-2h5v-5Z" />
      ) : null}
      {name === "download" ? (
        <path d="M12 1.75v14.5M5 9.5l7 6.75 7-6.75M3.5 21.5h17" />
      ) : null}
      {name === "close" ? (
        <path d="m6 6 12 12M18 6 6 18" />
      ) : null}
      {name === "check" ? (
        <path d="m9.2 18.15-5.35-5.34 2.35-2.35 3 3 8.6-8.61 2.35 2.35Z" />
      ) : null}
    </svg>
  );
}

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
type AuraBlendMode = "lighter" | "source-over";

type BlobParticle = {
  id: number;
  artStyle: ArtStyleId;
  color: Color;
  accent: Color;
  shape: AuraShape;
  note: string;
  midi: number;
  repeat: number;
  compositionIndex: number;
  x: number;
  y: number;
  radius: number;
  angle: number;
  stretch: number;
  thickness: number;
  curvature: number;
  velocity: number;
  softness: number;
  blendMode: AuraBlendMode;
  createdAt: number;
};

type KeySpec = NoteChoice & {
  id: string;
  kind: "white" | "upper";
  hand: "left" | "right";
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

type ExportState = "idle" | "image" | "gif";
type ExportKind = "image" | "gif";
type DownloadFeedback = "idle" | "preparing" | "complete" | "error";
type HapticFeedback = "open" | "close" | "confirm" | "success" | "error";
type MicrophoneState = "idle" | "requesting" | "listening" | "error" | "unsupported";
type AudioInputSource = "microphone" | "system" | "external";

type DeviceAudioTrackConstraints = MediaTrackConstraints & {
  suppressLocalAudioPlayback?: boolean;
};

type DeviceAudioCaptureOptions = Omit<DisplayMediaStreamOptions, "audio"> & {
  audio?: boolean | DeviceAudioTrackConstraints;
  preferCurrentTab?: boolean;
  selfBrowserSurface?: "include" | "exclude";
  surfaceSwitching?: "include" | "exclude";
  systemAudio?: "include" | "exclude";
  windowAudio?: "exclude" | "window" | "system";
};
type MicrophoneModeId = "wide-spectrum" | "voice-isolation" | "standard" | "automatic";
type MicrophoneMode = {
  id: MicrophoneModeId;
  label: string;
  title: string;
};
type MicrophoneCaptureConstraints = MediaTrackConstraints & {
  voiceIsolation?: boolean;
};
type ScaleMode = "major" | "minor";

type HarmonicContext = {
  root: number;
  mode: ScaleMode;
  confidence: number;
};

type ChordContext = HarmonicContext & {
  pitchClasses: number[];
};

type SpectrumAnalysis = {
  spectralFlux: number;
  dominantMidi: number | null;
  bassMidi: number | null;
  noteCandidates: number[];
  pitchClasses: number[];
};

type ReplayRenderState = {
  settledLayer: HTMLCanvasElement;
  settledContext: CanvasRenderingContext2D;
  settledCount: number;
  lastProgress: number;
  width: number;
  height: number;
  blobTotal: number;
};

type MicrophoneRuntime = {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  processingNodes: AudioNode[];
  analyser: AnalyserNode;
  detector: PitchDetector<Float32Array>;
  timeDomain: Float32Array;
  frequencyData: Float32Array;
  previousSpectrum: Float32Array;
  chroma: Float32Array;
  chordChroma: Float32Array;
  melodyChroma: Float32Array;
  frameChroma: Float32Array;
  candidateScores: Map<number, number>;
  spectrumAnalysis: SpectrumAnalysis;
  upperRegisterBoost: Float32Array;
  melodyScores: Float32Array;
  detectedPitchClasses: number[];
  nextHighlightedPitchClasses: number[];
  leftHandCandidateScratch: number[];
  animationFrame: number;
  analyze: FrameRequestCallback;
  lastAnalysisAt: number;
  lastResumeAttemptAt: number;
  lastVisualAt: number;
  lastBeatAt: number;
  lastValidPitchAt: number;
  lastMidi: number | null;
  candidateMidi: number | null;
  candidateFrames: number;
  noiseFloor: number;
  smoothedEnergy: number;
  smoothedFlux: number;
  beatBandEnergy: number;
  beatInterval: number;
  beatConfidence: number;
  nextBeatAt: number;
  lastOnsetAt: number;
  previousOnsetStrength: number;
  onsetRising: boolean;
  onsetBaseline: number;
  onsetDeviation: number;
  highlightedPitchClasses: number[];
  highlightedHarmonyPitchClasses: number[];
  lastKeyBeatAt: number;
  leftHandPitchClasses: number[];
  leftHandCandidatePitchClasses: number[];
  leftHandCandidateFrames: number;
  leftHandLastSeenAt: number;
  melodyPitchClass: number | null;
  melodyCandidatePitchClass: number | null;
  melodyCandidateFrames: number;
  melodyLastSeenAt: number;
  melodyStableSince: number;
  lastMeterLevel: number;
  lastMeterAt: number;
  lastReading: string;
  visualCursor: number;
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BASE_OCTAVE = 3;
const HIGHEST_PIANO_OCTAVE = 7;
const MIN_OCTAVE = 1;
const MAX_OCTAVE = HIGHEST_PIANO_OCTAVE - 1;
const MIN_MIDI = (MIN_OCTAVE + 1) * 12;
const MAX_MIDI = (HIGHEST_PIANO_OCTAVE + 2) * 12 - 1;
const BLOB_ARRIVAL_DURATION = 550;
const DOTTED_VISIBLE_FORMATIONS = 4;
const DOTTED_FORMATION_SETTLE_DURATION = 2200;
const DOTTED_GLOW_MATURATION_DURATION = 7200;
const MAX_LIVE_VISUAL_PARTICLES = 96;
const HARD_MAX_LIVE_VISUAL_PARTICLES = 192;
const SYSTEM_AUDIO_INTRO_SESSION_KEY = "aura-system-audio-introduction-shown";
const DEVICE_AUDIO_CAPTURE_OPTIONS: DeviceAudioCaptureOptions = {
  video: { displaySurface: "browser" },
  audio: { suppressLocalAudioPlayback: false },
  preferCurrentTab: false,
  selfBrowserSurface: "exclude",
  surfaceSwitching: "include",
  systemAudio: "include",
  windowAudio: "system",
};
const TELEMETRY_TOGGLE_FADE_DURATION = 560;
const SATURATION_CHECK_INTERVAL = 6;
const SATURATION_MINIMUM_LAYERS = 24;
const MAXIMUM_ADDITIVE_LAYERS = 48;
const COLOR_REBUILD_LAYERS = 18;
const SATURATION_COVERAGE_THRESHOLD = 0.14;
const MICROPHONE_ANALYSIS_INTERVAL = 1000 / 30;
const MICROPHONE_FFT_SIZE = 4096;
const AURA_FRAME_INTERVAL = 1000 / 30;
const AURA_FRAME_TOLERANCE = 0.75;
const DOTTED_RENDER_INTERVAL = 1000 / 20;
const AURA_BACKING_PIXEL_BUDGET = 1_500_000;
const AURA_RENDER_PIXEL_BUDGET = 360_000;
const AURA_SETTLE_BUDGET_MS = 4;
const AURA_RENDER_BUDGET_MS = 12;
const AURA_MIN_ADAPTIVE_SCALE = 0.62;
const OVERLAY_EXIT_DURATION = 240;
const DOWNLOAD_COMPLETE_HOLD = 520;
const GIF_FRAME_DELAY = 60;
const GIF_HOLD_DURATION = 1100;
const GIF_MAX_DIMENSION = 1200;
const GIF_PALETTE_SIZE = 256;
const DEFAULT_SOUND_MODE: SoundModeId = "piano";
const DEFAULT_MICROPHONE_MODE: MicrophoneModeId = "wide-spectrum";
const RADIOGRAPHIC_HUES = [338, 322, 300, 282, 260, 238, 220, 10, 18, 348, 312, 248] as const;
const MAJOR_SCALE_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88] as const;
const MINOR_SCALE_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17] as const;
const SCALE_PROFILES = [
  { mode: "major", profile: MAJOR_SCALE_PROFILE },
  { mode: "minor", profile: MINOR_SCALE_PROFILE },
] as const;
const CHORD_QUALITIES = [
  { mode: "major", third: 4 },
  { mode: "minor", third: 3 },
] as const;
const HARMONIC_WEIGHTS = [1, 0.5, 0.32, 0.22] as const;
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

const PIXEL_COMPOSITION_ANCHORS = [
  [0.11, 0.16],
  [0.89, 0.18],
  [0.13, 0.68],
  [0.87, 0.66],
  [0.3, 0.12],
  [0.7, 0.13],
  [0.09, 0.42],
  [0.91, 0.44],
  [0.27, 0.74],
  [0.73, 0.73],
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

const AURA_BASE_RADIUS: Record<AuraShape, number> = {
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

const AURA_STRETCH_BY_SHAPE: Record<AuraShape, readonly [number, number]> = {
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

const SOUND_MODE_INDEX: Record<SoundModeId, number> = {
  piano: 0,
  glass: 1,
  pad: 2,
  pluck: 3,
  organ: 4,
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

  for (let octaveOffset = 0; octaveOffset < 2; octaveOffset += 1) {
    const octave = BASE_OCTAVE + octaveOffset;
    const hand = octaveOffset === 0 ? "left" : "right";

    whitePitchClasses.forEach((pc) => {
      const note = `${NOTE_NAMES[pc]}${octave}`;
      keys.push({
        id: note,
        kind: "white",
        hand,
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
        hand,
        name: note,
        midi: (octave + 1) * 12 + pc,
        pc,
        left: (octaveOffset * 7 + afterWhite + 1) / 14,
      });
    });
  }

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

function pitchClassesMatch(first: number[], second: number[]) {
  if (first.length !== second.length) return false;
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false;
  }
  return true;
}

function copyPitchClasses(source: readonly number[], target: number[]) {
  target.length = source.length;
  for (let index = 0; index < source.length; index += 1) target[index] = source[index];
}

function sortPitchClasses(pitchClasses: number[]) {
  for (let index = 1; index < pitchClasses.length; index += 1) {
    const value = pitchClasses[index];
    let insertionIndex = index - 1;
    while (insertionIndex >= 0 && pitchClasses[insertionIndex] > value) {
      pitchClasses[insertionIndex + 1] = pitchClasses[insertionIndex];
      insertionIndex -= 1;
    }
    pitchClasses[insertionIndex + 1] = value;
  }
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

function calculateBandEnergy(
  frequencyData: Float32Array,
  sampleRate: number,
  fftSize: number,
  minimumFrequency: number,
  maximumFrequency: number,
) {
  const minimumBin = Math.max(1, Math.ceil((minimumFrequency * fftSize) / sampleRate));
  const maximumBin = Math.min(
    frequencyData.length - 1,
    Math.floor((maximumFrequency * fftSize) / sampleRate),
  );
  let energy = 0;
  let sampleCount = 0;

  for (let bin = minimumBin; bin <= maximumBin; bin += 1) {
    const decibels = frequencyData[bin];
    const amplitude = Number.isFinite(decibels) ? Math.pow(10, decibels / 20) : 0;
    energy += amplitude * amplitude;
    sampleCount += 1;
  }

  return sampleCount > 0 ? Math.sqrt(energy / sampleCount) : 0;
}

function normalizeBeatInterval(interval: number) {
  // Fold fast subdivisions and slow bar accents into a deliberate quarter-note pulse.
  let normalized = interval;
  while (normalized < 360) normalized *= 2;
  while (normalized > 760) normalized /= 2;
  return clamp(normalized, 360, 760);
}

function trackMicrophoneBeat(
  runtime: MicrophoneRuntime,
  now: number,
  activeSignal: boolean,
  energyRise: number,
  spectralFlux: number,
  beatBandEnergy: number,
) {
  const bandRise = beatBandEnergy / Math.max(0.000001, runtime.beatBandEnergy);
  const fluxRise = spectralFlux / Math.max(0.00001, runtime.smoothedFlux);
  const onsetStrength =
    Math.max(0, bandRise - 1) * 1.6 +
    Math.max(0, energyRise - 1) * 0.78 +
    Math.max(0, fluxRise - 1) * 0.14;
  const onsetThreshold = Math.max(0.16, runtime.onsetBaseline + runtime.onsetDeviation * 1.9);
  const onsetPeak =
    activeSignal &&
    runtime.onsetRising &&
    runtime.previousOnsetStrength >= onsetThreshold &&
    onsetStrength < runtime.previousOnsetStrength * 0.9;

  const baselineDifference = Math.abs(onsetStrength - runtime.onsetBaseline);
  runtime.onsetBaseline = lerp(runtime.onsetBaseline, onsetStrength, 0.035);
  runtime.onsetDeviation = lerp(runtime.onsetDeviation, baselineDifference, 0.045);
  runtime.onsetRising =
    onsetStrength > runtime.previousOnsetStrength + 0.008
      ? true
      : onsetStrength < runtime.previousOnsetStrength * 0.92
        ? false
        : runtime.onsetRising;
  runtime.previousOnsetStrength = onsetStrength;
  runtime.beatBandEnergy = lerp(
    runtime.beatBandEnergy,
    beatBandEnergy,
    beatBandEnergy > runtime.beatBandEnergy ? 0.035 : 0.12,
  );

  let beatDetected = false;
  if (onsetPeak) {
    const onsetAt = now - MICROPHONE_ANALYSIS_INTERVAL;
    const rawInterval = onsetAt - runtime.lastOnsetAt;
    if (rawInterval > Math.max(1800, runtime.beatInterval * 3)) {
      runtime.beatInterval = 500;
      runtime.beatConfidence = 0;
      runtime.nextBeatAt = Infinity;
    } else if (Number.isFinite(runtime.lastOnsetAt)) {
      if (rawInterval >= 150 && rawInterval <= 1520) {
        const candidateInterval = normalizeBeatInterval(rawInterval);
        const intervalDifference = Math.abs(candidateInterval - runtime.beatInterval) / runtime.beatInterval;

        if (runtime.beatConfidence === 0) {
          runtime.beatInterval = candidateInterval;
          runtime.beatConfidence = 1;
        } else if (intervalDifference <= 0.22) {
          runtime.beatInterval = lerp(runtime.beatInterval, candidateInterval, 0.18);
          runtime.beatConfidence = Math.min(5, runtime.beatConfidence + 0.75);
        } else if (intervalDifference <= 0.36 && runtime.beatConfidence < 2) {
          runtime.beatInterval = lerp(runtime.beatInterval, candidateInterval, 0.28);
          runtime.beatConfidence = Math.max(0.5, runtime.beatConfidence - 0.1);
        } else {
          runtime.beatConfidence = Math.max(0, runtime.beatConfidence - 0.45);
        }
      }
    }
    runtime.lastOnsetAt = onsetAt;

    const sinceLastBeat = onsetAt - runtime.lastBeatAt;
    const beatMultiple = Math.max(1, Math.round(sinceLastBeat / runtime.beatInterval));
    const phaseError = Math.abs(sinceLastBeat - beatMultiple * runtime.beatInterval);
    const phaseWindow = Math.max(70, runtime.beatInterval * 0.18);
    const minimumSpacing = Math.max(300, runtime.beatInterval * 0.58);
    const isOnGrid = phaseError <= phaseWindow;
    const isOverdue = sinceLastBeat >= runtime.beatInterval * 1.6;

    if (
      !Number.isFinite(runtime.lastBeatAt) ||
      (sinceLastBeat >= minimumSpacing && (runtime.beatConfidence < 1.5 || isOnGrid || isOverdue))
    ) {
      beatDetected = true;
      runtime.lastBeatAt = onsetAt;
      runtime.nextBeatAt = onsetAt + runtime.beatInterval;
    }
  }

  const hasRecentPulse = now - runtime.lastOnsetAt <= runtime.beatInterval * 2.2;
  // A confident tempo can carry one acoustically soft beat without chasing every transient.
  if (
    !beatDetected &&
    activeSignal &&
    runtime.beatConfidence >= 2 &&
    hasRecentPulse &&
    now >= runtime.nextBeatAt
  ) {
    beatDetected = true;
    runtime.lastBeatAt = runtime.nextBeatAt;
    runtime.nextBeatAt += runtime.beatInterval;
  }

  return beatDetected;
}

function updateSpectrumAnalysis(
  frequencyData: Float32Array,
  previousSpectrum: Float32Array,
  chroma: Float32Array,
  frameChroma: Float32Array,
  candidateScores: Map<number, number>,
  analysis: SpectrumAnalysis,
  sampleRate: number,
  fftSize: number,
) {
  frameChroma.fill(0);
  candidateScores.clear();
  analysis.noteCandidates.length = 0;
  analysis.pitchClasses.length = 0;

  const minimumBin = Math.max(1, Math.ceil((45 * fftSize) / sampleRate));
  const maximumBin = Math.min(frequencyData.length - 1, Math.floor((4200 * fftSize) / sampleRate));
  let spectralFlux = 0;
  let peakDecibels = -Infinity;
  let bassMidi: number | null = null;
  let strongestBassPeak = -Infinity;

  for (let bin = minimumBin; bin <= maximumBin; bin += 1) {
    const decibels = frequencyData[bin];
    const amplitude = Number.isFinite(decibels) ? Math.pow(10, decibels / 20) : 0;
    const previousAmplitude = previousSpectrum[bin];
    if (amplitude > previousAmplitude) spectralFlux += amplitude - previousAmplitude;
    previousSpectrum[bin] = amplitude;

    if (decibels > peakDecibels) peakDecibels = decibels;
  }

  const peakThreshold = Math.max(-78, peakDecibels - 30);
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

    if (frequency <= 265 && decibels >= Math.max(-72, peakDecibels - 24)) {
      const bassWeight = peakWeight * (1 + clamp((265 - frequency) / 220, 0, 1) * 0.16);
      if (bassWeight > strongestBassPeak) {
        bassMidi = Math.round(frequencyToMidi(frequency));
        strongestBassPeak = bassWeight;
      }
    }

    for (let harmonic = 1; harmonic <= HARMONIC_WEIGHTS.length; harmonic += 1) {
      const fundamental = frequency / harmonic;
      const midi = Math.round(frequencyToMidi(fundamental));
      if (midi < MIN_MIDI || midi > MAX_MIDI) continue;
      const score = peakWeight * HARMONIC_WEIGHTS[harmonic - 1];
      candidateScores.set(midi, (candidateScores.get(midi) ?? 0) + score);
      frameChroma[modulo(midi, 12)] += score;
    }
  }

  for (let pitchClass = 0; pitchClass < chroma.length; pitchClass += 1) {
    chroma[pitchClass] = chroma[pitchClass] * 0.94 + frameChroma[pitchClass];
  }

  let strongestPitchClass = 0;
  let totalPitchEnergy = 0;
  for (let pitchClass = 0; pitchClass < frameChroma.length; pitchClass += 1) {
    const score = frameChroma[pitchClass];
    strongestPitchClass = Math.max(strongestPitchClass, score);
    totalPitchEnergy += score;
  }

  const pitchClasses = analysis.pitchClasses;
  const minimumPitchClassScore = Math.max(
    strongestPitchClass * 0.38,
    Math.max(0.000001, totalPitchEnergy * 0.08),
  );
  for (let rank = 0; rank < 3; rank += 1) {
    let bestPitchClass = -1;
    let bestScore = -Infinity;
    for (let pitchClass = 0; pitchClass < frameChroma.length; pitchClass += 1) {
      if (pitchClasses.includes(pitchClass)) continue;
      const score = frameChroma[pitchClass];
      if (score > bestScore) {
        bestPitchClass = pitchClass;
        bestScore = score;
      }
    }
    if (bestPitchClass < 0 || bestScore <= 0 || bestScore < minimumPitchClassScore) break;
    pitchClasses.push(bestPitchClass);
  }

  const noteCandidates = analysis.noteCandidates;
  for (const pitchClass of pitchClasses) {
    let bestMidi: number | null = null;
    let bestScore = -Infinity;
    for (const [midi, score] of candidateScores) {
      if (modulo(midi, 12) === pitchClass && score > bestScore) {
        bestMidi = midi;
        bestScore = score;
      }
    }
    if (bestMidi !== null) noteCandidates.push(bestMidi);
  }

  analysis.spectralFlux = spectralFlux;
  analysis.dominantMidi = noteCandidates[0] ?? null;
  analysis.bassMidi = bassMidi;
  return analysis;
}

function detectChordContext(chroma: Float32Array, bassPitchClass: number | null): ChordContext | null {
  let total = 0;
  for (let index = 0; index < chroma.length; index += 1) total += chroma[index];
  if (total < 0.0001) return null;

  let bestRoot = 0;
  let bestMode: ScaleMode = "major";
  let bestThird = 4;
  let bestScore = -Infinity;
  let secondScore = -Infinity;
  for (let root = 0; root < 12; root += 1) {
    for (const { mode, third } of CHORD_QUALITIES) {
      const thirdPitchClass = modulo(root + third, 12);
      const fifthPitchClass = modulo(root + 7, 12);
      const toneEnergy =
        chroma[root] * 1.2 +
        chroma[thirdPitchClass] * 1.05 +
        chroma[fifthPitchClass] * 0.92;
      const coveredEnergy = chroma[root] + chroma[thirdPitchClass] + chroma[fifthPitchClass];
      const coverage = coveredEnergy / total;
      const bassFit =
        bassPitchClass === root
          ? total * 0.24
          : bassPitchClass === thirdPitchClass || bassPitchClass === fifthPitchClass
            ? total * 0.08
            : 0;
      const score = toneEnergy + coverage * total * 0.36 + bassFit;
      if (score > bestScore) {
        secondScore = bestScore;
        bestRoot = root;
        bestMode = mode;
        bestThird = third;
        bestScore = score;
      } else if (score > secondScore) {
        secondScore = score;
      }
    }
  }

  const pitchClasses = [bestRoot, modulo(bestRoot + bestThird, 12), modulo(bestRoot + 7, 12)];
  const coverage =
    (chroma[pitchClasses[0]] + chroma[pitchClasses[1]] + chroma[pitchClasses[2]]) / total;
  const margin = (bestScore - secondScore) / Math.max(0.0001, bestScore);
  return {
    root: bestRoot,
    mode: bestMode,
    pitchClasses,
    confidence: clamp(coverage * 0.72 + margin * 2.4, 0, 1),
  };
}

function detectHarmonicContext(chroma: Float32Array): HarmonicContext | null {
  let total = 0;
  for (let index = 0; index < chroma.length; index += 1) total += chroma[index];
  if (total < 0.0001) return null;

  let bestRoot = 0;
  let bestMode: ScaleMode = "major";
  let bestScore = -Infinity;
  let secondScore = -Infinity;
  for (let root = 0; root < 12; root += 1) {
    for (const { mode, profile } of SCALE_PROFILES) {
      let score = 0;
      for (let degree = 0; degree < 12; degree += 1) {
        score += (chroma[modulo(root + degree, 12)] / total) * profile[degree];
      }
      if (score > bestScore) {
        secondScore = bestScore;
        bestRoot = root;
        bestMode = mode;
        bestScore = score;
      } else if (score > secondScore) {
        secondScore = score;
      }
    }
  }

  return {
    root: bestRoot,
    mode: bestMode,
    confidence: clamp(((bestScore - secondScore) / Math.max(0.001, bestScore)) * 5, 0, 1),
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

const MICROPHONE_MODES: readonly MicrophoneMode[] = [
  { id: "wide-spectrum", label: "Wide Spectrum", title: "Wide Spectrum" },
  { id: "voice-isolation", label: "Voice Isolation", title: "Voice Isolation" },
  { id: "standard", label: "Standard", title: "Standard" },
  { id: "automatic", label: "Automatic", title: "Automatic" },
];

const ART_STYLE_SLOTS = [
  { id: "aura", label: "Aura" },
  { id: "style-2", label: "Pixel" },
  { id: "style-3", label: "Style 3" },
  { id: "style-4", label: "Style 4" },
] as const;
type ArtStyleId = (typeof ART_STYLE_SLOTS)[number]["id"];

function audioConstraintsForMicrophoneMode(mode: MicrophoneModeId): MicrophoneCaptureConstraints {
  switch (mode) {
    case "wide-spectrum":
      return {
        autoGainControl: false,
        echoCancellation: false,
        noiseSuppression: false,
        voiceIsolation: false,
      };
    case "voice-isolation":
      return {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
        voiceIsolation: true,
      };
    case "standard":
      return {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
        voiceIsolation: false,
      };
    case "automatic":
      return {};
  }
}

function microphoneModeIndex(mode: MicrophoneModeId) {
  const index = MICROPHONE_MODES.findIndex(({ id }) => id === mode);
  return index < 0 ? 0 : index;
}

function setMicrophoneTrackHints(stream: MediaStream, mode: MicrophoneModeId) {
  const contentHint =
    mode === "wide-spectrum" ? "music" : mode === "voice-isolation" || mode === "standard" ? "speech" : "";
  for (const track of stream.getAudioTracks()) {
    try {
      track.contentHint = contentHint;
    } catch {
      // Older browsers may expose contentHint as read-only or omit it.
    }
  }
}

function configureMicrophonePipeline(runtime: MicrophoneRuntime, mode: MicrophoneModeId) {
  runtime.source.disconnect();
  for (const node of runtime.processingNodes) node.disconnect();
  runtime.processingNodes = [];

  if (mode === "voice-isolation") {
    // Browsers may ignore the voiceIsolation capture constraint. This local
    // speech-band pipeline is the deterministic fallback used by Aura's analyser.
    const highPass = runtime.context.createBiquadFilter();
    highPass.type = "highpass";
    highPass.frequency.value = 80;
    highPass.Q.value = 0.72;

    const lowPass = runtime.context.createBiquadFilter();
    lowPass.type = "lowpass";
    lowPass.frequency.value = 4200;
    lowPass.Q.value = 0.72;

    const compressor = runtime.context.createDynamicsCompressor();
    compressor.threshold.value = -42;
    compressor.knee.value = 10;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;

    runtime.source.connect(highPass);
    highPass.connect(lowPass);
    lowPass.connect(compressor);
    compressor.connect(runtime.analyser);
    runtime.processingNodes = [highPass, lowPass, compressor];
    runtime.analyser.minDecibels = -82;
    runtime.analyser.smoothingTimeConstant = 0.3;
    runtime.detector.minVolumeDecibels = -52;
  } else {
    runtime.source.connect(runtime.analyser);
    runtime.analyser.minDecibels = mode === "wide-spectrum" ? -105 : -100;
    runtime.analyser.smoothingTimeConstant = mode === "wide-spectrum" ? 0.16 : 0.22;
    runtime.detector.minVolumeDecibels = mode === "wide-spectrum" ? -66 : -62;
  }

  runtime.previousSpectrum.fill(0);
  runtime.chroma.fill(0);
  runtime.chordChroma.fill(0);
  runtime.melodyChroma.fill(0);
  runtime.frameChroma.fill(0);
  runtime.candidateScores.clear();
  runtime.detectedPitchClasses.length = 0;
  runtime.nextHighlightedPitchClasses.length = 0;
  runtime.highlightedPitchClasses.length = 0;
  runtime.highlightedHarmonyPitchClasses.length = 0;
  runtime.leftHandPitchClasses.length = 0;
  runtime.leftHandCandidatePitchClasses.length = 0;
  runtime.melodyPitchClass = null;
  runtime.melodyCandidatePitchClass = null;
  runtime.candidateMidi = null;
  runtime.lastMidi = null;
  runtime.candidateFrames = 0;
  runtime.noiseFloor = mode === "voice-isolation" ? 0.004 : mode === "wide-spectrum" ? 0.0018 : 0.0028;
}

function sessionFlag(key: string) {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function rememberSessionFlag(key: string) {
  try {
    window.sessionStorage.setItem(key, "true");
  } catch {
    // Session storage can be unavailable in restrictive privacy modes.
  }
}

function disposeMicrophoneRuntime(
  runtime: MicrophoneRuntime | null,
  stopStream = true,
  pauseStream = !stopStream,
) {
  if (!runtime) return;
  window.cancelAnimationFrame(runtime.animationFrame);
  runtime.source.disconnect();
  for (const node of runtime.processingNodes) node.disconnect();
  runtime.analyser.disconnect();
  runtime.stream.getTracks().forEach((track) => {
    if (stopStream) track.stop();
    else if (pauseStream) track.enabled = false;
  });
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

function easeInOutSmooth(value: number) {
  const progress = clamp(value, 0, 1);
  return progress * progress * (3 - 2 * progress);
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

function drawGrainPattern(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  pattern: CanvasPattern,
  alpha: number,
) {
  context.save();
  context.globalCompositeOperation = "overlay";
  context.globalAlpha = alpha;
  context.fillStyle = pattern;
  context.fillRect(0, 0, width, height);
  context.restore();
}

function isAuraWashedOut(
  source: HTMLCanvasElement,
  probe: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
) {
  context.clearRect(0, 0, probe.width, probe.height);
  context.drawImage(source, 0, 0, probe.width, probe.height);
  const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
  let washedOutPixels = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const alpha = pixels[index + 3];
    if (alpha > 96 && red > 238 && green > 238 && blue > 238) washedOutPixels += 1;
  }

  return washedOutPixels / (probe.width * probe.height) >= SATURATION_COVERAGE_THRESHOLD;
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

function auraHighlightColor(blob: BlobParticle, alpha: number, preserveColor: boolean) {
  if (!preserveColor) return `rgba(255, 255, 255, ${alpha})`;
  return colorToHslar(
    {
      h: blob.accent.h,
      s: clamp(blob.accent.s + 4, 0, 100),
      l: clamp(blob.accent.l + 18, 0, 82),
    },
    Math.min(1, alpha * 1.16),
  );
}

function drawAuraParticle(
  context: CanvasRenderingContext2D,
  blob: BlobParticle,
  centerX: number,
  centerY: number,
  radius: number,
  alpha: number,
  preserveColor = false,
  artStyle: ArtStyleId = "aura",
  now = performance.now(),
) {
  void now;
  context.save();
  context.translate(centerX, centerY);
  context.rotate(blob.angle);
  context.shadowColor = colorToHslar(blob.color, alpha * 0.42);
  context.shadowBlur = radius * (0.16 + blob.softness * 0.34);

  if (artStyle === "style-2") {
    context.restore();
    return;
  }

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
    nucleus.addColorStop(0, auraHighlightColor(blob, alpha * 0.34, preserveColor));
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
    context.strokeStyle = auraHighlightColor(blob, alpha * 0.28, preserveColor);
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
    context.strokeStyle = auraHighlightColor(blob, alpha * 0.26, preserveColor);
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
    context.strokeStyle = auraHighlightColor(blob, alpha * 0.24, preserveColor);
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
          ? auraHighlightColor(blob, alpha * 0.24, preserveColor)
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
          ? auraHighlightColor(blob, alpha * 0.22, preserveColor)
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
      context.strokeStyle = ray % 3 === 0
        ? auraHighlightColor(blob, alpha * 0.24, preserveColor)
        : colorToHslar(blob.color, alpha * 0.5);
      context.lineWidth = radius * (0.025 + blob.thickness * 0.035);
      context.stroke();
      context.shadowBlur = 0;
    }
    const core = context.createRadialGradient(0, 0, 0, 0, 0, radius * 0.36);
    core.addColorStop(0, auraHighlightColor(blob, alpha * 0.3, preserveColor));
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
  startIndex = 0,
  endIndex = blobs.length,
  fallbackArtStyle: ArtStyleId = "aura",
) {
  const shortSide = Math.min(width, height);
  const replayPosition = replayProgress === undefined ? Number.POSITIVE_INFINITY : replayProgress * (blobs.length + 0.9);
  const limit = Math.min(endIndex, blobs.length);

  context.save();
  for (let index = startIndex; index < limit; index += 1) {
    const blob = blobs[index];
    const replayAge = replayPosition - index;
    if (replayAge <= 0) continue;

    const age = replayProgress === undefined ? Math.max(0, now - blob.createdAt) : replayAge * BLOB_ARRIVAL_DURATION;
    const arrival = easeOutCubic(age / BLOB_ARRIVAL_DURATION);
    const radius = blob.radius * shortSide * (0.46 + arrival * 0.54);
    const artStyle = blob.artStyle ?? fallbackArtStyle;
    const preserveColor = artStyle === "style-2" || blob.blendMode === "source-over";
    const alpha = clamp(
      (0.4 + blob.velocity * 0.48) * Math.min(1, replayAge) * (preserveColor ? 1.12 : 1),
      0,
      preserveColor ? 0.96 : 0.88,
    );

    context.globalCompositeOperation = artStyle === "style-2" ? "source-over" : blob.blendMode;
    drawAuraParticle(
      context,
      blob,
      blob.x * width,
      blob.y * height,
      radius,
      alpha,
      preserveColor,
      artStyle,
      now,
    );
  }
  context.restore();
}

function drawDottedSigilFlowLayer(
  context: CanvasRenderingContext2D,
  blobs: readonly BlobParticle[],
  width: number,
  height: number,
  now: number,
  reducedMotion: boolean,
  fallbackArtStyle: ArtStyleId,
  startIndex = 0,
  endIndex = blobs.length,
  replayProgress?: number,
  displayWidth = width,
  accentContext?: CanvasRenderingContext2D,
) {
  const shortSide = Math.min(width, height);
  const displayedPixelSize = displayWidth < 500 ? 2 : 3;
  const displayedGridStep = displayedPixelSize * 2;
  const gridStep = displayedGridStep * (width / Math.max(1, displayWidth));
  const replayPosition = replayProgress === undefined
    ? Number.POSITIVE_INFINITY
    : replayProgress * (blobs.length + 0.9);
  const limit = Math.min(endIndex, blobs.length, Math.ceil(replayPosition));
  const dottedIndices: number[] = [];
  let layeredWithOtherStyles = false;
  for (let index = 0; index < limit; index += 1) {
    if ((blobs[index].artStyle ?? fallbackArtStyle) !== "style-2") {
      layeredWithOtherStyles = true;
      break;
    }
  }
  for (let index = limit - 1; index >= startIndex; index -= 1) {
    if ((blobs[index].artStyle ?? fallbackArtStyle) !== "style-2") continue;
    const candidate = blobs[index];
    const overlapsNewerFormation = dottedIndices.some((selectedIndex) => {
      const selected = blobs[selectedIndex];
      return Math.hypot(candidate.x - selected.x, candidate.y - selected.y) < 0.16;
    });
    if (overlapsNewerFormation) continue;
    dottedIndices.unshift(index);
    if (dottedIndices.length === DOTTED_VISIBLE_FORMATIONS) break;
  }

  context.save();
  context.globalCompositeOperation = "source-over";
  const occupiedGridCells = new Set<string>();
  for (let position = dottedIndices.length - 1; position >= 0; position -= 1) {
    const index = dottedIndices[position];
    const blob = blobs[index];
    const replayAge = replayPosition - index;
    const age = replayProgress === undefined
      ? Math.max(0, now - blob.createdAt)
      : Math.max(0, replayAge) * BLOB_ARRIVAL_DURATION;
    const arrival = easeOutCubic(age / BLOB_ARRIVAL_DURATION);
    const radius = blob.radius * shortSide * (0.46 + arrival * 0.54);
    const recency = (position + 1) / Math.max(1, dottedIndices.length);
    const isNewestFormation = position === dottedIndices.length - 1;
    const layerEmphasis = isNewestFormation
      ? 1
      : lerp(0.74, 0.92, recency * recency);
    drawDottedSigil(context, {
      seed: blob.id * 4099 + blob.midi * 131 + blob.repeat * 17,
      midi: blob.midi,
      centerX: blob.x * width,
      centerY: blob.y * height,
      viewportWidth: width,
      viewportHeight: height,
      gridStep,
      radius,
      alpha: clamp((0.94 + blob.velocity * 0.06) * arrival * layerEmphasis, 0, 1),
      time: reducedMotion
        ? DOTTED_FORMATION_SETTLE_DURATION
        : Math.min(age, DOTTED_FORMATION_SETTLE_DURATION),
      arrival,
      emphasis: layerEmphasis,
      layered: layeredWithOtherStyles,
      maturation: reducedMotion
        ? 1
        : clamp(age / DOTTED_GLOW_MATURATION_DURATION, 0, 1),
      velocity: blob.velocity,
      repeat: blob.repeat,
      expansion: clamp(blob.compositionIndex / 12, 0, 1),
      stretch: blob.stretch,
      curvature: blob.curvature,
      accentContext,
      occupiedCells: occupiedGridCells,
    });
  }
  context.restore();
}

function drawChronologicalAuraLayers(
  context: CanvasRenderingContext2D,
  organicLayer: HTMLCanvasElement,
  organicContext: CanvasRenderingContext2D,
  pixelLayer: HTMLCanvasElement,
  pixelContext: CanvasRenderingContext2D,
  pixelAccentLayer: HTMLCanvasElement,
  pixelAccentContext: CanvasRenderingContext2D,
  blurredLayer: HTMLCanvasElement,
  blurredContext: CanvasRenderingContext2D,
  blobs: readonly BlobParticle[],
  width: number,
  height: number,
  now: number,
  reducedMotion: boolean,
  fallbackArtStyle: ArtStyleId,
  blurRadius: number,
  replayProgress?: number,
  hasEarlierArtwork = false,
) {
  const replayPosition = replayProgress === undefined
    ? Number.POSITIVE_INFINITY
    : replayProgress * (blobs.length + 0.9);
  const visibleLimit = Math.min(blobs.length, Math.max(0, Math.ceil(replayPosition)));
  const renderNow = reducedMotion
    ? (blobs[Math.max(0, visibleLimit - 1)]?.createdAt ?? now) + BLOB_ARRIVAL_DURATION
    : now;
  let dottedWindowStart = 0;
  let dottedCount = 0;
  for (let index = visibleLimit - 1; index >= 0; index -= 1) {
    if ((blobs[index].artStyle ?? fallbackArtStyle) !== "style-2") continue;
    dottedCount += 1;
    if (dottedCount === DOTTED_VISIBLE_FORMATIONS) {
      dottedWindowStart = index;
      break;
    }
  }

  let runStart = 0;
  while (runStart < visibleLimit) {
    const isDottedRun = (blobs[runStart].artStyle ?? fallbackArtStyle) === "style-2";
    let runEnd = runStart + 1;
    while (
      runEnd < visibleLimit &&
      ((blobs[runEnd].artStyle ?? fallbackArtStyle) === "style-2") === isDottedRun
    ) {
      runEnd += 1;
    }

    if (isDottedRun) {
      pixelContext.clearRect(0, 0, pixelLayer.width, pixelLayer.height);
      pixelAccentContext.clearRect(0, 0, pixelAccentLayer.width, pixelAccentLayer.height);
      drawDottedSigilFlowLayer(
        pixelContext,
        blobs,
        pixelLayer.width,
        pixelLayer.height,
        renderNow,
        reducedMotion,
        fallbackArtStyle,
        Math.max(runStart, dottedWindowStart),
        runEnd,
        replayProgress,
        width,
        pixelAccentContext,
      );
      const blendsWithEarlierArtwork = runStart > 0 || hasEarlierArtwork;
      if (blendsWithEarlierArtwork) {
        context.save();
        context.globalCompositeOperation = "screen";
        context.globalAlpha = 0.7;
        context.filter = `blur(${clamp(Math.min(width, height) * 0.009, 4, 9)}px)`;
        context.drawImage(pixelAccentLayer, 0, 0, width, height);
        context.restore();

        context.save();
        context.globalCompositeOperation = "color";
        context.globalAlpha = 0.46;
        context.imageSmoothingEnabled = false;
        context.drawImage(pixelLayer, 0, 0, width, height);
        context.restore();

        context.save();
        context.globalCompositeOperation = "luminosity";
        context.globalAlpha = 0.38;
        context.imageSmoothingEnabled = false;
        context.drawImage(pixelLayer, 0, 0, width, height);
        context.restore();
      }
      context.save();
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = blendsWithEarlierArtwork ? 0.94 : 1;
      context.imageSmoothingEnabled = false;
      context.drawImage(pixelLayer, 0, 0, width, height);
      context.restore();
      if (blendsWithEarlierArtwork) {
        context.save();
        context.globalCompositeOperation = "difference";
        context.globalAlpha = 0.5;
        context.imageSmoothingEnabled = false;
        context.drawImage(pixelAccentLayer, 0, 0, width, height);
        context.restore();
      }
    } else {
      organicContext.clearRect(0, 0, organicLayer.width, organicLayer.height);
      drawAuraComposition(
        organicContext,
        blobs,
        organicLayer.width,
        organicLayer.height,
        renderNow,
        replayProgress,
        runStart,
        runEnd,
        fallbackArtStyle,
      );
      blurredContext.clearRect(0, 0, blurredLayer.width, blurredLayer.height);
      blurredContext.save();
      blurredContext.filter = `blur(${Math.max(0.35, blurRadius)}px)`;
      blurredContext.drawImage(organicLayer, 0, 0);
      blurredContext.restore();

      context.save();
      context.globalCompositeOperation = "source-over";
      context.drawImage(blurredLayer, 0, 0, width, height);
      context.restore();
    }

    runStart = runEnd;
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function hapticFeedback(kind: HapticFeedback) {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const vibration = (navigator as Navigator & {
    vibrate?: (pattern: number | number[]) => boolean;
  }).vibrate;
  if (!vibration) return;
  const patterns: Record<HapticFeedback, number | number[]> = {
    open: 8,
    close: 5,
    confirm: 12,
    success: [10, 34, 16],
    error: [18, 42, 18],
  };
  const pattern = patterns[kind];
  vibration.call(navigator, Array.isArray(pattern) ? pattern : [pattern]);
}

function waitForPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Unable to prepare download"));
    }, type);
  });
}

function createGifPaletteIndexer(palette: number[][]) {
  const rgb565Cache = new Int16Array(65536);
  rgb565Cache.fill(-1);

  return (rgba: Uint8ClampedArray) => {
    const pixelCount = rgba.byteLength / 4;
    const pixels = new Uint32Array(rgba.buffer, rgba.byteOffset, pixelCount);
    const indexed = new Uint8Array(pixelCount);

    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
      const color = pixels[pixelIndex];
      const red = color & 0xff;
      const green = (color >> 8) & 0xff;
      const blue = (color >> 16) & 0xff;
      const cacheKey = ((red << 8) & 0xf800) | ((green << 2) & 0x03e0) | (blue >> 3);
      let paletteIndex = rgb565Cache[cacheKey];

      if (paletteIndex < 0) {
        let nearestDistance = Number.POSITIVE_INFINITY;
        paletteIndex = 0;
        for (let index = 0; index < palette.length; index += 1) {
          const paletteColor = palette[index];
          const redDistance = paletteColor[0] - red;
          let distance = redDistance * redDistance;
          if (distance > nearestDistance) continue;
          const greenDistance = paletteColor[1] - green;
          distance += greenDistance * greenDistance;
          if (distance > nearestDistance) continue;
          const blueDistance = paletteColor[2] - blue;
          distance += blueDistance * blueDistance;
          if (distance < nearestDistance) {
            nearestDistance = distance;
            paletteIndex = index;
          }
        }
        rgb565Cache[cacheKey] = paletteIndex;
      }

      indexed[pixelIndex] = paletteIndex;
    }

    return indexed;
  };
}

function exportFileStem() {
  return "aura-composition";
}

export function AuraToy() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewDownloadRef = useRef<HTMLButtonElement | null>(null);
  const imagePreviewButtonRef = useRef<HTMLButtonElement | null>(null);
  const gifPreviewButtonRef = useRef<HTMLButtonElement | null>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastPreviewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const microphoneButtonRef = useRef<HTMLButtonElement | null>(null);
  const systemAudioButtonRef = useRef<HTMLButtonElement | null>(null);
  const externalInputButtonRef = useRef<HTMLButtonElement | null>(null);
  const microphoneAllowRef = useRef<HTMLButtonElement | null>(null);
  const microphoneIntroductionShownRef = useRef(false);
  const systemAudioIntroductionShownRef = useRef(
    sessionFlag(SYSTEM_AUDIO_INTRO_SESSION_KEY),
  );
  const externalInputIntroductionShownRef = useRef(false);
  const systemAudioStreamRef = useRef<MediaStream | null>(null);
  const externalMidiAccessRef = useRef<MIDIAccess | null>(null);
  const externalMidiInputRef = useRef<MIDIInput | null>(null);
  const externalMidiNotesRef = useRef<Set<number>>(new Set());
  const microphoneModeRef = useRef<MicrophoneModeId>(DEFAULT_MICROPHONE_MODE);
  const microphoneModeSyncRef = useRef(0);
  const exportLayersRef = useRef<WeakMap<HTMLCanvasElement, HTMLCanvasElement>>(new WeakMap());
  const exportBlurLayersRef = useRef<WeakMap<HTMLCanvasElement, HTMLCanvasElement>>(new WeakMap());
  const exportPixelLayersRef = useRef<WeakMap<HTMLCanvasElement, HTMLCanvasElement>>(new WeakMap());
  const exportPixelAccentLayersRef = useRef<WeakMap<HTMLCanvasElement, HTMLCanvasElement>>(new WeakMap());
  const exportGrainPatternsRef = useRef<WeakMap<HTMLCanvasElement, CanvasPattern>>(new WeakMap());
  const replayRenderStatesRef = useRef<WeakMap<HTMLCanvasElement, ReplayRenderState>>(new WeakMap());
  const blobsRef = useRef<BlobParticle[]>([]);
  const blobIdRef = useRef(1);
  const noteRepeatRef = useRef<Map<string, number>>(new Map());
  const artStyleLayerCountRef = useRef<Record<ArtStyleId, number>>({
    aura: 0,
    "style-2": 0,
    "style-3": 0,
    "style-4": 0,
  });
  const compactedHistoryCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const compactedHistoryActiveRef = useRef(false);
  const grainRef = useRef<HTMLCanvasElement | null>(null);
  const colorRebuildLayersRef = useRef(0);
  const additiveLayerStartRef = useRef(0);
  const reducedMotionRef = useRef(false);
  const audioGenerationRef = useRef(0);
  const visualGenerationRef = useRef(0);
  const microphoneGenerationRef = useRef(0);
  const microphoneRef = useRef<MicrophoneRuntime | null>(null);
  const audioInputSourceRef = useRef<AudioInputSource | null>(null);
  const microphoneBeatTimerRef = useRef<number | null>(null);
  const resetFrameRef = useRef<number | null>(null);
  const previewFrameRef = useRef<number | null>(null);
  const previewCloseTimerRef = useRef<number | null>(null);
  const microphonePromptCloseTimerRef = useRef<number | null>(null);
  const downloadFeedbackTimerRef = useRef<number | null>(null);
  const microphoneAfterCloseRef = useRef<(() => void) | null>(null);
  const dialWheelTimerRef = useRef<number | null>(null);
  const microphoneModeWheelTimerRef = useRef<number | null>(null);
  const wakeRendererRef = useRef<(() => void) | null>(null);
  const resetRendererRef = useRef<(() => void) | null>(null);
  const releaseTimersRef = useRef<Map<string, number>>(new Map());
  const soundModeRef = useRef<SoundModeId>(DEFAULT_SOUND_MODE);
  const artStyleRef = useRef<ArtStyleId>("aura");
  const telemetryTransitionRef = useRef({ from: 0, to: 0, startedAt: 0 });
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
  const heldToneKeysRef = useRef<Set<string>>(new Set());
  const pendingToneAttacksRef = useRef<Map<string, number>>(new Map());
  const toneAttackSequenceRef = useRef(0);

  const [activeKeys, setActiveKeys] = useState<Set<string>>(() => new Set());
  const [octave, setOctave] = useState(BASE_OCTAVE);
  const [resetting, setResetting] = useState(false);
  const [soundMode, setSoundMode] = useState<SoundModeId>(DEFAULT_SOUND_MODE);
  const [layerCount, setLayerCount] = useState(0);
  const [exportState, setExportState] = useState<ExportState>("idle");
  const [previewKind, setPreviewKind] = useState<ExportKind | null>(null);
  const [previewClosing, setPreviewClosing] = useState(false);
  const [interfaceHidden, setInterfaceHidden] = useState(false);
  const [shortcutGuideVersion, setShortcutGuideVersion] = useState(0);
  const [downloadFeedback, setDownloadFeedback] = useState<DownloadFeedback>("idle");
  const [dialDirection, setDialDirection] = useState<-1 | 1>(1);
  const [microphoneState, setMicrophoneState] = useState<MicrophoneState>("idle");
  const [systemAudioState, setSystemAudioState] = useState<MicrophoneState>("idle");
  const [externalInputState, setExternalInputState] = useState<MicrophoneState>("idle");
  const [microphoneHarmonyPitchClasses, setMicrophoneHarmonyPitchClasses] = useState<number[]>([]);
  const [microphoneMelodyPitchClass, setMicrophoneMelodyPitchClass] = useState<number | null>(null);
  const [microphoneBeatPitchClasses, setMicrophoneBeatPitchClasses] = useState<number[]>([]);
  const [microphoneReading, setMicrophoneReading] = useState("Listening");
  const [microphonePromptOpen, setMicrophonePromptOpen] = useState(false);
  const [microphonePromptClosing, setMicrophonePromptClosing] = useState(false);
  const [microphonePromptGranting, setMicrophonePromptGranting] = useState(false);
  const [permissionPromptSource, setPermissionPromptSource] = useState<AudioInputSource>("microphone");
  const [microphoneMode, setMicrophoneMode] = useState<MicrophoneModeId>(DEFAULT_MICROPHONE_MODE);
  const [microphoneModeDirection, setMicrophoneModeDirection] = useState<-1 | 1>(1);
  const [artStyle, setArtStyle] = useState<ArtStyleId>("aura");
  const [telemetry, setTelemetry] = useState(false);

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
    const preloadAudioEngine = () => {
      void import("./audio-engine");
    };
    const timer = window.setTimeout(preloadAudioEngine, 600);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    artStyleRef.current = artStyle;
  }, [artStyle]);

  useEffect(() => {
    const now = performance.now();
    const previous = telemetryTransitionRef.current;
    const previousProgress = easeInOutSmooth(
      (now - previous.startedAt) / TELEMETRY_TOGGLE_FADE_DURATION,
    );
    const currentOpacity = lerp(previous.from, previous.to, previousProgress);
    telemetryTransitionRef.current = {
      from: currentOpacity,
      to: telemetry ? 1 : 0,
      startedAt: now,
    };
    wakeRendererRef.current?.();
  }, [telemetry]);

  useEffect(() => {
    if (!interfaceHidden) return;
    const restoreInterface = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (previewKind || microphonePromptOpen) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setInterfaceHidden(false);
      setShortcutGuideVersion(0);
      window.requestAnimationFrame(() => fullscreenButtonRef.current?.focus({ preventScroll: true }));
    };
    window.addEventListener("keydown", restoreInterface, true);
    return () => window.removeEventListener("keydown", restoreInterface, true);
  }, [interfaceHidden, microphonePromptOpen, previewKind]);

  useEffect(() => {
    microphoneModeRef.current = microphoneMode;
  }, [microphoneMode]);

  useEffect(() => {
    if (!microphonePromptOpen || microphonePromptClosing) return;
    const frame = window.requestAnimationFrame(() => {
      microphoneAllowRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [microphonePromptClosing, microphonePromptOpen]);

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
    heldToneKeysRef.current.clear();
    pendingToneAttacksRef.current.clear();
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
      if (previewCloseTimerRef.current !== null) window.clearTimeout(previewCloseTimerRef.current);
      if (microphonePromptCloseTimerRef.current !== null) {
        window.clearTimeout(microphonePromptCloseTimerRef.current);
      }
      if (downloadFeedbackTimerRef.current !== null) {
        window.clearTimeout(downloadFeedbackTimerRef.current);
      }
      if (dialWheelTimerRef.current !== null) window.clearTimeout(dialWheelTimerRef.current);
      if (microphoneModeWheelTimerRef.current !== null) {
        window.clearTimeout(microphoneModeWheelTimerRef.current);
      }
      releaseTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      releaseTimersRef.current.clear();
      if (microphoneBeatTimerRef.current !== null) window.clearTimeout(microphoneBeatTimerRef.current);
      microphoneGenerationRef.current += 1;
      const activeMicrophoneStream = microphoneRef.current?.stream ?? null;
      disposeMicrophoneRuntime(microphoneRef.current);
      microphoneRef.current = null;
      if (systemAudioStreamRef.current && systemAudioStreamRef.current !== activeMicrophoneStream) {
        systemAudioStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      systemAudioStreamRef.current = null;
      if (externalMidiInputRef.current) externalMidiInputRef.current.onmidimessage = null;
      if (externalMidiAccessRef.current) externalMidiAccessRef.current.onstatechange = null;
      externalMidiInputRef.current = null;
      externalMidiAccessRef.current = null;
      externalMidiNotesRef.current.clear();
      disposeToneEngine();
    },
    [disposeToneEngine],
  );

  const openMicrophonePrompt = useCallback((inputSource: AudioInputSource = "microphone") => {
    if (microphonePromptCloseTimerRef.current !== null) {
      window.clearTimeout(microphonePromptCloseTimerRef.current);
      microphonePromptCloseTimerRef.current = null;
    }
    microphoneAfterCloseRef.current = null;
    setPermissionPromptSource(inputSource);
    setMicrophonePromptGranting(false);
    setMicrophonePromptClosing(false);
    setMicrophonePromptOpen(true);
    hapticFeedback("open");
  }, []);

  const closeMicrophonePrompt = useCallback(
    (afterClose?: () => void, feedback: HapticFeedback | null = "close") => {
      if (!microphonePromptOpen) {
        afterClose?.();
        return;
      }
      if (microphonePromptCloseTimerRef.current !== null) {
        window.clearTimeout(microphonePromptCloseTimerRef.current);
      }
      microphoneAfterCloseRef.current = afterClose ?? null;
      setMicrophonePromptClosing(true);
      if (feedback) hapticFeedback(feedback);
      microphonePromptCloseTimerRef.current = window.setTimeout(() => {
        microphonePromptCloseTimerRef.current = null;
        setMicrophonePromptOpen(false);
        setMicrophonePromptClosing(false);
        setMicrophonePromptGranting(false);
        const nextAction = microphoneAfterCloseRef.current;
        microphoneAfterCloseRef.current = null;
        if (nextAction) nextAction();
        else {
          const promptButton =
            permissionPromptSource === "system"
              ? systemAudioButtonRef.current
              : permissionPromptSource === "external"
                ? externalInputButtonRef.current
                : microphoneButtonRef.current;
          promptButton?.focus({ preventScroll: true });
        }
      }, reducedMotionRef.current ? 0 : OVERLAY_EXIT_DURATION);
    },
    [microphonePromptOpen, permissionPromptSource],
  );

  useEffect(() => {
    if (!microphonePromptOpen) return;
    const handleMicrophonePromptKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !microphonePromptClosing) closeMicrophonePrompt();
    };
    window.addEventListener("keydown", handleMicrophonePromptKeyDown);
    return () => window.removeEventListener("keydown", handleMicrophonePromptKeyDown);
  }, [closeMicrophonePrompt, microphonePromptClosing, microphonePromptOpen]);

  const openPreview = useCallback((kind: ExportKind) => {
    if (previewCloseTimerRef.current !== null) {
      window.clearTimeout(previewCloseTimerRef.current);
      previewCloseTimerRef.current = null;
    }
    lastPreviewTriggerRef.current =
      kind === "image" ? imagePreviewButtonRef.current : gifPreviewButtonRef.current;
    setDownloadFeedback("idle");
    setPreviewClosing(false);
    setPreviewKind(kind);
    hapticFeedback("open");
  }, []);

  const closePreview = useCallback(
    (feedback: HapticFeedback | null = "close") => {
      if (!previewKind || previewClosing) return;
      if (previewCloseTimerRef.current !== null) window.clearTimeout(previewCloseTimerRef.current);
      setPreviewClosing(true);
      if (feedback) hapticFeedback(feedback);
      previewCloseTimerRef.current = window.setTimeout(() => {
        previewCloseTimerRef.current = null;
        setPreviewKind(null);
        setPreviewClosing(false);
        setDownloadFeedback("idle");
        lastPreviewTriggerRef.current?.focus({ preventScroll: true });
      }, reducedMotionRef.current ? 0 : OVERLAY_EXIT_DURATION);
    },
    [previewClosing, previewKind],
  );

  const holdDownloadFeedback = useCallback((duration: number) => {
    return new Promise<void>((resolve) => {
      if (downloadFeedbackTimerRef.current !== null) {
        window.clearTimeout(downloadFeedbackTimerRef.current);
      }
      downloadFeedbackTimerRef.current = window.setTimeout(() => {
        downloadFeedbackTimerRef.current = null;
        resolve();
      }, reducedMotionRef.current ? 0 : duration);
    });
  }, []);

  const ensureTone = useCallback(async () => {
    if (!toneRef.current.ready) {
      const generation = audioGenerationRef.current;
      const mode = SOUND_MODES.find(({ id }) => id === soundModeRef.current) ?? SOUND_MODES[0];
      const ready = (async () => {
        const { createAuraToneEngine } = await import("./audio-engine");
        const { synth, filter, reverb } = await createAuraToneEngine(mode);

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
      const attackSequence = toneAttackSequenceRef.current + 1;
      toneAttackSequenceRef.current = attackSequence;
      heldToneKeysRef.current.add(keyId);
      pendingToneAttacksRef.current.set(keyId, attackSequence);
      void ensureTone()
        .then(() => {
          if (generation !== visualGenerationRef.current) return;
          if (
            pendingToneAttacksRef.current.get(keyId) !== attackSequence ||
            !heldToneKeysRef.current.has(keyId)
          ) {
            return;
          }
          pendingToneAttacksRef.current.delete(keyId);
          const previousNote = activeToneNotesRef.current.get(keyId);
          if (previousNote) toneRef.current.synth?.triggerRelease(previousNote);
          activeToneNotesRef.current.set(keyId, noteName);
          toneRef.current.synth?.triggerAttack(noteName, undefined, velocity);
        })
        .catch(() => undefined);
    },
    [ensureTone],
  );

  const triggerRelease = useCallback((keyId: string) => {
    heldToneKeysRef.current.delete(keyId);
    pendingToneAttacksRef.current.delete(keyId);
    const noteName = activeToneNotesRef.current.get(keyId);
    if (!noteName) return;
    toneRef.current.synth?.triggerRelease(noteName);
    activeToneNotesRef.current.delete(keyId);
  }, []);

  const releaseAllToneNotes = useCallback(() => {
    heldToneKeysRef.current.clear();
    pendingToneAttacksRef.current.clear();
    toneRef.current.synth?.releaseAll();
    activeToneNotesRef.current.clear();
  }, []);

  const spawnBlob = useCallback((note: NoteChoice, color: Color, velocity: number) => {
    const now = performance.now();
    const id = blobIdRef.current;
    blobIdRef.current += 1;
    const mode = soundModeRef.current;
    const currentArtStyle = artStyleRef.current;
    const profile = VISUAL_MODES[mode];
    const modeIndex = SOUND_MODE_INDEX[mode];
    const identity = `AURA|${mode}|${note.name}`;
    const repeat = noteRepeatRef.current.get(identity) ?? 0;
    noteRepeatRef.current.set(identity, repeat + 1);
    const compositionIndex = artStyleLayerCountRef.current[currentArtStyle];
    artStyleLayerCountRef.current[currentArtStyle] = compositionIndex + 1;

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
    const pixelAnchor = PIXEL_COMPOSITION_ANCHORS[
      modulo(
        compositionIndex * 3 + note.pc * 5 + Math.floor(note.midi / 12),
        PIXEL_COMPOSITION_ANCHORS.length,
      )
    ];
    const baseAngle =
      profile.angleBias + (identityRng() - 0.5) * Math.PI * 0.82 + (note.pc - 5.5) * 0.045;
    const trailDirection = baseAngle + (modeIndex - 2) * 0.12;
    const trailDistance = repeat === 0 ? 0 : Math.min(0.012 + repeat * 0.012, 0.115);
    const trailBend = repeat === 0 ? 0 : Math.sin(repeat * 0.62) * Math.min(0.006 + repeat * 0.0015, 0.018);
    const x = currentArtStyle === "style-2"
      ? clamp(
          lerp(pixelAnchor[0], pitchX, 0.1) + (identityRng() - 0.5) * 0.024,
          0.06,
          0.94,
        )
      : clamp(
          baseX + Math.cos(trailDirection) * trailDistance + Math.cos(trailDirection + Math.PI / 2) * trailBend,
          0.035,
          0.965,
        );
    const y = currentArtStyle === "style-2"
      ? clamp(
          lerp(pixelAnchor[1], pitchY, 0.08) + (identityRng() - 0.5) * 0.022,
          0.07,
          0.78,
        )
      : clamp(
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
    const repeatScale = 0.96 + Math.min(repeat, 9) * 0.055;
    const registerScale = lerp(1.16, 0.86, pitchNorm);
    const radius =
      AURA_BASE_RADIUS[shape] *
      (0.88 + identityRng() * 0.46) *
      (0.82 + velocity * 0.38) *
      repeatScale *
      registerScale *
      (currentArtStyle === "style-2"
        ? lerp(0.78, 1.16, clamp(compositionIndex / 12, 0, 1))
        : 1);
    const [minimumStretch, maximumStretch] = AURA_STRETCH_BY_SHAPE[shape];
    const stretch =
      currentArtStyle === "style-2"
        ? lerp(0.78, 1.32, identityRng())
        : lerp(minimumStretch, maximumStretch, identityRng()) *
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

    const layerIndex = blobsRef.current.length;
    if (
      colorRebuildLayersRef.current === 0 &&
      layerIndex - additiveLayerStartRef.current >= MAXIMUM_ADDITIVE_LAYERS
    ) {
      colorRebuildLayersRef.current = COLOR_REBUILD_LAYERS;
    }

    const blendMode: AuraBlendMode =
      currentArtStyle === "style-2"
        ? "source-over"
        : colorRebuildLayersRef.current > 0
          ? "source-over"
          : "lighter";
    if (colorRebuildLayersRef.current > 0) {
      colorRebuildLayersRef.current -= 1;
      if (colorRebuildLayersRef.current === 0) additiveLayerStartRef.current = layerIndex + 1;
    }

    blobsRef.current.push({
      id,
      artStyle: currentArtStyle,
      color,
      accent,
      shape,
      note: note.name,
      midi: note.midi,
      repeat,
      compositionIndex,
      x,
      y,
      radius,
      angle:
        currentArtStyle === "style-2"
          ? (identityRng() - 0.5) * 1.35 + (note.pc - 5.5) * 0.08
          : baseAngle + Math.sin(repeat * 0.62) * 0.055,
      stretch,
      thickness: 0.2 + identityRng() * 0.42 + velocity * 0.12 + Math.min(repeat, 8) * 0.012,
      curvature: (identityRng() - 0.5) * 1.65 + Math.sin(repeat * 0.62) * 0.14,
      velocity,
      softness: clamp(profile.softness + (identityRng() - 0.5) * 0.18, 0.24, 0.98),
      blendMode,
      createdAt: now,
    });

    if (blobsRef.current.length === 1) setLayerCount(1);
    wakeRendererRef.current?.();
  }, []);

  const stopMicrophone = useCallback(() => {
    microphoneGenerationRef.current += 1;
    const midiInput = externalMidiInputRef.current;
    if (midiInput) midiInput.onmidimessage = null;
    if (externalMidiAccessRef.current) externalMidiAccessRef.current.onstatechange = null;
    externalMidiNotesRef.current.forEach((noteNumber) => {
      triggerRelease(`external-midi-${noteNumber}`);
    });
    externalMidiNotesRef.current.clear();
    externalMidiInputRef.current = null;
    externalMidiAccessRef.current = null;
    const runtime = microphoneRef.current;
    const retainSystemAudio =
      audioInputSourceRef.current === "system" &&
      runtime?.stream === systemAudioStreamRef.current &&
      runtime.stream.getAudioTracks().some((track) => track.readyState === "live");
    disposeMicrophoneRuntime(runtime, !retainSystemAudio, false);
    if (!retainSystemAudio && runtime?.stream === systemAudioStreamRef.current) {
      systemAudioStreamRef.current = null;
    }
    microphoneRef.current = null;
    audioInputSourceRef.current = null;
    microphoneButtonRef.current?.style.setProperty("--mic-level", "0");
    systemAudioButtonRef.current?.style.setProperty("--mic-level", "0");
    externalInputButtonRef.current?.style.setProperty("--mic-level", "0");
    if (microphoneBeatTimerRef.current !== null) {
      window.clearTimeout(microphoneBeatTimerRef.current);
      microphoneBeatTimerRef.current = null;
    }
    if (microphonePromptCloseTimerRef.current !== null) {
      window.clearTimeout(microphonePromptCloseTimerRef.current);
      microphonePromptCloseTimerRef.current = null;
    }
    microphoneAfterCloseRef.current = null;
    setMicrophonePromptOpen(false);
    setMicrophonePromptClosing(false);
    setMicrophonePromptGranting(false);
    setMicrophoneState("idle");
    setSystemAudioState("idle");
    setExternalInputState("idle");
    setMicrophoneHarmonyPitchClasses([]);
    setMicrophoneMelodyPitchClass(null);
    setMicrophoneBeatPitchClasses([]);
    setMicrophoneReading("Listening");
  }, [triggerRelease]);

  const startAudioInput = useCallback(async (
    inputSource: AudioInputSource,
    externalDeviceId?: string,
    externalDeviceName?: string,
  ) => {
    const mediaDevices = navigator.mediaDevices;
    const isSystemAudio = inputSource === "system";
    const isExternalInput = inputSource === "external";
    const inputSupported = isSystemAudio
      ? typeof mediaDevices?.getDisplayMedia === "function"
      : typeof mediaDevices?.getUserMedia === "function";
    if (!inputSupported) {
      if (isSystemAudio) setSystemAudioState("unsupported");
      else if (isExternalInput) setExternalInputState("unsupported");
      else setMicrophoneState("unsupported");
      return;
    }

    const AudioContextConstructor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      if (isSystemAudio) setSystemAudioState("unsupported");
      else if (isExternalInput) setExternalInputState("unsupported");
      else setMicrophoneState("unsupported");
      return;
    }

    const previousRuntime = microphoneRef.current;
    const retainPreviousSystemAudio =
      audioInputSourceRef.current === "system" &&
      previousRuntime?.stream === systemAudioStreamRef.current &&
      previousRuntime.stream.getAudioTracks().some((track) => track.readyState === "live");
    disposeMicrophoneRuntime(previousRuntime, !retainPreviousSystemAudio, false);
    microphoneRef.current = null;
    const generation = microphoneGenerationRef.current + 1;
    microphoneGenerationRef.current = generation;
    audioInputSourceRef.current = inputSource;
    setMicrophoneState(inputSource === "microphone" ? "requesting" : "idle");
    setSystemAudioState(isSystemAudio ? "requesting" : "idle");
    setExternalInputState(isExternalInput ? "requesting" : "idle");
    setMicrophoneReading(
      isSystemAudio
        ? "Choose the browser tab playing audio"
        : isExternalInput
          ? `Connecting ${externalDeviceName || "external input"}`
          : "Listening",
    );

    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let initialResumeAttempt: Promise<void> | null = null;
    let reusedSystemAudio = false;
    const pitchDetectorModule = import("pitchy");
    try {
      if (isSystemAudio) {
        // Prime Web Audio while this function is still inside the user's click.
        // Waiting until the display picker resolves can leave the context suspended
        // under browser autoplay policy even though capture itself succeeded.
        audioContext = new AudioContextConstructor({ latencyHint: "interactive" });
        if (audioContext.state === "suspended") {
          initialResumeAttempt = audioContext.resume().catch(() => undefined);
        }
        const rememberedStream = systemAudioStreamRef.current;
        if (rememberedStream?.getAudioTracks().some((track) => track.readyState === "live")) {
          stream = rememberedStream;
          reusedSystemAudio = true;
          stream.getTracks().forEach((track) => {
            track.enabled = true;
          });
        } else {
          systemAudioStreamRef.current = null;
          stream = await mediaDevices.getDisplayMedia(DEVICE_AUDIO_CAPTURE_OPTIONS);
        }
        if (stream.getAudioTracks().length === 0) {
          stream.getTracks().forEach((track) => track.stop());
          if (stream === systemAudioStreamRef.current) systemAudioStreamRef.current = null;
          stream = null;
          throw new Error("No device audio was shared");
        }
        systemAudioStreamRef.current = stream;
        systemAudioIntroductionShownRef.current = true;
        rememberSessionFlag(SYSTEM_AUDIO_INTRO_SESSION_KEY);
        stream.getAudioTracks().forEach((track) => {
          if ("contentHint" in track) track.contentHint = "music";
        });
      } else {
        stream = await mediaDevices.getUserMedia({
          audio: isExternalInput
            ? {
                deviceId: externalDeviceId ? { exact: externalDeviceId } : undefined,
                autoGainControl: false,
                echoCancellation: false,
                noiseSuppression: false,
                channelCount: { ideal: 2 },
                sampleRate: { ideal: 48_000 },
              }
            : audioConstraintsForMicrophoneMode(microphoneModeRef.current),
        });
        if (isExternalInput) {
          stream.getAudioTracks().forEach((track) => {
            if ("contentHint" in track) track.contentHint = "music";
          });
        } else {
          setMicrophoneTrackHints(stream, microphoneModeRef.current);
        }
      }
      if (generation !== microphoneGenerationRef.current) {
        stream.getTracks().forEach((track) => {
          if (!reusedSystemAudio) track.stop();
        });
        if (audioContext) void audioContext.close().catch(() => undefined);
        if (!reusedSystemAudio && stream === systemAudioStreamRef.current) {
          systemAudioStreamRef.current = null;
        }
        return;
      }

      if (!audioContext) audioContext = new AudioContextConstructor({ latencyHint: "interactive" });
      if (initialResumeAttempt) await initialResumeAttempt;
      if (audioContext.state !== "running") await audioContext.resume();
      const analysisStream = isSystemAudio
        ? new MediaStream([stream.getAudioTracks()[0]])
        : stream;
      const source = audioContext.createMediaStreamSource(analysisStream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = MICROPHONE_FFT_SIZE;
      analyser.smoothingTimeConstant = 0.22;
      analyser.minDecibels = -100;
      analyser.maxDecibels = -10;

      const { PitchDetector } = await pitchDetectorModule;
      const detector = PitchDetector.forFloat32Array(MICROPHONE_FFT_SIZE);
      detector.minVolumeDecibels = -62;
      const runtime: MicrophoneRuntime = {
        stream,
        context: audioContext,
        source,
        processingNodes: [],
        analyser,
        detector,
        timeDomain: new Float32Array(MICROPHONE_FFT_SIZE),
        frequencyData: new Float32Array(analyser.frequencyBinCount),
        previousSpectrum: new Float32Array(analyser.frequencyBinCount),
        chroma: new Float32Array(12),
        chordChroma: new Float32Array(12),
        melodyChroma: new Float32Array(12),
        frameChroma: new Float32Array(12),
        candidateScores: new Map<number, number>(),
        spectrumAnalysis: {
          spectralFlux: 0,
          dominantMidi: null,
          bassMidi: null,
          noteCandidates: [],
          pitchClasses: [],
        },
        upperRegisterBoost: new Float32Array(12),
        melodyScores: new Float32Array(12),
        detectedPitchClasses: [],
        nextHighlightedPitchClasses: [],
        leftHandCandidateScratch: [],
        animationFrame: 0,
        analyze: () => undefined,
        lastAnalysisAt: -Infinity,
        lastResumeAttemptAt: -Infinity,
        lastVisualAt: -Infinity,
        lastBeatAt: -Infinity,
        lastValidPitchAt: -Infinity,
        lastMidi: null,
        candidateMidi: null,
        candidateFrames: 0,
        noiseFloor: 0.0028,
        smoothedEnergy: 0.003,
        smoothedFlux: 0.001,
        beatBandEnergy: 0.0002,
        beatInterval: 500,
        beatConfidence: 0,
        nextBeatAt: Infinity,
        lastOnsetAt: -Infinity,
        previousOnsetStrength: 0,
        onsetRising: false,
        onsetBaseline: 0.05,
        onsetDeviation: 0.04,
        highlightedPitchClasses: [],
        highlightedHarmonyPitchClasses: [],
        lastKeyBeatAt: -Infinity,
        leftHandPitchClasses: [],
        leftHandCandidatePitchClasses: [],
        leftHandCandidateFrames: 0,
        leftHandLastSeenAt: -Infinity,
        melodyPitchClass: null,
        melodyCandidatePitchClass: null,
        melodyCandidateFrames: 0,
        melodyLastSeenAt: -Infinity,
        melodyStableSince: -Infinity,
        lastMeterLevel: -1,
        lastMeterAt: -Infinity,
        lastReading: "Listening",
        visualCursor: 0,
      };
      configureMicrophonePipeline(
        runtime,
        isSystemAudio || isExternalInput ? "wide-spectrum" : microphoneModeRef.current,
      );
      microphoneRef.current = runtime;
      setMicrophoneState(inputSource === "microphone" ? "listening" : "idle");
      setSystemAudioState(isSystemAudio ? "listening" : "idle");
      setExternalInputState(isExternalInput ? "listening" : "idle");
      setMicrophoneReading(isExternalInput ? externalDeviceName || "External input" : "Listening");
      hapticFeedback("success");

      const analyze = (now: number) => {
        if (generation !== microphoneGenerationRef.current || microphoneRef.current !== runtime) return;
        runtime.animationFrame = window.requestAnimationFrame(analyze);
        if (now - runtime.lastAnalysisAt < MICROPHONE_ANALYSIS_INTERVAL) return;
        runtime.lastAnalysisAt = now;

        if (runtime.context.state !== "running" && now - runtime.lastResumeAttemptAt >= 1000) {
          runtime.lastResumeAttemptAt = now;
          void runtime.context.resume().catch(() => undefined);
        }

        runtime.analyser.getFloatTimeDomainData(runtime.timeDomain as Float32Array<ArrayBuffer>);
        runtime.analyser.getFloatFrequencyData(runtime.frequencyData as Float32Array<ArrayBuffer>);
        const microphoneMode =
          isSystemAudio || isExternalInput ? "wide-spectrum" : microphoneModeRef.current;
        const isolatesVoice = microphoneMode === "voice-isolation";
        const capturesWideSpectrum = microphoneMode === "wide-spectrum";
        const rms = calculateRms(runtime.timeDomain);
        const previousEnergy = runtime.smoothedEnergy;
        const energyRise = rms / Math.max(0.0001, previousEnergy);
        runtime.smoothedEnergy = lerp(previousEnergy, rms, rms > previousEnergy ? 0.18 : 0.055);
        // Learn the room floor only from quiet frames so sustained music cannot raise its own gate.
        const quietEnoughToLearn =
          rms <= Math.max(isolatesVoice ? 0.008 : capturesWideSpectrum ? 0.003 : 0.0045, runtime.noiseFloor * 1.32);
        if (quietEnoughToLearn) {
          runtime.noiseFloor = clamp(
            lerp(runtime.noiseFloor, rms, 0.08),
            capturesWideSpectrum ? 0.0005 : isolatesVoice ? 0.0015 : 0.0008,
            isolatesVoice ? 0.012 : capturesWideSpectrum ? 0.0045 : 0.006,
          );
        }
        const gate = isolatesVoice
          ? clamp(runtime.noiseFloor * 2.35, 0.006, 0.028)
          : capturesWideSpectrum
            ? clamp(runtime.noiseFloor * 1.18, 0.0012, 0.0055)
            : clamp(runtime.noiseFloor * 1.55, 0.0022, 0.0085);
        let frequency = 0;
        let clarity = 0;
        if (rms > runtime.noiseFloor * (isolatesVoice ? 1.42 : 1.08)) {
          const detectedPitch = runtime.detector.findPitch(runtime.timeDomain, runtime.context.sampleRate);
          frequency = detectedPitch[0];
          clarity = detectedPitch[1];
        }
        const midiFloat = frequency > 0 ? frequencyToMidi(frequency) : Number.NaN;
        const nearestMidi = Number.isFinite(midiFloat) ? Math.round(midiFloat) : null;
        const withinVoiceRange = nearestMidi !== null && nearestMidi >= 40 && nearestMidi <= 84;
        const pitchedSignal =
          rms > runtime.noiseFloor * (isolatesVoice ? 1.42 : 1.08) &&
          nearestMidi !== null &&
          nearestMidi >= MIN_MIDI &&
          nearestMidi <= MAX_MIDI &&
          (!isolatesVoice || withinVoiceRange) &&
          clarity >= (isolatesVoice ? 0.78 : 0.72) &&
          Math.abs(midiFloat - nearestMidi) <= 0.48;
        // Voice Isolation intentionally rejects unpitched and polyphonic room
        // noise; Wide Spectrum keeps the raw broadband energy path open.
        const activeSignal = isolatesVoice ? pitchedSignal && rms > gate * 0.62 : rms > gate || pitchedSignal;
        const level = activeSignal ? clamp((rms - gate) / Math.max(0.012, 0.09 - gate), 0, 1) : 0;
        if (
          now - runtime.lastMeterAt >= 50 &&
          (Math.abs(level - runtime.lastMeterLevel) >= 0.012 ||
            (level === 0 && runtime.lastMeterLevel !== 0) ||
            (level === 1 && runtime.lastMeterLevel !== 1))
        ) {
          const inputButton = isSystemAudio
            ? systemAudioButtonRef.current
            : isExternalInput
              ? externalInputButtonRef.current
              : microphoneButtonRef.current;
          inputButton?.style.setProperty("--mic-level", level.toFixed(3));
          runtime.lastMeterLevel = level;
          runtime.lastMeterAt = now;
        }

        const { spectralFlux, dominantMidi, bassMidi, noteCandidates, pitchClasses } =
          updateSpectrumAnalysis(
            runtime.frequencyData,
            runtime.previousSpectrum,
            runtime.chroma,
            runtime.frameChroma,
            runtime.candidateScores,
            runtime.spectrumAnalysis,
            runtime.context.sampleRate,
            runtime.analyser.fftSize,
          );
        for (let pitchClass = 0; pitchClass < runtime.chordChroma.length; pitchClass += 1) {
          runtime.chordChroma[pitchClass] =
            runtime.chordChroma[pitchClass] * 0.84 + runtime.frameChroma[pitchClass];
          runtime.melodyChroma[pitchClass] =
            runtime.melodyChroma[pitchClass] * 0.76 + runtime.frameChroma[pitchClass];
        }
        const beatBandEnergy = calculateBandEnergy(
          runtime.frequencyData,
          runtime.context.sampleRate,
          runtime.analyser.fftSize,
          45,
          240,
        );
        const beatDetected = trackMicrophoneBeat(
          runtime,
          now,
          activeSignal,
          energyRise,
          spectralFlux,
          beatBandEnergy,
        );
        const previousFlux = runtime.smoothedFlux;
        runtime.smoothedFlux = lerp(previousFlux, spectralFlux, 0.085);

        const clearPitch =
          activeSignal &&
          nearestMidi !== null &&
          nearestMidi >= MIN_MIDI &&
          nearestMidi <= MAX_MIDI &&
          (!isolatesVoice || withinVoiceRange) &&
          clarity >= (isolatesVoice ? 0.78 : 0.68) &&
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
        } else if (now - runtime.lastValidPitchAt > 650 && runtime.lastMidi !== null) {
          runtime.lastMidi = null;
          runtime.candidateMidi = null;
          runtime.candidateFrames = 0;
        }

        const monophonicFrame =
          clearPitch &&
          clarity >= (isolatesVoice ? 0.78 : 0.82) &&
          nearestMidi !== null &&
          (isolatesVoice || pitchClasses.length <= 1);
        const monophonicPitchClass = monophonicFrame ? modulo(nearestMidi, 12) : null;
        const recentStableMidi = now - runtime.lastValidPitchAt < 650 ? runtime.lastMidi : null;
        const spectralMidi =
          noteCandidates.length > 0
            ? noteCandidates[runtime.visualCursor % noteCandidates.length]
            : dominantMidi;
        const detectedMidi = isolatesVoice
          ? clearPitch
            ? nearestMidi
            : recentStableMidi
          : monophonicFrame
            ? nearestMidi
            : spectralMidi ?? stableMidi ?? (clearPitch ? nearestMidi : null) ?? recentStableMidi;
        const detectedPitchClasses = runtime.detectedPitchClasses;
        detectedPitchClasses.length = 0;
        if (activeSignal) {
          if (isolatesVoice && detectedMidi !== null) {
            detectedPitchClasses.push(modulo(detectedMidi, 12));
          } else if (monophonicPitchClass !== null) {
            detectedPitchClasses.push(monophonicPitchClass);
          } else if (pitchClasses.length > 0) {
            copyPitchClasses(pitchClasses, detectedPitchClasses);
          } else if (detectedMidi !== null) {
            detectedPitchClasses.push(modulo(detectedMidi, 12));
          } else if (runtime.melodyPitchClass !== null && now - runtime.melodyLastSeenAt <= 560) {
            detectedPitchClasses.push(runtime.melodyPitchClass);
          } else if (
            runtime.leftHandPitchClasses.length > 0 &&
            now - runtime.leftHandLastSeenAt <= 520
          ) {
            copyPitchClasses(runtime.leftHandPitchClasses, detectedPitchClasses);
          }
        }

        const clearMelodyPitchClass =
          clearPitch &&
          clarity >= (isolatesVoice ? 0.78 : 0.74) &&
          nearestMidi !== null &&
          (isolatesVoice || bassMidi === null || nearestMidi >= bassMidi + 7)
            ? modulo(nearestMidi, 12)
            : null;
        const upperRegisterBoost = runtime.upperRegisterBoost;
        upperRegisterBoost.fill(0);
        for (const candidateMidi of noteCandidates) {
          if (bassMidi !== null && candidateMidi < bassMidi + 7) continue;
          const pitchClass = modulo(candidateMidi, 12);
          upperRegisterBoost[pitchClass] = Math.max(
            upperRegisterBoost[pitchClass],
            1 + clamp((candidateMidi - MIN_MIDI) / (MAX_MIDI - MIN_MIDI), 0, 1) * 0.34,
          );
        }
        if (clearMelodyPitchClass !== null) {
          upperRegisterBoost[clearMelodyPitchClass] = Math.max(
            upperRegisterBoost[clearMelodyPitchClass],
            1.42,
          );
        }
        const melodyScores = runtime.melodyScores;
        let melodyLeaderPitchClass: number | null = null;
        let melodyLeaderScore = -Infinity;
        for (let pitchClass = 0; pitchClass < melodyScores.length; pitchClass += 1) {
          const score =
            runtime.melodyChroma[pitchClass] *
            (upperRegisterBoost[pitchClass] ||
              (pitchClass === runtime.melodyPitchClass && now - runtime.melodyLastSeenAt <= 220
                ? 0.88
                : 0.68)) *
            (runtime.leftHandPitchClasses.includes(pitchClass) ? 0.58 : 1);
          melodyScores[pitchClass] = score;
          if (score > 0.000001 && score > melodyLeaderScore) {
            melodyLeaderPitchClass = pitchClass;
            melodyLeaderScore = score;
          }
        }
        const currentMelodyScore = runtime.melodyPitchClass === null
          ? 0
          : melodyScores[runtime.melodyPitchClass];
        const pendingMelodyScore = runtime.melodyCandidatePitchClass === null
          ? 0
          : melodyScores[runtime.melodyCandidatePitchClass];
        const melodyCandidate = !activeSignal
          ? null
          : clearMelodyPitchClass ??
            (runtime.melodyPitchClass !== null &&
            melodyLeaderPitchClass !== null &&
            currentMelodyScore > 0.000001 &&
            currentMelodyScore >= melodyLeaderScore * 0.56
              ? runtime.melodyPitchClass
              : runtime.melodyCandidatePitchClass !== null &&
                  melodyLeaderPitchClass !== null &&
                  pendingMelodyScore > 0.000001 &&
                  pendingMelodyScore >= melodyLeaderScore * 0.68
                ? runtime.melodyCandidatePitchClass
                : melodyLeaderPitchClass);
        let melodyOnsetPitchClass: number | null = null;

        if (melodyCandidate !== null) {
          if (runtime.melodyPitchClass === melodyCandidate) {
            runtime.melodyLastSeenAt = now;
            runtime.melodyCandidatePitchClass = null;
            runtime.melodyCandidateFrames = 0;
          } else {
            if (runtime.melodyCandidatePitchClass === melodyCandidate) {
              runtime.melodyCandidateFrames += 1;
            } else {
              runtime.melodyCandidatePitchClass = melodyCandidate;
              runtime.melodyCandidateFrames = 1;
            }

            const minimumMelodyDuration = now - runtime.melodyStableSince >= 170;
            const confirmationFrames =
              runtime.melodyPitchClass === null
                ? 1
                : clearMelodyPitchClass !== null || now - runtime.lastBeatAt <= 140
                  ? 4
                  : 7;
            if (
              runtime.melodyCandidateFrames >= confirmationFrames &&
              (runtime.melodyPitchClass === null || minimumMelodyDuration)
            ) {
              runtime.melodyPitchClass = melodyCandidate;
              runtime.melodyLastSeenAt = now;
              runtime.melodyStableSince = now;
              runtime.melodyCandidatePitchClass = null;
              runtime.melodyCandidateFrames = 0;
              melodyOnsetPitchClass = melodyCandidate;
              setMicrophoneMelodyPitchClass(melodyCandidate);
            }
          }
        }
        if (now - runtime.melodyLastSeenAt > 560 && runtime.melodyPitchClass !== null) {
          runtime.melodyPitchClass = null;
          runtime.melodyCandidatePitchClass = null;
          runtime.melodyCandidateFrames = 0;
          runtime.melodyStableSince = -Infinity;
          setMicrophoneMelodyPitchClass(null);
        }

        const bassPitchClass =
          !isolatesVoice && activeSignal && bassMidi !== null ? modulo(bassMidi, 12) : null;
        const chordContext = !isolatesVoice && activeSignal
          ? detectChordContext(runtime.chordChroma, bassPitchClass)
          : null;
        let chordEnergy = 0;
        let strongestChordTone = 0;
        for (let pitchClass = 0; pitchClass < runtime.chordChroma.length; pitchClass += 1) {
          const value = runtime.chordChroma[pitchClass];
          chordEnergy += value;
          strongestChordTone = Math.max(strongestChordTone, value);
        }
        let chordEvidenceCount = 0;
        for (let pitchClass = 0; pitchClass < runtime.chordChroma.length; pitchClass += 1) {
          const value = runtime.chordChroma[pitchClass];
          if (value >= strongestChordTone * 0.32 && value >= chordEnergy * 0.08) {
            chordEvidenceCount += 1;
          }
        }
        const hasChordEvidence = chordEvidenceCount >= 2;
        const leftHandCandidateScratch = runtime.leftHandCandidateScratch;
        leftHandCandidateScratch.length = 0;
        if (
          chordContext &&
          chordContext.confidence >= (bassPitchClass === null ? 0.36 : 0.34) &&
          hasChordEvidence
        ) {
          copyPitchClasses(chordContext.pitchClasses, leftHandCandidateScratch);
          sortPitchClasses(leftHandCandidateScratch);
        } else if (bassPitchClass !== null) {
          leftHandCandidateScratch.push(bassPitchClass);
        }
        let leftHandCandidate = leftHandCandidateScratch;

        if (leftHandCandidate.length > 1) {
          let currentOverlap = 0;
          let pendingOverlap = 0;
          for (let index = 0; index < leftHandCandidate.length; index += 1) {
            const pitchClass = leftHandCandidate[index];
            if (runtime.leftHandPitchClasses.includes(pitchClass)) currentOverlap += 1;
            if (runtime.leftHandCandidatePitchClasses.includes(pitchClass)) pendingOverlap += 1;
          }
          if (runtime.leftHandPitchClasses.length > 1 && currentOverlap >= 2) {
            leftHandCandidate = runtime.leftHandPitchClasses;
          } else if (runtime.leftHandCandidatePitchClasses.length > 1 && pendingOverlap >= 2) {
            leftHandCandidate = runtime.leftHandCandidatePitchClasses;
          }
        }

        // Treat lower-spectrum notes as accompaniment: single bass notes settle
        // quickly, while complete chord voicings need several consistent frames.
        if (leftHandCandidate.length > 0) {
          if (pitchClassesMatch(leftHandCandidate, runtime.leftHandPitchClasses)) {
            runtime.leftHandLastSeenAt = now;
            runtime.leftHandCandidatePitchClasses.length = 0;
            runtime.leftHandCandidateFrames = 0;
          } else {
            if (pitchClassesMatch(leftHandCandidate, runtime.leftHandCandidatePitchClasses)) {
              runtime.leftHandCandidateFrames += 1;
            } else {
              copyPitchClasses(leftHandCandidate, runtime.leftHandCandidatePitchClasses);
              runtime.leftHandCandidateFrames = 1;
            }

            const isChord = leftHandCandidate.length > 1;
            const isInitialVoicing = runtime.leftHandPitchClasses.length === 0;
            const isNearBeat = now - runtime.lastBeatAt <= 150;
            const confirmationFrames = isChord
              ? isInitialVoicing
                ? 5
                : isNearBeat
                  ? 6
                  : 10
              : isInitialVoicing
                ? 4
                : isNearBeat
                  ? 5
                  : 8;
            if (runtime.leftHandCandidateFrames >= confirmationFrames) {
              copyPitchClasses(leftHandCandidate, runtime.leftHandPitchClasses);
              runtime.leftHandLastSeenAt = now;
              runtime.leftHandCandidatePitchClasses.length = 0;
              runtime.leftHandCandidateFrames = 0;
            } else if (now - runtime.leftHandLastSeenAt > 480) {
              runtime.leftHandPitchClasses.length = 0;
            }
          }
        } else if (now - runtime.leftHandLastSeenAt > 480) {
          runtime.leftHandPitchClasses.length = 0;
          runtime.leftHandCandidatePitchClasses.length = 0;
          runtime.leftHandCandidateFrames = 0;
        }

        const nextHighlightedPitchClasses = runtime.nextHighlightedPitchClasses;
        nextHighlightedPitchClasses.length = 0;
        if (now - runtime.leftHandLastSeenAt <= 480) {
          copyPitchClasses(runtime.leftHandPitchClasses, nextHighlightedPitchClasses);
        }
        const harmonyHighlightsChanged =
          nextHighlightedPitchClasses.length !== runtime.highlightedHarmonyPitchClasses.length ||
          !pitchClassesMatch(nextHighlightedPitchClasses, runtime.highlightedHarmonyPitchClasses);
        if (harmonyHighlightsChanged) {
          const harmonyPitchClasses = nextHighlightedPitchClasses.slice();
          runtime.highlightedHarmonyPitchClasses = harmonyPitchClasses;
          setMicrophoneHarmonyPitchClasses(harmonyPitchClasses);
        }
        if (
          runtime.melodyPitchClass !== null &&
          now - runtime.melodyLastSeenAt <= 560 &&
          !nextHighlightedPitchClasses.includes(runtime.melodyPitchClass)
        ) {
          nextHighlightedPitchClasses.push(runtime.melodyPitchClass);
        }
        sortPitchClasses(nextHighlightedPitchClasses);

        const highlightsChanged =
          nextHighlightedPitchClasses.length !== runtime.highlightedPitchClasses.length ||
          !pitchClassesMatch(nextHighlightedPitchClasses, runtime.highlightedPitchClasses);
        if (highlightsChanged) {
          runtime.highlightedPitchClasses = nextHighlightedPitchClasses.slice();
        }

        if (melodyOnsetPitchClass !== null) {
          if (microphoneBeatTimerRef.current !== null) {
            window.clearTimeout(microphoneBeatTimerRef.current);
          }
          setMicrophoneBeatPitchClasses([melodyOnsetPitchClass]);
          microphoneBeatTimerRef.current = window.setTimeout(() => {
            microphoneBeatTimerRef.current = null;
            setMicrophoneBeatPitchClasses([]);
          }, 125);
        }

        const hasPendingKeyBeat =
          Number.isFinite(runtime.lastBeatAt) &&
          runtime.lastBeatAt > runtime.lastKeyBeatAt &&
          now - runtime.lastBeatAt <= 240;
        if (
          hasPendingKeyBeat &&
          runtime.beatConfidence >= 2 &&
          runtime.highlightedPitchClasses.length > 0
        ) {
          if (microphoneBeatTimerRef.current !== null) window.clearTimeout(microphoneBeatTimerRef.current);
          runtime.lastKeyBeatAt = runtime.lastBeatAt;
          setMicrophoneBeatPitchClasses([...runtime.highlightedPitchClasses]);
          microphoneBeatTimerRef.current = window.setTimeout(() => {
            microphoneBeatTimerRef.current = null;
            setMicrophoneBeatPitchClasses([]);
          }, 105);
        }

        if (!activeSignal) return;
        if (detectedMidi === null) return;
        const visualInterval = beatDetected ? 60 : lerp(165, 72, level);
        if (now - runtime.lastVisualAt < visualInterval) return;
        if (!clearPitch && !beatDetected && recentStableMidi === null && level < 0.1) return;

        const harmonicContext = isolatesVoice ? null : detectHarmonicContext(runtime.chroma);
        const velocity = clamp(0.26 + level * 0.64 + (beatDetected ? 0.1 : 0), 0.26, 1);
        const beatCompanion =
          !isolatesVoice && beatDetected && !monophonicFrame && noteCandidates.length > 1
            ? noteCandidates[(runtime.visualCursor + 1) % noteCandidates.length]
            : null;
        const primaryVisualNote = midiToNote(clamp(detectedMidi, MIN_MIDI, MAX_MIDI));
        const primaryVisualColor = AURA_MAPPING.pitches[primaryVisualNote.pc];
        spawnBlob(
          primaryVisualNote,
          microphoneColor(primaryVisualColor, harmonicContext),
          velocity,
        );
        let visualCount = 1;
        if (beatCompanion !== null && beatCompanion !== detectedMidi) {
          const companionNote = midiToNote(clamp(beatCompanion, MIN_MIDI, MAX_MIDI));
          const companionColor = AURA_MAPPING.pitches[companionNote.pc];
          spawnBlob(
            companionNote,
            microphoneColor(companionColor, harmonicContext),
            velocity * 0.86,
          );
          visualCount = 2;
        }
        runtime.visualCursor += visualCount;
        runtime.lastVisualAt = now;
        let heardNotes = primaryVisualNote.name;
        if (detectedPitchClasses.length > 1) {
          heardNotes = NOTE_NAMES[detectedPitchClasses[0]];
          for (let index = 1; index < detectedPitchClasses.length; index += 1) {
            heardNotes += ` + ${NOTE_NAMES[detectedPitchClasses[index]]}`;
          }
        }
        const nextReading =
          harmonicContext && harmonicContext.confidence > 0.08
            ? `${heardNotes}, ${NOTE_NAMES[harmonicContext.root]} ${harmonicContext.mode}`
            : heardNotes;
        if (nextReading !== runtime.lastReading) {
          runtime.lastReading = nextReading;
          setMicrophoneReading(nextReading);
        }
      };

      runtime.analyze = analyze;
      runtime.animationFrame = window.requestAnimationFrame(runtime.analyze);
      stream.getTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          if (generation !== microphoneGenerationRef.current) return;
          if (audioInputSourceRef.current !== inputSource) return;
          const current = microphoneRef.current;
          if (!current) return;
          if (current.stream.getTracks().some((active) => active.id === track.id)) {
            if (isSystemAudio && systemAudioStreamRef.current === current.stream) {
              systemAudioStreamRef.current = null;
            }
            stopMicrophone();
          }
        }, { once: true });
      });
    } catch {
      stream?.getTracks().forEach((track) => {
        if (!reusedSystemAudio) track.stop();
      });
      if (!reusedSystemAudio && stream === systemAudioStreamRef.current) {
        systemAudioStreamRef.current = null;
      }
      if (audioContext) void audioContext.close().catch(() => undefined);
      if (generation !== microphoneGenerationRef.current) return;
      microphoneRef.current = null;
      audioInputSourceRef.current = null;
      const inputButton = isSystemAudio
        ? systemAudioButtonRef.current
        : isExternalInput
          ? externalInputButtonRef.current
          : microphoneButtonRef.current;
      inputButton?.style.setProperty("--mic-level", "0");
      setMicrophoneState(inputSource === "microphone" ? "error" : "idle");
      setSystemAudioState(isSystemAudio ? "error" : "idle");
      setExternalInputState(isExternalInput ? "error" : "idle");
      setMicrophoneHarmonyPitchClasses([]);
      setMicrophoneMelodyPitchClass(null);
      setMicrophoneBeatPitchClasses([]);
      setMicrophoneReading(
        isSystemAudio
          ? "Device audio unavailable"
          : isExternalInput
            ? "External input unavailable"
            : "Microphone unavailable",
      );
      hapticFeedback("error");
    }
  }, [spawnBlob, stopMicrophone]);

  const startExternalInput = useCallback(async () => {
    stopMicrophone();
    setExternalInputState("requesting");
    setMicrophoneReading("Finding connected instruments");

    const navigatorWithMidi = navigator as Navigator & {
      requestMIDIAccess?: (options?: { sysex?: boolean }) => Promise<MIDIAccess>;
    };

    try {
      const midiAccess = await navigatorWithMidi.requestMIDIAccess?.({ sysex: false });
      const midiInput = midiAccess
        ? [...midiAccess.inputs.values()].find(
            (input) => input.type === "input" && input.state === "connected",
          )
        : undefined;
      if (midiAccess && midiInput) {
        const inputName = midiInput.name?.trim() || "MIDI instrument";
        externalMidiAccessRef.current = midiAccess;
        externalMidiInputRef.current = midiInput;
        audioInputSourceRef.current = "external";
        midiInput.onmidimessage = (event) => {
          const data = event.data;
          if (!data || data.length < 3) return;
          const command = data[0] & 0xf0;
          const noteNumber = data[1];
          const noteVelocity = data[2];
          const keyId = `external-midi-${noteNumber}`;
          if (command === 0x90 && noteVelocity > 0) {
            const note = midiToNote(clamp(noteNumber, MIN_MIDI, MAX_MIDI));
            const velocity = clamp(noteVelocity / 127, 0.18, 1);
            externalMidiNotesRef.current.add(noteNumber);
            triggerAttack(keyId, note.name, velocity);
            spawnBlob(note, AURA_MAPPING.pitches[note.pc], velocity);
            setMicrophoneReading(`${inputName}: ${note.name}`);
            if (microphoneBeatTimerRef.current !== null) {
              window.clearTimeout(microphoneBeatTimerRef.current);
            }
            setMicrophoneBeatPitchClasses([note.pc]);
            microphoneBeatTimerRef.current = window.setTimeout(() => {
              microphoneBeatTimerRef.current = null;
              setMicrophoneBeatPitchClasses([]);
            }, 105);
          } else if (command === 0x80 || (command === 0x90 && noteVelocity === 0)) {
            externalMidiNotesRef.current.delete(noteNumber);
            triggerRelease(keyId);
          }
        };
        midiAccess.onstatechange = () => {
          if (midiInput.state === "disconnected") stopMicrophone();
        };
        setMicrophoneState("idle");
        setSystemAudioState("idle");
        setExternalInputState("listening");
        setMicrophoneReading(inputName);
        hapticFeedback("success");
        return;
      }
    } catch {
      // MIDI permission or support is optional; USB audio remains available below.
    }

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia || !mediaDevices.enumerateDevices) {
      setExternalInputState("unsupported");
      setMicrophoneReading("External input is unsupported");
      return;
    }

    let permissionStream: MediaStream | null = null;
    try {
      permissionStream = await mediaDevices.getUserMedia({ audio: true });
      const activeTrack = permissionStream.getAudioTracks()[0];
      const activeDeviceId = activeTrack?.getSettings().deviceId;
      const devices = await mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((device) => device.kind === "audioinput");
      const externalLabel = /usb|midi|teenage engineering|audio interface|instrument|line|op-1|op-z|tx-6|field/i;
      const builtInLabel = /built-in|macbook|iphone|facetime|microphone array|default|communications/i;
      const selectedDevice =
        audioInputs.find((device) => externalLabel.test(device.label)) ??
        audioInputs.find((device) => device.label && !builtInLabel.test(device.label)) ??
        audioInputs.find((device) => device.deviceId === activeDeviceId) ??
        audioInputs[0];
      const selectedName = selectedDevice?.label || activeTrack?.label || "External audio input";
      permissionStream.getTracks().forEach((track) => track.stop());
      permissionStream = null;
      await startAudioInput("external", selectedDevice?.deviceId, selectedName);
    } catch {
      permissionStream?.getTracks().forEach((track) => track.stop());
      setExternalInputState("error");
      setMicrophoneReading("External input unavailable");
      hapticFeedback("error");
    }
  }, [spawnBlob, startAudioInput, stopMicrophone, triggerAttack, triggerRelease]);

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
      void startAudioInput("microphone");
      return;
    }
    openMicrophonePrompt("microphone");
  }, [openMicrophonePrompt, startAudioInput]);

  const toggleMicrophone = useCallback(() => {
    if (microphonePromptOpen) {
      closeMicrophonePrompt();
      return;
    }
    if (microphoneState === "listening" || microphoneState === "requesting") {
      hapticFeedback("close");
      stopMicrophone();
      return;
    }
    if (systemAudioState === "listening" || systemAudioState === "requesting") {
      stopMicrophone();
    }
    if (externalInputState === "listening" || externalInputState === "requesting") {
      stopMicrophone();
    }
    void prepareMicrophone();
  }, [
    closeMicrophonePrompt,
    externalInputState,
    microphonePromptOpen,
    microphoneState,
    prepareMicrophone,
    stopMicrophone,
    systemAudioState,
  ]);

  const toggleSystemAudio = useCallback(() => {
    if (systemAudioState === "listening" || systemAudioState === "requesting") {
      hapticFeedback("close");
      stopMicrophone();
      return;
    }
    if (microphonePromptOpen) {
      closeMicrophonePrompt();
      return;
    }
    if (microphoneState === "listening" || microphoneState === "requesting") {
      stopMicrophone();
    }
    if (externalInputState === "listening" || externalInputState === "requesting") {
      stopMicrophone();
    }
    const hasRememberedSystemAudio =
      systemAudioStreamRef.current?.getAudioTracks().some((track) => track.readyState === "live") ??
      false;
    if (!systemAudioIntroductionShownRef.current && !hasRememberedSystemAudio) {
      openMicrophonePrompt("system");
      return;
    }
    void startAudioInput("system");
  }, [
    closeMicrophonePrompt,
    externalInputState,
    microphonePromptOpen,
    microphoneState,
    openMicrophonePrompt,
    startAudioInput,
    stopMicrophone,
    systemAudioState,
  ]);

  const toggleExternalInput = useCallback(() => {
    if (externalInputState === "listening" || externalInputState === "requesting") {
      hapticFeedback("close");
      stopMicrophone();
      return;
    }
    if (microphonePromptOpen) {
      closeMicrophonePrompt();
      return;
    }
    if (
      microphoneState === "listening" ||
      microphoneState === "requesting" ||
      systemAudioState === "listening" ||
      systemAudioState === "requesting"
    ) {
      stopMicrophone();
    }
    if (!externalInputIntroductionShownRef.current) {
      openMicrophonePrompt("external");
      return;
    }
    void startExternalInput();
  }, [
    closeMicrophonePrompt,
    externalInputState,
    microphonePromptOpen,
    microphoneState,
    openMicrophonePrompt,
    startExternalInput,
    stopMicrophone,
    systemAudioState,
  ]);

  const replaceLiveMicrophoneStream = useCallback(async (runtime: MicrophoneRuntime, generation: number) => {
    const sync = microphoneModeSyncRef.current + 1;
    microphoneModeSyncRef.current = sync;
    const mode = microphoneModeRef.current;
    let nextStream: MediaStream;
    try {
      nextStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraintsForMicrophoneMode(mode),
      });
      setMicrophoneTrackHints(nextStream, mode);
    } catch {
      return;
    }
    if (
      sync !== microphoneModeSyncRef.current ||
      generation !== microphoneGenerationRef.current ||
      microphoneRef.current !== runtime
    ) {
      nextStream.getTracks().forEach((track) => track.stop());
      return;
    }

    const previousSource = runtime.source;
    const previousStream = runtime.stream;
    runtime.stream = nextStream;
    runtime.source = runtime.context.createMediaStreamSource(nextStream);
    configureMicrophonePipeline(runtime, mode);
    previousSource.disconnect();
    previousStream.getTracks().forEach((track) => track.stop());
    nextStream.getAudioTracks().forEach((track) => {
      track.addEventListener("ended", () => {
        if (generation !== microphoneGenerationRef.current) return;
        const current = microphoneRef.current;
        if (!current) return;
        if (current.stream.getAudioTracks().some((active) => active.id === track.id)) {
          stopMicrophone();
        }
      });
    });
  }, [stopMicrophone]);

  const selectMicrophoneMode = useCallback(
    (mode: MicrophoneModeId, direction?: -1 | 1) => {
      const currentIndex = microphoneModeIndex(microphoneModeRef.current);
      const nextIndex = microphoneModeIndex(mode);
      if (MICROPHONE_MODES[nextIndex]?.id !== mode || nextIndex === currentIndex) return;

      microphoneModeRef.current = mode;
      setMicrophoneModeDirection(direction ?? (nextIndex > currentIndex ? 1 : -1));
      setMicrophoneMode(mode);
      hapticFeedback("open");

      const runtime = microphoneRef.current;
      if (
        audioInputSourceRef.current !== "microphone" ||
        !runtime ||
        runtime.context.state === "closed" ||
        !runtime.stream.active
      ) return;
      configureMicrophonePipeline(runtime, mode);
      setMicrophoneHarmonyPitchClasses([]);
      setMicrophoneMelodyPitchClass(null);
      setMicrophoneBeatPitchClasses([]);
      setMicrophoneReading("Listening");
      void replaceLiveMicrophoneStream(runtime, microphoneGenerationRef.current);
    },
    [replaceLiveMicrophoneStream],
  );

  const cycleMicrophoneMode = useCallback(
    (direction: -1 | 1) => {
      const currentIndex = microphoneModeIndex(microphoneModeRef.current);
      const nextMode = MICROPHONE_MODES[modulo(currentIndex + direction, MICROPHONE_MODES.length)];
      selectMicrophoneMode(nextMode.id, direction);
    },
    [selectMicrophoneMode],
  );

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
      if (previewKind || microphonePromptOpen) return;
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
    const clearDownKeys = () => downKeys.clear();

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", clearDownKeys);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", clearDownKeys);
    };
  }, [endKey, keyboardMap, microphonePromptOpen, previewKind, startKey]);

  useEffect(() => {
    const releaseInterruptedNotes = () => {
      // A hidden or unfocused tab must be silent immediately; disposing also
      // removes long pad/reverb tails that releaseAll intentionally preserves.
      disposeToneEngine();
      releaseTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      releaseTimersRef.current.clear();
      setActiveKeys(new Set());
    };
    const handleVisibilityChange = () => {
      if (document.hidden) releaseInterruptedNotes();
    };

    window.addEventListener("blur", releaseInterruptedNotes);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("blur", releaseInterruptedNotes);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [disposeToneEngine]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !context) return;

    const offscreen = document.createElement("canvas");
    const offscreenContext = offscreen.getContext("2d", { alpha: true });
    const pixelLayer = document.createElement("canvas");
    const pixelContext = pixelLayer.getContext("2d", { alpha: true });
    const pixelAccents = document.createElement("canvas");
    const pixelAccentContext = pixelAccents.getContext("2d", { alpha: true });
    const blurred = document.createElement("canvas");
    const blurredContext = blurred.getContext("2d", { alpha: true });
    const settled = document.createElement("canvas");
    const settledContext = settled.getContext("2d", { alpha: true });
    const settledSnapshot = document.createElement("canvas");
    const settledSnapshotContext = settledSnapshot.getContext("2d", { alpha: true });
    const historyComposite = document.createElement("canvas");
    const historyCompositeContext = historyComposite.getContext("2d", { alpha: true });
    const historySnapshot = document.createElement("canvas");
    const historySnapshotContext = historySnapshot.getContext("2d", { alpha: true });
    const saturationProbe = document.createElement("canvas");
    saturationProbe.width = 48;
    saturationProbe.height = 32;
    const saturationProbeContext = saturationProbe.getContext("2d", { willReadFrequently: true });
    if (
      !offscreenContext ||
      !pixelContext ||
      !pixelAccentContext ||
      !blurredContext ||
      !settledContext ||
      !settledSnapshotContext ||
      !historyCompositeContext ||
      !historySnapshotContext ||
      !saturationProbeContext
    ) return;

    compactedHistoryCanvasRef.current = historyComposite;
    grainRef.current = makeNoiseTile(160, 20);
    const grainPattern = context.createPattern(grainRef.current, "repeat");
    let width = 1;
    let height = 1;
    let dpr = 1;
    let frame = 0;
    let running = false;
    let lastDrawAt = -Infinity;
    let settledCount = 0;
    let adaptiveRenderScale = 1;
    let overBudgetFrames = 0;
    let lastQualityAdjustmentAt = -Infinity;
    let blurredSettledCount = -1;
    let blurredBlobCount = -1;
    let blurredFallbackArtStyle: ArtStyleId | null = null;
    let lastPixelRenderedAt = Number.NEGATIVE_INFINITY;
    let lastPixelBlobCount = -1;
    let lastPixelFallbackArtStyle: ArtStyleId | null = null;
    let lastPixelReducedMotion = false;
    let hasCompactedHistory = false;
    let scheduledWakeTimer: number | null = null;
    let scheduledWakeAt = Number.POSITIVE_INFINITY;

    const syncOffscreenSize = (preserveSettled = false) => {
      const layerTotal = blobsRef.current.length;
      const densityScale = layerTotal > 320 ? 0.34 : layerTotal > 140 ? 0.42 : 0.5;
      const pixelBudgetScale = Math.sqrt(AURA_RENDER_PIXEL_BUDGET / Math.max(1, width * height));
      const renderScale = Math.max(
        0.14,
        Math.min(densityScale, pixelBudgetScale) * adaptiveRenderScale,
      );
      const targetWidth = Math.max(1, Math.round(width * renderScale));
      const targetHeight = Math.max(1, Math.round(height * renderScale));
      if (offscreen.width !== targetWidth || offscreen.height !== targetHeight) {
        const canPreserveSettled = preserveSettled && settledCount > 0;
        if (canPreserveSettled) {
          settledSnapshot.width = settled.width;
          settledSnapshot.height = settled.height;
          settledSnapshotContext.clearRect(0, 0, settledSnapshot.width, settledSnapshot.height);
          settledSnapshotContext.drawImage(settled, 0, 0);
        }
        offscreen.width = targetWidth;
        offscreen.height = targetHeight;
        blurred.width = targetWidth;
        blurred.height = targetHeight;
        blurredSettledCount = -1;
        blurredBlobCount = -1;
        blurredFallbackArtStyle = null;
        settled.width = targetWidth;
        settled.height = targetHeight;
        if (canPreserveSettled) {
          settledContext.drawImage(
            settledSnapshot,
            0,
            0,
            settledSnapshot.width,
            settledSnapshot.height,
            0,
            0,
            targetWidth,
            targetHeight,
          );
        } else {
          settledCount = 0;
        }
      }
      const pixelWidth = Math.max(1, Math.round(width));
      const pixelHeight = Math.max(1, Math.round(height));
      if (pixelLayer.width !== pixelWidth || pixelLayer.height !== pixelHeight) {
        pixelLayer.width = pixelWidth;
        pixelLayer.height = pixelHeight;
        pixelAccents.width = pixelWidth;
        pixelAccents.height = pixelHeight;
        lastPixelRenderedAt = Number.NEGATIVE_INFINITY;
        lastPixelBlobCount = -1;
      }
    };

    const syncHistorySize = () => {
      const targetWidth = Math.max(1, Math.round(width));
      const targetHeight = Math.max(1, Math.round(height));
      if (historyComposite.width === targetWidth && historyComposite.height === targetHeight) return;

      const canPreserveHistory =
        hasCompactedHistory && historyComposite.width > 0 && historyComposite.height > 0;
      if (canPreserveHistory) {
        historySnapshot.width = historyComposite.width;
        historySnapshot.height = historyComposite.height;
        historySnapshotContext.clearRect(0, 0, historySnapshot.width, historySnapshot.height);
        historySnapshotContext.drawImage(historyComposite, 0, 0);
      }
      historyComposite.width = targetWidth;
      historyComposite.height = targetHeight;
      if (canPreserveHistory) {
        historyCompositeContext.drawImage(
          historySnapshot,
          0,
          0,
          historySnapshot.width,
          historySnapshot.height,
          0,
          0,
          targetWidth,
          targetHeight,
        );
      }
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const pixelBudgetRatio = Math.sqrt(AURA_BACKING_PIXEL_BUDGET / Math.max(1, width * height));
      dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 1.25, pixelBudgetRatio));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      syncHistorySize();
      syncOffscreenSize(false);
    };

    const drawEmptyAura = () => {
      if (blobsRef.current.length > 0 || hasCompactedHistory) return;
      const gradient = context.createRadialGradient(width * 0.5, height * 0.28, 0, width * 0.5, height * 0.28, width * 0.34);
      gradient.addColorStop(0, "rgba(230, 234, 250, 0.06)");
      gradient.addColorStop(0.54, "rgba(235, 220, 244, 0.028)");
      gradient.addColorStop(1, "rgba(243, 245, 250, 0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
    };

    const resetRenderer = () => {
      settledContext.clearRect(0, 0, settled.width, settled.height);
      offscreenContext.clearRect(0, 0, offscreen.width, offscreen.height);
      pixelContext.clearRect(0, 0, pixelLayer.width, pixelLayer.height);
      pixelAccentContext.clearRect(0, 0, pixelAccents.width, pixelAccents.height);
      blurredContext.clearRect(0, 0, blurred.width, blurred.height);
      historyCompositeContext.clearRect(0, 0, historyComposite.width, historyComposite.height);
      settledCount = 0;
      compactedHistoryActiveRef.current = false;
      hasCompactedHistory = false;
      blurredSettledCount = -1;
      blurredBlobCount = -1;
      blurredFallbackArtStyle = null;
      lastPixelRenderedAt = Number.NEGATIVE_INFINITY;
      lastPixelBlobCount = -1;
      lastPixelFallbackArtStyle = null;
      colorRebuildLayersRef.current = 0;
      additiveLayerStartRef.current = 0;
      context.clearRect(0, 0, width, height);
      drawEmptyAura();
    };

    const cancelScheduledWake = () => {
      if (scheduledWakeTimer !== null) window.clearTimeout(scheduledWakeTimer);
      scheduledWakeTimer = null;
      scheduledWakeAt = Number.POSITIVE_INFINITY;
    };

    const wakeRenderer = () => {
      cancelScheduledWake();
      if (running || document.hidden) return;
      running = true;
      frame = window.requestAnimationFrame(animate);
    };

    const scheduleRendererWake = (targetAt: number) => {
      if (!Number.isFinite(targetAt)) {
        cancelScheduledWake();
        return;
      }
      if (scheduledWakeTimer !== null && scheduledWakeAt <= targetAt + 1) return;
      cancelScheduledWake();
      scheduledWakeAt = targetAt;
      scheduledWakeTimer = window.setTimeout(() => {
        scheduledWakeTimer = null;
        scheduledWakeAt = Number.POSITIVE_INFINITY;
        wakeRenderer();
      }, Math.max(0, targetAt - performance.now()));
    };

    const compactVisualHistory = (now: number, blurRadius: number) => {
      const blobs = blobsRef.current;
      if (blobs.length <= MAX_LIVE_VISUAL_PARTICLES || settledCount === 0) return;

      let compactCount = 0;
      for (let index = 0; index < settledCount; index += 1) {
        const blob = blobs[index];
        const isDotted = (blob.artStyle ?? artStyleRef.current) === "style-2";
        const minimumAge = isDotted
          ? DOTTED_GLOW_MATURATION_DURATION
          : BLOB_ARRIVAL_DURATION;
        if (!reducedMotionRef.current && now - blob.createdAt < minimumAge) break;
        compactCount = index + 1;
      }

      const forcedCount = blobs.length > HARD_MAX_LIVE_VISUAL_PARTICLES
        ? Math.min(settledCount, blobs.length - MAX_LIVE_VISUAL_PARTICLES)
        : 0;
      compactCount = Math.max(compactCount, forcedCount);
      if (compactCount === 0) return;

      const compactedBlobs = blobs.slice(0, compactCount);
      drawChronologicalAuraLayers(
        historyCompositeContext,
        offscreen,
        offscreenContext,
        pixelLayer,
        pixelContext,
        pixelAccents,
        pixelAccentContext,
        blurred,
        blurredContext,
        compactedBlobs,
        width,
        height,
        now,
        true,
        artStyleRef.current,
        blurRadius,
        undefined,
        hasCompactedHistory,
      );

      hasCompactedHistory = true;
      compactedHistoryActiveRef.current = true;
      blobsRef.current = blobs.slice(compactCount);
      settledContext.clearRect(0, 0, settled.width, settled.height);
      settledCount = 0;
      additiveLayerStartRef.current = Math.max(0, additiveLayerStartRef.current - compactCount);
      blurredSettledCount = -1;
      blurredBlobCount = -1;
      blurredFallbackArtStyle = null;
      lastPixelRenderedAt = Number.NEGATIVE_INFINITY;
      lastPixelBlobCount = -1;
      lastPixelFallbackArtStyle = null;
      replayRenderStatesRef.current = new WeakMap();
    };

    const animate = (now: number) => {
      running = false;

      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        resize();
      }

      const elapsed = now - lastDrawAt;
      if (elapsed < AURA_FRAME_INTERVAL - AURA_FRAME_TOLERANCE) {
        wakeRenderer();
        return;
      }
      if (Number.isFinite(lastDrawAt)) {
        const elapsedIntervals = Math.max(
          1,
          Math.floor((elapsed + AURA_FRAME_TOLERANCE) / AURA_FRAME_INTERVAL),
        );
        lastDrawAt += elapsedIntervals * AURA_FRAME_INTERVAL;
      } else {
        lastDrawAt = now;
      }
      const renderStartedAt = performance.now();
      const currentArtStyle = artStyleRef.current;

      context.clearRect(0, 0, width, height);
      drawEmptyAura();

      syncOffscreenSize(true);
      if (blobsRef.current.length < settledCount) {
        settledContext.clearRect(0, 0, settled.width, settled.height);
        settledCount = 0;
      }
      const settleStartedAt = performance.now();
      while (settledCount < blobsRef.current.length) {
        const blob = blobsRef.current[settledCount];
        if (!reducedMotionRef.current && now - blob.createdAt < BLOB_ARRIVAL_DURATION) break;
        if ((blob.artStyle ?? currentArtStyle) !== "style-2") {
          drawAuraComposition(
            settledContext,
            blobsRef.current,
            settled.width,
            settled.height,
            blob.createdAt + BLOB_ARRIVAL_DURATION,
            undefined,
            settledCount,
            settledCount + 1,
            currentArtStyle,
          );
        }
        settledCount += 1;
        if (
          (blob.artStyle ?? currentArtStyle) !== "style-2" &&
          colorRebuildLayersRef.current === 0 &&
          settledCount - additiveLayerStartRef.current >= SATURATION_MINIMUM_LAYERS &&
          settledCount % SATURATION_CHECK_INTERVAL === 0 &&
          isAuraWashedOut(settled, saturationProbe, saturationProbeContext)
        ) {
          colorRebuildLayersRef.current = COLOR_REBUILD_LAYERS;
        }
        if (performance.now() - settleStartedAt >= AURA_SETTLE_BUDGET_MS) break;
      }
      const blurScale = offscreen.width / Math.max(1, width);
      const compactionBlurRadius = (reducedMotionRef.current ? 4 : 7) * blurScale;
      compactVisualHistory(now, compactionBlurRadius);
      if (hasCompactedHistory) {
        context.save();
        context.globalCompositeOperation = "source-over";
        context.drawImage(historyComposite, 0, 0, width, height);
        context.restore();
      }

      let newestDottedCreatedAt = Number.NEGATIVE_INFINITY;
      let containsOrganicStyle = false;
      for (let index = blobsRef.current.length - 1; index >= 0; index -= 1) {
        const blob = blobsRef.current[index];
        if ((blob.artStyle ?? currentArtStyle) === "style-2") {
          if (!Number.isFinite(newestDottedCreatedAt)) newestDottedCreatedAt = blob.createdAt;
        } else {
          containsOrganicStyle = true;
        }
        if (containsOrganicStyle && Number.isFinite(newestDottedCreatedAt)) break;
      }
      const hasDottedStyle = Number.isFinite(newestDottedCreatedAt);
      const dottedMotionIsActive =
        hasDottedStyle &&
        !reducedMotionRef.current &&
        now - newestDottedCreatedAt < DOTTED_FORMATION_SETTLE_DURATION;
      const blurRadius =
        (containsOrganicStyle || hasCompactedHistory
          ? reducedMotionRef.current
            ? 4
            : 7
          : reducedMotionRef.current
            ? 0.4
            : 0.65) * blurScale;
      if (!hasDottedStyle) {
        const organicLayerNeedsRefresh =
          settledCount < blobsRef.current.length ||
          blurredSettledCount !== settledCount ||
          blurredBlobCount !== blobsRef.current.length ||
          blurredFallbackArtStyle !== currentArtStyle;
        if (organicLayerNeedsRefresh) {
          offscreenContext.clearRect(0, 0, offscreen.width, offscreen.height);
          offscreenContext.drawImage(settled, 0, 0);
          if (settledCount < blobsRef.current.length) {
            const newestBlob = blobsRef.current.at(-1);
            const effectiveNow = reducedMotionRef.current && newestBlob
              ? newestBlob.createdAt + BLOB_ARRIVAL_DURATION
              : now;
            drawAuraComposition(
              offscreenContext,
              blobsRef.current,
              offscreen.width,
              offscreen.height,
              effectiveNow,
              undefined,
              settledCount,
              blobsRef.current.length,
              currentArtStyle,
            );
          }

          blurredContext.clearRect(0, 0, blurred.width, blurred.height);
          blurredContext.save();
          blurredContext.filter = `blur(${Math.max(0.35, blurRadius)}px)`;
          blurredContext.drawImage(offscreen, 0, 0);
          blurredContext.restore();
          blurredSettledCount = settledCount;
          blurredBlobCount = blobsRef.current.length;
          blurredFallbackArtStyle = currentArtStyle;
        }
      }

      if (hasCompactedHistory || (hasDottedStyle && containsOrganicStyle)) {
        drawChronologicalAuraLayers(
          context,
          offscreen,
          offscreenContext,
          pixelLayer,
          pixelContext,
          pixelAccents,
          pixelAccentContext,
          blurred,
          blurredContext,
          blobsRef.current,
          width,
          height,
          now,
          reducedMotionRef.current,
          currentArtStyle,
          blurRadius,
          undefined,
          hasCompactedHistory,
        );
      } else if (hasDottedStyle) {
        const pixelLayerNeedsRefresh =
          lastPixelBlobCount !== blobsRef.current.length ||
          lastPixelFallbackArtStyle !== currentArtStyle ||
          lastPixelReducedMotion !== reducedMotionRef.current ||
          (dottedMotionIsActive &&
            now - lastPixelRenderedAt >= DOTTED_RENDER_INTERVAL - AURA_FRAME_TOLERANCE);
        if (pixelLayerNeedsRefresh) {
          pixelContext.clearRect(0, 0, pixelLayer.width, pixelLayer.height);
          drawDottedSigilFlowLayer(
            pixelContext,
            blobsRef.current,
            pixelLayer.width,
            pixelLayer.height,
            now,
            reducedMotionRef.current,
            currentArtStyle,
            0,
            blobsRef.current.length,
            undefined,
            width,
          );
          lastPixelRenderedAt = now;
          lastPixelBlobCount = blobsRef.current.length;
          lastPixelFallbackArtStyle = currentArtStyle;
          lastPixelReducedMotion = reducedMotionRef.current;
        }
        context.save();
        context.globalCompositeOperation = "source-over";
        context.imageSmoothingEnabled = false;
        context.drawImage(pixelLayer, 0, 0, width, height);
        context.restore();
      } else {
        context.save();
        context.globalCompositeOperation = "lighter";
        context.drawImage(blurred, 0, 0, width, height);
        context.restore();
      }

      if (grainPattern) {
        drawGrainPattern(context, width, height, grainPattern, 0.055);
      }

      const telemetryTransition = telemetryTransitionRef.current;
      const telemetryTransitionProgress = clamp(
        (now - telemetryTransition.startedAt) / TELEMETRY_TOGGLE_FADE_DURATION,
        0,
        1,
      );
      const telemetryOpacity = lerp(
        telemetryTransition.from,
        telemetryTransition.to,
        easeInOutSmooth(telemetryTransitionProgress),
      );
      const telemetryIsTransitioning =
        telemetryTransitionProgress < 1 &&
        Math.abs(telemetryTransition.to - telemetryTransition.from) > 0.001;

      // Screen-only: exports render from drawAuraComposition without this pass.
      if (telemetryOpacity > 0.001) {
        drawTelemetryOverlay(
          context,
          blobsRef.current,
          width,
          height,
          now,
          currentArtStyle,
          telemetryOpacity,
        );
      }
      const nextTelemetryFrameAt = telemetryOpacity > 0.001
        ? telemetryNextFrameAt(now)
        : Number.POSITIVE_INFINITY;

      const newestBlob = blobsRef.current.at(-1);
      const hasArrivingBlob =
        !reducedMotionRef.current &&
        newestBlob !== undefined &&
        now - newestBlob.createdAt < BLOB_ARRIVAL_DURATION;
      const renderDuration = performance.now() - renderStartedAt;
      if (renderDuration > AURA_RENDER_BUDGET_MS) {
        overBudgetFrames += 1;
      } else {
        overBudgetFrames = Math.max(0, overBudgetFrames - 1);
      }
      if (
        overBudgetFrames >= 2 &&
        adaptiveRenderScale > AURA_MIN_ADAPTIVE_SCALE &&
        now - lastQualityAdjustmentAt >= 500
      ) {
        adaptiveRenderScale = Math.max(AURA_MIN_ADAPTIVE_SCALE, adaptiveRenderScale * 0.84);
        overBudgetFrames = 0;
        lastQualityAdjustmentAt = now;
      }
      if (
        hasArrivingBlob ||
        dottedMotionIsActive ||
        settledCount < blobsRef.current.length ||
        telemetryIsTransitioning ||
        nextTelemetryFrameAt <= now
      ) {
        wakeRenderer();
      } else {
        scheduleRendererWake(nextTelemetryFrameAt);
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
    resetRendererRef.current = resetRenderer;
    window.addEventListener("resize", handleResize);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    resizeObserver.observe(canvas);
    wakeRenderer();

    return () => {
      wakeRendererRef.current = null;
      resetRendererRef.current = null;
      if (compactedHistoryCanvasRef.current === historyComposite) {
        compactedHistoryCanvasRef.current = null;
      }
      compactedHistoryActiveRef.current = false;
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      resizeObserver.disconnect();
      cancelScheduledWake();
      window.cancelAnimationFrame(frame);
    };
  }, []);

  const renderArtwork = useCallback((output: HTMLCanvasElement, replayProgress?: number) => {
    const outputContext = output.getContext("2d", { alpha: false });
    if (!outputContext) return;
    const compactedHistory = compactedHistoryCanvasRef.current;
    const hasCompactedHistory =
      compactedHistoryActiveRef.current &&
      compactedHistory !== null &&
      compactedHistory.width > 0 &&
      compactedHistory.height > 0;

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

    let pixelLayer = exportPixelLayersRef.current.get(output);
    if (!pixelLayer) {
      pixelLayer = document.createElement("canvas");
      exportPixelLayersRef.current.set(output, pixelLayer);
    }
    if (pixelLayer.width !== output.width || pixelLayer.height !== output.height) {
      pixelLayer.width = output.width;
      pixelLayer.height = output.height;
    }
    const pixelContext = pixelLayer.getContext("2d", { alpha: true });
    if (!pixelContext) return;

    let pixelAccentLayer = exportPixelAccentLayersRef.current.get(output);
    if (!pixelAccentLayer) {
      pixelAccentLayer = document.createElement("canvas");
      exportPixelAccentLayersRef.current.set(output, pixelAccentLayer);
    }
    if (pixelAccentLayer.width !== output.width || pixelAccentLayer.height !== output.height) {
      pixelAccentLayer.width = output.width;
      pixelAccentLayer.height = output.height;
    }
    const pixelAccentLayerContext = pixelAccentLayer.getContext("2d", { alpha: true });
    if (!pixelAccentLayerContext) return;

    layerContext.clearRect(0, 0, layerWidth, layerHeight);
    pixelContext.clearRect(0, 0, pixelLayer.width, pixelLayer.height);
    pixelAccentLayerContext.clearRect(0, 0, pixelAccentLayer.width, pixelAccentLayer.height);
    if (replayProgress === undefined || hasCompactedHistory) {
      replayRenderStatesRef.current.delete(output);
      const settledAt = (blobsRef.current.at(-1)?.createdAt ?? performance.now()) + BLOB_ARRIVAL_DURATION;
      drawAuraComposition(
        layerContext,
        blobsRef.current,
        layerWidth,
        layerHeight,
        settledAt,
        replayProgress,
        0,
        blobsRef.current.length,
        artStyleRef.current,
      );
    } else {
      let replayState = replayRenderStatesRef.current.get(output);
      if (!replayState) {
        const settledLayer = document.createElement("canvas");
        const settledContext = settledLayer.getContext("2d", { alpha: true });
        if (settledContext) {
          replayState = {
            settledLayer,
            settledContext,
            settledCount: 0,
            lastProgress: -Infinity,
            width: 0,
            height: 0,
            blobTotal: -1,
          };
          replayRenderStatesRef.current.set(output, replayState);
        }
      }

      if (!replayState) {
        const settledAt = (blobsRef.current.at(-1)?.createdAt ?? performance.now()) + BLOB_ARRIVAL_DURATION;
        drawAuraComposition(
          layerContext,
          blobsRef.current,
          layerWidth,
          layerHeight,
          settledAt,
          replayProgress,
          0,
          blobsRef.current.length,
          artStyleRef.current,
        );
      } else {
        const blobTotal = blobsRef.current.length;
        const needsReset =
          replayProgress < replayState.lastProgress ||
          replayState.width !== layerWidth ||
          replayState.height !== layerHeight ||
          replayState.blobTotal !== blobTotal;
        if (needsReset) {
          replayState.settledLayer.width = layerWidth;
          replayState.settledLayer.height = layerHeight;
          replayState.settledCount = 0;
          replayState.width = layerWidth;
          replayState.height = layerHeight;
          replayState.blobTotal = blobTotal;
          replayState.settledContext.clearRect(0, 0, layerWidth, layerHeight);
        }

        const replayPosition = replayProgress * (blobTotal + 0.9);
        const targetSettledCount = Math.min(blobTotal, Math.max(0, Math.floor(replayPosition)));
        while (replayState.settledCount < targetSettledCount) {
          const blobIndex = replayState.settledCount;
          const blob = blobsRef.current[blobIndex];
          drawAuraComposition(
            replayState.settledContext,
            blobsRef.current,
            layerWidth,
            layerHeight,
            blob.createdAt + BLOB_ARRIVAL_DURATION,
            undefined,
            blobIndex,
            blobIndex + 1,
            artStyleRef.current,
          );
          replayState.settledCount += 1;
        }

        layerContext.drawImage(replayState.settledLayer, 0, 0);
        if (targetSettledCount < blobTotal) {
          drawAuraComposition(
            layerContext,
            blobsRef.current,
            layerWidth,
            layerHeight,
            performance.now(),
            replayProgress,
            targetSettledCount,
            targetSettledCount + 1,
            artStyleRef.current,
          );
        }
        replayState.lastProgress = replayProgress;
      }
    }

    let blurredAuraLayer = exportBlurLayersRef.current.get(output);
    if (!blurredAuraLayer) {
      blurredAuraLayer = document.createElement("canvas");
      exportBlurLayersRef.current.set(output, blurredAuraLayer);
    }
    if (blurredAuraLayer.width !== layerWidth || blurredAuraLayer.height !== layerHeight) {
      blurredAuraLayer.width = layerWidth;
      blurredAuraLayer.height = layerHeight;
    }
    const blurredLayerContext = blurredAuraLayer.getContext("2d", { alpha: true });
    if (!blurredLayerContext) return;
    blurredLayerContext.clearRect(0, 0, layerWidth, layerHeight);
    blurredLayerContext.save();
    const outputBlurRadius = clamp(Math.min(output.width, output.height) * 0.008, 4, 10);
    blurredLayerContext.filter = `blur(${outputBlurRadius * layerScale}px)`;
    blurredLayerContext.drawImage(auraLayer, 0, 0);
    blurredLayerContext.restore();

    const hasDottedStyle = blobsRef.current.some(
      (blob) => (blob.artStyle ?? artStyleRef.current) === "style-2",
    );
    const containsOrganicStyle = blobsRef.current.some(
      (blob) => (blob.artStyle ?? artStyleRef.current) !== "style-2",
    );
    paintArtworkBackground(outputContext, output.width, output.height);
    if (hasCompactedHistory && compactedHistory) {
      outputContext.save();
      outputContext.globalCompositeOperation = "source-over";
      outputContext.drawImage(compactedHistory, 0, 0, output.width, output.height);
      outputContext.restore();
    }
    if (hasCompactedHistory || (hasDottedStyle && containsOrganicStyle)) {
      drawChronologicalAuraLayers(
        outputContext,
        auraLayer,
        layerContext,
        pixelLayer,
        pixelContext,
        pixelAccentLayer,
        pixelAccentLayerContext,
        blurredAuraLayer,
        blurredLayerContext,
        blobsRef.current,
        output.width,
        output.height,
        performance.now(),
        replayProgress === undefined,
        artStyleRef.current,
        outputBlurRadius * layerScale,
        replayProgress,
        hasCompactedHistory,
      );
    } else if (hasDottedStyle) {
      drawDottedSigilFlowLayer(
        outputContext,
        blobsRef.current,
        output.width,
        output.height,
        performance.now(),
        replayProgress === undefined,
        artStyleRef.current,
        0,
        blobsRef.current.length,
        replayProgress,
      );
    } else {
      outputContext.save();
      outputContext.globalCompositeOperation = "source-over";
      outputContext.drawImage(blurredAuraLayer, 0, 0, output.width, output.height);
      outputContext.restore();
    }
    if (grainRef.current) {
      let grainPattern = exportGrainPatternsRef.current.get(output);
      if (!grainPattern) {
        grainPattern = outputContext.createPattern(grainRef.current, "repeat") ?? undefined;
        if (grainPattern) exportGrainPatternsRef.current.set(output, grainPattern);
      }
      if (grainPattern) drawGrainPattern(outputContext, output.width, output.height, grainPattern, 0.035);
    }
  }, []);

  const createExportCanvas = useCallback((replayProgress?: number, maximumDimension?: number) => {
    const sourceBounds = canvasRef.current?.getBoundingClientRect();
    const sourceWidth = Math.max(1, sourceBounds?.width ?? 1440);
    const sourceHeight = Math.max(1, sourceBounds?.height ?? 900);
    const maxDimension =
      maximumDimension ?? (replayProgress === undefined ? 1920 : blobsRef.current.length > 160 ? 960 : 1280);
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

    if (previewKind === "image" || reducedMotionRef.current || exportState === "gif") {
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
      if (event.key === "Escape" && exportState === "idle" && downloadFeedback === "idle") {
        closePreview();
      }
    };
    window.addEventListener("keydown", handlePreviewKeyDown);
    return () => window.removeEventListener("keydown", handlePreviewKeyDown);
  }, [closePreview, downloadFeedback, exportState, previewKind]);

  const downloadStill = useCallback(async () => {
    if (blobsRef.current.length === 0 || exportState !== "idle") return;
    setExportState("image");
    setDownloadFeedback("preparing");
    hapticFeedback("confirm");
    await waitForPaint();

    try {
      const output = previewCanvasRef.current ?? createExportCanvas();
      const blob = await canvasToBlob(output, "image/png");
      downloadBlob(blob, `${exportFileStem()}.png`);
      setExportState("idle");
      setDownloadFeedback("complete");
      hapticFeedback("success");
      await holdDownloadFeedback(DOWNLOAD_COMPLETE_HOLD);
      closePreview(null);
    } catch {
      setExportState("idle");
      setDownloadFeedback("error");
      hapticFeedback("error");
      await holdDownloadFeedback(1000);
      setDownloadFeedback("idle");
    }
  }, [closePreview, createExportCanvas, exportState, holdDownloadFeedback]);

  const downloadGif = useCallback(async () => {
    if (blobsRef.current.length === 0 || exportState !== "idle") return;

    setExportState("gif");
    setDownloadFeedback("preparing");
    hapticFeedback("confirm");
    await waitForPaint();

    try {
      // @ts-expect-error -- gifenc does not publish TypeScript declarations.
      const { GIFEncoder, quantize } = await import("gifenc");
      const preview = previewCanvasRef.current;
      const output = preview?.width && preview.height
        ? document.createElement("canvas")
        : createExportCanvas(0, GIF_MAX_DIMENSION);
      if (preview?.width && preview.height) {
        output.width = preview.width;
        output.height = preview.height;
      }
      const outputContext = output.getContext("2d", { alpha: false });
      if (!outputContext) throw new Error("Unable to prepare GIF canvas");
      const gif = GIFEncoder();
      const revealDuration = clamp(1800 + blobsRef.current.length * 75, 2800, 4800);
      const frameCount = Math.max(2, Math.ceil(revealDuration / GIF_FRAME_DELAY) + 1);
      renderArtwork(output, 1);
      const finalFrameRgba = outputContext.getImageData(0, 0, output.width, output.height).data;
      const globalPalette = quantize(finalFrameRgba, GIF_PALETTE_SIZE, {
        format: "rgb565",
        useSqrt: true,
      });
      const indexGifFrame = createGifPaletteIndexer(globalPalette);
      for (let frame = 0; frame < frameCount; frame += 1) {
        const replayProgress = frame / (frameCount - 1);
        renderArtwork(output, replayProgress);
        const rgba = outputContext.getImageData(0, 0, output.width, output.height).data;
        const indexedFrame = indexGifFrame(rgba);
        gif.writeFrame(indexedFrame, output.width, output.height, {
          palette: frame === 0 ? globalPalette : undefined,
          delay: frame === frameCount - 1 ? GIF_HOLD_DURATION : GIF_FRAME_DELAY,
          repeat: 0,
        });
        if (frame % 4 === 3) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
      }
      gif.finish();
      const encodedBytes = Uint8Array.from(gif.bytes());
      const animatedGif = new Blob([encodedBytes], { type: "image/gif" });
      downloadBlob(animatedGif, `${exportFileStem()}.gif`);
      setExportState("idle");
      setDownloadFeedback("complete");
      hapticFeedback("success");
      await holdDownloadFeedback(DOWNLOAD_COMPLETE_HOLD);
      closePreview(null);
    } catch {
      setExportState("idle");
      setDownloadFeedback("error");
      hapticFeedback("error");
      await holdDownloadFeedback(1000);
      setDownloadFeedback("idle");
    } finally {
      setExportState("idle");
    }
  }, [closePreview, createExportCanvas, exportState, holdDownloadFeedback, renderArtwork]);

  const shiftOctave = useCallback((direction: -1 | 1) => {
    releaseAllToneNotes();
    setActiveKeys(new Set());
    setOctave((current) => clamp(current + direction, MIN_OCTAVE, MAX_OCTAVE));
  }, [releaseAllToneNotes]);

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
      if (
        previewKind ||
        microphonePromptOpen ||
        event.metaKey ||
        event.altKey ||
        event.ctrlKey ||
        event.repeat
      ) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, .microphone-mode-dial")
      ) {
        return;
      }
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      cycleSoundMode(event.key === "ArrowUp" ? -1 : 1);
    };
    window.addEventListener("keydown", handleModeKeyboard);
    return () => window.removeEventListener("keydown", handleModeKeyboard);
  }, [cycleSoundMode, microphonePromptOpen, previewKind]);

  const resetAura = useCallback(() => {
    disposeToneEngine();
    releaseTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    releaseTimersRef.current.clear();
    blobsRef.current = [];
    blobIdRef.current = 1;
    noteRepeatRef.current.clear();
    artStyleLayerCountRef.current = {
      aura: 0,
      "style-2": 0,
      "style-3": 0,
      "style-4": 0,
    };
    colorRebuildLayersRef.current = 0;
    additiveLayerStartRef.current = 0;
    resetRendererRef.current?.();

    const microphone = microphoneRef.current;
    if (microphone && microphone.stream.active && microphone.context.state !== "closed") {
      microphone.lastAnalysisAt = -Infinity;
      microphone.lastVisualAt = -Infinity;
      window.cancelAnimationFrame(microphone.animationFrame);
      microphone.animationFrame = window.requestAnimationFrame(microphone.analyze);
      if (microphone.context.state !== "running") {
        void microphone.context.resume().catch(() => undefined);
      }
    }

    if (resetFrameRef.current !== null) window.cancelAnimationFrame(resetFrameRef.current);
    setResetting(true);
    setLayerCount(0);
    setActiveKeys(new Set());
    setOctave(BASE_OCTAVE);
    wakeRendererRef.current?.();
    resetFrameRef.current = window.requestAnimationFrame(() => {
      resetFrameRef.current = null;
      setResetting(false);
    });
  }, [disposeToneEngine]);

  const selectArtStyleByIndex = useCallback(
    (nextIndex: number) => {
      const nextStyle = ART_STYLE_SLOTS[nextIndex];
      if (!nextStyle || nextStyle.id === artStyleRef.current) return;
      // The renderer reads this ref directly, so update it before React's next render.
      artStyleRef.current = nextStyle.id;
      setArtStyle(nextStyle.id);
      wakeRendererRef.current?.();
      hapticFeedback("confirm");
    },
    [],
  );

  const enterFullscreenView = useCallback(() => {
    if (layerCount === 0 || exportState !== "idle") return;
    fullscreenButtonRef.current?.blur();
    setShortcutGuideVersion(0);
    setInterfaceHidden(true);
    hapticFeedback("open");
  }, [exportState, layerCount]);

  useEffect(() => {
    const handleFeatureShortcut = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.metaKey ||
        event.altKey ||
        event.ctrlKey ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const run = (action: () => void) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        action();
      };

      if (previewKind) return;

      if (microphonePromptOpen) return;

      if (event.key === "?" && window.matchMedia("(min-width: 1101px)").matches) {
        run(() => setShortcutGuideVersion((current) => current + 1));
      } else if (key === "r") {
        run(resetAura);
      } else if (event.key === "T") {
        run(() => {
          setTelemetry((current) => !current);
          hapticFeedback("confirm");
        });
      } else if (/^[1-4]$/.test(key)) {
        run(() => selectArtStyleByIndex(Number(key) - 1));
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        run(() => cycleSoundMode(event.key === "ArrowUp" ? -1 : 1));
      } else if (event.shiftKey && key === "d") {
        if (systemAudioState !== "unsupported") run(toggleSystemAudio);
      } else if (key === "m") {
        if (microphoneState !== "unsupported") run(toggleMicrophone);
      } else if (event.shiftKey && key === "f") {
        if (interfaceHidden) {
          run(() => {
            setInterfaceHidden(false);
            setShortcutGuideVersion(0);
            window.requestAnimationFrame(() =>
              fullscreenButtonRef.current?.focus({ preventScroll: true }),
            );
          });
        } else if (layerCount > 0 && exportState === "idle") {
          run(enterFullscreenView);
        }
      } else if (event.key === "P") {
        if (layerCount > 0 && exportState === "idle") run(() => openPreview("image"));
      } else if (key === "v") {
        if (layerCount > 0 && exportState === "idle") run(() => openPreview("gif"));
      }
    };

    window.addEventListener("keydown", handleFeatureShortcut, true);
    return () => window.removeEventListener("keydown", handleFeatureShortcut, true);
  }, [
    cycleSoundMode,
    enterFullscreenView,
    exportState,
    interfaceHidden,
    layerCount,
    microphonePromptOpen,
    microphoneState,
    openPreview,
    previewKind,
    resetAura,
    selectArtStyleByIndex,
    systemAudioState,
    toggleMicrophone,
    toggleSystemAudio,
  ]);

  const activeSoundMode = SOUND_MODES.find(({ id }) => id === soundMode) ?? SOUND_MODES[0];
  const activeMicrophoneMode =
    MICROPHONE_MODES.find(({ id }) => id === microphoneMode) ?? MICROPHONE_MODES[0];
  const activeArtStyle =
    ART_STYLE_SLOTS.find(({ id }) => id === artStyle) ?? ART_STYLE_SLOTS[0];
  const microphoneLabel =
    microphoneState === "listening"
      ? `Stop microphone listening, detecting ${microphoneReading}`
      : microphoneState === "requesting"
        ? "Cancel microphone request"
        : microphonePromptOpen && permissionPromptSource === "microphone"
          ? "Close microphone setup"
        : microphoneState === "error"
          ? "Retry microphone listening"
          : microphoneState === "unsupported"
            ? "Microphone listening is unsupported"
            : "Start microphone listening";
  const systemAudioActive = systemAudioState === "listening" || systemAudioState === "requesting";
  const externalInputActive =
    externalInputState === "listening" || externalInputState === "requesting";
  const fixedAudioInputActive = systemAudioActive || externalInputActive;
  const systemAudioLabel =
    systemAudioState === "listening"
      ? `Stop device audio listening, detecting ${microphoneReading}`
      : systemAudioState === "requesting"
        ? "Cancel device audio request"
        : microphonePromptOpen && permissionPromptSource === "system"
          ? "Close device audio setup"
        : systemAudioState === "error"
          ? "Retry device audio capture"
          : systemAudioState === "unsupported"
            ? "Device audio capture is unsupported"
            : "Start device audio capture; choose the browser tab playing audio";
  const externalInputLabel =
    externalInputState === "listening"
      ? `Stop external input, detecting ${microphoneReading}`
      : externalInputState === "requesting"
        ? "Cancel external input request"
        : microphonePromptOpen && permissionPromptSource === "external"
          ? "Close external input setup"
        : externalInputState === "error"
          ? "Retry external instrument input"
          : externalInputState === "unsupported"
            ? "External instrument input is unsupported"
            : "Connect an external instrument, audio interface, or MIDI device";
  const keyPresentation = (key: KeySpec) => {
    const note = shiftedNote(key);
    const isHarmony =
      key.hand === "left" && microphoneHarmonyPitchClasses.includes(note.pc);
    const isMelody = key.hand === "right" && microphoneMelodyPitchClass === note.pc;
    const isDetected = isHarmony || isMelody;
    const isBeat = isDetected && microphoneBeatPitchClasses.includes(note.pc);

    return {
      note,
      className: `piano-key ${key.kind === "white" ? "white-key" : "upper-key"} ${
        activeKeys.has(key.id) ? "is-active" : ""
      } ${isDetected ? "is-detected" : ""} ${isMelody ? "is-melody" : ""} ${
        isBeat ? "is-microphone-beat" : ""
      }`,
    };
  };

  return (
    <main
      className={`aura-page ${resetting ? "is-resetting" : ""} ${interfaceHidden ? "is-interface-hidden" : ""}`}
    >
      <canvas ref={canvasRef} className="aura-canvas" aria-hidden="true" />

      <section className="instrument-zone" aria-label="Aura instrument" aria-hidden={interfaceHidden}>
        <div className="instrument-cluster">
          <div className="instrument-body-frame">
            <div className="instrument-body">
            <div className="instrument-header">
            <button
              type="button"
              className="power-led reset-led"
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
              <span
                className="octave-indicator"
                role="status"
                aria-live="polite"
                aria-label={`Octave ${octave}`}
              >
                {Array.from({ length: MAX_OCTAVE - MIN_OCTAVE + 1 }, (_, index) => {
                  const indicatorOctave = MIN_OCTAVE + index;
                  return (
                    <span
                      key={indicatorOctave}
                      className={`octave-indicator-dot ${
                        indicatorOctave === octave ? "is-active" : ""
                      }`}
                      aria-hidden="true"
                    />
                  );
                })}
              </span>
              <button
                type="button"
                className="transport-button"
                aria-label="Shift piano octave down"
                title="Lower piano octave"
                disabled={octave === MIN_OCTAVE}
                onClick={() => shiftOctave(-1)}
              >
                <span className="filled-triangle is-left" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="transport-button"
                aria-label="Shift piano octave up"
                title="Raise piano octave"
                disabled={octave === MAX_OCTAVE}
                onClick={() => shiftOctave(1)}
              >
                <span className="filled-triangle is-right" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="keybed" data-octave={octave}>
            <div className="white-keys">
              {WHITE_KEYS.map((key) => {
                const { note, className } = keyPresentation(key);

                return (
                  <button
                    key={key.id}
                    type="button"
                    className={className}
                    data-hand={key.hand}
                    aria-label={note.name}
                    onPointerDown={(event) => handlePointerDown(event, key)}
                    onPointerUp={(event) => handlePointerEnd(event, key)}
                    onPointerCancel={(event) => handlePointerEnd(event, key)}
                    onLostPointerCapture={() => endKey(key)}
                  />
                );
              })}
            </div>

            {UPPER_KEYS.map((key) => {
              const { note, className } = keyPresentation(key);

              return (
                <div
                  key={key.id}
                  className="upper-key-slot"
                  data-hand={key.hand}
                  style={{
                    "--upper-left": `${(key.left ?? 0) * 100}%`,
                    "--mobile-upper-left": `${(key.left ?? 0) * 200}%`,
                  } as CSSProperties}
                >
                  <button
                    type="button"
                    className={className}
                    data-hand={key.hand}
                    aria-label={note.name}
                    onPointerDown={(event) => handlePointerDown(event, key)}
                    onPointerUp={(event) => handlePointerEnd(event, key)}
                    onPointerCancel={(event) => handlePointerEnd(event, key)}
                    onLostPointerCapture={() => endKey(key)}
                  />
                </div>
              );
            })}
          </div>
            </div>
          </div>
          <div className="art-style-bank-frame">
            <div className="art-style-bank">
              <div className="art-style-header">
                <div
                  className="mode-screen art-style-screen"
                  role="status"
                  aria-live="polite"
                  aria-label={`Aesthetic: ${activeArtStyle.label}`}
                >
                  <span className="mode-screen-glass" aria-hidden="true">
                    <span
                      className="mode-readout"
                    >
                      {activeArtStyle.label}
                    </span>
                  </span>
                </div>
                <button
                  type="button"
                  className={`power-led art-style-telemetry ${telemetry ? "is-active" : ""}`}
                  aria-label={`TouchDesigner overlay${telemetry ? ", on" : ", off"}`}
                  role="switch"
                  aria-checked={telemetry}
                  title="Toggle TouchDesigner overlay"
                  onClick={() => {
                    setTelemetry((current) => !current);
                    hapticFeedback("confirm");
                  }}
                />
              </div>
              <div id="art-style-grid" className="art-style-grid" role="group" aria-label="Art styles">
                {ART_STYLE_SLOTS.map((style, nextIndex) => {
                  const selected = style.id === artStyle;
                  const selectStyle = () => selectArtStyleByIndex(nextIndex);

                  return (
                    <button
                      key={style.id}
                      type="button"
                      className={`art-style-pad ${selected ? "is-active" : ""}`}
                      aria-label={`${style.label} art style${selected ? ", selected" : ""}`}
                      aria-pressed={selected}
                      title={style.label}
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        event.preventDefault();
                        selectStyle();
                      }}
                      onClick={(event) => {
                        // Pointer input already switches on press; retain click for keyboard use.
                        if (event.detail === 0) selectStyle();
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div
        className={`microphone-dock ${
          microphoneState === "listening" ||
          systemAudioState === "listening" ||
          externalInputState === "listening"
            ? "is-listening"
            : ""
        }`}
        aria-label="Audio input"
        aria-hidden={interfaceHidden}
      >
        <div className="audio-input-buttons" role="group" aria-label="Audio source">
          <button
            ref={systemAudioButtonRef}
            type="button"
            className={`export-button microphone-button system-audio-button is-${systemAudioState}`}
            aria-label={systemAudioLabel}
            aria-pressed={systemAudioState === "listening"}
            title="Device audio (Shift+D) — choose the browser tab playing audio"
            disabled={systemAudioState === "unsupported"}
            onClick={toggleSystemAudio}
          >
            <SolidControlIcon name="system-audio" size={15} />
          </button>
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
              <SolidControlIcon name="mic-off" size={15} />
            ) : (
              <SolidControlIcon name="mic" size={15} />
            )}
          </button>
          <button
            ref={externalInputButtonRef}
            type="button"
            className={`export-button microphone-button external-input-button is-${externalInputState}`}
            aria-label={externalInputLabel}
            aria-pressed={externalInputState === "listening"}
            title="External instrument, audio interface, or MIDI input"
            disabled={externalInputState === "unsupported"}
            onClick={toggleExternalInput}
          >
            <SolidControlIcon name="external-input" size={15} />
          </button>
        </div>
        <div
          className="mode-dial microphone-mode-dial"
          onWheel={(event) => {
            event.preventDefault();
            if (microphoneState === "unsupported" || fixedAudioInputActive) return;
            if (microphoneModeWheelTimerRef.current !== null || event.deltaY === 0) return;
            const direction = event.deltaY > 0 ? 1 : -1;
            cycleMicrophoneMode(direction);
            microphoneModeWheelTimerRef.current = window.setTimeout(() => {
              microphoneModeWheelTimerRef.current = null;
            }, 180);
          }}
        >
          <div
            className="mode-screen"
            role="status"
            aria-live="polite"
            aria-label={
              systemAudioActive
                ? "Audio source: Device Audio"
                : externalInputActive
                  ? "Audio source: External Input"
                : `Microphone mode: ${activeMicrophoneMode.title}`
            }
          >
            <span className="mode-screen-glass" aria-hidden="true">
              <span
                key={`${systemAudioActive ? "system" : externalInputActive ? "external" : microphoneMode}-${microphoneModeDirection}`}
                className={`mode-readout ${microphoneModeDirection > 0 ? "is-forward" : "is-backward"}`}
              >
                {systemAudioActive
                  ? "DEVICE AUDIO"
                  : externalInputActive
                    ? "EXTERNAL INPUT"
                    : activeMicrophoneMode.label}
              </span>
            </span>
            <div className="mode-stepper" aria-label="Microphone mode controls">
              <button
                type="button"
                className="mode-step-button"
                aria-label="Previous microphone mode"
                title="Previous microphone mode"
                disabled={microphoneState === "unsupported" || fixedAudioInputActive}
                onClick={() => cycleMicrophoneMode(-1)}
              >
                <span className="filled-triangle is-up" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="mode-step-button"
                aria-label="Next microphone mode"
                title="Next microphone mode"
                disabled={microphoneState === "unsupported" || fixedAudioInputActive}
                onClick={() => cycleMicrophoneMode(1)}
              >
                <span className="filled-triangle is-down" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
        <span className="sr-only" role="status" aria-live="polite">
          {systemAudioActive
            ? systemAudioState === "listening"
              ? microphoneReading
              : systemAudioLabel
            : externalInputActive
              ? externalInputState === "listening"
                ? microphoneReading
                : externalInputLabel
            : microphoneState === "listening"
              ? microphoneReading
              : microphoneLabel}
        </span>
      </div>

      {microphonePromptOpen ? (
        <div
          className={`microphone-permission-backdrop ${microphonePromptClosing ? "is-closing" : ""}`}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget && !microphonePromptClosing) {
              closeMicrophonePrompt();
            }
          }}
        >
          <section
            className={`microphone-permission ${
              permissionPromptSource === "system" ? "is-system-audio" : ""
            } ${
              permissionPromptSource === "external" ? "is-external-input" : ""
            } ${microphonePromptGranting ? "is-granting" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="audio-permission-title"
          >
            <header className="microphone-permission-header">
              <h2 id="audio-permission-title">
                {permissionPromptSource === "system"
                  ? "Device audio"
                  : permissionPromptSource === "external"
                    ? "External input"
                    : "Microphone"}
              </h2>
              <button
                type="button"
                className="preview-control dialog-close"
                aria-label={`Close ${
                  permissionPromptSource === "system"
                    ? "device audio"
                    : permissionPromptSource === "external"
                      ? "external input"
                      : "microphone"
                } setup`}
                title={`Close ${
                  permissionPromptSource === "system"
                    ? "device audio"
                    : permissionPromptSource === "external"
                      ? "external input"
                      : "microphone"
                } setup`}
                onClick={() => closeMicrophonePrompt()}
              >
                <SolidControlIcon name="close" />
              </button>
            </header>
            <div className="microphone-permission-screen">
              <div className="microphone-permission-content">
                <span
                  className={`microphone-permission-icon ${
                    permissionPromptSource === "system" ? "is-system-audio" : ""
                  } ${
                    permissionPromptSource === "external" ? "is-external-input" : ""
                  }`}
                  aria-hidden="true"
                >
                  <SolidControlIcon
                    name={
                      permissionPromptSource === "system"
                        ? "system-audio"
                        : permissionPromptSource === "external"
                          ? "external-input"
                          : "mic"
                    }
                    size={19}
                  />
                </span>
                <p>
                  {permissionPromptSource === "system"
                    ? "Aura listens locally to the browser tab you choose. Select the tab playing audio and keep Share tab audio turned on. Audio is never saved."
                    : permissionPromptSource === "external"
                      ? "Connect a MIDI instrument or USB audio device. Aura reads notes and audio locally; nothing is saved."
                      : "Aura listens locally to pitch, rhythm, and volume. Audio is never saved."}
                </p>
              </div>
            </div>
            <button
              ref={microphoneAllowRef}
              type="button"
              className={`microphone-permission-action ${microphonePromptGranting ? "is-confirming" : ""}`}
              onClick={() => {
                const inputSource = permissionPromptSource;
                if (inputSource === "system") {
                  systemAudioIntroductionShownRef.current = true;
                  rememberSessionFlag(SYSTEM_AUDIO_INTRO_SESSION_KEY);
                }
                else if (inputSource === "external") externalInputIntroductionShownRef.current = true;
                else microphoneIntroductionShownRef.current = true;
                setMicrophonePromptGranting(true);
                hapticFeedback("confirm");
                if (inputSource === "system") {
                  // Display capture requires transient user activation. Start it in this click
                  // rather than after the permission panel's closing animation.
                  void startAudioInput(inputSource);
                  closeMicrophonePrompt(undefined, null);
                  return;
                }
                closeMicrophonePrompt(
                  () =>
                    inputSource === "external"
                      ? void startExternalInput()
                      : void startAudioInput(inputSource),
                  null,
                );
              }}
            >
              {permissionPromptSource === "system"
                ? "Continue to device audio"
                : permissionPromptSource === "external"
                  ? "Connect external input"
                  : "Allow microphone"}
            </button>
          </section>
        </div>
      ) : null}

      <div
        className={`export-dock ${layerCount > 0 ? "is-ready" : ""}`}
        aria-label="Export visual"
        aria-hidden={interfaceHidden}
      >
        <button
          ref={fullscreenButtonRef}
          type="button"
          className="export-button"
          aria-label="Hide interface for fullscreen view"
          title="Fullscreen view (Shift+F)"
          disabled={layerCount === 0 || exportState !== "idle"}
          onClick={enterFullscreenView}
        >
          <SolidControlIcon name="fullscreen" size={15} />
        </button>
        <button
          ref={imagePreviewButtonRef}
          type="button"
          className="export-button"
          aria-label="Preview visual as PNG"
          title="Preview PNG"
          disabled={layerCount === 0 || exportState !== "idle"}
          onClick={() => openPreview("image")}
        >
          <SolidControlIcon name="image" size={15} />
        </button>
        <button
          ref={gifPreviewButtonRef}
          type="button"
          className={`export-button ${exportState === "gif" ? "is-exporting" : ""}`}
          aria-label={exportState === "gif" ? "Rendering GIF" : "Preview visual as GIF"}
          title={exportState === "gif" ? "Rendering GIF" : "Preview animated GIF"}
          disabled={layerCount === 0 || exportState !== "idle"}
          onClick={() => openPreview("gif")}
        >
          <SolidControlIcon name="video" size={15} />
        </button>
        <span className="sr-only" aria-live="polite">
          {exportState === "gif" ? "Rendering Aura GIF" : ""}
        </span>
      </div>

      {interfaceHidden && shortcutGuideVersion === 0 ? (
        <div className="interface-hidden-hint" role="status" aria-live="polite">
          <span>Esc returns the interface</span>
          <span className="interface-hidden-hint-divider" aria-hidden="true">|</span>
          <span>? shows shortcuts</span>
        </div>
      ) : null}

      {interfaceHidden ? (
        <div className="interface-hidden-mobile-actions" aria-label="Fullscreen controls">
          <button
            type="button"
            className="interface-hidden-mobile-action"
            aria-label="Show interface controls"
            title="Restore interface"
            onClick={() => {
              setInterfaceHidden(false);
              setShortcutGuideVersion(0);
              hapticFeedback("open");
            }}
          >
            <SolidControlIcon name="exit-fullscreen" size={15} />
          </button>
        </div>
      ) : null}

      {shortcutGuideVersion > 0 ? (
        <div
          key={shortcutGuideVersion}
          className="presentation-shortcut-guide"
          role="status"
          aria-live="polite"
          onAnimationEnd={() => setShortcutGuideVersion(0)}
        >
          <span className="presentation-shortcut-guide-glass">
            <span><kbd>R</kbd> Reset</span>
            <span><kbd>↑ ↓</kbd> Sound</span>
            <span><kbd>1–4</kbd> Style</span>
            <span><kbd>⇧ T</kbd> TouchDesigner</span>
            <span><kbd>⇧ D</kbd> Device audio</span>
            <span><kbd>M</kbd> Microphone</span>
            <span><kbd>⇧ P</kbd> Photo</span>
            <span><kbd>V</kbd> GIF</span>
            <span><kbd>⇧ F</kbd> Fullscreen</span>
          </span>
        </div>
      ) : null}

      {previewKind ? (
        <div
          className={`export-preview-backdrop ${previewClosing ? "is-closing" : ""}`}
          onPointerDown={(event) => {
            if (
              event.target === event.currentTarget &&
              exportState === "idle" &&
              downloadFeedback === "idle" &&
              !previewClosing
            ) closePreview();
          }}
        >
          <section
            className={`export-preview ${downloadFeedback !== "idle" ? "is-processing" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={previewKind === "image" ? "Image export preview" : "GIF export preview"}
          >
            <header className="export-preview-header">
              <span className="export-preview-label">{previewKind === "image" ? "Still" : "Motion"}</span>
              <div className="export-preview-actions">
                <button
                  ref={previewDownloadRef}
                  type="button"
                  className={`preview-control ${downloadFeedback === "preparing" ? "is-exporting" : ""}`}
                  aria-label={previewKind === "image" ? "Download PNG" : "Download animated GIF"}
                  title={previewKind === "image" ? "Download PNG" : "Download animated GIF"}
                  disabled={exportState !== "idle" || downloadFeedback !== "idle"}
                  onClick={() => {
                    if (previewKind === "image") void downloadStill();
                    else void downloadGif();
                  }}
                >
                  <SolidControlIcon name="download" size={15} />
                </button>
                <button
                  type="button"
                  className="preview-control dialog-close"
                  aria-label="Close export preview"
                  title="Close preview"
                  disabled={exportState !== "idle" || downloadFeedback !== "idle"}
                  onClick={() => closePreview()}
                >
                  <SolidControlIcon name="close" />
                </button>
              </div>
            </header>
            <div className="export-preview-screen">
              <canvas ref={previewCanvasRef} aria-label="Artwork to be saved" />
              {downloadFeedback !== "idle" ? (
                <div
                  className={`export-feedback is-${downloadFeedback}`}
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <span className="export-feedback-icon" aria-hidden="true">
                    <SolidControlIcon
                      name={
                        downloadFeedback === "complete"
                          ? "check"
                          : downloadFeedback === "error"
                            ? "close"
                            : "download"
                      }
                      size={16}
                    />
                  </span>
                  <span className="export-feedback-label">
                    {downloadFeedback === "complete"
                      ? "Saved"
                      : downloadFeedback === "error"
                        ? "Try again"
                        : previewKind === "image"
                          ? "Preparing image"
                          : "Encoding GIF"}
                  </span>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
