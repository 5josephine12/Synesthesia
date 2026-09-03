export type MetalheartParticleState = {
  id: number;
  artStyle?: string;
  midi: number;
  repeat: number;
  x: number;
  y: number;
  radius: number;
  angle: number;
  stretch: number;
  thickness: number;
  curvature: number;
  velocity: number;
  createdAt: number;
  color?: { h: number; s: number; l: number };
  accent?: { h: number; s: number; l: number };
};

export type MetalheartPulseState = {
  progress: number;
  strength: number;
  x: number;
  y: number;
};

export type MetalheartFrameOptions = {
  particles: readonly MetalheartParticleState[];
  width: number;
  height: number;
  now: number;
  reducedMotion: boolean;
  pulse?: MetalheartPulseState;
};

export type MetalheartFrame = {
  canvas: HTMLCanvasElement;
  forming: boolean;
};

export type MetalheartParticleOptions = {
  seed: number;
  midi: number;
  radius: number;
  alpha: number;
  arrival: number;
  time: number;
  stretch: number;
  thickness: number;
  curvature: number;
  velocity: number;
  repeat: number;
};

export type MetalheartPulseOptions = {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  progress: number;
  strength: number;
};

const FORMATION_DURATION = 1900;
const MAX_VISIBLE_GROWTHS = 6;
const RENDER_PIXEL_BUDGET = 3_200_000;
const COMPOSITION_SEED = 0x6f726761;
const TAU = Math.PI * 2;

type Point = { x: number; y: number };

type RibbonSpec = {
  seed: number;
  origin: Point;
  angle: number;
  length: number;
  width: number;
  bend: number;
  wave: number;
  reveal: number;
  lobe: number;
  hook: number;
};

type InkShape = {
  fill: Path2D;
  centers: Point[];
  widths: number[];
  tangentAngles: number[];
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

function easeOutCubic(value: number) {
  const progress = clamp(value, 0, 1);
  return 1 - Math.pow(1 - progress, 3);
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const progress = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return progress * progress * (3 - 2 * progress);
}

function hash(seed: number, index: number) {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}

function rotatePoint(point: Point, origin: Point, angle: number): Point {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: origin.x + point.x * cosine - point.y * sine,
    y: origin.y + point.x * sine + point.y * cosine,
  };
}

function traceBoundary(points: readonly Point[], path = new Path2D()) {
  if (points.length === 0) return path;
  path.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    path.lineTo(points[index].x, points[index].y);
  }
  return path;
}

function localRibbonCenter(spec: RibbonSpec, progress: number): Point {
  const phase = hash(spec.seed, 3) * TAU;
  const envelope = Math.sin(progress * Math.PI);
  const direction = hash(spec.seed, 11) > 0.5 ? 1 : -1;
  const broadCurve = Math.pow(progress, 1.35) * spec.bend * spec.length;
  const primaryWave =
    Math.sin(progress * Math.PI * lerp(0.62, 1.08, hash(spec.seed, 5)) + phase) *
    spec.length *
    spec.wave *
    envelope;
  const firstElbow = Math.max(0, progress - 0.31) * spec.length * 0.052 * direction;
  const secondElbow = Math.max(0, progress - 0.67) * spec.length * 0.085 * -direction;
  const hook =
    spec.hook *
    spec.length *
    0.17 *
    Math.pow(smoothstep(0.68, 1, progress), 1.35);
  return {
    x: progress * spec.length,
    y: broadCurve + primaryWave + firstElbow + secondElbow + hook,
  };
}

function worldRibbonCenter(spec: RibbonSpec, progress: number) {
  return rotatePoint(localRibbonCenter(spec, progress), spec.origin, spec.angle);
}

function ribbonWidth(spec: RibbonSpec, normalized: number, edge: -1 | 1) {
  const taper = Math.pow(Math.max(0.002, 1 - normalized), 0.36);
  const section = normalized < 0.16
    ? 0.68
    : normalized < 0.39
      ? 1.08 + spec.lobe * 0.42
      : normalized < 0.53
        ? 0.62
        : normalized < 0.79
          ? 0.92 + spec.lobe * 0.28
          : 0.5;
  const edgePhase = hash(spec.seed, edge > 0 ? 17 : 19) * TAU;
  const machinedVariance = Math.sin(normalized * TAU * 3 + edgePhase) * 0.022;
  return Math.max(0.24, spec.width * (section + machinedVariance) * taper);
}

