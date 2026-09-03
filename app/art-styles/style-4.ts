export type LiquidMetalParticleState = {
  id: number;
  artStyle?: string;
  midi: number;
  repeat: number;
  x: number;
  y: number;
  radius: number;
  velocity: number;
  createdAt: number;
  frozenAt?: number;
  color?: { h: number; s: number; l: number };
  accent?: { h: number; s: number; l: number };
};

export type LiquidMetalFrameOptions = {
  particles: readonly LiquidMetalParticleState[];
  width: number;
  height: number;
  now: number;
  reducedMotion: boolean;
};

export type LiquidMetalFrame = {
  canvas: HTMLCanvasElement;
  forming: boolean;
};

const MAX_HALFTONE_FIELDS = 12;
const HALFTONE_FORMATION_DURATION = 1900;
const HALFTONE_PIXEL_BUDGET = 1_250_000;
const HALFTONE_FRAME_INTERVAL = 1000 / 20;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

function hash(seed: number, salt = 0) {
  let value = (seed + Math.imul(salt, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}

function easeInOutSine(value: number) {
  const progress = clamp(value, 0, 1);
  return -(Math.cos(Math.PI * progress) - 1) / 2;
}

function hsla(
  color: { h: number; s: number; l: number },
  alpha: number,
  saturationOffset = 0,
  lightnessOffset = 0,
) {
  return `hsla(${color.h}, ${clamp(color.s + saturationOffset, 0, 100)}%, ${clamp(color.l + lightnessOffset, 0, 100)}%, ${alpha})`;
}

class HalftoneRenderer {
  readonly canvas: HTMLCanvasElement;

  private readonly context: CanvasRenderingContext2D;
  private readonly glowCanvas: HTMLCanvasElement;
  private readonly glowContext: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private displayScale = 1;
  private lastFrameAt = Number.NEGATIVE_INFINITY;
  private lastSignature = "";

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("aria-hidden", "true");
    const context = this.canvas.getContext("2d", {
      alpha: true,
      desynchronized: true,
    });
    if (!context) throw new Error("Halftone canvas is unavailable");
    this.context = context;
    this.glowCanvas = document.createElement("canvas");
    const glowContext = this.glowCanvas.getContext("2d", {
      alpha: true,
      desynchronized: true,
    });
    if (!glowContext) throw new Error("Halftone glow canvas is unavailable");
    this.glowContext = glowContext;
  }

  private syncSize(width: number, height: number) {
    const deviceScale = Math.min(1.5, window.devicePixelRatio || 1);
    const budgetScale = Math.sqrt(HALFTONE_PIXEL_BUDGET / Math.max(1, width * height));
    const scale = Math.max(0.75, Math.min(deviceScale, budgetScale));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    if (targetWidth === this.width && targetHeight === this.height) return false;
    this.width = targetWidth;
    this.height = targetHeight;
    this.displayScale = scale;
    this.canvas.width = targetWidth;
    this.canvas.height = targetHeight;
    this.glowCanvas.width = targetWidth;
    this.glowCanvas.height = targetHeight;
    return true;
  }

  private drawField(
    particle: LiquidMetalParticleState,
    now: number,
    reducedMotion: boolean,
    occupiedDots: Map<string, Array<{ x: number; y: number; radius: number }>>,
  ) {
    const effectiveNow = particle.frozenAt ?? now;
    const age = reducedMotion && particle.frozenAt === undefined
      ? HALFTONE_FORMATION_DURATION
      : Math.max(0, effectiveNow - particle.createdAt);
    const arrival = easeInOutSine(age / HALFTONE_FORMATION_DURATION);
    if (arrival <= 0.001) return false;

    const scale = this.displayScale;
    const width = this.width;
    const height = this.height;
    const shortSide = Math.min(width, height);
    const pitch = clamp((particle.midi - 24) / 83, 0, 1);
    const strength = clamp(particle.velocity, 0, 1);
    const seed = particle.id * 4099 + particle.midi * 131 + particle.repeat * 17;

    // Strong bass notes occupy a broader, denser field. Higher and quieter
    // notes leave finer, airier screens, while every dot remains circular.
    const fieldWidth = shortSide * lerp(0.105, 0.21, strength) * lerp(1.08, 0.86, pitch);
    const fieldHeight = shortSide * lerp(0.072, 0.145, strength) * lerp(1.08, 0.88, pitch);
    const dotRadius = clamp(
      shortSide * lerp(0.0025, 0.0072, strength) * lerp(1.26, 0.76, pitch),
      1.5 * scale,
      7 * scale,
    );
    const gridStep = clamp(dotRadius * lerp(2.5, 1.92, strength), 4.5 * scale, 16 * scale);
    const centerX = particle.x * width;
    const centerY = particle.y * height;
    const columns = Math.ceil((fieldWidth * 2.15) / gridStep);
    const rows = Math.ceil((fieldHeight * 2.15) / gridStep);
    const bodyPath = new Path2D();
    const accentPath = new Path2D();
    const icyCorePath = new Path2D();

    for (let row = -rows; row <= rows; row += 1) {
      for (let column = -columns; column <= columns; column += 1) {
        const localX = column * gridStep;
        const localY = row * gridStep;
        const normalizedX = localX / fieldWidth;
        const normalizedY = localY / fieldHeight;
        const curl = Math.sin(normalizedY * 4.2 + hash(seed, 19) * 6.28) * 0.13;
        const warpedX = normalizedX + curl * (0.35 + Math.abs(normalizedY));
        const lobeA = Math.hypot(warpedX + 0.27, normalizedY * 1.06 - 0.04);
        const lobeB = Math.hypot((warpedX - 0.38) * 1.12, normalizedY + 0.19);
        const lobeC = Math.hypot((warpedX + 0.04) * 0.82, normalizedY - 0.34);
        const field = Math.max(1 - lobeA, 0.88 - lobeB, 0.72 - lobeC);
        const grain = hash(seed + row * 811 + column * 131, 29);
        const occupancy = field + (grain - 0.5) * 0.25 + strength * 0.12;
        const revealOrder = clamp(
          0.12 + Math.hypot(normalizedX, normalizedY) * 0.48 + hash(seed + row * 97 + column * 53, 41) * 0.22,
          0,
          0.94,
        );
        if (occupancy <= 0.025 || arrival <= revealOrder) continue;

        const px = centerX + localX;
        const py = centerY + localY;
        if (px < -dotRadius || px > width + dotRadius || py < -dotRadius || py > height + dotRadius) continue;
        const edgeScale = clamp((occupancy + 0.18) / 0.82, 0.16, 1.18);
        const pulseScale = lerp(0.72, 1, clamp((arrival - revealOrder) / 0.24, 0, 1));
        const radius = dotRadius * edgeScale * pulseScale * lerp(0.9, 1.08, grain);
        const collisionCellSize = 9 * scale;
        const cellX = Math.floor(px / collisionCellSize);
        const cellY = Math.floor(py / collisionCellSize);
        let overlapsExistingDot = false;
        for (let offsetY = -2; offsetY <= 2 && !overlapsExistingDot; offsetY += 1) {
          for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
            const nearby = occupiedDots.get(`${cellX + offsetX}:${cellY + offsetY}`);
            if (!nearby) continue;
            if (nearby.some((dot) => Math.hypot(px - dot.x, py - dot.y) < (radius + dot.radius) * 0.74)) {
              overlapsExistingDot = true;
              break;
            }
          }
        }
        if (overlapsExistingDot) continue;
        const cellKey = `${cellX}:${cellY}`;
        const occupiedCell = occupiedDots.get(cellKey);
        if (occupiedCell) occupiedCell.push({ x: px, y: py, radius });
        else occupiedDots.set(cellKey, [{ x: px, y: py, radius }]);
        const path = hash(seed + row * 43 + column * 17, 67) > 0.82 ? accentPath : bodyPath;
        path.moveTo(px + radius, py);
        path.arc(px, py, radius, 0, Math.PI * 2);
        const coreRadius = radius * lerp(0.5, 0.68, strength);
        icyCorePath.moveTo(px + coreRadius, py);
        icyCorePath.arc(px, py, coreRadius, 0, Math.PI * 2);
      }
    }

    const body = particle.color ?? { h: 338, s: 92, l: 62 };
    const accent = particle.accent ?? body;
    const luminousBody = {
      h: body.h,
      s: clamp(body.s * 0.58, 34, 72),
      l: clamp(Math.max(body.l + 20, 76), 76, 88),
    };
    const luminousAccent = {
      h: accent.h,
      s: clamp(accent.s * 0.54, 3, 68),
      l: clamp(Math.max(accent.l + 22, 78), 78, 90),
    };
    this.context.save();
    this.context.globalCompositeOperation = "source-over";
    this.context.fillStyle = hsla(luminousBody, 0.68 * arrival);
    this.context.fill(bodyPath);
    this.context.fillStyle = hsla(luminousAccent, 0.56 * arrival);
    this.context.fill(accentPath);
    this.context.fillStyle = `rgba(247, 253, 255, ${0.92 * arrival})`;
    this.context.fill(icyCorePath);
    this.context.restore();

    return particle.frozenAt === undefined && arrival < 0.999;
  }

  render(options: LiquidMetalFrameOptions): LiquidMetalFrame | null {
    const { particles, width, height, now, reducedMotion } = options;
    if (width <= 0 || height <= 0) return null;
    const resized = this.syncSize(width, height);
    const active: LiquidMetalParticleState[] = [];
    for (let index = particles.length - 1; index >= 0 && active.length < MAX_HALFTONE_FIELDS; index -= 1) {
      const particle = particles[index];
      if (particle.artStyle === "style-4") active.push(particle);
    }
    active.reverse();
    if (active.length === 0) {
      this.reset();
      return null;
    }

    const signature = active
      .map((particle) => `${particle.id}:${particle.frozenAt ?? "live"}`)
      .join("|");
    const hasLiveFormation = active.some((particle) => {
      if (particle.frozenAt !== undefined) return false;
      return now - particle.createdAt < HALFTONE_FORMATION_DURATION;
    });
    if (
      !resized &&
      signature === this.lastSignature &&
      (!hasLiveFormation || now - this.lastFrameAt < HALFTONE_FRAME_INTERVAL)
    ) {
      return { canvas: this.canvas, forming: hasLiveFormation };
    }

    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.clearRect(0, 0, this.width, this.height);
    let forming = false;
    const occupiedDots = new Map<string, Array<{ x: number; y: number; radius: number }>>();
    for (let index = active.length - 1; index >= 0; index -= 1) {
      if (this.drawField(active[index], now, reducedMotion, occupiedDots)) forming = true;
    }
    this.glowContext.setTransform(1, 0, 0, 1, 0, 0);
    this.glowContext.clearRect(0, 0, this.width, this.height);
    this.glowContext.save();
    this.glowContext.globalCompositeOperation = "source-over";
    this.glowContext.globalAlpha = 0.82;
    this.glowContext.filter = `blur(${clamp(Math.min(this.width, this.height) * 0.012, 7 * this.displayScale, 16 * this.displayScale)}px)`;
    this.glowContext.drawImage(this.canvas, 0, 0);
    this.glowContext.restore();
    this.context.save();
    this.context.globalCompositeOperation = "destination-over";
    this.context.globalAlpha = 0.86;
    this.context.drawImage(this.glowCanvas, 0, 0);
    this.context.restore();
    this.lastFrameAt = now;
    this.lastSignature = signature;
    return { canvas: this.canvas, forming };
  }

  reset() {
    this.context.clearRect(0, 0, this.width, this.height);
    this.glowContext.clearRect(0, 0, this.width, this.height);
    this.lastFrameAt = Number.NEGATIVE_INFINITY;
    this.lastSignature = "";
  }

  dispose() {
    this.reset();
    this.canvas.width = 1;
    this.canvas.height = 1;
    this.glowCanvas.width = 1;
    this.glowCanvas.height = 1;
  }
}

let liquidMetalRenderer: HalftoneRenderer | null = null;

function getLiquidMetalRenderer() {
  try {
    liquidMetalRenderer ??= new HalftoneRenderer();
    return liquidMetalRenderer;
  } catch {
    return null;
  }
}

export function warmLiquidMetalRenderer() {
  void getLiquidMetalRenderer();
}

export function renderLiquidMetalFrame(options: LiquidMetalFrameOptions) {
  return getLiquidMetalRenderer()?.render(options) ?? null;
}

export function resetLiquidMetalRenderer() {
  liquidMetalRenderer?.reset();
}

export function disposeLiquidMetalRenderer() {
  liquidMetalRenderer?.dispose();
  liquidMetalRenderer = null;
}
