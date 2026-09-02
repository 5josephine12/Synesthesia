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

const TAU = Math.PI * 2;

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

function hash(seed: number, index: number) {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}

function hsla(hue: number, saturation: number, lightness: number, alpha: number) {
  return `hsla(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(lightness)}%, ${clamp(alpha, 0, 1)})`;
}

function traceMechanicalPlate(
  context: CanvasRenderingContext2D,
  length: number,
  height: number,
  variant: number,
  curvature: number,
) {
  const notch = (0.1 + variant * 0.018) * length;
  const bend = curvature * height * 0.12;
  context.beginPath();
  context.moveTo(-length * 0.52, height * (0.08 + variant * 0.018));
  context.lineTo(-length * 0.34, -height * 0.42 + bend);
  context.lineTo(-length * 0.1, -height * (0.5 - variant * 0.035));
  context.lineTo(length * 0.02, -height * 0.32);
  context.lineTo(length * 0.18 + notch, -height * 0.46 - bend);
  context.lineTo(length * 0.54, -height * 0.12);
  context.lineTo(length * 0.37, height * 0.26 + bend);
  context.lineTo(length * 0.08, height * (0.48 - variant * 0.025));
  context.lineTo(-length * 0.12, height * 0.29);
  context.lineTo(-length * 0.41, height * 0.42 - bend);
  context.closePath();
}

function chromeGradient(
  context: CanvasRenderingContext2D,
  length: number,
  height: number,
  alpha: number,
  accentHue: number,
  reverse: boolean,
) {
  const gradient = context.createLinearGradient(
    -length * 0.48,
    reverse ? height * 0.36 : -height * 0.38,
    length * 0.5,
    reverse ? -height * 0.34 : height * 0.4,
  );
  gradient.addColorStop(0, `rgba(1, 3, 9, ${alpha * 0.96})`);
  gradient.addColorStop(0.16, `rgba(20, 27, 42, ${alpha * 0.98})`);
  gradient.addColorStop(0.3, hsla(218, 40, 76, alpha * 0.84));
  gradient.addColorStop(0.39, `rgba(250, 253, 255, ${alpha})`);
  gradient.addColorStop(0.47, hsla(190, 94, 75, alpha * 0.96));
  gradient.addColorStop(0.59, `rgba(9, 14, 25, ${alpha * 0.98})`);
  gradient.addColorStop(0.73, hsla(accentHue, 88, 71, alpha * 0.88));
  gradient.addColorStop(0.84, `rgba(238, 246, 255, ${alpha * 0.94})`);
  gradient.addColorStop(1, `rgba(3, 5, 12, ${alpha * 0.96})`);
  return gradient;
}

