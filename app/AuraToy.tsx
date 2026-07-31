"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

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
  word: string;
  seedHash: number;
  seedId: string;
  letters: Color[];
  pitches: Color[];
  letterNotes: NoteChoice[];
};

type BlobParticle = {
  id: number;
  color: Color;
  x: number;
  y: number;
  restX: number;
  restY: number;
  radius: number;
  velocity: number;
  softness: number;
  createdAt: number;
  life: number;
  phase: number;
};

type KeySpec = NoteChoice & {
  id: string;
  kind: "white" | "upper";
  left?: number;
};

const STORAGE_KEY = "aura.seed.v1";
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const MIN_MIDI = 48;
const MAX_MIDI = 83;
const SETTLE_DELAY = 800;
const SETTLE_DURATION = 1500;

const PENTATONIC_SCALE: NoteChoice[] = [
  midiToNote(60),
  midiToNote(62),
  midiToNote(64),
  midiToNote(67),
  midiToNote(69),
  midiToNote(72),
  midiToNote(74),
  midiToNote(76),
  midiToNote(79),
  midiToNote(81),
  midiToNote(84),
  midiToNote(86),
  midiToNote(88),
  midiToNote(91),
  midiToNote(93),
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

  for (let octave = 4; octave <= 5; octave += 1) {
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
        left: ((octave - 4) * 7 + afterWhite + 1) / 14,
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

function normalizeWord(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^a-z]/gi, "")
    .slice(0, 24)
    .toUpperCase();
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

function circularDistance(a: number, b: number) {
  const distance = Math.abs(a - b) % 360;
  return Math.min(distance, 360 - distance);
}

function shortestHueDelta(from: number, to: number) {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

function enforceNeighborSeparation(hue: number, previous: number | null, minDistance: number, rng: () => number) {
  if (previous === null || circularDistance(hue, previous) >= minDistance) {
    return hue;
  }

  const direction = rng() > 0.5 ? 1 : -1;
  const needed = minDistance - circularDistance(hue, previous);
  return modulo(hue + direction * (needed + 8 + rng() * 18), 360);
}

function biasedHue(index: number, randomHue: number, rng: () => number) {
  const bias: Record<number, { hue: number; weight: number }> = {
    0: { hue: 4, weight: 0.5 },
    8: { hue: 54, weight: 0.42 },
    14: { hue: 214, weight: 0.28 },
    24: { hue: 52, weight: 0.5 },
  };
  const target = bias[index];
  if (!target) return randomHue;

  const weight = target.weight + rng() * 0.14;
  return modulo(randomHue + shortestHueDelta(randomHue, target.hue) * weight, 360);
}

function createMapping(rawWord: string): Mapping {
  const word = normalizeWord(rawWord) || "AURA";
  const seedHash = fnv1a(word);
  const rng = mulberry32(seedHash);
  const seedId = seedHash.toString(36).toUpperCase().padStart(6, "0").slice(-6);
  const letters: Color[] = [];
  const pitches: Color[] = [];
  let previousHue: number | null = null;

  for (let index = 0; index < 26; index += 1) {
    const randomHue = rng() * 360;
    const hue = enforceNeighborSeparation(biasedHue(index, randomHue, rng), previousHue, 18, rng);
    const paleVowel = index === 8 || index === 14;
    const color = {
      h: hue,
      s: paleVowel ? 34 + rng() * 12 : 45 + rng() * 27,
      l: paleVowel ? 70 + rng() * 6 : 54 + rng() * 16,
    };
    letters.push(color);
    previousHue = hue;
  }

  previousHue = null;
  for (let index = 0; index < 12; index += 1) {
    const hue = enforceNeighborSeparation(rng() * 360, previousHue, 24, rng);
    pitches.push({
      h: hue,
      s: 48 + rng() * 22,
      l: 56 + rng() * 12,
    });
    previousHue = hue;
  }

  const offset = seedHash % PENTATONIC_SCALE.length;
  const letterNotes = Array.from({ length: 26 }, (_, index) => {
    const note = PENTATONIC_SCALE[(index + offset) % PENTATONIC_SCALE.length];
    return { ...note };
  });

  return {
    word,
    seedHash,
    seedId,
    letters,
    pitches,
    letterNotes,
  };
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

function easeInOut(value: number) {
  const x = clamp(value, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function makeNoiseTile(size: number, alpha = 18) {
  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;
  const tileContext = tile.getContext("2d");
  if (!tileContext) return tile;
  const image = tileContext.createImageData(size, size);
  for (let index = 0; index < image.data.length; index += 4) {
    const value = Math.random() * 255;
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
    image.data[index + 3] = Math.random() * alpha;
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

function drawTrackedText(
  context: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  tracking: number,
) {
  const characters = text.split("");
  const width =
    characters.reduce((total, character) => total + context.measureText(character).width, 0) +
    tracking * Math.max(0, characters.length - 1);
  let x = centerX - width / 2;

  characters.forEach((character) => {
    context.fillText(character, x, y);
    x += context.measureText(character).width + tracking;
  });
}

export function AuraToy() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const blobsRef = useRef<BlobParticle[]>([]);
  const mappingRef = useRef<Mapping | null>(null);
  const seedWordRef = useRef("");
  const lastNoteAtRef = useRef(0);
  const settleStartRef = useRef<number | null>(null);
  const frozenAtRef = useRef<number | null>(null);
  const blobIdRef = useRef(1);
  const noteOrderRef = useRef(0);
  const grainRef = useRef<HTMLCanvasElement | null>(null);
  const reducedMotionRef = useRef(false);
  const toneRef = useRef<{
    module: any;
    synth: any;
    reverb: any;
    ready: Promise<void> | null;
  }>({
    module: null,
    synth: null,
    reverb: null,
    ready: null,
  });
  const activeToneNotesRef = useRef<Map<string, string>>(new Map());
  const keyHistoryRef = useRef<string[]>([]);

  const [entryValue, setEntryValue] = useState("");
  const [committed, setCommitted] = useState(false);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [canSave, setCanSave] = useState(false);
  const [activeKeys, setActiveKeys] = useState<Set<string>>(() => new Set());
  const [transpose, setTranspose] = useState(0);

  const keyboardMap = useMemo(() => {
    const allKeys = [...WHITE_KEYS, ...UPPER_KEYS].sort((a, b) => a.midi - b.midi);
    return new Map(KEYBOARD_ORDER.map((key, index) => [key, allKeys[index]]).filter(([, key]) => Boolean(key)));
  }, []);

  useEffect(() => {
    mappingRef.current = mapping;
    seedWordRef.current = mapping?.word ?? "";
  }, [mapping]);

  useEffect(() => {
    const storedSeed = window.localStorage.getItem(STORAGE_KEY);
    const normalized = storedSeed ? normalizeWord(storedSeed) : "";

    if (normalized) {
      const storedMapping = createMapping(normalized);
      setMapping(storedMapping);
      setCommitted(true);
      seedWordRef.current = normalized;
      mappingRef.current = storedMapping;
    } else {
      inputRef.current?.focus({ preventScroll: true });
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = media.matches;
    const updateMotion = () => {
      reducedMotionRef.current = media.matches;
    };
    media.addEventListener("change", updateMotion);
    return () => media.removeEventListener("change", updateMotion);
  }, []);

  const ensureTone = useCallback(async () => {
    if (!toneRef.current.ready) {
      toneRef.current.ready = (async () => {
        const Tone = await import("tone");
        await Tone.start();
        const reverb = new Tone.Reverb({
          decay: 4.8,
          preDelay: 0.02,
          wet: 0.24,
        });
        await reverb.generate();
        const synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "sine" },
          envelope: {
            attack: 0.04,
            decay: 0.22,
            sustain: 0.42,
            release: 1.2,
          },
          volume: -9,
        }).connect(reverb);
        reverb.toDestination();
        toneRef.current.module = Tone;
        toneRef.current.synth = synth;
        toneRef.current.reverb = reverb;
      })();
    }

    await toneRef.current.ready;
  }, []);

  const triggerAttackRelease = useCallback(
    (noteName: string, velocity: number, duration = "8n") => {
      void ensureTone()
        .then(() => {
          toneRef.current.synth?.triggerAttackRelease(noteName, duration, undefined, velocity);
        })
        .catch(() => undefined);
    },
    [ensureTone],
  );

  const triggerAttack = useCallback(
    (keyId: string, noteName: string, velocity: number) => {
      void ensureTone()
        .then(() => {
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

    const seed = fnv1a(`${seedWordRef.current || "AURA"}-${note.name}-${id}`);
    const rng = mulberry32(seed);
    const order = noteOrderRef.current;
    noteOrderRef.current += 1;
    const pitchNorm = clamp((note.midi - MIN_MIDI) / (MAX_MIDI - MIN_MIDI), 0, 1);
    const orderPosition = (order % 17) / 16;
    const x = clamp(0.17 + orderPosition * 0.66 + (rng() - 0.5) * 0.1, 0.08, 0.92);
    const y = clamp(0.14 + (1 - pitchNorm) * 0.46 + (rng() - 0.5) * 0.045, 0.08, 0.66);
    const radius = lerp(0.17, 0.065, pitchNorm) * (0.94 + velocity * 0.12);

    blobsRef.current.push({
      id,
      color,
      x,
      y,
      restX: lerp(x, 0.5, 0.42) + (rng() - 0.5) * 0.035,
      restY: y + (rng() - 0.5) * 0.03,
      radius,
      velocity,
      softness: 0.72 + rng() * 0.24,
      createdAt: now,
      life: 6.2 + rng() * 1.8,
      phase: rng() * Math.PI * 2,
    });

    lastNoteAtRef.current = now;
    settleStartRef.current = null;
    frozenAtRef.current = null;
    setCanSave(false);
  }, []);

  const playLetter = useCallback(
    (letter: string, liveMapping: Mapping, index: number) => {
      const letterIndex = LETTERS.indexOf(letter.toUpperCase());
      if (letterIndex < 0) return;
      const note = liveMapping.letterNotes[letterIndex];
      const color = liveMapping.letters[letterIndex];
      const velocity = 0.54 + ((liveMapping.seedHash + index * 37) % 34) / 100;

      window.setTimeout(() => {
        spawnBlob(note, color, velocity);
        triggerAttackRelease(note.name, velocity, "8n");
      }, index * 92);
    },
    [spawnBlob, triggerAttackRelease],
  );

  const commitSeed = useCallback(
    (value: string) => {
      const normalized = normalizeWord(value);
      if (!normalized || committed) return;
      const nextMapping = createMapping(normalized);
      window.localStorage.setItem(STORAGE_KEY, normalized);
      setMapping(nextMapping);
      setCommitted(true);
      setEntryValue("");
      mappingRef.current = nextMapping;
      seedWordRef.current = normalized;
    },
    [committed],
  );

  useEffect(() => {
    if (committed || !entryValue) return;
    const timeout = window.setTimeout(() => commitSeed(entryValue), 1100);
    return () => window.clearTimeout(timeout);
  }, [committed, commitSeed, entryValue]);

  const handleEntryChange = useCallback(
    (value: string) => {
      if (committed) return;
      const normalized = normalizeWord(value);
      const previous = entryValue;
      setEntryValue(normalized);

      if (!normalized) return;
      const liveMapping = createMapping(normalized);
      setMapping(liveMapping);

      if (normalized.length > previous.length) {
        normalized
          .slice(previous.length)
          .split("")
          .forEach((letter, offset) => playLetter(letter, liveMapping, offset));
      }
    },
    [committed, entryValue, playLetter],
  );

  const shiftedNote = useCallback(
    (key: KeySpec): NoteChoice => {
      const shifted = midiToNote(key.midi + transpose);
      return shifted;
    },
    [transpose],
  );

  const startKey = useCallback(
    (key: KeySpec, velocity = 0.76) => {
      const liveMapping = mappingRef.current;
      if (!liveMapping) return;
      const note = shiftedNote(key);
      const color = liveMapping.pitches[note.pc];
      spawnBlob(note, color, velocity);
      keyHistoryRef.current = [...keyHistoryRef.current, note.name].slice(-20);
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
      setActiveKeys((current) => {
        const next = new Set(current);
        next.delete(key.id);
        return next;
      });
      triggerRelease(key.id);
    },
    [triggerRelease],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, key: KeySpec) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      startKey(key, event.pointerType === "mouse" ? 0.72 : 0.82);
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
    if (!committed) return;

    const downKeys = new Set<string>();
    const handleKeyDown = (event: KeyboardEvent) => {
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
  }, [committed, endKey, keyboardMap, startKey]);

  const drawBlobLayer = useCallback((context: CanvasRenderingContext2D, width: number, height: number, now: number) => {
    const frozenAt = frozenAtRef.current;
    const settleStart = settleStartRef.current;
    const effectiveNow = frozenAt ?? now;
    const settleProgress = frozenAt
      ? 1
      : settleStart
        ? easeInOut((now - settleStart) / SETTLE_DURATION)
        : 0;
    const reducedMotion = reducedMotionRef.current;
    const shortSide = Math.min(width, height);

    context.save();
    context.globalCompositeOperation = "lighter";
    blobsRef.current.forEach((blob) => {
      const age = Math.max(0, (effectiveNow - blob.createdAt) / 1000);
      const alive = clamp(1 - age / blob.life, 0, 1);
      if (!frozenAt && alive <= 0.002) return;

      const arrival = easeOutCubic(age / 0.55);
      const drift = reducedMotion ? 0 : Math.min(0.2, age * 0.03) * (1 - settleProgress);
      const wobble = reducedMotion ? 0 : Math.sin(age * 0.55 + blob.phase) * 0.012 * (1 - settleProgress);
      const breathing = reducedMotion ? 0 : Math.cos(age * 0.38 + blob.phase) * 0.009 * (1 - settleProgress);
      const movingX = lerp(blob.x + wobble, 0.5, drift);
      const movingY = blob.y + breathing;
      const x = lerp(movingX, blob.restX, settleProgress);
      const y = lerp(movingY, blob.restY, settleProgress);
      const radius = blob.radius * shortSide * (0.42 + arrival * 0.58) * (1 + settleProgress * 0.08);
      const alpha = Math.pow(alive, 0.68) * (0.32 + blob.velocity * 0.58);
      const centerX = x * width;
      const centerY = y * height;
      const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
      const softMid = 0.42 + blob.softness * 0.18;

      gradient.addColorStop(0, colorToHslar(blob.color, alpha * 0.7));
      gradient.addColorStop(0.18, colorToHslar(blob.color, alpha * 0.42));
      gradient.addColorStop(softMid, colorToHslar(blob.color, alpha * 0.16));
      gradient.addColorStop(1, colorToHslar(blob.color, 0));

      context.fillStyle = gradient;
      context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
    });
    context.restore();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !context) return;

    const offscreen = document.createElement("canvas");
    const offscreenContext = offscreen.getContext("2d", { alpha: true });
    if (!offscreenContext) return;

    grainRef.current = makeNoiseTile(160, 20);
    let width = 1;
    let height = 1;
    let dpr = 1;
    let frame = 0;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      offscreen.width = Math.max(1, Math.round(width * 0.5));
      offscreen.height = Math.max(1, Math.round(height * 0.5));
    };

    const drawBreath = (now: number) => {
      if (blobsRef.current.length > 0) return;
      const pulse = reducedMotionRef.current ? 0.4 : 0.5 + Math.sin(now / 2200) * 0.5;
      const gradient = context.createRadialGradient(width * 0.5, height * 0.28, 0, width * 0.5, height * 0.28, width * 0.34);
      gradient.addColorStop(0, `rgba(255, 246, 222, ${0.045 + pulse * 0.018})`);
      gradient.addColorStop(0.54, "rgba(255, 217, 160, 0.025)");
      gradient.addColorStop(1, "rgba(241, 241, 243, 0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
    };

    const animate = (now: number) => {
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        resize();
      }

      const hasBlobs = blobsRef.current.length > 0;
      if (hasBlobs && lastNoteAtRef.current > 0 && !frozenAtRef.current) {
        const idleTime = now - lastNoteAtRef.current;
        if (idleTime > SETTLE_DELAY && !settleStartRef.current) {
          settleStartRef.current = now;
        }
        if (settleStartRef.current && now - settleStartRef.current >= SETTLE_DURATION) {
          frozenAtRef.current = now;
          setCanSave(true);
        }
      }

      context.clearRect(0, 0, width, height);
      drawBreath(now);

      offscreenContext.clearRect(0, 0, offscreen.width, offscreen.height);
      drawBlobLayer(offscreenContext, offscreen.width, offscreen.height, now);

      context.save();
      context.globalCompositeOperation = "lighter";
      context.filter = reducedMotionRef.current ? "blur(18px)" : "blur(28px)";
      context.drawImage(offscreen, 0, 0, width, height);
      context.restore();

      if (grainRef.current) {
        drawGrain(context, width, height, grainRef.current, 0.055);
      }

      if (!frozenAtRef.current) {
        blobsRef.current = blobsRef.current.filter((blob) => (now - blob.createdAt) / 1000 < blob.life + 1.2);
      }

      frame = window.requestAnimationFrame(animate);
    };

    resize();
    window.addEventListener("resize", resize);
    frame = window.requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(frame);
    };
  }, [drawBlobLayer]);

  const downloadAura = useCallback(() => {
    const liveMapping = mappingRef.current;
    if (!liveMapping) return;

    const width = 1080;
    const height = 1350;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = width;
    exportCanvas.height = height;
    const exportContext = exportCanvas.getContext("2d");
    const layer = document.createElement("canvas");
    layer.width = width;
    layer.height = height;
    const layerContext = layer.getContext("2d");
    if (!exportContext || !layerContext) return;

    exportContext.fillStyle = "#F1F1F3";
    exportContext.fillRect(0, 0, width, height);
    drawBlobLayer(layerContext, width, height, frozenAtRef.current ?? performance.now());
    exportContext.save();
    exportContext.globalCompositeOperation = "lighter";
    exportContext.filter = "blur(36px)";
    exportContext.drawImage(layer, 0, 0);
    exportContext.restore();

    drawGrain(exportContext, width, height, makeNoiseTile(260, 22), 0.06);

    const noteSequence = keyHistoryRef.current.length ? keyHistoryRef.current.slice(-14).join(" ") : liveMapping.word;
    const label = `${noteSequence.toUpperCase()}    SEED ${liveMapping.seedId}`;
    exportContext.save();
    exportContext.fillStyle = "#A8A8B0";
    exportContext.font = "500 18px Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    exportContext.textBaseline = "middle";
    drawTrackedText(exportContext, label, width / 2, height - 52, 2);
    exportContext.restore();

    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = `aura-${liveMapping.seedId}.png`;
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [drawBlobLayer]);

  const shiftOctave = useCallback((direction: -1 | 1) => {
    setTranspose((current) => clamp(current + direction * 12, -12, 12));
  }, []);

  const seedId = mapping?.seedId ?? "------";

  return (
    <main className={`aura-page ${committed ? "is-committed" : "is-entry"}`}>
      <canvas ref={canvasRef} className="aura-canvas" aria-hidden="true" />

      <div className={`seed-entry ${committed ? "is-hidden" : ""}`}>
        <input
          ref={inputRef}
          value={entryValue}
          aria-label="Seed word"
          spellCheck={false}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder=""
          size={Math.max(1, entryValue.length)}
          onChange={(event) => handleEntryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commitSeed(entryValue);
            }
          }}
        />
      </div>

      <section className="instrument-zone" aria-label="Aura instrument">
        <div className="instrument-body">
          <div className="instrument-header">
            <span className="power-led" aria-hidden="true" />
            <span className="device-label">K-07</span>
            <span className="header-rule" aria-hidden="true" />
            <span className="seed-id">SEED {seedId}</span>
            <div className="transport" aria-label="Octave controls">
              <button
                type="button"
                className="transport-button"
                aria-label="Shift octave down"
                onClick={() => shiftOctave(-1)}
              >
                <span className="triangle is-left" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="transport-button"
                aria-label="Shift octave up"
                onClick={() => shiftOctave(1)}
              >
                <span className="triangle is-right" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="keybed">
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
              <button
                key={key.id}
                type="button"
                className={`piano-key upper-key ${activeKeys.has(key.id) ? "is-active" : ""}`}
                style={{ "--upper-left": `${(key.left ?? 0) * 100}%` } as CSSProperties}
                aria-label={shiftedNote(key).name}
                onPointerDown={(event) => handlePointerDown(event, key)}
                onPointerUp={(event) => handlePointerEnd(event, key)}
                onPointerCancel={(event) => handlePointerEnd(event, key)}
                onLostPointerCapture={() => endKey(key)}
              />
            ))}
          </div>
        </div>

        <h1>Aura</h1>
        <button type="button" className={`save-aura ${canSave ? "is-visible" : ""}`} onClick={downloadAura}>
          Save aura
        </button>
      </section>
    </main>
  );
}
