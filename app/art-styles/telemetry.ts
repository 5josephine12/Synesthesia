/**
 * Spatial focus panels drawn on top of whichever art style is live. Distant
 * visualizations keep separate layers; nearby events reuse a panel and morph
 * its image, tracking box, connector, and metadata toward the new target.
 */

import { dottedSigilBounds } from "./style-2";

type TelemetryColor = {
  h: number;
  s: number;
  l: number;
};

export type TelemetryNode = {
  id: number;
  artStyle?: string;
  note: string;
  midi: number;
  velocity: number;
  color: TelemetryColor;
  shape: string;
  repeat: number;
  x: number;
  y: number;
  radius: number;
  angle: number;
  stretch: number;
  thickness: number;
  curvature: number;
  softness: number;
  createdAt: number;
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type VisualizationFrame = Rect & {
  centerX: number;
  centerY: number;
  halfWidth: number;
  halfHeight: number;
  angle: number;
};

type PanelMetrics = {
  width: number;
  height: number;
  previewWidth: number;
  previewHeight: number;
  dataWidth: number;
};

type PanelPlacement = Rect & {
  side: "left" | "right" | "top" | "bottom";
};

type PanelPose = {
  viewport: Rect;
  metadataX: number;
  metadataY: number;
  dockX: number;
  dockY: number;
};

type FocusPresentation = {
  node: TelemetryNode;
  chord: string | null;
  frame: VisualizationFrame;
  pose: PanelPose;
};

type OverlayMorphState = {
  targetKey: string;
  from: FocusPresentation;
  to: FocusPresentation;
  startedAt: number;
  duration: number;
  sessionStartedAt: number;
  width: number;
  height: number;
};

/** Canvas tracking is well supported but still missing from some lib.dom builds. */
type TrackedContext = CanvasRenderingContext2D & { letterSpacing?: string };

const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Notes struck inside this window read as one chord rather than a melody. */
const CHORD_WINDOW_MS = 190;

const VISUAL_ARRIVAL_MS = 550;
const ENTER_MS = 680;
const HOLD_MS = 4300;
const EXIT_MS = 1000;
const LIFETIME_MS = ENTER_MS + HOLD_MS + EXIT_MS;
const MORPH_MS = 1280;
const ENTRY_MORPH_MS = 920;
const DISTANT_MORPH_MS = 1560;

const MAX_PANELS = 3;
const MORPH_PROXIMITY_MIN = 68;
const MORPH_PROXIMITY_MAX = 124;
const DATA_GAP = 10;
const PANEL_GAP = 62;
const PANEL_COLLISION_GAP = 18;
const FRAME_PADDING = 7;
const SNAPSHOT_WIDTH = 192;
const SNAPSHOT_HEIGHT = 192;
const SNAPSHOT_FRAME_INTERVAL = 1000 / 15;

const HUD_ACCENT = "232, 234, 236";
const HUD_GLOW = "255, 255, 255";

let snapshotStrip: HTMLCanvasElement | null = null;
let lastSnapshotAt = Number.NEGATIVE_INFINITY;
let lastSnapshotKey = "";
let morphStates: OverlayMorphState[] = [];
let processedNodeKeys = new Set<string>();
let cachedChordLabels = new Map<number, string | null>();
let cachedChordFirstId = -1;
let cachedChordLastId = -1;
let cachedChordNodeCount = -1;

const CHORD_SHAPES: readonly { readonly intervals: readonly number[]; readonly suffix: string }[] = [
  { intervals: [0, 4, 7], suffix: "" },
  { intervals: [0, 3, 7], suffix: "m" },
  { intervals: [0, 3, 6], suffix: "dim" },
  { intervals: [0, 4, 8], suffix: "aug" },
  { intervals: [0, 2, 7], suffix: "sus2" },
  { intervals: [0, 5, 7], suffix: "sus4" },
  { intervals: [0, 4, 7, 11], suffix: "maj7" },
  { intervals: [0, 4, 7, 10], suffix: "7" },
  { intervals: [0, 3, 7, 10], suffix: "m7" },
  { intervals: [0, 3, 6, 10], suffix: "m7b5" },
  { intervals: [0, 3, 6, 9], suffix: "dim7" },
  { intervals: [0, 4, 7, 9], suffix: "6" },
  { intervals: [0, 3, 7, 9], suffix: "m6" },
  { intervals: [0, 2, 4, 7], suffix: "add9" },
  { intervals: [0, 2, 3, 7], suffix: "madd9" },
  { intervals: [0, 4, 7, 11, 2], suffix: "maj9" },
  { intervals: [0, 4, 7, 10, 2], suffix: "9" },
  { intervals: [0, 3, 7, 10, 2], suffix: "m9" },
];

const INTERVAL_NAMES = ["P1", "m2", "M2", "m3", "M3", "P4", "TT", "P5", "m6", "M6", "m7", "M7"];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function easeOutCubic(value: number) {
  const clamped = clamp(value, 0, 1);
  return 1 - Math.pow(1 - clamped, 3);
}

function easeInOutCubic(value: number) {
  const clamped = clamp(value, 0, 1);
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

/** Zero velocity at both ends keeps consecutive panel handoffs from snapping. */
function smootherStep(value: number) {
  const clamped = clamp(value, 0, 1);
  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

function pitchClass(midi: number) {
  return ((midi % 12) + 12) % 12;
}

function midiToFrequency(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function sameSet(first: readonly number[], second: readonly number[]) {
  if (first.length !== second.length) return false;
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false;
  }
  return true;
}

/** Names a simultaneous group of notes; returns null for a single note. */
export function nameChord(midiNotes: readonly number[]): string | null {
  const unique = Array.from(new Set(midiNotes.map(pitchClass))).sort((a, b) => a - b);
  if (unique.length < 2) return null;

  const lowest = pitchClass(Math.min(...midiNotes));
  if (unique.length === 2) {
    const other = unique[0] === lowest ? unique[1] : unique[0];
    return `${PITCH_NAMES[lowest]} ${INTERVAL_NAMES[((other - lowest) + 12) % 12]}`;
  }

  for (const root of unique) {
    const intervals = unique.map((value) => ((value - root) + 12) % 12).sort((a, b) => a - b);
    for (const shape of CHORD_SHAPES) {
      const normalized = Array.from(new Set(shape.intervals.map((value) => value % 12))).sort((a, b) => a - b);
      if (sameSet(intervals, normalized)) return `${PITCH_NAMES[root]}${shape.suffix}`;
    }
  }

  // Dense, unrecognized note clusters do not become a wall of text.
  return null;
}

/**
 * Splits nodes into chord groups by strike time so a panel can report the
 * harmony a shape belongs to rather than its note alone.
 */
function chordLabels(nodes: readonly TelemetryNode[]) {
  const labels = new Map<number, string | null>();
  let groupStart = 0;

  for (let index = 1; index <= nodes.length; index += 1) {
    const boundary =
      index === nodes.length || nodes[index].createdAt - nodes[index - 1].createdAt > CHORD_WINDOW_MS;
    if (!boundary) continue;

    const group = nodes.slice(groupStart, index);
    const label = nameChord(group.map((node) => node.midi));
    for (const node of group) labels.set(node.id, label);
    groupStart = index;
  }

  return labels;
}

function chordLabelsForActiveNodes(nodes: readonly TelemetryNode[]) {
  const firstId = nodes[0]?.id ?? -1;
  const lastId = nodes.at(-1)?.id ?? -1;
  if (
    firstId !== cachedChordFirstId ||
    lastId !== cachedChordLastId ||
    nodes.length !== cachedChordNodeCount
  ) {
    cachedChordLabels = chordLabels(nodes);
    cachedChordFirstId = firstId;
    cachedChordLastId = lastId;
    cachedChordNodeCount = nodes.length;
  }
  return cachedChordLabels;
}

function accentColor(_color: TelemetryColor, alpha: number) {
  return `rgba(${HUD_ACCENT}, ${alpha})`;
}

function glowColor(alpha: number) {
  return `rgba(${HUD_GLOW}, ${alpha})`;
}

function visualArrival(age: number) {
  return 0.46 + easeOutCubic(age / VISUAL_ARRIVAL_MS) * 0.54;
}

function auraLocalSize(node: TelemetryNode, radius: number) {
  const washWidth = radius * (1.1 + Math.min(node.stretch, 5.2) * 0.48);
  const washHeight = radius * (0.92 + node.thickness * 0.9 + node.softness * 0.34);
  let width = washWidth;
  let height = washHeight;

  switch (node.shape) {
    case "bloom":
      width = Math.max(width, radius * 2 * node.stretch);
      height = Math.max(height, radius * 2);
      break;
    case "ribbon": {
      const stroke = radius * (0.22 + node.thickness * 0.52);
      width = Math.max(width, radius * node.stretch + stroke);
      height = Math.max(height, Math.abs(radius * node.curvature) * 1.5 + stroke);
      break;
    }
    case "beam":
      width = Math.max(width, radius * node.stretch);
      height = Math.max(height, radius * (0.24 + node.thickness * 0.5));
      break;
    case "arc": {
      const stroke = radius * (0.16 + node.thickness * 0.34);
      width = Math.max(width, radius * 2 * node.stretch + stroke);
      height = Math.max(height, radius * 2 + stroke);
      break;
    }
    case "prism":
      width = Math.max(width, radius * node.stretch);
      height = Math.max(height, radius * (0.7 + node.thickness * 0.9));
      break;
    case "veil":
      width = Math.max(width, radius * node.stretch * 1.45);
      height = Math.max(height, radius * (1.1 + node.thickness * 1.5));
      break;
    case "wave": {
      const line = radius * (0.11 + node.thickness * 0.08);
      const amplitude = radius * (0.22 + node.thickness * 0.48);
      width = Math.max(width, radius * node.stretch * 1.3 + line);
      height = Math.max(height, (amplitude + radius * 0.18 + line) * 2);
      break;
    }
    case "halo": {
      const outer = radius * 0.96;
      width = Math.max(width, outer * (1.15 + node.stretch * 0.3) * 2);
      height = Math.max(height, outer * (0.74 + node.thickness * 0.25) * 2);
      break;
    }
    case "flare": {
      const outer = radius * 1.3 * (0.72 + node.stretch * 0.2);
      width = Math.max(width, outer * 2);
      height = Math.max(height, outer * 2);
      break;
    }
    case "mesh": {
      const length = radius * node.stretch * 1.15;
      const meshHeight = radius * (0.8 + node.thickness * 0.9);
      const lobeWidth = radius * 0.43;
      const lobeHeight = radius * (0.56 + node.thickness * 0.28);
      width = Math.max(width, length + lobeWidth);
      height = Math.max(height, meshHeight * 0.44 + lobeHeight);
      break;
    }
  }

  // The live render adds shadow and a slight blur around every particle.
  const glow = radius * (0.12 + node.softness * 0.08) + 4;
  return { width: width + glow * 2, height: height + glow * 2 };
}

function visualizationFrame(
  node: TelemetryNode,
  width: number,
  height: number,
  shortSide: number,
  age: number,
  artStyle: string,
): VisualizationFrame {
  const nodeArtStyle = node.artStyle ?? artStyle;
  const radius = node.radius * shortSide * visualArrival(age);
  let localWidth: number;
  let localHeight: number;

  if (nodeArtStyle === "style-2") {
    const bounds = dottedSigilBounds(radius, node.stretch);
    const glow = Math.max(3, radius * 0.12);
    localWidth = bounds.width + glow * 2;
    localHeight = bounds.height + glow * 2;
  } else {
    const bounds = auraLocalSize(node, radius);
    localWidth = bounds.width;
    localHeight = bounds.height;
  }

  const halfWidth = Math.max(14, localWidth / 2 + FRAME_PADDING);
  const halfHeight = Math.max(14, localHeight / 2 + FRAME_PADDING);
  const cosine = Math.abs(Math.cos(node.angle));
  const sine = Math.abs(Math.sin(node.angle));
  const projectedHalfWidth = cosine * halfWidth + sine * halfHeight;
  const projectedHalfHeight = sine * halfWidth + cosine * halfHeight;
  const centerX = node.x * width;
  const centerY = node.y * height;

  return {
    x: centerX - projectedHalfWidth,
    y: centerY - projectedHalfHeight,
    width: projectedHalfWidth * 2,
    height: projectedHalfHeight * 2,
    centerX,
    centerY,
    halfWidth: projectedHalfWidth,
    halfHeight: projectedHalfHeight,
    angle: 0,
  };
}

function expandRect(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

function overlaps(candidate: Rect, placed: readonly Rect[], gap = PANEL_COLLISION_GAP) {
  return placed.some(
    (rect) =>
      candidate.x < rect.x + rect.width + gap &&
      candidate.x + candidate.width + gap > rect.x &&
      candidate.y < rect.y + rect.height + gap &&
      candidate.y + candidate.height + gap > rect.y,
  );
}

function isOnCanvas(rect: Rect, width: number, height: number) {
  return rect.x >= 14 && rect.y >= 14 && rect.x + rect.width <= width - 14 && rect.y + rect.height <= height - 14;
}

function panelPlacement(
  frame: VisualizationFrame,
  metrics: PanelMetrics,
  obstacles: readonly Rect[],
  width: number,
  height: number,
): PanelPlacement {
  const verticalY = clamp(frame.centerY - metrics.height / 2, 14, height - metrics.height - 14);
  const horizontalX = clamp(frame.centerX - metrics.width / 2, 14, width - metrics.width - 14);
  const candidates: PanelPlacement[] = [
    {
      side: "right",
      x: frame.x + frame.width + PANEL_GAP,
      y: verticalY,
      width: metrics.width,
      height: metrics.height,
    },
    {
      side: "left",
      x: frame.x - PANEL_GAP - metrics.width,
      y: verticalY,
      width: metrics.width,
      height: metrics.height,
    },
    {
      side: "top",
      x: horizontalX,
      y: frame.y - PANEL_GAP - metrics.height,
      width: metrics.width,
      height: metrics.height,
    },
    {
      side: "bottom",
      x: horizontalX,
      y: frame.y + frame.height + PANEL_GAP,
      width: metrics.width,
      height: metrics.height,
    },
  ];

  const preferred = frame.centerX < width * 0.56 ? "right" : "left";
  candidates.sort((first, second) => {
    const score = (candidate: PanelPlacement) => {
      let value = candidate.side === preferred ? 0 : candidate.side === "top" || candidate.side === "bottom" ? 18 : 8;
      if (!isOnCanvas(candidate, width, height)) value += 10_000;
      if (overlaps(candidate, obstacles)) value += 2_000;
      return value;
    };
    return score(first) - score(second);
  });

  const selected = candidates[0];
  return {
    ...selected,
    x: clamp(selected.x, 14, width - metrics.width - 14),
    y: clamp(selected.y, 14, height - metrics.height - 14),
  };
}

/** A transient straight link makes the previous visualization hand off to the next. */
function drawMorphConnector(
  context: CanvasRenderingContext2D,
  from: VisualizationFrame,
  to: VisualizationFrame,
  progress: number,
  life: number,
) {
  if (progress <= 0 || progress >= 1) return;
  const alpha = Math.sin(progress * Math.PI) * life;
  if (alpha <= 0.001) return;

  const fromEdge = frameAnchor(from, to.centerX, to.centerY);
  const toEdge = frameAnchor(to, from.centerX, from.centerY);
  const length = Math.hypot(toEdge.x - fromEdge.x, toEdge.y - fromEdge.y);
  const reveal = easeInOutCubic(clamp(progress / 0.62, 0, 1));

  context.save();
  context.globalCompositeOperation = "source-over";
  context.lineCap = "round";
  context.lineWidth = 1;
  context.strokeStyle = accentColor({ h: 0, s: 0, l: 100 }, 0.5 * alpha);
  context.shadowColor = glowColor(0.65 * alpha);
  context.shadowBlur = 5;
  context.setLineDash([Math.max(0.01, length * reveal), length]);
  context.beginPath();
  context.moveTo(fromEdge.x, fromEdge.y);
  context.lineTo(toEdge.x, toEdge.y);
  context.stroke();
  context.setLineDash([]);
  context.restore();
}

function drawCornerBrackets(
  context: CanvasRenderingContext2D,
  frame: VisualizationFrame,
) {
  const left = -frame.halfWidth;
  const right = frame.halfWidth;
  const top = -frame.halfHeight;
  const bottom = frame.halfHeight;
  const cornerX = clamp(frame.width * 0.18, 8, 24);
  const cornerY = clamp(frame.height * 0.18, 8, 24);

  context.beginPath();
  context.moveTo(left, top + cornerY);
  context.lineTo(left, top);
  context.lineTo(left + cornerX, top);
  context.moveTo(right - cornerX, top);
  context.lineTo(right, top);
  context.lineTo(right, top + cornerY);
  context.moveTo(right, bottom - cornerY);
  context.lineTo(right, bottom);
  context.lineTo(right - cornerX, bottom);
  context.moveTo(left + cornerX, bottom);
  context.lineTo(left, bottom);
  context.lineTo(left, bottom - cornerY);
  context.stroke();
}

function drawRoutedConnection(
  context: CanvasRenderingContext2D,
  from: VisualizationFrame,
  to: VisualizationFrame,
  seed: number,
  reveal: number,
  life: number,
  focused: boolean,
) {
  if (life <= 0.001 || reveal <= 0.001) return;
  const start = frameAnchor(from, to.centerX, to.centerY);
  const end = frameAnchor(to, from.centerX, from.centerY);
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const direct = Math.abs(seed) % 4 === 0;
  const points = [{ x: start.x, y: start.y }];
  if (!direct) {
    const bendBias = 0.42 + ((Math.abs(seed) % 5) - 2) * 0.035;
    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
      const bendX = start.x + deltaX * bendBias;
      points.push({ x: bendX, y: start.y }, { x: bendX, y: end.y });
    } else {
      const bendY = start.y + deltaY * bendBias;
      points.push({ x: start.x, y: bendY }, { x: end.x, y: bendY });
    }
  }
  points.push({ x: end.x, y: end.y });

  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y,
    );
  }
  const alpha = life * (focused ? 0.58 : 0.34);

  context.save();
  context.globalCompositeOperation = "source-over";
  context.lineCap = "square";
  context.lineJoin = "miter";
  context.strokeStyle = accentColor({ h: 0, s: 0, l: 100 }, alpha);
  context.shadowColor = glowColor(alpha * 0.82);
  context.shadowBlur = focused ? 5 : 3;
  context.lineWidth = focused ? 1 : 0.78;
  context.setLineDash([Math.max(0.01, length * reveal), length + 1]);
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y);
  }
  context.stroke();
  context.setLineDash([]);

  if (reveal > 0.72) {
    context.shadowBlur = 3;
    context.fillStyle = accentColor({ h: 0, s: 0, l: 100 }, alpha * 1.15);
    context.beginPath();
    context.arc(start.x, start.y, focused ? 2.1 : 1.6, 0, Math.PI * 2);
    context.moveTo(end.x + (focused ? 2.1 : 1.6), end.y);
    context.arc(end.x, end.y, focused ? 2.1 : 1.6, 0, Math.PI * 2);
    context.fill();
    if (points.length > 2) {
      const junction = points[Math.floor(points.length / 2)];
      context.strokeStyle = accentColor({ h: 0, s: 0, l: 100 }, alpha * 0.9);
      context.lineWidth = 0.75;
      context.strokeRect(junction.x - 2.5, junction.y - 2.5, 5, 5);
    }
  }
  context.restore();
}

