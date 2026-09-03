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
const MAX_VISIBLE_ORGANISMS = 8;
const RENDER_PIXEL_BUDGET = 1_050_000;
const TAU = Math.PI * 2;

type Point = { x: number; y: number };

type OrganismOptions = {
  seed: number;
  radius: number;
  stretch: number;
  thickness: number;
  curvature: number;
  velocity: number;
  repeat: number;
  arrival: number;
  alpha: number;
  now: number;
  pulse: number;
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
  return -(Math.cos(Math.PI * clamp(value, 0, 1)) - 1) / 2;
}

function hash(seed: number, index: number) {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}

function smoothClosedPath(points: readonly Point[]) {
  const path = new Path2D();
  if (points.length < 3) return path;
  const last = points[points.length - 1];
  const first = points[0];
  path.moveTo((last.x + first.x) * 0.5, (last.y + first.y) * 0.5);
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    path.quadraticCurveTo(current.x, current.y, (current.x + next.x) * 0.5, (current.y + next.y) * 0.5);
  }
  path.closePath();
  return path;
}

function traceCapsule(path: Path2D, x: number, y: number, length: number, width: number, angle: number) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const normalX = -sine * width;
  const normalY = cosine * width;
  const startX = x - cosine * length * 0.5;
  const startY = y - sine * length * 0.5;
  const endX = x + cosine * length * 0.5;
  const endY = y + sine * length * 0.5;
  path.moveTo(startX + normalX, startY + normalY);
  path.quadraticCurveTo(x - cosine * length * 0.57 - normalX * 0.25, y - sine * length * 0.57 - normalY * 0.25, startX - normalX, startY - normalY);
  path.lineTo(endX - normalX, endY - normalY);
  path.quadraticCurveTo(x + cosine * length * 0.57 + normalX * 0.25, y + sine * length * 0.57 + normalY * 0.25, endX + normalX, endY + normalY);
  path.closePath();
}

function branchCenter(
  seed: number,
  branchIndex: number,
  progress: number,
  length: number,
  bend: number,
  motion: number,
) {
  const phase = hash(seed, branchIndex * 29 + 7) * TAU;
  const swell = Math.sin(progress * Math.PI);
  const hook = Math.pow(progress, 1.72) * bend * length;
  const organicWave =
    Math.sin(progress * Math.PI * lerp(0.72, 1.34, hash(seed, branchIndex * 31 + 9)) + phase) *
    length *
    lerp(0.018, 0.052, hash(seed, branchIndex * 37 + 11)) *
    swell;
  const secondaryWave =
    Math.sin(progress * Math.PI * 3.1 + phase * 0.63) *
    length *
    0.008 *
    swell *
    swell;
  return {
    x: progress * length,
    y: hook + organicWave + secondaryWave + motion * length * 0.012 * swell,
  };
}

