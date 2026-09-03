/**
 * Spatial focus panels drawn on top of whichever art style is live. Distant
 * every event keeps a separate layer so the overlay grows as a connected
 * network instead of absorbing nearby notes into one continuously morphing panel.
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
  panelVariant: number;
  from: FocusPresentation;
  to: FocusPresentation;
  startedAt: number;
  duration: number;
  sessionStartedAt: number;
  width: number;
  height: number;
};

type OverlayCompositionMode = "frames" | "nodes" | "both";

type OverlayCompositionMix = {
  frames: number;
  nodes: number;
};

type OverlayCompositionTransition = {
  from: OverlayCompositionMix;
  to: OverlayCompositionMix;
  startedAt: number;
};

/** Canvas tracking is well supported but still missing from some lib.dom builds. */
type TrackedContext = CanvasRenderingContext2D & { letterSpacing?: string };

const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Notes struck inside this window read as one chord rather than a melody. */
const CHORD_WINDOW_MS = 190;

const VISUAL_ARRIVAL_MS = 550;
const ENTER_MS = 560;
const HOLD_MS = 6000;
const EXIT_MS = 900;
const LIFETIME_MS = ENTER_MS + HOLD_MS + EXIT_MS;
const MORPH_MS = 1280;
const DISTANT_MORPH_MS = 1080;
const ENTRY_MORPH_MS = Math.min(720, MORPH_MS, DISTANT_MORPH_MS);
const COMPOSITION_MODE_TRANSITION_MS = 860;
const COMPOSITION_MODE_HOLD_MS = 2400;

const MAX_PANELS = 3;
const MAX_VISIBLE_FRAME_ASSETS = 2;
const DATA_GAP = 10;
const PANEL_GAP = 62;
const PANEL_COLLISION_GAP = 18;
const FRAME_PADDING = 7;
const SNAPSHOT_WIDTH = 192;
const SNAPSHOT_HEIGHT = 192;
const SNAPSHOT_FRAME_INTERVAL = 1000 / 15;

const HUD_GLOW = "255, 255, 255";
const OVERLAY_STROKE_WIDTH = 1.25;
const OVERLAY_GLOW_BLUR = 4.5;
const CORNER_GLOW_BLUR = 10;

let snapshotStrip: HTMLCanvasElement | null = null;
let lastSnapshotAt = Number.NEGATIVE_INFINITY;
let lastSnapshotKey = "";
let morphStates: OverlayMorphState[] = [];
let processedNodeKeys = new Set<string>();
let cachedChordLabels = new Map<number, string | null>();
let cachedChordFirstId = -1;
let cachedChordLastId = -1;
let cachedChordNodeCount = -1;
// Node-led scenes intentionally dominate. The repeated node entries preserve
// long node-only passages while still allowing both and frame-only scenes.
const COMPOSITION_MODES: readonly OverlayCompositionMode[] = [
  "nodes",
  "nodes",
  "both",
  "nodes",
  "frames",
];
let compositionModeIndex = -1;
let lastCompositionAdvanceAt = Number.NEGATIVE_INFINITY;
let compositionTransition: OverlayCompositionTransition = {
  from: { frames: 1, nodes: 1 },
  to: { frames: 1, nodes: 1 },
  startedAt: Number.NEGATIVE_INFINITY,
};

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

function compositionMixFor(mode: OverlayCompositionMode): OverlayCompositionMix {
  if (mode === "frames") return { frames: 1, nodes: 0 };
  if (mode === "nodes") return { frames: 0, nodes: 1 };
  return { frames: 1, nodes: 1 };
}

function currentCompositionMix(now: number): OverlayCompositionMix {
  const progress = smootherStep(
    (now - compositionTransition.startedAt) / COMPOSITION_MODE_TRANSITION_MS,
  );
  return {
    frames: lerp(compositionTransition.from.frames, compositionTransition.to.frames, progress),
    nodes: lerp(compositionTransition.from.nodes, compositionTransition.to.nodes, progress),
  };
}