function drawFrameNetwork(
  context: CanvasRenderingContext2D,
  rendered: readonly {
    state: OverlayMorphState;
    progress: number;
    current: FocusPresentation;
    life: number;
  }[],
) {
  const visible = rendered
    .filter((item) => item.life > 0.015)
    .sort((first, second) => first.state.to.node.createdAt - second.state.to.node.createdAt);
  for (let index = 1; index < visible.length; index += 1) {
    const from = visible[index - 1];
    const to = visible[index];
    drawRoutedConnection(
      context,
      from.current.frame,
      to.current.frame,
      from.state.to.node.id * 31 + to.state.to.node.id,
      smootherStep(to.progress),
      Math.min(from.life, to.life),
      index === visible.length - 1,
    );
  }
}

/** One tracking frame continuously reshapes and travels between visualizations. */
function drawVisualizationFrame(
  context: CanvasRenderingContext2D,
  frame: VisualizationFrame,
  life: number,
  nodeId: number,
) {
  context.save();
  context.globalCompositeOperation = "source-over";
  context.translate(frame.centerX, frame.centerY);
  context.rotate(frame.angle);

  context.strokeStyle = accentColor({ h: 0, s: 0, l: 100 }, 0.78 * life);
  context.shadowColor = glowColor(0.9 * life);
  context.shadowBlur = 6;
  context.lineWidth = 1.15;
  if (Math.abs(nodeId) % 5 === 0) {
    context.strokeRect(-frame.halfWidth, -frame.halfHeight, frame.width, frame.height);
  } else {
    drawCornerBrackets(context, frame);
    if (Math.abs(nodeId) % 3 === 0) {
      const tick = clamp(Math.min(frame.width, frame.height) * 0.08, 3, 8);
      context.beginPath();
      context.moveTo(-tick, -frame.halfHeight);
      context.lineTo(tick, -frame.halfHeight);
      context.moveTo(frame.halfWidth, -tick);
      context.lineTo(frame.halfWidth, tick);
      context.stroke();
    }
  }

  context.shadowBlur = 5;
  context.fillStyle = accentColor({ h: 0, s: 0, l: 100 }, 0.9 * life);
  context.fillRect(-frame.halfWidth - 1.5, -frame.halfHeight - 1.5, 3, 3);
  context.fillRect(frame.halfWidth - 1.5, frame.halfHeight - 1.5, 3, 3);

  context.restore();
}