function buildBranch(
  seed: number,
  branchIndex: number,
  length: number,
  rootWidth: number,
  bend: number,
  reveal: number,
  motion: number,
) {
  const outline = new Path2D();
  const innerLines: Path2D[] = [];
  const revealed = clamp(reveal, 0.035, 1);
  const samples = Math.max(4, Math.ceil(18 * revealed));
  const left: Point[] = [];
  const right: Point[] = [];
  const centers: Point[] = [];
  const widths: number[] = [];

  for (let index = 0; index <= samples; index += 1) {
    const normalized = index / samples;
    const progress = normalized * revealed;
    const center = branchCenter(seed, branchIndex, progress, length, bend, motion);
    const next = branchCenter(seed, branchIndex, Math.min(1, progress + 0.006), length, bend, motion);
    const tangentX = next.x - center.x;
    const tangentY = next.y - center.y;
    const tangentLength = Math.max(0.0001, Math.hypot(tangentX, tangentY));
    const normalX = -tangentY / tangentLength;
    const normalY = tangentX / tangentLength;
    const taper = Math.pow(Math.max(0.018, 1 - normalized), 0.48);
    const rib = 0.74 + Math.sin(normalized * Math.PI) * 0.38;
    const irregularity = 0.9 + Math.sin(normalized * 10.4 + hash(seed, branchIndex + 83) * TAU) * 0.1;
    const width = Math.max(0.32, rootWidth * taper * rib * irregularity);
    centers.push(center);
    widths.push(width);
    left.push({ x: center.x + normalX * width, y: center.y + normalY * width });
    right.push({ x: center.x - normalX * width, y: center.y - normalY * width });
  }

  outline.moveTo(left[0].x, left[0].y);
  for (let index = 1; index < left.length; index += 1) outline.lineTo(left[index].x, left[index].y);
  const tip = centers[centers.length - 1];
  outline.quadraticCurveTo(
    tip.x + length * 0.018,
    tip.y + (hash(seed, branchIndex * 41 + 19) - 0.5) * rootWidth,
    right[right.length - 1].x,
    right[right.length - 1].y,
  );
  for (let index = right.length - 2; index >= 0; index -= 1) outline.lineTo(right[index].x, right[index].y);
  outline.closePath();

  const lineCount = 2 + Math.floor(hash(seed, branchIndex * 43 + 23) * 3);
  for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
    const line = new Path2D();
    const start = lerp(0.18, 0.38, hash(seed, branchIndex * 47 + lineIndex));
    const end = lerp(0.62, 0.92, hash(seed, branchIndex * 53 + lineIndex));
    let started = false;
    for (let index = 0; index < centers.length; index += 1) {
      const normalized = index / Math.max(1, centers.length - 1);
      if (normalized < start || normalized > end) continue;
      const current = centers[index];
      const previous = centers[Math.max(0, index - 1)];
      const next = centers[Math.min(centers.length - 1, index + 1)];
      const tangentLength = Math.max(0.0001, Math.hypot(next.x - previous.x, next.y - previous.y));
      const normalX = -(next.y - previous.y) / tangentLength;
      const normalY = (next.x - previous.x) / tangentLength;
      const side = lineIndex % 2 === 0 ? 1 : -1;
      const offset = widths[index] * lerp(0.2, 0.58, (lineIndex + 1) / (lineCount + 1)) * side;
      const x = current.x + normalX * offset;
      const y = current.y + normalY * offset;
      if (!started) {
        line.moveTo(x, y);
        started = true;
      } else {
        line.lineTo(x, y);
      }
    }
    innerLines.push(line);
  }

  return { outline, innerLines };
}

function organismBranchAngles(seed: number) {
  const handedness = hash(seed, 3) > 0.5 ? 1 : -1;
  return [
    -0.08,
    Math.PI + 0.18,
    0.58 * handedness,
    -0.82 * handedness,
    1.28 * handedness,
    -1.46 * handedness,
    Math.PI + 0.64 * handedness,
    Math.PI - 0.9 * handedness,
  ];
}