function advanceCompositionMode(now: number) {
  if (
    compositionModeIndex >= 0 &&
    now - lastCompositionAdvanceAt < COMPOSITION_MODE_HOLD_MS
  ) {
    return;
  }
  const from = currentCompositionMix(now);
  compositionModeIndex = (compositionModeIndex + 1) % COMPOSITION_MODES.length;
  const nextMode = COMPOSITION_MODES[compositionModeIndex];
  lastCompositionAdvanceAt = now;
  compositionTransition = {
    from,
    to: compositionMixFor(nextMode),
    startedAt: now,
  };
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

function glowColor(alpha: number) {
  return `rgba(${HUD_GLOW}, ${alpha})`;
}

function applyOverlayStroke(context: CanvasRenderingContext2D, alpha: number) {
  const visibleAlpha = clamp(alpha, 0, 1);
  context.strokeStyle = glowColor(visibleAlpha);
  context.shadowColor = glowColor(visibleAlpha * 0.72);
  context.shadowBlur = OVERLAY_GLOW_BLUR;
  context.lineWidth = OVERLAY_STROKE_WIDTH;
}

function drawRectangleCornerGlow(
  context: CanvasRenderingContext2D,
  rect: Rect,
  alpha: number,
) {
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  const visibleAlpha = clamp(alpha, 0, 1);
  context.save();
  context.globalCompositeOperation = "source-over";
  context.fillStyle = glowColor(visibleAlpha);
  context.shadowColor = glowColor(visibleAlpha * 0.94);
  context.shadowBlur = CORNER_GLOW_BLUR;
  for (const corner of corners) {
    context.fillRect(corner.x - 0.8, corner.y - 0.8, 1.6, 1.6);
  }
  context.restore();
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
  const unclampedCenterX = node.x * width;
  const unclampedCenterY = node.y * height;
  const frameWidth = Math.min(projectedHalfWidth * 2, Math.max(28, width - 28));
  const frameHeight = Math.min(projectedHalfHeight * 2, Math.max(28, height - 28));
  const frameX = clamp(
    unclampedCenterX - frameWidth / 2,
    14,
    Math.max(14, width - frameWidth - 14),
  );
  const frameY = clamp(
    unclampedCenterY - frameHeight / 2,
    14,
    Math.max(14, height - frameHeight - 14),
  );
  const centerX = frameX + frameWidth / 2;
  const centerY = frameY + frameHeight / 2;

  return {
    x: frameX,
    y: frameY,
    width: frameWidth,
    height: frameHeight,
    centerX,
    centerY,
    halfWidth: frameWidth / 2,
    halfHeight: frameHeight / 2,
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

function drawConnectionNode(
  context: CanvasRenderingContext2D,
  point: { x: number; y: number },
  alpha: number,
) {
  context.save();
  context.globalCompositeOperation = "source-over";
  applyOverlayStroke(context, alpha);
  context.beginPath();
  context.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function secondaryPanelDock(
  pose: PanelPose,
  primaryDock: { x: number; y: number },
  branchVariant: number,
) {
  const { viewport } = pose;
  const distances = [
    Math.abs(primaryDock.x - viewport.x),
    Math.abs(primaryDock.x - (viewport.x + viewport.width)),
    Math.abs(primaryDock.y - viewport.y),
    Math.abs(primaryDock.y - (viewport.y + viewport.height)),
  ];
  const closestEdge = distances.indexOf(Math.min(...distances));
  const direction = branchVariant % 4 < 2 ? -1 : 1;

  if (closestEdge < 2) {
    const offset = Math.min(30, viewport.height * 0.3) * direction;
    return {
      x: primaryDock.x,
      y: clamp(primaryDock.y + offset, viewport.y + 8, viewport.y + viewport.height - 8),
    };
  }

  const offset = Math.min(36, viewport.width * 0.3) * direction;
  return {
    x: clamp(primaryDock.x + offset, viewport.x + 8, viewport.x + viewport.width - 8),
    y: primaryDock.y,
  };
}

function drawConnectionCable(
  context: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  alpha: number,
) {
  context.save();
  context.globalCompositeOperation = "source-over";
  applyOverlayStroke(context, alpha);
  context.lineCap = "square";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  context.restore();
}

function drawVisualizerConnection(
  context: CanvasRenderingContext2D,
  frame: VisualizationFrame,
  pose: PanelPose,
  life: number,
  frameMix: number,
) {
  if (life <= 0.001 || frameMix <= 0.001) return;
  // Derive the dock from the panel's visible rectangle on every frame. The
  // panel and cable can now move independently without their edges separating.
  const dock = rectAnchor(pose.viewport, frame.centerX, frame.centerY);
  const edge = frameAnchor(frame, dock.x, dock.y);
  const deltaX = dock.x - edge.x;
  const deltaY = dock.y - edge.y;
  const distance = Math.max(1, Math.hypot(deltaX, deltaY));
  const directionX = deltaX / distance;
  const directionY = deltaY / distance;
  // Extend the leader into both outlined bodies. The overlap removes the
  // antialiasing seam that made a mathematically connected line look detached.
  const startX = edge.x - directionX * 2;
  const startY = edge.y - directionY * 2;
  const endX = dock.x + directionX * 2;
  const endY = dock.y + directionY * 2;

  if (frameMix > 0.001) {
    context.save();
    context.globalCompositeOperation = "source-over";
    applyOverlayStroke(context, life * frameMix);
    context.strokeRect(frame.x, frame.y, frame.width, frame.height);
    drawRectangleCornerGlow(context, frame, life * frameMix);
    context.restore();
  }

  const cableAlpha = life * frameMix;
  drawConnectionCable(
    context,
    { x: startX, y: startY },
    { x: endX, y: endY },
    cableAlpha,
  );
}

function drawPanelNodeNetwork(
  context: CanvasRenderingContext2D,
  first: FocusPresentation,
  second: FocusPresentation,
  life: number,
  nodeMix: number,
  branchVariant: number,
) {
  if (life <= 0.001 || nodeMix <= 0.001) return;
  const firstCenter = {
    x: first.pose.viewport.x + first.pose.viewport.width / 2,
    y: first.pose.viewport.y + first.pose.viewport.height / 2,
  };
  const secondCenter = {
    x: second.pose.viewport.x + second.pose.viewport.width / 2,
    y: second.pose.viewport.y + second.pose.viewport.height / 2,
  };
  const firstDock = rectAnchor(first.pose.viewport, secondCenter.x, secondCenter.y);
  const secondDock = rectAnchor(second.pose.viewport, firstCenter.x, firstCenter.y);
  const deltaX = secondDock.x - firstDock.x;
  const deltaY = secondDock.y - firstDock.y;
  const distance = Math.max(1, Math.hypot(deltaX, deltaY));
  const directionX = deltaX / distance;
  const directionY = deltaY / distance;
  const cableStart = {
    x: firstDock.x - directionX * 2,
    y: firstDock.y - directionY * 2,
  };
  const cableEnd = {
    x: secondDock.x + directionX * 2,
    y: secondDock.y + directionY * 2,
  };
  const nodeLife = life * nodeMix;
  drawConnectionCable(context, cableStart, cableEnd, nodeLife);
  drawConnectionNode(context, firstDock, nodeLife);
  drawConnectionNode(
    context,
    {
      x: lerp(firstDock.x, secondDock.x, 0.34),
      y: lerp(firstDock.y, secondDock.y, 0.34),
    },
    nodeLife,
  );
  drawConnectionNode(
    context,
    {
      x: lerp(firstDock.x, secondDock.x, 0.68),
      y: lerp(firstDock.y, secondDock.y, 0.68),
    },
    nodeLife,
  );
  drawConnectionNode(context, secondDock, nodeLife);

  const hasBranch = branchVariant % 2 === 1 && distance >= 120;
  if (hasBranch) {
    const branchPoint = {
      x: lerp(firstDock.x, secondDock.x, 0.5),
      y: lerp(firstDock.y, secondDock.y, 0.5),
    };
    const branchDock = secondaryPanelDock(second.pose, secondDock, branchVariant);
    const branchDeltaX = branchDock.x - branchPoint.x;
    const branchDeltaY = branchDock.y - branchPoint.y;
    const branchDistance = Math.max(1, Math.hypot(branchDeltaX, branchDeltaY));
    const branchDirectionX = branchDeltaX / branchDistance;
    const branchDirectionY = branchDeltaY / branchDistance;
    const branchEnd = {
      x: branchDock.x + branchDirectionX * 2,
      y: branchDock.y + branchDirectionY * 2,
    };
    drawConnectionCable(context, branchPoint, branchEnd, nodeLife);
    drawConnectionNode(context, branchPoint, nodeLife);
    drawConnectionNode(
      context,
      {
        x: lerp(branchPoint.x, branchDock.x, 0.58),
        y: lerp(branchPoint.y, branchDock.y, 0.58),
      },
      nodeLife,
    );
    drawConnectionNode(context, branchDock, nodeLife);
  }
}

function measurePanel(
  context: TrackedContext,
  node: TelemetryNode,
  chord: string | null,
  frame: VisualizationFrame,
  panelVariant: number,
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
  // The first persistent slot is always a substantial square frame. The other
  // slots cycle through contrasting proportions as they are replaced.
  const format = formats[((panelVariant % formats.length) + formats.length) % formats.length];
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

function rectAnchor(rect: Rect, targetX: number, targetY: number) {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const deltaX = targetX - centerX;
  const deltaY = targetY - centerY;
  if (Math.hypot(deltaX, deltaY) < 0.001) {
    return { x: centerX, y: centerY };
  }
  const scaleX = Math.abs(deltaX) < 0.001
    ? Number.POSITIVE_INFINITY
    : rect.width / 2 / Math.abs(deltaX);
  const scaleY = Math.abs(deltaY) < 0.001
    ? Number.POSITIVE_INFINITY
    : rect.height / 2 / Math.abs(deltaY);
  const scale = Math.min(scaleX, scaleY);
  return {
    x: centerX + deltaX * scale,
    y: centerY + deltaY * scale,
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

function createPresentation(
  context: TrackedContext,
  node: TelemetryNode,
  chord: string | null,
  panelVariant: number,
  width: number,
  height: number,
  artStyle: string,
  obstacles: readonly Rect[] = [],
  settledFrame?: VisualizationFrame,
): FocusPresentation {
  const shortSide = Math.min(width, height);
  const frame =
    settledFrame ?? visualizationFrame(node, width, height, shortSide, VISUAL_ARRIVAL_MS, artStyle);
  const metrics = measurePanel(context, node, chord, frame, panelVariant);
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
  const { pose } = current;
  const viewport = pose.viewport;

  if (life <= 0.001) return;

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
  applyOverlayStroke(context, life);
  traceViewport(context, viewport.x, viewport.y, viewport.width, viewport.height);
  context.stroke();
  drawRectangleCornerGlow(context, viewport, life);
  context.restore();

  if (changing) {
    const oldAlpha = 1 - easeOutCubic(progress / 0.52);
    const newAlpha = easeOutCubic((progress - 0.38) / 0.62);
    drawMetadata(context, from, pose, life * oldAlpha, -progress * 4);
    drawMetadata(context, to, pose, life * newAlpha, (1 - progress) * 4);
  } else {
    drawMetadata(context, to, pose, life, 0);
  }
}

/** The frame, leader, and data panel are rendered as one synchronized asset. */
function drawFrameAsset(
  context: TrackedContext,
  from: FocusPresentation,
  to: FocusPresentation,
  current: FocusPresentation,
  snapshots: HTMLCanvasElement | null,
  snapshotBase: number,
  progress: number,
  life: number,
  changing: boolean,
  frameMix: number,
  assetMix: number,
) {
  if (life <= 0.001 || assetMix <= 0.001) return;
  drawVisualizerConnection(context, current.frame, current.pose, life, frameMix);
  drawPanel(context, from, to, current, snapshots, snapshotBase, progress, life * assetMix, changing);
}

/**
 * Returns the next time the overlay can visibly change. A single static frame
 * can sleep, while the gently drifting node network keeps rendering.
 */
export function telemetryNextFrameAt(now: number) {
  if (now - compositionTransition.startedAt < COMPOSITION_MODE_TRANSITION_MS) return now;
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

  let addedPanelBatch = false;
  for (const node of active) {
    const targetKey = nodeKey(node);
    if (processedNodeKeys.has(targetKey)) continue;
    processedNodeKeys.add(targetKey);
    addedPanelBatch = true;

    let replacementIndex = -1;
    if (morphStates.length >= MAX_PANELS) {
      replacementIndex = 0;
      for (let index = 1; index < morphStates.length; index += 1) {
        if (morphStates[index].to.node.createdAt < morphStates[replacementIndex].to.node.createdAt) {
          replacementIndex = index;
        }
      }
    }
    const panelVariant =
      replacementIndex >= 0 ? morphStates[replacementIndex].panelVariant : morphStates.length;

    const targetFrame = visualizationFrame(
      node,
      width,
      height,
      shortSide,
      VISUAL_ARRIVAL_MS,
      artStyle,
    );
    const obstacles = morphStates.flatMap((state) =>
      [expandRect(state.to.frame, 12), expandRect(presentationObstacle(state.to), 8)],
    );
    const presentation = createPresentation(
      trackedContext,
      node,
      chords.get(node.id) ?? null,
      panelVariant,
      width,
      height,
      artStyle,
      obstacles,
      targetFrame,
    );
    const nextState: OverlayMorphState = {
      targetKey,
      panelVariant,
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
      morphStates.splice(replacementIndex, 1);
      morphStates.push(nextState);
    }
  }

  // A chord can add several panels in the same rendered frame. Advance once
  // for the whole musical gesture so the three composition states never skip.
  if (addedPanelBatch) advanceCompositionMode(now);
  const compositionMix = currentCompositionMix(now);

  // Enforce the cap at the final visible-state boundary as well as insertion.
  // This prevents transitions or retained state from ever drawing a fourth
  // panel, even for one animation frame.
  const visibleStates = [...morphStates]
    .sort((first, second) => first.to.node.createdAt - second.to.node.createdAt)
    .slice(-MAX_PANELS);
  const rendered = visibleStates.map((state) => {
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
  const frameItems = [] as typeof rendered;
  for (
    let index = rendered.length - 1;
    index >= 0 && frameItems.length < MAX_VISIBLE_FRAME_ASSETS;
    index -= 1
  ) {
    const candidate = rendered[index];
    const candidatePanel = presentationObstacle(candidate.current);
    const collidesWithVisiblePanel = frameItems.some((item) =>
      overlaps(candidatePanel, [presentationObstacle(item.current)], 10),
    );
    if (!collidesWithVisiblePanel) frameItems.push(candidate);
  }
  frameItems.reverse();
  const hasNodePair = frameItems.length >= 2;
  const visibleCompositionMix = hasNodePair
    ? compositionMix
    : {
        frames: Math.max(compositionMix.frames, compositionMix.nodes),
        nodes: 0,
      };
  const assetMix = Math.max(visibleCompositionMix.frames, visibleCompositionMix.nodes);

  const snapshots = assetMix > 0.001
    ? prepareSnapshotStrip(
        context,
        frameItems.flatMap(({ state }) => [state.from.frame, state.to.frame]),
        width,
        height,
        now,
        frameItems.map(({ state }) => state.targetKey).join("|"),
      )
    : null;

  frameItems.forEach((item, index) => {
    drawFrameAsset(
      trackedContext,
      item.state.from,
      item.state.to,
      item.current,
      snapshots,
      index * 2,
      item.progress,
      item.life,
      item.changing,
      visibleCompositionMix.frames,
      assetMix,
    );
  });

  if (hasNodePair) {
    const first = frameItems[0];
    const second = frameItems[1];
    drawPanelNodeNetwork(
      trackedContext,
      first.current,
      second.current,
      Math.min(first.life, second.life),
      visibleCompositionMix.nodes,
      first.state.panelVariant + second.state.panelVariant,
    );
  }

  context.restore();
}
