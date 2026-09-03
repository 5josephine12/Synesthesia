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
const RENDER_PIXEL_BUDGET = 5_000_000;
const TAU = Math.PI * 2;
const COMPOSITION_FLOW_ANGLE = -0.67;
const FLOW_DIRECTION_OFFSETS = [-0.86, -0.56, -0.34, -0.18, -0.06, 0, 0.1, 0.24, 0.43, 0.72, 1.42] as const;

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

function easeInOutSine(value: number) {
  const progress = clamp(value, 0, 1);
  return -(Math.cos(Math.PI * progress) - 1) * 0.5;
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
  const samples = Math.max(12, Math.ceil(44 * reveal));
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

  return { fill };
}

function buildLoop(
  seed: number,
  center: Point,
  radiusX: number,
  radiusY: number,
  rotation: number,
  width: number,
  startAngle: number,
  sweep: number,
  reveal: number,
): InkShape {
  const visibleSweep = sweep * clamp(reveal, 0.025, 1);
  const samples = Math.max(16, Math.ceil(Math.abs(visibleSweep) * 14));
  const left: Point[] = [];
  const right: Point[] = [];
  for (let index = 0; index <= samples; index += 1) {
    const progress = index / samples;
    const angle = startAngle + visibleSweep * progress;
    const localTangentX = -Math.sin(angle) * radiusX * Math.sign(visibleSweep);
    const localTangentY = Math.cos(angle) * radiusY * Math.sign(visibleSweep);
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    const tangentX = localTangentX * cosine - localTangentY * sine;
    const tangentY = localTangentX * sine + localTangentY * cosine;
    const tangentLength = Math.max(0.0001, Math.hypot(tangentX, tangentY));
    const normalX = -tangentY / tangentLength;
    const normalY = tangentX / tangentLength;
    const endTaper = Math.pow(Math.max(0.025, Math.sin(progress * Math.PI)), 0.32);
    const mechanicalStep = progress < 0.28 ? 0.72 : progress < 0.64 ? 1.08 : 0.62;
    const variation = 1 + Math.sin(progress * TAU * 3 + hash(seed, 11) * TAU) * 0.025;
    const halfWidth = Math.max(0.22, width * endTaper * mechanicalStep * variation);
    const point = rotatePoint(
      { x: Math.cos(angle) * radiusX, y: Math.sin(angle) * radiusY },
      center,
      rotation,
    );
    left.push({ x: point.x + normalX * halfWidth, y: point.y + normalY * halfWidth });
    right.push({ x: point.x - normalX * halfWidth, y: point.y - normalY * halfWidth });
  }
  const fill = new Path2D();
  traceBoundary(left, fill);
  for (let index = right.length - 1; index >= 0; index -= 1) {
    fill.lineTo(right[index].x, right[index].y);
  }
  fill.closePath();
  return { fill };
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
  // The reference has one stable visual gravity point. Keeping this anchor
  // independent of the active note count prevents established forms from
  // jumping whenever a new note joins the composition.
  const focalPoint = {
    x: width * 0.3,
    y: height * 0.57,
  };
  const flow = { x: Math.cos(COMPOSITION_FLOW_ANGLE), y: Math.sin(COMPOSITION_FLOW_ANGLE) };
  const crossFlow = { x: -flow.y, y: flow.x };

  for (const particle of active) {
    const seed = growthSeed(particle);
    const age = reducedMotion ? FORMATION_DURATION : Math.max(0, now - particle.createdAt);
    const arrival = easeInOutSine(age / FORMATION_DURATION);
    if (arrival <= 0.01) continue;
    const alongFlow = shortSide * (hash(seed, 3) - 0.5) * 0.31;
    const acrossFlow = shortSide * (hash(seed, 5) - 0.5) * 0.17;
    const pocket = {
      x: focalPoint.x + flow.x * alongFlow + crossFlow.x * acrossFlow,
      y: focalPoint.y + flow.y * alongFlow + crossFlow.y * acrossFlow,
    };
    const strandCount = 8 + Math.floor(hash(seed, 7) * 5);
    for (let strandIndex = 0; strandIndex < strandCount; strandIndex += 1) {
      const strandSeed = seed + strandIndex * 193;
      const delay = strandIndex * 0.025;
      const reveal = clamp((arrival - delay) / Math.max(0.3, 1 - delay), 0, 1);
      if (reveal <= 0.01) continue;
      const shapeRoll = hash(strandSeed, 11);
      const isLoop = shapeRoll > 0.68 && shapeRoll < 0.82;
      const isMedium = shapeRoll >= 0.82 && shapeRoll < 0.96;
      const isPlate = shapeRoll >= 0.96;
      const localAlong = (hash(strandSeed, 13) - 0.5) * shortSide * 0.22;
      const localAcross = (hash(strandSeed, 17) - 0.5) * shortSide * 0.135;
      const origin = {
        x: pocket.x + flow.x * localAlong + crossFlow.x * localAcross,
        y: pocket.y + flow.y * localAlong + crossFlow.y * localAcross,
      };
      const directionIndex = Math.floor(hash(strandSeed, 23) * FLOW_DIRECTION_OFFSETS.length);
      const angle =
        COMPOSITION_FLOW_ANGLE +
        FLOW_DIRECTION_OFFSETS[Math.min(FLOW_DIRECTION_OFFSETS.length - 1, directionIndex)] +
        particle.angle * 0.045 +
        (hash(strandSeed, 29) - 0.5) * 0.12;

      if (isLoop) {
        shapes.push(buildLoop(
          strandSeed,
          origin,
          shortSide * lerp(0.055, 0.14, hash(strandSeed, 31)),
          shortSide * lerp(0.035, 0.11, hash(strandSeed, 37)),
          COMPOSITION_FLOW_ANGLE + (hash(strandSeed, 39) - 0.5) * 0.82,
          shortSide * lerp(0.0012, 0.0032, hash(strandSeed, 41)),
          angle,
          (hash(strandSeed, 43) > 0.5 ? 1 : -1) * lerp(Math.PI * 0.78, Math.PI * 1.72, hash(strandSeed, 47)),
          reveal,
        ));
        continue;
      }

      const length = isPlate
        ? shortSide * lerp(0.11, 0.24, hash(strandSeed, 53))
        : isMedium
          ? shortSide * lerp(0.14, 0.34, hash(strandSeed, 53))
          : shortSide * lerp(0.16, 0.49, hash(strandSeed, 53));
      const halfWidth = isPlate
        ? shortSide * lerp(0.012, 0.024, hash(strandSeed, 59))
        : isMedium
          ? shortSide * lerp(0.004, 0.009, hash(strandSeed, 59))
          : shortSide * lerp(0.00065, 0.0025, hash(strandSeed, 59));
      shapes.push(buildRibbon({
        seed: strandSeed,
        origin,
        angle,
        length,
        width: halfWidth,
        bend: (hash(strandSeed, 61) - 0.5) * (isPlate ? 0.08 : 0.2),
        wave: isPlate ? 0.006 : lerp(0.004, 0.018, hash(strandSeed, 67)),
        reveal,
        lobe: isPlate ? lerp(0.8, 1.35, hash(strandSeed, 71)) : lerp(0.15, 0.58, hash(strandSeed, 71)),
        hook: (hash(strandSeed, 73) > 0.5 ? 1 : -1) * (isPlate ? 0.16 : lerp(0.2, 0.92, hash(strandSeed, 79))),
      }));
    }

    // A small number of parallel hairline gestures cross the crop along the
    // composition's shared diagonal without becoming one connected trunk.
    if (hash(seed, 127) > 0.66) {
      const fromLeadingEdge = hash(seed, 131) > 0.5;
      const edgeOrigin = {
        x: fromLeadingEdge ? -width * 0.1 : focalPoint.x - flow.x * shortSide * 0.72,
        y: fromLeadingEdge
          ? clamp(focalPoint.y + shortSide * lerp(0.18, 0.5, hash(seed, 137)), -height * 0.08, height * 1.08)
          : focalPoint.y - flow.y * shortSide * 0.72,
      };
      const edgeAngle = COMPOSITION_FLOW_ANGLE + (hash(seed, 139) - 0.5) * 0.16;
      shapes.push(buildRibbon({
        seed: seed + 1709,
        origin: edgeOrigin,
        angle: edgeAngle,
        length: Math.hypot(width, height) * lerp(0.72, 1.02, hash(seed, 149)),
        width: shortSide * lerp(0.00055, 0.00135, hash(seed, 151)),
        bend: (hash(seed, 157) - 0.5) * 0.035,
        wave: 0.004,
        reveal: arrival,
        lobe: 0.18,
        hook: (hash(seed, 163) - 0.5) * 0.24,
      }));
    }

    const fragmentCount = 2 + Math.floor(hash(seed, 83) * 4);
    for (let fragmentIndex = 0; fragmentIndex < fragmentCount; fragmentIndex += 1) {
      const fragmentCenter = {
        x: pocket.x + (hash(seed, 89 + fragmentIndex) - 0.5) * shortSide * 0.32,
        y: pocket.y + (hash(seed, 97 + fragmentIndex) - 0.5) * shortSide * 0.28,
      };
      fragments.push(makeFragment(seed + 401 + fragmentIndex * 23, fragmentCenter, shortSide * lerp(0.0018, 0.006, hash(seed, 103 + fragmentIndex))));
    }
  }

  context.save();
  context.lineCap = "butt";
  context.lineJoin = "miter";
  context.miterLimit = 3;
  const outlineAlpha = clamp(0.66 + pulse * 0.12, 0.66, 0.82);
  context.strokeStyle = `rgba(0, 0, 0, ${outlineAlpha})`;
  context.lineWidth = clamp(shortSide * 0.00078, 0.72, 1.08);
  context.fillStyle = "#ffffff";
  for (const shape of shapes) {
    context.stroke(shape.fill);
    context.fill(shape.fill);
  }
  for (const fragment of fragments) {
    context.stroke(fragment);
    context.fill(fragment);
  }

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