function measurePanel(
  context: TrackedContext,
  node: TelemetryNode,
  chord: string | null,
  frame: VisualizationFrame,
): PanelMetrics {
  const frequency = midiToFrequency(node.midi).toFixed(1);
  const chordText = chord?.toUpperCase() ?? "";
  const footprint = Math.sqrt(frame.width * frame.height);
  const formats = [
    { width: 82, height: 82 },
    { width: 116, height: 68 },
    { width: 68, height: 108 },
    { width: 142, height: 62 },
    { width: 80, height: 98 },
  ] as const;
  // Format is stable per pitch, while repetition directly enlarges that format.
  const format = formats[((node.midi % formats.length) + formats.length) % formats.length];
  const footprintScale = 0.88 + clamp((footprint - 42) / 170, 0, 1) * 0.2;
  const velocityScale = 0.94 + node.velocity * 0.12;
  const repetitionScale = 1 + (1 - Math.exp(-node.repeat / 3.2)) * 0.76;
  const chordScale = chord ? 1.05 : 1;
  const scale = footprintScale * velocityScale * repetitionScale * chordScale;
  const previewWidth = clamp(Math.round(format.width * scale), 58, 194);
  const previewHeight = clamp(Math.round(format.height * scale), 48, 164);

  context.letterSpacing = "0.4px";
  context.font = "600 10px Inter, ui-sans-serif, sans-serif";
  const noteWidth = Math.ceil(context.measureText(node.note).width);
  context.font = "500 9px ui-monospace, SFMono-Regular, Menlo, monospace";
  const frequencyWidth = Math.ceil(context.measureText(`${frequency} Hz`).width);
  context.font = "600 9px Inter, ui-sans-serif, sans-serif";
  const chordWidth = chordText ? Math.ceil(context.measureText(chordText).width) : 0;
  const dataWidth = Math.max(46, noteWidth, chordWidth, frequencyWidth);

  return {
    width: previewWidth + DATA_GAP + dataWidth,
    height: Math.max(previewHeight, chordText ? 43 : 30),
    previewWidth,
    previewHeight,
    dataWidth,
  };
}

