export type DottedSigilOptions = {
  seed: number;
  midi?: number;
  centerX: number;
  centerY: number;
  viewportWidth: number;
  viewportHeight: number;
  gridStep: number;
  radius: number;
  alpha: number;
  time: number;
  arrival: number;
  emphasis: number;
  layered: boolean;
  maturation: number;
  velocity: number;
  repeat: number;
  expansion: number;
  stretch: number;
  curvature: number;
  accentContext?: CanvasRenderingContext2D;
  occupiedCells?: Set<number>;
};

export type DottedSigilColor = {
  h: number;
  s: number;
  l: number;
};

const TAU = Math.PI * 2;
const ARCHETYPES = [
  "murmuration",
  "topography",
  "signal-weave",
  "archipelago",
  "canopy",
  "fold",
] as const;
type Archetype = (typeof ARCHETYPES)[number];

const PIXEL_PALETTES: ReadonlyArray<{
  primary: DottedSigilColor;
  accent: DottedSigilColor;
}> = [
  { primary: { h: 8, s: 94, l: 64 }, accent: { h: 42, s: 96, l: 68 } },
  { primary: { h: 340, s: 90, l: 66 }, accent: { h: 20, s: 94, l: 72 } },
  { primary: { h: 278, s: 82, l: 72 }, accent: { h: 320, s: 89, l: 67 } },
  { primary: { h: 28, s: 96, l: 70 }, accent: { h: 300, s: 83, l: 73 } },
  { primary: { h: 352, s: 92, l: 68 }, accent: { h: 52, s: 95, l: 72 } },
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

function mixColor(a: DottedSigilColor, b: DottedSigilColor, amount: number) {
  const hueDelta = ((b.h - a.h + 540) % 360) - 180;
  return {
    h: (a.h + hueDelta * amount + 360) % 360,
    s: lerp(a.s, b.s, amount),
    l: lerp(a.l, b.l, amount),
  };
}

function fillColor(color: DottedSigilColor, alpha: number) {
  return `hsla(${Math.round(color.h)}, ${Math.round(color.s)}%, ${Math.round(color.l)}%, ${alpha})`;
}

function pixel(
  path: Pick<CanvasRenderingContext2D, "rect"> | Path2D,
  x: number,
  y: number,
  size: number,
) {
  const side = Math.max(1, Math.round(size));
  const left = Math.round(x - side * 0.5);
  const top = Math.round(y - side * 0.5);
  path.rect(left, top, side, side);
}

function distance(x: number, y: number) {
  return Math.hypot(x, y);
}

function gridCellKey(column: number, row: number) {
  return ((column & 0xffff) << 16) | (row & 0xffff);
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

function kite(x: number, y: number, width: number, height: number) {
  return 1 - (Math.abs(x) / width + Math.abs(y) / height);
}

function ribbon(x: number, y: number, center: number, thickness: number, extent = 1.1) {
  return Math.min(1 - Math.abs(x) / extent, 1 - Math.abs(y - center) / thickness);
}

function fieldMask(
  archetype: Archetype,
  x: number,
  y: number,
  phase: number,
  seed: number,
  curvature: number,
) {
  const seedPhase = hash(seed, 5) * TAU;
  const driftX = x + Math.sin(phase * 0.38 + y * 2.15 + seedPhase) * 0.045 + curvature * 0.018;
  const driftY = y + Math.cos(phase * 0.34 + x * 1.9 - seedPhase) * 0.04;
  const noise = (
    hash(seed, Math.round(driftX * 56) * 73 + Math.round(driftY * 56) * 19) - 0.5
  ) * 0.032;

  switch (archetype) {
    case "murmuration": {
      const upperCurrent = Math.sin(driftX * 2.7 + phase * 0.42 + seedPhase) * 0.16 - 0.1;
      const lowerCurrent = Math.sin(driftX * 3.4 - phase * 0.31) * 0.13 + 0.2;
      const sweep = ribbon(driftX, driftY, upperCurrent, 0.16, 1.12);
      const returnSweep = ribbon(driftX * 0.94, driftY, lowerCurrent, 0.11, 0.92);
      const gathering = almond(driftX + 0.42, driftY + 0.02, 0.54, 0.42);
      const wake = almond(driftX - 0.58, driftY - 0.08, 0.42, 0.25);
      const opening = almond(driftX - 0.05, driftY + 0.02, 0.19, 0.14);
      return Math.max(sweep * 0.92, returnSweep * 0.8, gathering * 0.72, wake * 0.66)
        - Math.max(0, opening) * 0.58 + noise;
    }
    case "topography": {
      const contourA = Math.sin(driftX * 2.25 + phase * 0.3 + seedPhase) * 0.16 - 0.34;
      const contourB = Math.sin(driftX * 2.8 - phase * 0.24) * 0.14 - 0.02;
      const contourC = Math.sin(driftX * 3.15 + phase * 0.2 - seedPhase) * 0.12 + 0.31;
      const ridgeA = ribbon(driftX, driftY, contourA, 0.095, 1.08);
      const ridgeB = ribbon(driftX * 0.92, driftY, contourB, 0.12, 1.02);
      const ridgeC = ribbon(driftX * 1.04, driftY, contourC, 0.085, 0.94);
      const basin = annulus(driftX + 0.34, driftY - 0.02, 0.12, 0.34);
      const interruption = almond(driftX - 0.48, driftY + 0.06, 0.18, 0.24);
      return Math.max(ridgeA * 0.86, ridgeB * 0.92, ridgeC * 0.78, basin * 0.64)
        - Math.max(0, interruption) * 0.46 + noise;
    }
    case "signal-weave": {
      const horizontalCenter = Math.sin(driftX * 3.1 + phase * 0.48) * 0.18;
      const horizontal = ribbon(driftX, driftY, horizontalCenter, 0.12, 1.1);
      const verticalCenter = Math.sin(driftY * 3.5 - phase * 0.37 + seedPhase) * 0.2;
      const vertical = ribbon(driftY, driftX, verticalCenter, 0.1, 0.84);
      const relayA = almond(driftX + 0.62, driftY - 0.28, 0.28, 0.22);
      const relayB = almond(driftX - 0.54, driftY + 0.3, 0.34, 0.25);
      const relayC = kite(driftX - 0.08, driftY + 0.03, 0.32, 0.42);
      const quietZone = almond(driftX + 0.12, driftY - 0.16, 0.13, 0.18);
      return Math.max(horizontal * 0.86, vertical * 0.8, relayA * 0.68, relayB * 0.62, relayC * 0.7)
        - Math.max(0, quietZone) * 0.52 + noise;
    }
    case "archipelago": {
      const islandA = almond(driftX + 0.58, driftY + 0.16, 0.48, 0.31);
      const islandB = almond(driftX + 0.04, driftY - 0.24, 0.6, 0.36);
      const islandC = almond(driftX - 0.6, driftY + 0.14, 0.42, 0.3);
      const islandD = almond(driftX - 0.18, driftY + 0.42, 0.32, 0.19);
      const tidalBridge = ribbon(
        driftX,
        driftY,
        Math.sin(driftX * 2.4 + phase * 0.3) * 0.18,
        0.085,
        0.94,
      );
      const lagoonA = almond(driftX + 0.1, driftY - 0.22, 0.18, 0.13);
      const lagoonB = almond(driftX - 0.56, driftY + 0.12, 0.11, 0.09);
      return Math.max(islandA * 0.72, islandB * 0.86, islandC * 0.68, islandD * 0.58, tidalBridge * 0.56)
        - Math.max(0, lagoonA, lagoonB) * 0.62 + noise;
    }
    case "canopy": {
      const crownA = almond(driftX + 0.48, driftY + 0.28, 0.55, 0.42);
      const crownB = almond(driftX - 0.04, driftY + 0.4, 0.66, 0.35);
      const crownC = almond(driftX - 0.58, driftY + 0.2, 0.46, 0.38);
      const stemCenter = Math.sin(driftY * 2.5 + phase * 0.28) * 0.13;
      const stem = ribbon(driftY, driftX, stemCenter, 0.11, 0.9);
      const branch = ribbon(
        driftX,
        driftY,
        Math.sin(driftX * 2.8 - phase * 0.3) * 0.16 + 0.05,
        0.08,
        0.82,
      );
      const apertureA = almond(driftX + 0.38, driftY + 0.3, 0.13, 0.16);
      const apertureB = almond(driftX - 0.3, driftY + 0.34, 0.17, 0.11);
      return Math.max(crownA * 0.72, crownB * 0.78, crownC * 0.68, stem * 0.78, branch * 0.62)
        - Math.max(0, apertureA, apertureB) * 0.55 + noise;
    }
    case "fold": {
      const upperFold = Math.sin(driftX * 2.2 + phase * 0.28 + seedPhase) * 0.13 - 0.22;
      const lowerFold = Math.sin(driftX * 2.65 - phase * 0.24) * 0.16 + 0.23;
      const upperSheet = ribbon(driftX, driftY, upperFold, 0.24, 1.08);
      const lowerSheet = ribbon(driftX * 0.94, driftY, lowerFold, 0.22, 1.02);
      const clasp = annulus(driftX - 0.34, driftY + 0.02, 0.11, 0.32);
      const pocket = almond(driftX + 0.42, driftY - 0.03, 0.22, 0.28);
      const slit = ribbon(
        driftX * 0.72,
        driftY,
        Math.sin(driftX * 3.4 + phase * 0.32) * 0.08,
        0.045,
        0.66,
      );
      return Math.max(upperSheet * 0.76, lowerSheet * 0.72, clasp * 0.64, pocket * 0.58)
        - Math.max(0, slit) * 0.46 + noise;
    }
  }
}

export function drawDottedSigil(
  context: CanvasRenderingContext2D,
  options: DottedSigilOptions,
) {
  const {
    centerX,
    centerY,
    viewportWidth,
    viewportHeight,
    gridStep,
    radius,
    alpha,
    seed,
    time,
    arrival,
    emphasis,
    layered,
    maturation,
    velocity,
    repeat,
    expansion,
    stretch,
    curvature,
    accentContext,
    occupiedCells,
    midi = 60,
  } = options;
  if (radius <= 0 || alpha <= 0) return;

  const archetype = ARCHETYPES[Math.abs(seed + midi * 3) % ARCHETYPES.length];
  const palette = PIXEL_PALETTES[Math.abs(midi * 3 + repeat * 5) % PIXEL_PALETTES.length];
  const saturatedPrimary = {
    h: palette.primary.h,
    s: palette.primary.s,
    l: palette.primary.l,
  };
  const saturatedAccent = {
    h: palette.accent.h,
    s: palette.accent.s,
    l: palette.accent.l,
  };
  const saturatedBodyColors = [
    saturatedPrimary,
    mixColor(saturatedPrimary, saturatedAccent, 0.24),
    mixColor(saturatedPrimary, saturatedAccent, 0.5),
    mixColor(saturatedPrimary, saturatedAccent, 0.76),
    saturatedAccent,
  ] as const;
  const whiteLight = { h: saturatedAccent.h, s: 6, l: 96 };
  const whiteTransition = maturation * maturation * (3 - maturation * 2);
  const luminosityStops = [0, 0.02, 0.05, 0.1, 0.2] as const;
  const bodyColors = saturatedBodyColors.map((color, index) =>
    mixColor(
      color,
      whiteLight,
      clamp(
        luminosityStops[index] +
          whiteTransition * (0.02 + index * 0.025) +
          (layered ? index * 0.015 : 0),
        0,
        0.9,
      ),
    ),
  );
  const coloredHighlight = {
    h: saturatedAccent.h,
    s: clamp(saturatedAccent.s + 2, 0, 100),
    l: clamp(saturatedAccent.l + 20, 0, 84),
  };
  const highlightColor = mixColor(
    coloredHighlight,
    whiteLight,
    clamp(0.38 + whiteTransition * 0.62 + (layered ? 0.08 : 0), 0, 1),
  );
  const phase = time * 0.00072 + hash(seed, 17) * TAU;
  const flip = hash(seed, 91) > 0.5 ? 1 : -1;
  const density = clamp(0.56 + velocity * 0.08 + Math.min(repeat, 7) * 0.008, 0.56, 0.72);
  const footprintGrowth = Math.pow(clamp(expansion, 0, 1), 0.82);
  // Match Halftone's compact, aspect-ratio-independent footprint. Basing both
  // axes on the short side prevents a single Pixel note from spanning most of
  // a wide display while preserving the exact-square pixel grid within it.
  const footprintBasis = Math.min(viewportWidth, viewportHeight);
  const compactWidth = lerp(0.18, 0.26, hash(seed, 211));
  const expandedWidth = lerp(0.28, 0.4, hash(seed, 211));
  const compactHeight = lerp(0.13, 0.18, hash(seed, 227));
  const expandedHeight = lerp(0.2, 0.29, hash(seed, 227));
  const widthVariation = lerp(0.96, 1.04, clamp((stretch - 0.78) / 0.54, 0, 1));
  const heightVariation = archetype === "canopy" ? 1.04 : 1;
  const fieldWidth = footprintBasis * lerp(compactWidth, expandedWidth, footprintGrowth) * widthVariation;
  const fieldHeight = footprintBasis * lerp(compactHeight, expandedHeight, footprintGrowth) * heightVariation;
  const startColumn = Math.floor((centerX - fieldWidth) / gridStep);
  const endColumn = Math.ceil((centerX + fieldWidth) / gridStep);
  const startRow = Math.floor((centerY - fieldHeight) / gridStep);
  const endRow = Math.ceil((centerY + fieldHeight) / gridStep);
  const pixelSize = Math.max(1, Math.round(gridStep * 0.5));
  const reservedCells = occupiedCells ?? new Set<number>();
  const bodyPaths = bodyColors.map(() => new Path2D());
  const glowPath = new Path2D();
  let activeCellCount = 0;
  let glowCellCount = 0;

  for (let row = startRow; row <= endRow; row += 1) {
    const gridY = row * gridStep;
    const v = (gridY - centerY) / fieldHeight;
    for (let column = startColumn; column <= endColumn; column += 1) {
      const gridX = column * gridStep;
      const u = ((gridX - centerX) / fieldWidth) * flip;
      const occupancy = fieldMask(archetype, u, v, phase, seed, curvature);
      if (occupancy <= -0.035) continue;

      const cellIndex = row * 4099 + column;
      const flow = 0.5 + Math.sin(
        column * 0.145 + row * 0.085 - phase * 1.65 + hash(seed, 23) * TAU,
      ) * 0.5;
      const envelope = clamp((occupancy + 0.08) * 0.92, 0, 1);
      const revealOrder = clamp(
        Math.hypot(u * 0.7, v * 0.7) * 0.24 + hash(seed + 809, cellIndex) * 0.16,
        0,
        0.42,
      );
      const reveal = clamp((arrival - revealOrder) / 0.26, 0, 1);
      const activation = density * envelope * (0.62 + flow * 0.38) * reveal;
      const cellChance = hash(seed + row * 47, column * 131);
      if (cellChance > activation) continue;

      const toneRoll = clamp(
        hash(seed + 487, cellIndex) * 0.5 + flow * 0.34 + envelope * 0.16,
        0,
        1,
      );
      const cellKey = gridCellKey(column, row);
      if (reservedCells.has(cellKey)) continue;
      reservedCells.add(cellKey);

      const tone = toneRoll < 0.2 ? 0 : toneRoll < 0.4 ? 1 : toneRoll < 0.6 ? 2 : toneRoll < 0.8 ? 3 : 4;
      pixel(bodyPaths[tone], gridX, gridY, pixelSize);
      activeCellCount += 1;

      const intensity = clamp(0.42 + occupancy * 0.48 + flow * 0.16, 0.35, 1);
      const glowChance = hash(seed + 367, column * 313 + row);
      const glowDensity = layered
        ? 0.14 + emphasis * 0.08
        : 0.02 + emphasis * 0.035;
      if (glowChance <= intensity * glowDensity) {
        pixel(glowPath, gridX, gridY, pixelSize);
        glowCellCount += 1;
      }
    }
  }

  if (activeCellCount === 0) return;

  context.save();
  context.globalAlpha = clamp(alpha, 0, 1);
  context.imageSmoothingEnabled = false;
  for (let tone = 0; tone < bodyColors.length; tone += 1) {
    context.fillStyle = fillColor(bodyColors[tone], 1);
    context.fill(bodyPaths[tone]);
  }

  context.fillStyle = fillColor(highlightColor, 1);
  context.fill(glowPath);
  context.restore();

  if (accentContext && glowCellCount > 0) {
    accentContext.save();
    accentContext.globalAlpha = clamp(alpha * (0.55 + emphasis * 0.3), 0, 1);
    accentContext.imageSmoothingEnabled = false;
    accentContext.fillStyle = fillColor(highlightColor, 1);
    accentContext.fill(glowPath);
    accentContext.restore();
  }
}

export function dottedSigilBounds(radius: number, stretch = 1) {
  return {
    width: radius * (2.2 + (clamp(stretch, 0.88, 1.18) - 1) * 0.4),
    height: radius * 2.5,
  };
}