export function drawMetalheartParticle(
  context: CanvasRenderingContext2D,
  options: MetalheartParticleOptions,
) {
  const {
    seed,
    midi,
    radius,
    alpha,
    arrival,
    time,
    stretch,
    thickness,
    curvature,
    velocity,
    repeat,
  } = options;
  if (radius <= 0 || alpha <= 0) return;

  const reveal = easeOutCubic(arrival);
  const formation = clamp(time / 1600, 0, 1);
  const flex = (1 - formation) * Math.sin(time * 0.0022 + seed * 0.017) * 0.075;
  const accentHue = (midi + repeat) % 3 === 0 ? 314 : (midi + repeat) % 3 === 1 ? 205 : 184;
  const length = radius * (1.82 + stretch * 0.54) * lerp(0.62, 1, reveal);
  const height = radius * (0.62 + thickness * 0.82) * lerp(0.76, 1, reveal);
  const plateCount = 3 + Math.floor(hash(seed, 2) * 3);

  context.save();
  context.rotate(flex);
  context.globalAlpha = alpha;
  context.lineJoin = "miter";
  context.lineCap = "square";

  // A dark extrusion gives the sculpture weight without relying on expensive blur.
  context.save();
  context.translate(radius * 0.055, radius * 0.075);
  context.fillStyle = `rgba(0, 2, 8, ${0.72 * reveal})`;
  traceMechanicalPlate(context, length, height, 2, curvature);
  context.fill();
  context.restore();

  for (let plate = 0; plate < plateCount; plate += 1) {
    const plateProgress = plateCount === 1 ? 0.5 : plate / (plateCount - 1);
    const plateReveal = clamp((reveal - plateProgress * 0.14) / 0.72, 0, 1);
    if (plateReveal <= 0) continue;
    const direction = plate % 2 === 0 ? 1 : -1;
    const plateLength = length * lerp(0.38, 0.78, hash(seed, 20 + plate));
    const plateHeight = height * lerp(0.34, 0.76, hash(seed, 40 + plate));
    const plateX = lerp(-length * 0.28, length * 0.3, plateProgress);
    const plateY = direction * height * lerp(0.05, 0.28, hash(seed, 60 + plate));
    const plateAngle = direction * lerp(0.06, 0.32, hash(seed, 80 + plate)) + flex * 0.8;

    context.save();
    context.translate(plateX, plateY);
    context.rotate(plateAngle);
    context.scale(lerp(0.42, 1, plateReveal), lerp(0.72, 1, plateReveal));
    context.fillStyle = chromeGradient(
      context,
      plateLength,
      plateHeight,
      plateReveal,
      accentHue + plate * 5,
      plate % 2 === 1,
    );
    traceMechanicalPlate(context, plateLength, plateHeight, plate, curvature * direction);
    context.fill();

    context.strokeStyle = plate % 2 === 0
      ? `rgba(245, 251, 255, ${0.58 * plateReveal})`
      : hsla(accentHue, 92, 80, 0.48 * plateReveal);
    context.lineWidth = Math.max(0.55, radius * 0.014);
    context.stroke();

    context.beginPath();
    context.moveTo(-plateLength * 0.31, -plateHeight * 0.18);
    context.lineTo(plateLength * 0.27, plateHeight * 0.1);
    context.strokeStyle = `rgba(255, 255, 255, ${0.7 * plateReveal})`;
    context.lineWidth = Math.max(0.45, radius * 0.009);
    context.stroke();
    context.restore();
  }

  // A continuous liquid-metal spine binds individual plates into one sculpture.
  const ribbonGradient = context.createLinearGradient(-length * 0.54, 0, length * 0.54, 0);
  ribbonGradient.addColorStop(0, `rgba(2, 4, 11, ${0.2 * reveal})`);
  ribbonGradient.addColorStop(0.22, hsla(220, 34, 74, 0.74 * reveal));
  ribbonGradient.addColorStop(0.43, `rgba(255, 255, 255, ${0.92 * reveal})`);
  ribbonGradient.addColorStop(0.56, hsla(191, 96, 76, 0.88 * reveal));
  ribbonGradient.addColorStop(0.72, `rgba(7, 11, 23, ${0.86 * reveal})`);
  ribbonGradient.addColorStop(0.88, hsla(accentHue, 92, 76, 0.72 * reveal));
  ribbonGradient.addColorStop(1, `rgba(2, 4, 10, ${0.08 * reveal})`);
  context.beginPath();
  context.moveTo(-length * 0.56, height * 0.1);
  context.bezierCurveTo(
    -length * 0.22,
    -height * (0.52 + curvature * 0.08),
    length * 0.18,
    height * (0.48 - curvature * 0.07),
    length * 0.58,
    -height * 0.07,
  );
  context.strokeStyle = ribbonGradient;
  context.lineWidth = Math.max(1, height * (0.18 + velocity * 0.08));
  context.stroke();

  context.beginPath();
  context.moveTo(-length * 0.5, height * 0.06);
  context.bezierCurveTo(-length * 0.18, -height * 0.42, length * 0.2, height * 0.38, length * 0.52, -height * 0.05);
  context.strokeStyle = `rgba(255, 255, 255, ${0.72 * reveal})`;
  context.lineWidth = Math.max(0.5, radius * 0.012);
  context.stroke();

  // Fine mechanical struts echo the references without adding persistent DOM or textures.
  const strutCount = 3 + ((seed + repeat) % 3);
  for (let strut = 0; strut < strutCount; strut += 1) {
    const phase = (strut / strutCount) * TAU + hash(seed, 120 + strut) * 0.8;
    const inner = radius * lerp(0.18, 0.42, hash(seed, 140 + strut));
    const outer = radius * lerp(0.78, 1.38, hash(seed, 160 + strut)) * reveal;
    context.beginPath();
    context.moveTo(Math.cos(phase) * inner, Math.sin(phase) * inner);
    context.lineTo(Math.cos(phase + curvature * 0.04) * outer, Math.sin(phase + curvature * 0.04) * outer);
    context.strokeStyle = strut % 2 === 0
      ? `rgba(231, 242, 255, ${0.38 * reveal})`
      : hsla(accentHue, 86, 72, 0.32 * reveal);
    context.lineWidth = Math.max(0.45, radius * 0.008);
    context.stroke();
  }

  context.restore();
}

export function drawMetalheartPulse(
  context: CanvasRenderingContext2D,
  options: MetalheartPulseOptions,
) {
  const { centerX, centerY, width, height, progress, strength } = options;
  if (progress < 0 || progress >= 1 || strength <= 0) return;
  const fade = Math.pow(1 - progress, 2) * clamp(strength, 0, 1);
  const sweepX = lerp(-width * 0.18, width * 1.18, easeOutCubic(progress));
  const bandWidth = clamp(Math.min(width, height) * 0.075, 36, 110);

  context.save();
  context.globalCompositeOperation = "screen";

  const sweep = context.createLinearGradient(
    sweepX - bandWidth,
    0,
    sweepX + bandWidth,
    0,
  );
  sweep.addColorStop(0, "rgba(84, 136, 255, 0)");
  sweep.addColorStop(0.36, `rgba(102, 211, 255, ${fade * 0.055})`);
  sweep.addColorStop(0.5, `rgba(255, 255, 255, ${fade * 0.11})`);
  sweep.addColorStop(0.66, `rgba(241, 116, 255, ${fade * 0.055})`);
  sweep.addColorStop(1, "rgba(241, 116, 255, 0)");
  context.fillStyle = sweep;
  context.fillRect(0, 0, width, height);

  const rippleRadius = Math.min(width, height) * lerp(0.035, 0.22, easeOutCubic(progress));
  context.beginPath();
  context.ellipse(centerX, centerY, rippleRadius * 1.7, rippleRadius, -0.12, 0, TAU);
  context.strokeStyle = `rgba(205, 241, 255, ${fade * 0.32})`;
  context.lineWidth = Math.max(0.6, Math.min(width, height) * 0.0015);
  context.stroke();

  const bloom = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, rippleRadius * 1.45);
  bloom.addColorStop(0, `rgba(255, 255, 255, ${fade * 0.12})`);
  bloom.addColorStop(0.36, `rgba(105, 218, 255, ${fade * 0.06})`);
  bloom.addColorStop(0.72, `rgba(230, 118, 255, ${fade * 0.025})`);
  bloom.addColorStop(1, "rgba(120, 160, 255, 0)");
  context.fillStyle = bloom;
  context.fillRect(centerX - rippleRadius * 1.45, centerY - rippleRadius * 1.45, rippleRadius * 2.9, rippleRadius * 2.9);
  context.restore();
}