function drawOrganism(context: CanvasRenderingContext2D, options: OrganismOptions) {
  const {
    seed,
    radius,
    stretch,
    thickness,
    curvature,
    velocity,
    arrival,
    alpha,
    now,
    pulse,
  } = options;
  const reveal = easeOutCubic(arrival);
  if (radius <= 0 || alpha <= 0 || reveal <= 0) return;

  const contourAlpha = clamp(alpha * (0.78 + pulse * 0.2), 0, 0.98);
  const whiteAlpha = clamp(alpha * (0.92 + pulse * 0.08), 0, 0.99);
  const outlineWidth = clamp(radius * 0.0065, 0.72, 1.42);
  const bodyRadius = radius * lerp(0.19, 0.29, hash(seed, 5));
  const motion = Math.sin(now * 0.0014 + seed * 0.001) * (1 - reveal) * 0.9;
  const branchAngles = organismBranchAngles(seed);
  const branchCount = 6 + Math.floor(hash(seed, 17) * 3);

  context.save();
  const formationScale = lerp(0.72, 1, reveal);
  context.scale(formationScale, formationScale);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.miterLimit = 2;

  for (let index = branchCount - 1; index >= 0; index -= 1) {
    const delay = index * 0.035;
    const branchReveal = clamp((reveal - delay) / Math.max(0.18, 1 - delay), 0, 1);
    if (branchReveal <= 0.01) continue;
    const branchScale = index < 2 ? 1 : lerp(0.46, 0.84, hash(seed, index * 61 + 7));
    const length =
      radius *
      (1.48 + stretch * 0.55) *
      branchScale *
      lerp(0.94, 1.08, velocity) *
      lerp(0.84, 1.17, hash(seed, index * 67 + 13));
    const rootWidth =
      radius *
      (0.055 + thickness * 0.052) *
      lerp(0.72, 1.26, hash(seed, index * 71 + 29));
    const bend =
      curvature * 0.075 +
      (hash(seed, index * 73 + 31) - 0.5) * (index < 2 ? 0.11 : 0.24);
    const angle = branchAngles[index] + (hash(seed, index * 79 + 37) - 0.5) * 0.24;

    context.save();
    context.rotate(angle);
    context.translate(-bodyRadius * lerp(0.04, 0.22, hash(seed, index * 83 + 41)), 0);
    const branch = buildBranch(seed, index, length, rootWidth, bend, branchReveal, motion);

    context.fillStyle = `rgba(255, 255, 255, ${whiteAlpha})`;
    context.strokeStyle = `rgba(8, 9, 12, ${contourAlpha})`;
    context.lineWidth = outlineWidth;
    context.fill(branch.outline);
    context.stroke(branch.outline);

    context.strokeStyle = `rgba(12, 13, 17, ${contourAlpha * 0.72})`;
    context.lineWidth = Math.max(0.52, outlineWidth * 0.62);
    for (const line of branch.innerLines) context.stroke(line);

    if (index >= 2 && hash(seed, index * 89 + 43) > 0.38 && branchReveal > 0.64) {
      const joint = new Path2D();
      const jointProgress = lerp(0.2, 0.42, hash(seed, index * 97 + 47));
      const jointCenter = branchCenter(seed, index, jointProgress, length, bend, motion);
      traceCapsule(
        joint,
        jointCenter.x,
        jointCenter.y,
        rootWidth * lerp(1.75, 2.8, hash(seed, index * 101 + 53)),
        rootWidth * 0.34,
        Math.PI * 0.5 + bend,
      );
      context.fillStyle = `rgba(255, 255, 255, ${whiteAlpha})`;
      context.fill(joint);
      context.strokeStyle = `rgba(8, 9, 12, ${contourAlpha * 0.9})`;
      context.lineWidth = Math.max(0.58, outlineWidth * 0.72);
      context.stroke(joint);
    }
    context.restore();
  }

  const bodyPoints: Point[] = [];
  const bodyPointCount = 16;
  for (let index = 0; index < bodyPointCount; index += 1) {
    const angle = (index / bodyPointCount) * TAU;
    const irregularity =
      0.78 +
      hash(seed, 211 + index) * 0.34 +
      Math.sin(angle * 3 + hash(seed, 233) * TAU) * 0.075;
    bodyPoints.push({
      x: Math.cos(angle) * bodyRadius * irregularity * lerp(1.1, 1.55, hash(seed, 239)),
      y: Math.sin(angle) * bodyRadius * irregularity,
    });
  }
  const body = smoothClosedPath(bodyPoints);
  context.fillStyle = `rgba(255, 255, 255, ${whiteAlpha})`;
  context.strokeStyle = `rgba(8, 9, 12, ${contourAlpha})`;
  context.lineWidth = outlineWidth;
  context.fill(body);
  context.stroke(body);

  const bodyEchoes = 2 + Math.floor(hash(seed, 251) * 2);
  for (let index = 0; index < bodyEchoes; index += 1) {
    const arcRadius = bodyRadius * (0.36 + index * 0.19);
    context.beginPath();
    context.ellipse(
      bodyRadius * (hash(seed, 257 + index) - 0.5) * 0.28,
      bodyRadius * (hash(seed, 263 + index) - 0.5) * 0.24,
      arcRadius * lerp(1.18, 1.62, hash(seed, 269 + index)),
      arcRadius * lerp(0.38, 0.68, hash(seed, 271 + index)),
      (hash(seed, 277 + index) - 0.5) * 1.2,
      Math.PI * lerp(0.08, 0.32, hash(seed, 281 + index)),
      Math.PI * lerp(1.05, 1.74, hash(seed, 283 + index)),
    );
    context.strokeStyle = `rgba(10, 11, 15, ${contourAlpha * 0.58})`;
    context.lineWidth = Math.max(0.5, outlineWidth * 0.55);
    context.stroke();
  }

  const fragmentCount = 3 + Math.floor(hash(seed, 293) * 4);
  context.fillStyle = `rgba(255, 255, 255, ${whiteAlpha})`;
  context.strokeStyle = `rgba(8, 9, 12, ${contourAlpha * 0.82})`;
  context.lineWidth = Math.max(0.5, outlineWidth * 0.62);
  for (let index = 0; index < fragmentCount; index += 1) {
    const orbit = bodyRadius * lerp(1.34, 2.18, hash(seed, 301 + index));
    const angle = hash(seed, 317 + index) * TAU;
    const fragment = new Path2D();
    traceCapsule(
      fragment,
      Math.cos(angle) * orbit,
      Math.sin(angle) * orbit,
      radius * lerp(0.035, 0.085, hash(seed, 331 + index)),
      Math.max(0.55, radius * lerp(0.004, 0.009, hash(seed, 347 + index))),
      angle + (hash(seed, 359 + index) - 0.5) * 1.6,
    );
    context.fill(fragment);
    context.stroke(fragment);
  }

  if (pulse > 0.01) {
    context.beginPath();
    context.ellipse(0, 0, bodyRadius * (1.28 + pulse * 0.72), bodyRadius * (0.84 + pulse * 0.46), -0.18, 0, TAU);
    context.strokeStyle = `rgba(255, 255, 255, ${pulse * 0.38})`;
    context.lineWidth = outlineWidth + pulse * 1.2;
    context.stroke();
  }

  context.restore();
}

