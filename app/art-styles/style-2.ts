export type DottedSigilOptions = {
  seed: number;
  midi?: number;
  radius: number;
  alpha: number;
  time: number;
  velocity: number;
  repeat: number;
  stretch: number;
  curvature: number;
};

const TAU = Math.PI * 2;
const ARCHETYPES = ["eye", "crest", "wing", "ring", "thorn", "veil"] as const;
type Archetype = (typeof ARCHETYPES)[number];

const PALETTES = [
  { field: [176, 186, 194], core: [244, 247, 250], glow: [168, 188, 202] },
  { field: [64, 168, 186], core: [214, 244, 250], glow: [48, 210, 230] },
  { field: [112, 164, 204], core: [226, 238, 250], glow: [96, 176, 228] },
  { field: [150, 198, 206], core: [236, 248, 250], glow: [120, 214, 226] },
] as const;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

function hash(seed: number, index: number) {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}

function mixColor(a: readonly number[], b: readonly number[], amount: number) {
  return [
    lerp(a[0], b[0], amount),
    lerp(a[1], b[1], amount),
    lerp(a[2], b[2], amount),
  ] as const;
}

function fillColor(rgb: readonly number[], alpha: number) {
  return `rgba(${rgb[0].toFixed(0)}, ${rgb[1].toFixed(0)}, ${rgb[2].toFixed(0)}, ${alpha})`;
}

function pixel(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  const half = size * 0.5;
  context.rect(x - half, y - half, size, size);
}

function distance(x: number, y: number) {
  return Math.hypot(x, y);
}

function almond(x: number, y: number, width: number, height: number) {
  const nx = x / width;
  const ny = y / height;
  return 1 - (nx * nx + ny * ny);
}

function annulus(x: number, y: number, inner: number, outer: number) {
  const radius = distance(x, y);
  if (radius > outer || radius < inner) return -1;
  return 1 - Math.abs((radius - (inner + outer) * 0.5) / ((outer - inner) * 0.5));
}

function chevron(x: number, y: number, width: number) {
  return 1 - Math.abs(Math.abs(x) + y * 0.62) / width;
}

function kite(x: number, y: number, width: number, height: number) {
  return 1 - (Math.abs(x) / width + Math.abs(y) / height);
}

function fieldMask(
  archetype: Archetype,
  x: number,
  y: number,
  phase: number,
  seed: number,
  curvature: number,
) {
  const wave = Math.sin(phase * 0.7 + x * 4.2 + y * 3.1) * 0.045;
  const driftX = x + Math.sin(phase * 0.55 + y * 2.4) * 0.04 + curvature * 0.03;
  const driftY = y + Math.cos(phase * 0.48 + x * 2.1) * 0.035;
  const noise = (hash(seed, Math.round(driftX * 48) * 73 + Math.round(driftY * 48) * 19) - 0.5) * 0.16;

  switch (archetype) {
    case "eye": {
      const shell = almond(driftX, driftY, 1.08, 0.58 + wave);
      const pupil = almond(driftX * 1.08, driftY * 1.25, 0.22, 0.12);
      const band = 1 - Math.abs(driftY) / 0.22;
      return Math.max(shell, band * 0.55) - Math.max(0, pupil) * 0.9 + noise;
    }
    case "crest": {
      const body = chevron(driftX, driftY + 0.08, 0.9 + wave);
      const stem = 1 - (Math.abs(driftX) / 0.28 + Math.abs(driftY - 0.1) / 0.82);
      const bite = almond(driftX, driftY - 0.18, 0.16, 0.18);
      return Math.max(body, stem * 0.85) - Math.max(0, bite) * 0.75 + noise;
    }
    case "wing": {
      const sweep = 1 - (Math.abs(driftY + driftX * 0.28) / 0.46 + Math.max(0, -driftX) / 0.28);
      const fan = almond(driftX - 0.12, driftY, 0.96, 0.62 + wave);
      const cut = almond(driftX + 0.5, driftY - 0.12, 0.24, 0.16);
      return Math.max(sweep, fan) - Math.max(0, cut) * 0.8 + noise;
    }
    case "ring": {
      const ring = annulus(driftX, driftY, 0.28, 0.98 + wave);
      const gap = Math.cos(Math.atan2(driftY, driftX) * 2 + seed * 0.01);
      const shard = kite(driftX - 0.12, driftY + 0.18, 0.34, 0.62);
      return Math.max(ring - Math.max(0, gap) * 0.12, shard * 0.7) + noise;
    }
    case "thorn": {
      const blade = kite(driftX, driftY, 0.52, 1.05);
      const bar = 1 - (Math.abs(driftY - driftX * 0.55) / 0.2 + Math.abs(driftX) / 0.92);
      const notch = kite(driftX + 0.16, driftY - 0.16, 0.12, 0.14);
      return Math.max(blade, bar * 0.9) - Math.max(0, notch) * 0.7 + noise;
    }
    case "veil": {
      const sheet = 1 - Math.max(Math.abs(driftX) / 1.02, Math.abs(driftY) / 0.78);
      const fringe = Math.sin(driftX * 8 + phase) * 0.06 + Math.sin(driftY * 6 - phase * 0.6) * 0.05;
      const window = almond(driftX + 0.2, driftY - 0.1, 0.18, 0.14);
      return sheet + fringe - Math.max(0, window) * 0.78 + noise;
    }
  }
}