function buildRibbon(spec: RibbonSpec): InkShape {
  const reveal = clamp(spec.reveal, 0.025, 1);
  const samples = Math.max(7, Math.ceil(24 * reveal));
  const left: Point[] = [];
  const right: Point[] = [];
  const centers: Point[] = [];
  const widths: number[] = [];
  const tangentAngles: number[] = [];

  for (let index = 0; index <= samples; index += 1) {
    const normalized = index / samples;
    const progress = normalized * reveal;
    const center = worldRibbonCenter(spec, progress);
    const previous = worldRibbonCenter(spec, Math.max(0, progress - 0.0035));
    const next = worldRibbonCenter(spec, Math.min(1, progress + 0.0035));
    const tangentAngle = Math.atan2(next.y - previous.y, next.x - previous.x);
    const normalX = -Math.sin(tangentAngle);
    const normalY = Math.cos(tangentAngle);
    const leftWidth = ribbonWidth(spec, normalized, 1);
    const rightWidth = ribbonWidth(spec, normalized, -1);
    centers.push(center);
    widths.push((leftWidth + rightWidth) * 0.5);
    tangentAngles.push(tangentAngle);
    left.push({ x: center.x + normalX * leftWidth, y: center.y + normalY * leftWidth });
    right.push({ x: center.x - normalX * rightWidth, y: center.y - normalY * rightWidth });
  }

  const fill = new Path2D();
  traceBoundary(left, fill);
  const tip = centers[centers.length - 1];
  fill.quadraticCurveTo(
    tip.x + Math.cos(tangentAngles[tangentAngles.length - 1]) * spec.length * 0.025,
    tip.y + Math.sin(tangentAngles[tangentAngles.length - 1]) * spec.length * 0.025,
    right[right.length - 1].x,
    right[right.length - 1].y,
  );
  for (let index = right.length - 2; index >= 0; index -= 1) fill.lineTo(right[index].x, right[index].y);
  fill.closePath();

  return { fill, centers, widths, tangentAngles };
}

function sampleShape(shape: InkShape, progress: number) {
  const index = Math.round(clamp(progress, 0, 1) * (shape.centers.length - 1));
  return {
    point: shape.centers[index],
    width: shape.widths[index],
    angle: shape.tangentAngles[index],
  };
}

function makeFragment(seed: number, center: Point, scale: number) {
  const points: Point[] = [];
  const count = 5 + Math.floor(hash(seed, 5) * 3);
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * TAU;
    const radius = scale * lerp(0.42, 1, hash(seed, 13 + index));
    points.push({
      x: center.x + Math.cos(angle) * radius * lerp(0.65, 1.45, hash(seed, 29)),
      y: center.y + Math.sin(angle) * radius,
    });
  }
  const path = new Path2D();
  if (points.length === 0) return path;
  path.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) path.lineTo(points[index].x, points[index].y);
  path.closePath();
  return path;
}

function growthSeed(particle: MetalheartParticleState) {
  return particle.id * 4099 + particle.midi * 131 + particle.repeat * 17;
}