function frameAnchor(frame: VisualizationFrame, targetX: number, targetY: number) {
  const deltaX = targetX - frame.centerX;
  const deltaY = targetY - frame.centerY;
  if (Math.hypot(deltaX, deltaY) < 0.001) {
    return { x: frame.centerX, y: frame.centerY };
  }
  const cosine = Math.cos(-frame.angle);
  const sine = Math.sin(-frame.angle);
  const localX = deltaX * cosine - deltaY * sine;
  const localY = deltaX * sine + deltaY * cosine;
  const scaleX = Math.abs(localX) < 0.001 ? Number.POSITIVE_INFINITY : frame.halfWidth / Math.abs(localX);
  const scaleY = Math.abs(localY) < 0.001 ? Number.POSITIVE_INFINITY : frame.halfHeight / Math.abs(localY);
  const scale = Math.min(scaleX, scaleY);
  const edgeLocalX = localX * scale;
  const edgeLocalY = localY * scale;
  const restoreCosine = Math.cos(frame.angle);
  const restoreSine = Math.sin(frame.angle);

  return {
    x: frame.centerX + edgeLocalX * restoreCosine - edgeLocalY * restoreSine,
    y: frame.centerY + edgeLocalX * restoreSine + edgeLocalY * restoreCosine,
  };
}