function ornamentPaths(
  archetype: Archetype,
  radius: number,
  phase: number,
  seed: number,
  flip: number,
): Array<{ x: number; y: number }[]> {
  const spin = Math.sin(phase * 0.42) * 0.08;
  const stretch = 1 + Math.sin(phase * 0.33) * 0.04;

  const point = (angle: number, distance: number) => ({
    x: Math.cos(angle + spin) * distance * radius * stretch * flip,
    y: Math.sin(angle + spin) * distance * radius * stretch,
  });

  switch (archetype) {
    case "eye":
      return [
        Array.from({ length: 18 }, (_, index) =>
          point((-0.72 + index / 17) * Math.PI, 0.42 + Math.sin(index * 0.5) * 0.04),
        ),
        Array.from({ length: 14 }, (_, index) =>
          point((0.18 + index / 13) * Math.PI, 0.58),
        ),
        [
          point(-0.2, 0.12),
          point(0.08, 0.34),
          point(0.42, 0.18),
          point(0.62, -0.08),
        ],
      ];
    case "crest":
      return [
        [
          point(-0.5 * Math.PI, 0.82),
          point(-0.18, 0.08),
          point(0.5 * Math.PI, 0.78),
        ],
        Array.from({ length: 9 }, (_, index) =>
          point(-0.72 + index * 0.18, 0.7 + (index % 2) * 0.16),
        ),
        [
          point(Math.PI * 0.92, 0.22),
          point(Math.PI * 1.08, 0.48),
          point(Math.PI * 1.22, 0.18),
        ],
      ];
    case "wing":
      return [
        Array.from({ length: 16 }, (_, index) =>
          point(-0.15 + index * 0.09, 0.28 + index * 0.034),
        ),
        [
          point(0.2, 0.16),
          point(0.55, 0.38),
          point(0.82, 0.12),
          point(1.02, -0.22),
        ],
        Array.from({ length: 8 }, (_, index) =>
          point(Math.PI * 0.7 + index * 0.08, 0.46),
        ),
      ];
    case "ring":
      return [
        Array.from({ length: 24 }, (_, index) => point((index / 24) * TAU, 0.72)),
        Array.from({ length: 10 }, (_, index) => point(index * 0.22 + seed, 0.38)),
        [
          point(0.4, 0.18),
          point(1.1, 0.42),
          point(1.4, 0.08),
        ],
      ];
    case "thorn":
      return [
        [
          point(-0.7, 0.08),
          point(0.12, -0.78),
          point(0.36, 0.08),
          point(0.08, 0.86),
          point(-0.7, 0.08),
        ],
        [
          point(0.2, -0.12),
          point(0.86, -0.48),
          point(0.62, 0.06),
        ],
        [
          point(-0.12, 0.18),
          point(-0.72, 0.54),
          point(-0.28, 0.42),
        ],
      ];
    case "veil":
      return [
        Array.from({ length: 12 }, (_, index) => ({
          x: lerp(-0.78, 0.78, index / 11) * radius * flip,
          y: (Math.sin(index * 0.9 + phase) * 0.12 - 0.08) * radius,
        })),
        Array.from({ length: 10 }, (_, index) => ({
          x: (0.18 + Math.sin(index * 0.7) * 0.08) * radius * flip,
          y: lerp(-0.58, 0.58, index / 9) * radius,
        })),
        [
          point(-0.35, 0.42),
          point(0.05, 0.58),
          point(0.48, 0.32),
        ],
      ];
  }
}