function drawInkComposition(
  context: CanvasRenderingContext2D,
  active: readonly MetalheartParticleState[],
  width: number,
  height: number,
  now: number,
  reducedMotion: boolean,
  pulse: number,
) {
  const shortSide = Math.min(width, height);
  const shapes: InkShape[] = [];
  const fragments: Path2D[] = [];
  const direction = hash(COMPOSITION_SEED, 2) > 0.5 ? 1 : -1;
  const start = {
    x: direction > 0 ? -width * 0.08 : width * 1.08,
    y: height * lerp(0.24, 0.4, hash(COMPOSITION_SEED, 7)),
  };
  const endY = height * lerp(0.58, 0.76, hash(COMPOSITION_SEED, 11));
  const endX = direction > 0 ? width * 1.08 : -width * 0.08;
  const trunkLength = Math.hypot(endX - start.x, endY - start.y);
  const trunkAngle = Math.atan2(endY - start.y, endX - start.x);
  const strongestArrival = active.reduce((maximum, particle) => {
    const age = reducedMotion ? FORMATION_DURATION : Math.max(0, now - particle.createdAt);
    return Math.max(maximum, easeOutCubic(age / FORMATION_DURATION));
  }, 0);
  const trunk = buildRibbon({
    seed: COMPOSITION_SEED,
    origin: start,
    angle: trunkAngle,
    length: trunkLength,
    width: shortSide * 0.086,
    bend: -0.025,
    wave: 0.012,
    reveal: strongestArrival,
    lobe: 0.68,
    hook: 0.08,
  });
  shapes.push(trunk);

  for (let index = 0; index < active.length; index += 1) {
    const particle = active[index];
    const seed = growthSeed(particle);
    const age = reducedMotion ? FORMATION_DURATION : Math.max(0, now - particle.createdAt);
    const arrival = easeOutCubic(age / FORMATION_DURATION);
    if (arrival <= 0.01) continue;
    const stableSlot = ((particle.id * 5 + particle.midi * 3) % 13 + 13) % 13;
    const attachProgress = clamp(0.08 + (stableSlot / 12) * 0.84 + (hash(seed, 3) - 0.5) * 0.035, 0.06, 0.94);
    const attachment = sampleShape(trunk, attachProgress);
    const side = hash(seed, 7) > 0.5 ? 1 : -1;
    const departure = side * lerp(0.42, 1.16, hash(seed, 13));
    const primaryAngle = attachment.angle + departure;
    const primaryLength =
      shortSide *
      lerp(0.24, 0.48, hash(seed, 17)) *
      lerp(0.92, 1.08, particle.velocity);
    const primary = buildRibbon({
      seed,
      origin: attachment.point,
      angle: primaryAngle,
      length: primaryLength,
      width: shortSide * lerp(0.028, 0.062, hash(seed, 19)) * (0.9 + particle.thickness * 0.22),
      bend: particle.curvature * 0.05 + side * lerp(0.015, 0.075, hash(seed, 23)),
      wave: lerp(0.006, 0.02, hash(seed, 29)),
      reveal: arrival,
      lobe: lerp(0.48, 1.08, hash(seed, 31)),
      hook: side * lerp(0.18, 0.62, hash(seed, 37)),
    });
    shapes.push(primary);

    const forkCount = 1 + Math.floor(hash(seed, 41) * 2);
    for (let forkIndex = 0; forkIndex < forkCount; forkIndex += 1) {
      const forkProgress = lerp(0.34, 0.76, (forkIndex + 1) / (forkCount + 1)) + (hash(seed, 43 + forkIndex) - 0.5) * 0.08;
      const forkAttachment = sampleShape(primary, forkProgress);
      const forkSide = forkIndex % 2 === 0 ? -side : side;
      const forkReveal = clamp((arrival - 0.12 - forkIndex * 0.07) / 0.8, 0, 1);
      if (forkReveal <= 0.01) continue;
      const fork = buildRibbon({
        seed: seed + 101 + forkIndex * 47,
        origin: forkAttachment.point,
        angle: forkAttachment.angle + forkSide * lerp(0.28, 0.66, hash(seed, 53 + forkIndex)),
        length: primaryLength * lerp(0.3, 0.52, hash(seed, 59 + forkIndex)),
        width: Math.max(2.4, forkAttachment.width * lerp(0.5, 0.74, hash(seed, 61 + forkIndex))),
        bend: forkSide * lerp(0.025, 0.11, hash(seed, 67 + forkIndex)),
        wave: lerp(0.004, 0.016, hash(seed, 71 + forkIndex)),
        reveal: forkReveal,
        lobe: lerp(0.3, 0.82, hash(seed, 73 + forkIndex)),
        hook: forkSide * lerp(0.12, 0.5, hash(seed, 79 + forkIndex)),
      });
      shapes.push(fork);
    }

    const fragmentCount = 1 + Math.floor(hash(seed, 83) * 3);
    for (let fragmentIndex = 0; fragmentIndex < fragmentCount; fragmentIndex += 1) {
      const fragmentAnchor = sampleShape(primary, lerp(0.36, 0.88, hash(seed, 89 + fragmentIndex)));
      const offset = primaryLength * lerp(0.018, 0.065, hash(seed, 97 + fragmentIndex));
      const fragmentCenter = {
        x: fragmentAnchor.point.x + Math.cos(fragmentAnchor.angle + side * Math.PI * 0.5) * offset,
        y: fragmentAnchor.point.y + Math.sin(fragmentAnchor.angle + side * Math.PI * 0.5) * offset,
      };
      fragments.push(makeFragment(seed + 401 + fragmentIndex * 23, fragmentCenter, shortSide * lerp(0.003, 0.009, hash(seed, 103 + fragmentIndex))));
    }
  }

  context.save();
  context.lineCap = "round";
  context.lineJoin = "miter";
  context.miterLimit = 3;
  const outlineAlpha = clamp(0.88 + pulse * 0.1, 0.88, 0.98);
  context.strokeStyle = `rgba(0, 0, 0, ${outlineAlpha})`;
  context.lineWidth = clamp(shortSide * 0.0023, 1.8, 2.9);
  for (const shape of shapes) context.stroke(shape.fill);
  for (const fragment of fragments) context.stroke(fragment);

  // Filling every connected plate after every stroke hides all seams inside
  // the union, leaving one clean exterior contour and no interior linework.
  context.fillStyle = "#ffffff";
  for (const shape of shapes) context.fill(shape.fill);
  for (const fragment of fragments) context.fill(fragment);

  context.restore();
}

class ContourCompositionRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private scale = 1;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("aria-hidden", "true");
    const context = this.canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!context) throw new Error("Canvas 2D is unavailable");
    this.context = context;
  }

  private syncSize(width: number, height: number) {
    const displayScale = Math.min(1.5, window.devicePixelRatio || 1);
    const scale = Math.min(displayScale, Math.sqrt(RENDER_PIXEL_BUDGET / Math.max(1, width * height)));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    if (targetWidth !== this.width || targetHeight !== this.height) {
      this.width = targetWidth;
      this.height = targetHeight;
      this.canvas.width = targetWidth;
      this.canvas.height = targetHeight;
    }
    this.scale = scale;
  }

  render(options: MetalheartFrameOptions): MetalheartFrame | null {
    const { particles, width, height, now, reducedMotion, pulse } = options;
    if (width <= 0 || height <= 0) return null;
    this.syncSize(width, height);
    const active: MetalheartParticleState[] = [];
    for (let index = particles.length - 1; index >= 0 && active.length < MAX_VISIBLE_GROWTHS; index -= 1) {
      if (particles[index].artStyle === "style-3") active.push(particles[index]);
    }
    active.reverse();
    if (active.length === 0) {
      this.context.clearRect(0, 0, this.width, this.height);
      return null;
    }

    const pulseProgress = pulse?.progress ?? 2;
    const pulseEnvelope = pulseProgress >= 0 && pulseProgress < 1
      ? Math.sin(pulseProgress * Math.PI) * Math.pow(1 - pulseProgress, 0.72) * clamp(pulse?.strength ?? 0, 0, 1)
      : 0;
    let forming = false;
    for (const particle of active) {
      if (!reducedMotion && now - particle.createdAt < FORMATION_DURATION) {
        forming = true;
        break;
      }
    }

    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.clearRect(0, 0, this.width, this.height);
    this.context.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    drawInkComposition(this.context, active, width, height, now, reducedMotion, pulseEnvelope);
    return { canvas: this.canvas, forming };
  }

  reset() {
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.clearRect(0, 0, this.width, this.height);
  }

  dispose() {
    this.reset();
    this.canvas.width = 1;
    this.canvas.height = 1;
  }
}

let contourRenderer: ContourCompositionRenderer | null = null;
let canvasUnavailable = false;

function getContourRenderer() {
  if (canvasUnavailable) return null;
  try {
    contourRenderer ??= new ContourCompositionRenderer();
    return contourRenderer;
  } catch {
    canvasUnavailable = true;
    return null;
  }
}

export function warmMetalheartRenderer() {
  void getContourRenderer();
}

export function renderMetalheartFrame(options: MetalheartFrameOptions) {
  return getContourRenderer()?.render(options) ?? null;
}

export function resetMetalheartRenderer() {
  contourRenderer?.reset();
}

export function disposeMetalheartRenderer() {
  contourRenderer?.dispose();
  contourRenderer = null;
  canvasUnavailable = false;
}

export function drawMetalheartParticle(
  context: CanvasRenderingContext2D,
  options: MetalheartParticleOptions,
) {
  const reveal = easeOutCubic(options.arrival);
  if (reveal <= 0 || options.alpha <= 0) return;
  const shape = buildRibbon({
    seed: options.seed,
    origin: { x: 0, y: 0 },
    angle: 0,
    length: options.radius * (1.9 + options.stretch * 0.62),
    width: options.radius * (0.08 + options.thickness * 0.08),
    bend: options.curvature * 0.1,
    wave: 0.036,
    reveal,
    lobe: 0.82,
    hook: hash(options.seed, 7) > 0.5 ? 0.72 : -0.72,
  });
  context.save();
  context.strokeStyle = `rgba(0, 0, 0, ${clamp(options.alpha * 0.94, 0, 0.96)})`;
  context.lineWidth = clamp(options.radius * 0.013, 1.7, 2.7);
  context.stroke(shape.fill);
  context.fillStyle = "#ffffff";
  context.fill(shape.fill);
  context.restore();
}

export function drawMetalheartPulse(
  _context: CanvasRenderingContext2D,
  options: MetalheartPulseOptions,
) {
  void options;
}