function panelPose(metrics: PanelMetrics, placement: PanelPlacement): PanelPose {
  const viewport: Rect = {
    x: placement.x,
    y: placement.y + (metrics.height - metrics.previewHeight) / 2,
    width: metrics.previewWidth,
    height: metrics.previewHeight,
  };
  const dockX =
    placement.side === "left"
      ? viewport.x + viewport.width
      : placement.side === "right"
        ? viewport.x
        : viewport.x + viewport.width * 0.5;
  const dockY =
    placement.side === "top"
      ? viewport.y + viewport.height
      : placement.side === "bottom"
        ? viewport.y
        : viewport.y + viewport.height * 0.5;

  return {
    viewport,
    metadataX: viewport.x + viewport.width + DATA_GAP,
    metadataY: viewport.y,
    dockX,
    dockY,
  };
}

function anchoredMorphPose(
  current: PanelPose,
  target: PanelPose,
  targetFrame: VisualizationFrame,
  canvasWidth: number,
  canvasHeight: number,
): PanelPose {
  const centerX = current.viewport.x + current.viewport.width / 2;
  const centerY = current.viewport.y + current.viewport.height / 2;
  const viewport: Rect = {
    x: clamp(
      centerX - target.viewport.width / 2,
      14,
      Math.max(14, canvasWidth - target.viewport.width - 78),
    ),
    y: clamp(
      centerY - target.viewport.height / 2,
      14,
      Math.max(14, canvasHeight - target.viewport.height - 14),
    ),
    width: target.viewport.width,
    height: target.viewport.height,
  };
  const deltaX = targetFrame.centerX - (viewport.x + viewport.width / 2);
  const deltaY = targetFrame.centerY - (viewport.y + viewport.height / 2);
  let dockX = viewport.x + viewport.width / 2;
  let dockY = viewport.y + viewport.height / 2;
  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    dockX = deltaX >= 0 ? viewport.x + viewport.width : viewport.x;
  } else {
    dockY = deltaY >= 0 ? viewport.y + viewport.height : viewport.y;
  }

  return {
    viewport,
    metadataX: viewport.x + viewport.width + DATA_GAP,
    metadataY: viewport.y,
    dockX,
    dockY,
  };
}

function interpolateFrame(from: VisualizationFrame, to: VisualizationFrame, amount: number): VisualizationFrame {
  const centerX = lerp(from.centerX, to.centerX, amount);
  const centerY = lerp(from.centerY, to.centerY, amount);
  const halfWidth = lerp(from.halfWidth, to.halfWidth, amount);
  const halfHeight = lerp(from.halfHeight, to.halfHeight, amount);
  return {
    x: centerX - halfWidth,
    y: centerY - halfHeight,
    width: halfWidth * 2,
    height: halfHeight * 2,
    centerX,
    centerY,
    halfWidth,
    halfHeight,
    angle: lerp(from.angle, to.angle, amount),
  };
}

function interpolatePose(from: PanelPose, to: PanelPose, amount: number): PanelPose {
  return {
    viewport: {
      x: lerp(from.viewport.x, to.viewport.x, amount),
      y: lerp(from.viewport.y, to.viewport.y, amount),
      width: lerp(from.viewport.width, to.viewport.width, amount),
      height: lerp(from.viewport.height, to.viewport.height, amount),
    },
    metadataX: lerp(from.metadataX, to.metadataX, amount),
    metadataY: lerp(from.metadataY, to.metadataY, amount),
    dockX: lerp(from.dockX, to.dockX, amount),
    dockY: lerp(from.dockY, to.dockY, amount),
  };
}

function interpolatePresentation(
  from: FocusPresentation,
  to: FocusPresentation,
  amount: number,
): FocusPresentation {
  return {
    node: amount < 0.5 ? from.node : to.node,
    chord: amount < 0.5 ? from.chord : to.chord,
    frame: interpolateFrame(from.frame, to.frame, amount),
    pose: interpolatePose(from.pose, to.pose, amount),
  };
}

function scaledFrame(frame: VisualizationFrame, scale: number): VisualizationFrame {
  const halfWidth = frame.halfWidth * scale;
  const halfHeight = frame.halfHeight * scale;
  return {
    ...frame,
    x: frame.centerX - halfWidth,
    y: frame.centerY - halfHeight,
    width: halfWidth * 2,
    height: halfHeight * 2,
    halfWidth,
    halfHeight,
  };
}