function drawPixelStroke(
  context: CanvasRenderingContext2D,
  path: Array<{ x: number; y: number }>,
  size: number,
  rgb: readonly number[],
  alpha: number,
) {
  if (path.length < 2) return;
  context.beginPath();
  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index];
    const end = path[index + 1];
    const steps = Math.max(2, Math.round(distance(end.x - start.x, end.y - start.y) / (size * 1.12)));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      pixel(context, lerp(start.x, end.x, t), lerp(start.y, end.y, t), size);
    }
  }
  context.fillStyle = fillColor(rgb, alpha);
  context.fill();
}

export function drawDottedSigil(
  context: CanvasRenderingContext2D,
  options: DottedSigilOptions,
) {
  const { radius, alpha, seed, time, velocity, repeat, stretch, curvature, midi = 60 } = options;
  if (radius <= 0 || alpha <= 0) return;

  const archetype = ARCHETYPES[Math.abs(seed + midi * 3) % ARCHETYPES.length];
  const palette = PALETTES[Math.abs(midi + repeat) % PALETTES.length];
  const phase = time * 0.00105 + hash(seed, 17) * TAU;
  const flip = hash(seed, 91) > 0.5 ? 1 : -1;
  const columns = Math.round(clamp(radius / 1.55, 24, 46));
  const rows = Math.round(clamp(radius / 1.7, 22, 42));
  const cell = (radius * 2.08) / Math.max(columns, rows);
  const pixelSize = clamp(cell * 0.78, 1.2, 2.4);
  const density = clamp(0.72 + velocity * 0.16 + Math.min(repeat, 7) * 0.02, 0.72, 0.94);
  const width = radius * (1.08 + (stretch - 1) * 0.28);
  const height = radius * (archetype === "crest" || archetype === "thorn" ? 1.22 : 0.92);

  context.save();
  context.scale(flip, 1);
  context.rotate((hash(seed, 44) - 0.5) * 0.46);
  context.globalAlpha *= clamp(alpha, 0, 1);

  context.beginPath();
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const u = (column / (columns - 1)) * 2 - 1;
      const v = (row / (rows - 1)) * 2 - 1;
      const occupancy = fieldMask(archetype, u, v, phase, seed, curvature);
      if (occupancy <= 0.02) continue;
      const chance = hash(seed + row * 47, column * 13 + Math.round(phase * 8));
      if (chance > density * clamp(0.35 + occupancy * 0.65, 0, 1)) continue;
      const x = u * width + (hash(seed, row + column * 9) - 0.5) * cell * 0.18;
      const y = v * height + Math.sin(phase + column * 0.4) * cell * 0.08;
      pixel(context, x, y, pixelSize * (0.78 + occupancy * 0.34));
    }
  }
  context.fillStyle = fillColor(mixColor(palette.field, palette.core, 0.12), 0.88);
  context.fill();

  context.shadowColor = fillColor(palette.glow, 0.7);
  context.shadowBlur = clamp(pixelSize * 2.2, 2.2, 6);
  context.beginPath();
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const glowChance = hash(seed + 311 + row * 23, column * 41);
      if (glowChance < 0.82) continue;
      const u = (column / (columns - 1)) * 2 - 1;
      const v = (row / (rows - 1)) * 2 - 1;
      const occupancy = fieldMask(archetype, u, v, phase, seed, curvature);
      if (occupancy <= 0.22) continue;
      pixel(context, u * width, v * height, pixelSize * (1.15 + glowChance * 0.55));
    }
  }
  context.fillStyle = fillColor(palette.core, 0.92);
  context.fill();
  context.shadowBlur = 0;

  const ornaments = ornamentPaths(archetype, radius, phase, seed, 1);
  for (const [index, path] of ornaments.entries()) {
    const weight = pixelSize * (index === 0 ? 1.22 : 0.94);
    context.shadowColor = fillColor(palette.glow, 0.58);
    context.shadowBlur = clamp(weight * 1.8, 1.8, 5.2);
    drawPixelStroke(context, path, weight, palette.core, 0.96);
    context.shadowBlur = 0;
    drawPixelStroke(context, path, weight * 0.62, palette.field, 0.88);
  }

  context.restore();
}

export function dottedSigilBounds(radius: number, stretch = 1) {
  return {
    width: radius * (2.2 + (clamp(stretch, 0.88, 1.18) - 1) * 0.4),
    height: radius * 2.5,
  };
}
