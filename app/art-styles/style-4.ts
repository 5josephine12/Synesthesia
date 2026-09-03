import {
  Color,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
} from "three";

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

const MAX_LIQUID_NODES = 12;
const LIQUID_FORMATION_DURATION = 2100;
const LIQUID_PIXEL_BUDGET = 820_000;

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  #define MAX_LIQUID_NODES 12

  varying vec2 vUv;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uEnergy;
  uniform int uCount;
  uniform vec4 uNodes[MAX_LIQUID_NODES];
  uniform vec3 uColorA;
  uniform vec3 uColorB;

  float hash21(vec2 point) {
    point = fract(point * vec2(123.34, 456.21));
    point += dot(point, point + 45.32);
    return fract(point.x * point.y);
  }

  float valueNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    float a = hash21(cell);
    float b = hash21(cell + vec2(1.0, 0.0));
    float c = hash21(cell + vec2(0.0, 1.0));
    float d = hash21(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
  }

  mat2 rotate2d(float angle) {
    float sine = sin(angle);
    float cosine = cos(angle);
    return mat2(cosine, -sine, sine, cosine);
  }

  void main() {
    float aspect = uResolution.x / max(1.0, uResolution.y);
    vec2 surfacePoint = vUv - 0.5;
    surfacePoint.x *= aspect;

    float slowTime = uTime * 0.12;
    float contourNoise = valueNoise(surfacePoint * 4.1 + vec2(slowTime, -slowTime * 0.63));
    float fineNoise = valueNoise(surfacePoint * 10.5 - vec2(slowTime * 0.37, slowTime * 0.44));
    vec2 flow = vec2(contourNoise - 0.5, fineNoise - 0.5) * (0.026 + uEnergy * 0.012);
    vec2 warpedPoint = surfacePoint + flow;

    float field = 0.0;
    vec2 gradient = vec2(0.0);
    for (int index = 0; index < MAX_LIQUID_NODES; index += 1) {
      if (index >= uCount) continue;
      vec4 node = uNodes[index];
      vec2 center = node.xy - 0.5;
      center.x *= aspect;
      vec2 delta = warpedPoint - center;
      float angle = node.w * 6.2831853 + slowTime * (0.08 + node.w * 0.07);
      delta = rotate2d(angle) * delta;
      float stretch = mix(0.72, 1.62, fract(node.w * 7.13));
      delta.x /= stretch;
      delta.y *= mix(0.86, 1.18, fract(node.w * 11.7));
      float radiusSquared = node.z * node.z;
      float distanceSquared = dot(delta, delta) + 0.0045;
      float contribution = radiusSquared / distanceSquared;
      field += contribution;
      gradient += (-2.0 * radiusSquared * delta) / (distanceSquared * distanceSquared);
    }

    field += (contourNoise - 0.5) * 0.2 + (fineNoise - 0.5) * 0.065;
    float liquid = smoothstep(0.84, 1.02, field);
    if (liquid <= 0.001) discard;

    vec3 normal = normalize(vec3(-gradient * 0.038, 1.0));
    vec3 viewDirection = normalize(vec3((vUv - 0.5) * 0.42, 1.0));
    vec3 reflected = reflect(-viewDirection, normal);
    float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);
    float fresnel = pow(1.0 - facing, 3.4);

    float environmentHeight = clamp(reflected.y * 0.5 + 0.5, 0.0, 1.0);
    float horizon = exp(-pow(reflected.y * 7.5, 2.0));
    float verticalSweep = 0.5 + 0.5 * sin(reflected.x * 10.0 + reflected.y * 5.0 + slowTime);
    float colorMix = clamp(verticalSweep * 0.58 + fresnel * 0.42, 0.0, 1.0);
    vec3 paletteReflection = mix(uColorA, uColorB, colorMix);
    vec3 warmReflection = vec3(1.0, 0.73, 0.28);
    float warmBand = exp(-pow((reflected.x + reflected.y * 0.34 - 0.18) * 9.0, 2.0));
    paletteReflection = mix(paletteReflection, warmReflection, warmBand * 0.22);

    vec3 lowSilver = vec3(0.035, 0.045, 0.055);
    vec3 highSilver = vec3(0.88, 0.92, 0.95);
    vec3 silver = mix(lowSilver, highSilver, smoothstep(0.08, 0.9, environmentHeight));
    silver = mix(silver, vec3(0.985), horizon * 0.72);

    vec3 lightA = normalize(vec3(-0.56, 0.62, 0.74));
    vec3 lightB = normalize(vec3(0.64, -0.28, 0.72));
    float highlightA = pow(max(dot(normal, lightA), 0.0), 78.0);
    float highlightB = pow(max(dot(normal, lightB), 0.0), 42.0);
    float microHighlight = pow(max(0.0, 0.68 + 0.32 * sin(field * 8.0 - slowTime)), 18.0);

    vec3 color = silver * (0.72 + facing * 0.32);
    color += paletteReflection * (0.1 + fresnel * 0.42 + horizon * 0.08);
    color += vec3(1.0) * highlightA * (1.25 + uEnergy * 0.35);
    color += mix(uColorB, vec3(1.0), 0.72) * highlightB * 0.72;
    color += vec3(0.72, 0.77, 0.82) * microHighlight * 0.075;

    float innerEdge = smoothstep(0.88, 1.02, field);
    float contour = smoothstep(0.83, 0.91, field) * (1.0 - smoothstep(0.96, 1.06, field));
    color = mix(vec3(0.055, 0.065, 0.072), color, innerEdge);
    color += paletteReflection * contour * 0.12;
    color = color / (color + vec3(0.72));
    color = pow(color, vec3(0.88));

    gl_FragColor = vec4(color, liquid * 0.985);
  }