function enteringPresentation(target: FocusPresentation): FocusPresentation {
  const viewportCenterX = target.pose.viewport.x + target.pose.viewport.width / 2;
  const viewportCenterY = target.pose.viewport.y + target.pose.viewport.height / 2;
  const approachX = (target.frame.centerX - viewportCenterX) * 0.055;
  const approachY = (target.frame.centerY - viewportCenterY) * 0.055;
  const viewportScale = 0.86;
  const viewportWidth = target.pose.viewport.width * viewportScale;
  const viewportHeight = target.pose.viewport.height * viewportScale;
  const viewport = {
    x: viewportCenterX - viewportWidth / 2 + approachX,
    y: viewportCenterY - viewportHeight / 2 + approachY,
    width: viewportWidth,
    height: viewportHeight,
  };

  return {
    ...target,
    frame: scaledFrame(target.frame, 0.7),
    pose: {
      viewport,
      metadataX: target.pose.metadataX + approachX - target.pose.viewport.width * 0.07,
      metadataY: target.pose.metadataY + approachY + target.pose.viewport.height * 0.03,
      dockX: lerp(target.frame.centerX, target.pose.dockX, 0.84),
      dockY: lerp(target.frame.centerY, target.pose.dockY, 0.84),
    },
  };
}

function presentationAt(state: OverlayMorphState, now: number) {
  const progress = smootherStep((now - state.startedAt) / state.duration);
  return interpolatePresentation(state.from, state.to, progress);
}

function morphDuration(
  from: FocusPresentation,
  to: FocusPresentation,
  shortSide: number,
  distant = false,
) {
  const distance = Math.hypot(
    from.frame.centerX - to.frame.centerX,
    from.frame.centerY - to.frame.centerY,
  );
  const travel = clamp(distance / Math.max(1, shortSide), 0, 1);
  const ceiling = distant ? DISTANT_MORPH_MS : MORPH_MS;
  return lerp(MORPH_MS * 0.78, ceiling, smootherStep(travel));
}

function nodeKey(node: TelemetryNode) {
  return `${node.id}:${node.createdAt}`;
}

function presentationObstacle(presentation: FocusPresentation): Rect {
  const { viewport, metadataX } = presentation.pose;
  return {
    x: viewport.x,
    y: viewport.y,
    width: Math.max(viewport.width, metadataX - viewport.x + 64),
    height: Math.max(viewport.height, presentation.chord ? 43 : 30),
  };
}

function framesAreClose(
  first: VisualizationFrame,
  second: VisualizationFrame,
  shortSide: number,
) {
  const centerDistance = Math.hypot(first.centerX - second.centerX, first.centerY - second.centerY);
  const threshold = clamp(shortSide * 0.145, MORPH_PROXIMITY_MIN, MORPH_PROXIMITY_MAX);
  return centerDistance <= threshold;
}

function createPresentation(
  context: TrackedContext,
  node: TelemetryNode,
  chord: string | null,
  width: number,
  height: number,
  artStyle: string,
  obstacles: readonly Rect[] = [],
  settledFrame?: VisualizationFrame,
): FocusPresentation {
  const shortSide = Math.min(width, height);
  const frame =
    settledFrame ?? visualizationFrame(node, width, height, shortSide, VISUAL_ARRIVAL_MS, artStyle);
  const metrics = measurePanel(context, node, chord, frame);
  const placement = panelPlacement(
    frame,
    metrics,
    [expandRect(frame, 12), ...obstacles],
    width,
    height,
  );
  return { node, chord, frame, pose: panelPose(metrics, placement) };
}

function traceViewport(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  context.beginPath();
  context.rect(x, y, width, height);
}

/**
 * Captures small crops before annotations are drawn. The strip is reused on
 * every frame, avoiding a full-size canvas copy while keeping previews live.
 */
function prepareSnapshotStrip(
  context: CanvasRenderingContext2D,
  frames: readonly VisualizationFrame[],
  width: number,
  height: number,
  now: number,
  snapshotKey: string,
) {
  if (frames.length === 0 || typeof document === "undefined") return null;
  snapshotStrip ??= document.createElement("canvas");
  const stripWidth = SNAPSHOT_WIDTH * frames.length;
  const stripWasResized =
    snapshotStrip.width !== stripWidth || snapshotStrip.height !== SNAPSHOT_HEIGHT;
  if (stripWasResized) {
    snapshotStrip.width = stripWidth;
    snapshotStrip.height = SNAPSHOT_HEIGHT;
  }
  const snapshotContext = snapshotStrip.getContext("2d", { alpha: true });
  if (!snapshotContext) return null;
  if (
    !stripWasResized &&
    snapshotKey === lastSnapshotKey &&
    now - lastSnapshotAt < SNAPSHOT_FRAME_INTERVAL
  ) {
    return snapshotStrip;
  }

  snapshotContext.clearRect(0, 0, snapshotStrip.width, snapshotStrip.height);
  const dpr = context.canvas.width / Math.max(1, width);
  const aspect = SNAPSHOT_WIDTH / SNAPSHOT_HEIGHT;

  frames.forEach((frame, index) => {
    // Crop well inside the tracking box so the viewport reads as a detail,
    // matching the close-up image nodes in the reference system.
    let sourceWidth = Math.max(24, frame.width * 0.38);
    let sourceHeight = Math.max(16, frame.height * 0.38);
    if (sourceWidth / sourceHeight > aspect) sourceHeight = sourceWidth / aspect;
    else sourceWidth = sourceHeight * aspect;
    sourceWidth = Math.min(sourceWidth, width);
    sourceHeight = Math.min(sourceHeight, height);
    const sourceX = clamp(frame.centerX - sourceWidth / 2, 0, Math.max(0, width - sourceWidth));
    const sourceY = clamp(frame.centerY - sourceHeight / 2, 0, Math.max(0, height - sourceHeight));

    snapshotContext.drawImage(
      context.canvas,
      sourceX * dpr,
      sourceY * dpr,
      sourceWidth * dpr,
      sourceHeight * dpr,
      index * SNAPSHOT_WIDTH,
      0,
      SNAPSHOT_WIDTH,
      SNAPSHOT_HEIGHT,
    );
  });

  lastSnapshotAt = now;
  lastSnapshotKey = snapshotKey;

  return snapshotStrip;
}