class ContourOrganismRenderer {
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
    const scale = Math.min(1, Math.sqrt(RENDER_PIXEL_BUDGET / Math.max(1, width * height)));
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
    for (let index = particles.length - 1; index >= 0 && active.length < MAX_VISIBLE_ORGANISMS; index -= 1) {
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
    const shortSide = Math.min(width, height);
    let forming = false;

    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.clearRect(0, 0, this.width, this.height);
    this.context.setTransform(this.scale, 0, 0, this.scale, 0, 0);

    for (const particle of active) {
      const age = reducedMotion ? FORMATION_DURATION : Math.max(0, now - particle.createdAt);
      const arrival = clamp(age / FORMATION_DURATION, 0, 1);
      if (arrival < 0.999) forming = true;
      const seed = particle.id * 4099 + particle.midi * 131 + particle.repeat * 17;
      const distanceToPulse = pulse
        ? Math.hypot(particle.x - pulse.x, particle.y - pulse.y)
        : 1;
      const localPulse = pulseEnvelope * clamp(1.16 - distanceToPulse * 1.35, 0.24, 1);

      this.context.save();
      this.context.translate(particle.x * width, particle.y * height);
      this.context.rotate(particle.angle * 0.72);
      drawOrganism(this.context, {
        seed,
        radius: shortSide * particle.radius * lerp(0.86, 1.14, particle.velocity),
        stretch: particle.stretch,
        thickness: particle.thickness,
        curvature: particle.curvature,
        velocity: particle.velocity,
        repeat: particle.repeat,
        arrival,
        alpha: clamp(0.72 + particle.velocity * 0.24, 0.76, 0.96),
        now,
        pulse: localPulse,
      });
      this.context.restore();
    }

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

let contourRenderer: ContourOrganismRenderer | null = null;
let canvasUnavailable = false;

function getContourRenderer() {
  if (canvasUnavailable) return null;
  try {
    contourRenderer ??= new ContourOrganismRenderer();
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
  drawOrganism(context, {
    seed: options.seed,
    radius: options.radius,
    stretch: options.stretch,
    thickness: options.thickness,
    curvature: options.curvature,
    velocity: options.velocity,
    repeat: options.repeat,
    arrival: options.arrival,
    alpha: options.alpha,
    now: options.time,
    pulse: 0,
  });
}

export function drawMetalheartPulse(
  context: CanvasRenderingContext2D,
  options: MetalheartPulseOptions,
) {
  const { centerX, centerY, width, height, progress, strength } = options;
  if (progress < 0 || progress >= 1 || strength <= 0) return;
  const envelope = Math.sin(progress * Math.PI) * Math.pow(1 - progress, 0.72) * clamp(strength, 0, 1);
  const radius = Math.min(width, height) * lerp(0.028, 0.13, easeInOutSine(progress));
  context.save();
  context.beginPath();
  context.ellipse(centerX, centerY, radius * 1.7, radius, -0.18, 0, TAU);
  context.strokeStyle = `rgba(12, 13, 16, ${envelope * 0.18})`;
  context.lineWidth = Math.max(0.55, Math.min(width, height) * 0.00085);
  context.stroke();
  context.restore();
}
