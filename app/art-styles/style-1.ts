/**
 * Style 1 glyphs generated with QuiverAI Arrow 2.0.
 * Geometry is the Quiver SVG path data, simplified to a single filled shape.
 */

export const STYLE_1_GLYPHS = [
  "circle",
  "triangle",
  "square",
  "diamond",
  "plus",
  "hexagon",
] as const;

export type Style1GlyphId = (typeof STYLE_1_GLYPHS)[number];

type Style1Glyph = {
  width: number;
  height: number;
  trace: (context: CanvasRenderingContext2D) => void;
};

function polygon(context: CanvasRenderingContext2D, points: readonly number[]) {
  context.moveTo(points[0], points[1]);
  for (let index = 2; index < points.length; index += 2) {
    context.lineTo(points[index], points[index + 1]);
  }
  context.closePath();
}

const GLYPHS: Record<Style1GlyphId, Style1Glyph> = {
  circle: {
    width: 276,
    height: 276,
    trace(context) {
      context.arc(138.2, 138.2, 121, 0, Math.PI * 2);
    },
  },
  triangle: {
    width: 80,
    height: 71,
    trace(context) {
      polygon(context, [75.38, 66.56, 4.621, 66.56, 39.96, 4.434]);
    },
  },
  square: {
    width: 448,
    height: 512,
    trace(context) {
      context.roundRect(21.4, 32, 405.3, 448, 21.33);
    },
  },
  diamond: {
    width: 499,
    height: 812.1,
    trace(context) {
      polygon(context, [249.3, 38.4, 40.4, 407.5, 249.3, 775.6, 458.7, 407.1]);
    },
  },
  plus: {
    width: 100,
    height: 100,
    trace(context) {
      polygon(context, [59, 40, 59, 5, 41, 5, 41, 40, 6, 40, 6, 59, 41, 59, 41, 95, 59, 95, 59, 59, 94, 59, 94, 40]);
    },
  },
  hexagon: {
    width: 240,
    height: 214.5,
    trace(context) {
      polygon(context, [173.7, 14.5, 66.3, 14.5, 13.1, 107.4, 66.3, 200.1, 173.7, 200.1, 226.9, 107.4]);
    },
  },
};

export function style1GlyphForBlob(id: number, repeat: number): Style1GlyphId {
  const index = ((id + repeat) % STYLE_1_GLYPHS.length + STYLE_1_GLYPHS.length) % STYLE_1_GLYPHS.length;
  return STYLE_1_GLYPHS[index];
}

export function drawStyle1Glyph(
  context: CanvasRenderingContext2D,
  glyphId: Style1GlyphId,
) {
  const glyph = GLYPHS[glyphId];
  context.beginPath();
  glyph.trace(context);
}

export function style1GlyphBounds(glyphId: Style1GlyphId) {
  const glyph = GLYPHS[glyphId];
  return { width: glyph.width, height: glyph.height };
}