function drawSnapshot(
  context: TrackedContext,
  snapshots: HTMLCanvasElement | null,
  snapshotIndex: number,
  viewport: Rect,
  alpha: number,
) {
  if (!snapshots || alpha <= 0.001) return;
  const sourceAspect = SNAPSHOT_WIDTH / SNAPSHOT_HEIGHT;
  const viewportAspect = viewport.width / viewport.height;
  let sourceX = snapshotIndex * SNAPSHOT_WIDTH;
  let sourceY = 0;
  let sourceWidth = SNAPSHOT_WIDTH;
  let sourceHeight = SNAPSHOT_HEIGHT;
  if (viewportAspect > sourceAspect) {
    sourceHeight = SNAPSHOT_WIDTH / viewportAspect;
    sourceY = (SNAPSHOT_HEIGHT - sourceHeight) / 2;
  } else {
    sourceWidth = SNAPSHOT_HEIGHT * viewportAspect;
    sourceX += (SNAPSHOT_WIDTH - sourceWidth) / 2;
  }

  context.globalAlpha = alpha;
  context.drawImage(
    snapshots,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    viewport.x,
    viewport.y,
    viewport.width,
    viewport.height,
  );
}

function drawMetadata(
  context: TrackedContext,
  presentation: FocusPresentation,
  pose: PanelPose,
  alpha: number,
  offsetY: number,
) {
  if (alpha <= 0.001) return;
  const frequency = midiToFrequency(presentation.node.midi).toFixed(1);
  const chordText = presentation.chord?.toUpperCase() ?? "";

  context.save();
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = alpha;
  context.textBaseline = "top";
  context.textAlign = "left";
  context.letterSpacing = "0.4px";
  context.font = "600 10px Inter, ui-sans-serif, sans-serif";
  context.fillStyle = "rgba(16, 16, 16, 0.96)";
  context.fillText(presentation.node.note, pose.metadataX, pose.metadataY + 1 + offsetY);
  context.letterSpacing = "0px";
  context.font = "500 9px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillStyle = "rgba(24, 24, 24, 0.78)";
  context.fillText(`${frequency} Hz`, pose.metadataX, pose.metadataY + 16 + offsetY);
  if (chordText) {
    context.font = "600 9px Inter, ui-sans-serif, sans-serif";
    context.fillStyle = "rgba(42, 42, 42, 0.62)";
    context.fillText(chordText, pose.metadataX, pose.metadataY + 30 + offsetY);
  }
  context.restore();
}