`;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function hash(seed: number) {
  let value = seed >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}

function easeOutCubic(value: number) {
  const progress = clamp(value, 0, 1);
  return 1 - Math.pow(1 - progress, 3);
}

class LiquidMetalRenderer {
  readonly canvas: HTMLCanvasElement;

  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new PlaneGeometry(2, 2);
  private readonly nodes = Array.from({ length: MAX_LIQUID_NODES }, () => new Vector4());
  private readonly material: ShaderMaterial;
  private readonly resolution = new Vector2(1, 1);
  private readonly colorA = new Vector3(0.72, 0.82, 1);
  private readonly colorB = new Vector3(1, 0.56, 0.78);
  private readonly bodyColor = new Color();
  private readonly accentColor = new Color();
  private width = 0;
  private height = 0;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("aria-hidden", "true");
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
      precision: "highp",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setPixelRatio(1);

    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        uResolution: { value: this.resolution },
        uTime: { value: 0 },
        uEnergy: { value: 0 },
        uCount: { value: 0 },
        uNodes: { value: this.nodes },
        uColorA: { value: this.colorA },
        uColorB: { value: this.colorB },
      },
    });
    this.scene.add(new Mesh(this.geometry, this.material));
  }

  private syncSize(width: number, height: number) {
    const scale = Math.min(1, Math.sqrt(LIQUID_PIXEL_BUDGET / Math.max(1, width * height)));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    if (targetWidth === this.width && targetHeight === this.height) return;
    this.width = targetWidth;
    this.height = targetHeight;
    this.renderer.setSize(targetWidth, targetHeight, false);
    this.resolution.set(targetWidth, targetHeight);
  }

  render(options: LiquidMetalFrameOptions): LiquidMetalFrame | null {
    const { particles, width, height, now, reducedMotion } = options;
    if (width <= 0 || height <= 0) return null;
    this.syncSize(width, height);

    const active: LiquidMetalParticleState[] = [];
    for (let index = particles.length - 1; index >= 0 && active.length < MAX_LIQUID_NODES; index -= 1) {
      const particle = particles[index];
      if (particle.artStyle !== "style-4") continue;
      active.push(particle);
    }
    active.reverse();
    if (active.length === 0) {
      this.renderer.clear();
      return null;
    }

    let forming = false;
    let energy = 0;
    for (let index = 0; index < MAX_LIQUID_NODES; index += 1) {
      const particle = active[index];
      if (!particle) {
        this.nodes[index].set(0, 0, 0, 0);
        continue;
      }
      const effectiveNow = particle.frozenAt ?? now;
      const age = reducedMotion && particle.frozenAt === undefined
        ? LIQUID_FORMATION_DURATION
        : Math.max(0, effectiveNow - particle.createdAt);
      const arrival = easeOutCubic(age / LIQUID_FORMATION_DURATION);
      if (arrival < 0.999 && particle.frozenAt === undefined) forming = true;
      const radius = clamp(
        (0.105 + particle.radius * 0.42 + particle.velocity * 0.018) * arrival,
        0.001,
        0.205,
      );
      this.nodes[index].set(
        particle.x,
        1 - particle.y,
        radius,
        hash(particle.id * 4099 + particle.midi * 131 + particle.repeat * 17),
      );
      energy += particle.velocity;
    }

    const palette = active[active.length - 1];
    const body = palette.color ?? palette.accent ?? { h: 220, s: 70, l: 62 };
    const accent = palette.accent ?? palette.color ?? { h: 326, s: 72, l: 64 };
    this.bodyColor.setHSL((body.h % 360) / 360, 0.58, 0.66);
    this.accentColor.setHSL((accent.h % 360) / 360, 0.62, 0.68);
    this.colorA.set(this.bodyColor.r, this.bodyColor.g, this.bodyColor.b);
    this.colorB.set(this.accentColor.r, this.accentColor.g, this.accentColor.b);
    this.material.uniforms.uCount.value = active.length;
    this.material.uniforms.uEnergy.value = clamp(energy / Math.max(1, active.length), 0, 1);
    const newest = active[active.length - 1];
    const newestNow = newest.frozenAt ?? now;
    const settledNow = Math.min(newestNow, newest.createdAt + LIQUID_FORMATION_DURATION);
    this.material.uniforms.uTime.value = (
      reducedMotion && newest.frozenAt === undefined
        ? newest.createdAt + LIQUID_FORMATION_DURATION
        : settledNow
    ) * 0.001;
    this.renderer.render(this.scene, this.camera);
    return { canvas: this.canvas, forming };
  }

  reset() {
    this.material.uniforms.uCount.value = 0;
    this.renderer.clear();
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }
}

let liquidMetalRenderer: LiquidMetalRenderer | null = null;
let webglUnavailable = false;

function getLiquidMetalRenderer() {
  if (webglUnavailable) return null;
  try {
    liquidMetalRenderer ??= new LiquidMetalRenderer();
    return liquidMetalRenderer;
  } catch {
    webglUnavailable = true;
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
  webglUnavailable = false;
}