function drawPanel(
  context: TrackedContext,
  from: FocusPresentation,
  to: FocusPresentation,
  current: FocusPresentation,
  snapshots: HTMLCanvasElement | null,
  snapshotBase: number,
  progress: number,
  life: number,
  changing: boolean,
) {
  const { pose, frame } = current;
  const viewport = pose.viewport;
  const edge = frameAnchor(frame, pose.dockX, pose.dockY);

  context.save();
  context.globalCompositeOperation = "source-over";
  context.strokeStyle = accentColor(to.node.color, 0.62 * life);
  context.shadowColor = glowColor(0.8 * life);
  context.shadowBlur = 6;
  context.lineWidth = 1.1;
  context.beginPath();
  context.moveTo(edge.x, edge.y);
  context.lineTo(pose.dockX, pose.dockY);
  context.stroke();
  context.restore();

  context.save();
  context.globalCompositeOperation = "source-over";
  traceViewport(context, viewport.x, viewport.y, viewport.width, viewport.height);
  context.clip();
  context.fillStyle = `rgba(244, 250, 251, ${0.48 * life})`;
  context.fillRect(viewport.x, viewport.y, viewport.width, viewport.height);
  if (changing) {
    const blend = easeInOutCubic(progress);
    drawSnapshot(context, snapshots, snapshotBase, viewport, life * (1 - blend) * 0.94);
    drawSnapshot(context, snapshots, snapshotBase + 1, viewport, life * blend * 0.94);
  } else {
    drawSnapshot(context, snapshots, snapshotBase + 1, viewport, life * 0.94);
  }
  context.restore();

  context.save();
  context.globalCompositeOperation = "source-over";
  context.strokeStyle = accentColor(to.node.color, 0.76 * life);
  context.shadowColor = glowColor(0.9 * life);
  context.shadowBlur = 7;
  traceViewport(context, viewport.x, viewport.y, viewport.width, viewport.height);
  context.stroke();
  context.restore();

  if (changing) {
    const oldAlpha = 1 - easeOutCubic(progress / 0.52);
    const newAlpha = easeOutCubic((progress - 0.38) / 0.62);
    drawMetadata(context, from, pose, life * oldAlpha, -progress * 4);
    drawMetadata(context, to, pose, life * newAlpha, (1 - progress) * 4);
  } else {
    drawMetadata(context, to, pose, life, 0);
  }

  context.save();
  context.globalCompositeOperation = "source-over";
  context.fillStyle = accentColor(to.node.color, 0.75 * life);
  context.beginPath();
  context.arc(pose.dockX, pose.dockY, 1.7, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

/**
 * Returns the next time the overlay can visibly change. Static hold frames can
 * sleep until their exit begins instead of redrawing the same panel at 30fps.
 */
export function telemetryNextFrameAt(now: number) {
  let nextFrameAt = Number.POSITIVE_INFINITY;
  for (const state of morphStates) {
    if (now - state.startedAt < state.duration || now - state.sessionStartedAt < ENTER_MS) {
      return now;
    }
    const exitStartsAt = state.to.node.createdAt + ENTER_MS + HOLD_MS;
    const exitEndsAt = exitStartsAt + EXIT_MS;
    if (now < exitStartsAt) nextFrameAt = Math.min(nextFrameAt, exitStartsAt);
    else if (now < exitEndsAt) return now;
  }
  return nextFrameAt;
}

function clearMorphStates() {
  morphStates = [];
  lastSnapshotAt = Number.NEGATIVE_INFINITY;
  lastSnapshotKey = "";
  processedNodeKeys = new Set<string>();
  cachedChordLabels = new Map<number, string | null>();
  cachedChordFirstId = -1;
  cachedChordLastId = -1;
  cachedChordNodeCount = -1;
}

export function drawTelemetryOverlay(
  context: CanvasRenderingContext2D,
  nodes: readonly TelemetryNode[],
  width: number,
  height: number,
  now: number,
  artStyle = "aura",
  opacity = 1,
) {
  if (nodes.length === 0) {
    clearMorphStates();
    return;
  }

  let firstActive = nodes.length;
  while (firstActive > 0 && now - nodes[firstActive - 1].createdAt < LIFETIME_MS) {
    firstActive -= 1;
  }
  const active = nodes.slice(firstActive);
  if (active.length === 0) {
    clearMorphStates();
    return;
  }

  context.save();
  context.globalCompositeOperation = "source-over";

  const chords = chordLabelsForActiveNodes(active);
  const trackedContext = context as TrackedContext;
  const shortSide = Math.min(width, height);
  const stateIsStale = morphStates.some(
    (state) =>
      state.width !== width || state.height !== height,
  );
  if (stateIsStale) clearMorphStates();

  for (let index = morphStates.length - 1; index >= 0; index -= 1) {
    if (now - morphStates[index].to.node.createdAt >= LIFETIME_MS) {
      morphStates.splice(index, 1);
    }
  }

  for (const node of active) {
    const targetKey = nodeKey(node);
    if (processedNodeKeys.has(targetKey)) continue;
    processedNodeKeys.add(targetKey);

    const targetFrame = visualizationFrame(
      node,
      width,
      height,
      shortSide,
      VISUAL_ARRIVAL_MS,
      artStyle,
    );
    let closestIndex = -1;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < morphStates.length; index += 1) {
      const state = morphStates[index];
      if (!framesAreClose(state.to.frame, targetFrame, shortSide)) continue;
      const distance = Math.hypot(
        state.to.frame.centerX - targetFrame.centerX,
        state.to.frame.centerY - targetFrame.centerY,
      );
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    }

    const obstacles = morphStates.flatMap((state, index) =>
      index === closestIndex
        ? []
        : [expandRect(state.to.frame, 12), expandRect(presentationObstacle(state.to), 8)],
    );
    const presentation = createPresentation(
      trackedContext,
      node,
      chords.get(node.id) ?? null,
      width,
      height,
      artStyle,
      obstacles,
      targetFrame,
    );
    if (closestIndex >= 0) {
      const previous = morphStates[closestIndex];
      const current = presentationAt(previous, now);
      const anchoredTarget: FocusPresentation = {
        ...presentation,
        pose: anchoredMorphPose(current.pose, presentation.pose, presentation.frame, width, height),
      };
      morphStates[closestIndex] = {
        ...previous,
        targetKey,
        from: {
          ...current,
          node: previous.to.node,
          chord: previous.to.chord,
        },
        to: anchoredTarget,
        startedAt: now,
        duration: morphDuration(current, anchoredTarget, shortSide),
      };
    } else {
      const nextState: OverlayMorphState = {
        targetKey,
        from: enteringPresentation(presentation),
        to: presentation,
        startedAt: now,
        duration: ENTRY_MORPH_MS,
        sessionStartedAt: now,
        width,
        height,
      };
      if (morphStates.length < MAX_PANELS) {
        morphStates.push(nextState);
      } else {
        let oldestIndex = 0;
        for (let index = 1; index < morphStates.length; index += 1) {
          if (morphStates[index].to.node.createdAt < morphStates[oldestIndex].to.node.createdAt) {
            oldestIndex = index;
          }
        }
        const previous = morphStates[oldestIndex];
        const current = presentationAt(previous, now);
        morphStates[oldestIndex] = {
          ...nextState,
          from: {
            ...current,
            node: previous.to.node,
            chord: previous.to.chord,
          },
          startedAt: now,
          duration: morphDuration(current, presentation, shortSide, true),
          sessionStartedAt: previous.sessionStartedAt,
        };
      }
    }
  }

  const rendered = morphStates.map((state) => {
    const rawProgress = clamp((now - state.startedAt) / state.duration, 0, 1);
    const progress = smootherStep(rawProgress);
    const current = interpolatePresentation(state.from, state.to, progress);
    const targetAge = now - state.to.node.createdAt;
    const entrance = easeOutCubic((now - state.sessionStartedAt) / ENTER_MS);
    const departure =
      targetAge < ENTER_MS + HOLD_MS
        ? 1
        : 1 - easeInOutCubic((targetAge - ENTER_MS - HOLD_MS) / EXIT_MS);
    return {
      state,
      rawProgress,
      progress,
      current,
      life: entrance * departure * clamp(opacity, 0, 1),
      changing: state.targetKey !== nodeKey(state.from.node) && rawProgress < 1,
    };
  });

  const snapshots = prepareSnapshotStrip(
    context,
    rendered.flatMap(({ state }) => [state.from.frame, state.to.frame]),
    width,
    height,
    now,
    rendered.map(({ state }) => state.targetKey).join("|"),
  );

  for (const item of rendered) {
    if (item.changing) {
      drawMorphConnector(
        context,
        item.state.from.frame,
        item.state.to.frame,
        item.progress,
        item.life,
      );
    }
  }
  drawFrameNetwork(context, rendered);
  for (const item of rendered) {
    drawVisualizationFrame(context, item.current.frame, item.life, item.state.to.node.id);
  }
  rendered.forEach((item, index) => {
    drawPanel(
      trackedContext,
      item.state.from,
      item.state.to,
      item.current,
      snapshots,
      index * 2,
      item.progress,
      item.life,
      item.changing,
    );
  });

  context.restore();
}
