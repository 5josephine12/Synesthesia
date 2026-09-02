import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshPhysicalMaterial,
  NormalBlending,
  PointLight,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Shape,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Object3D,
  type WebGLRenderTarget,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

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

const CAMERA_FOV = 31;
const CAMERA_DISTANCE = 12;
const FORMATION_DURATION = 1900;
const MAX_SCULPTURE_NODES = 8;
const WEBGL_PIXEL_BUDGET = 1_050_000;
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

function easeInOutSine(value: number) {
  return -(Math.cos(Math.PI * clamp(value, 0, 1)) - 1) / 2;
}

function hash(seed: number, index: number) {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}

function makeBladeGeometry() {
  const shape = new Shape();
  shape.moveTo(-1.42, -0.035);
  shape.lineTo(-0.78, -0.11);
  shape.lineTo(-0.2, -0.07);
  shape.lineTo(0.08, -0.17);
  shape.lineTo(1.48, -0.018);
  shape.lineTo(0.48, 0.085);
  shape.lineTo(0.12, 0.14);
  shape.lineTo(-0.3, 0.065);
  shape.lineTo(-0.92, 0.12);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.026,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.009,
    bevelThickness: 0.009,
  });
  geometry.center();
  geometry.computeVertexNormals();
  return geometry;
}

function makeRibbonGeometry(
  seed: number,
  length: number,
  width: number,
  depth: number,
  curvature: number,
  offset = 0,
) {
  const crossSection = new Shape();
  crossSection.moveTo(-width * 0.5, -depth * 0.5);
  crossSection.lineTo(width * 0.5, -depth * 0.5);
  crossSection.lineTo(width * 0.5, depth * 0.5);
  crossSection.lineTo(-width * 0.5, depth * 0.5);
  crossSection.closePath();

  const points: Vector3[] = [];
  const phase = hash(seed, 2) * TAU + offset;
  for (let index = 0; index < 7; index += 1) {
    const progress = index / 6;
    const taper = Math.sin(progress * Math.PI);
    points.push(
      new Vector3(
        (progress - 0.5) * length,
        Math.sin(progress * Math.PI * 1.85 + phase) * width * (1.1 + taper * 1.45) +
          curvature * width * (progress - 0.5) * 1.25 +
          (hash(seed, 40 + index) - 0.5) * width * 3.4,
        Math.cos(progress * Math.PI * 2.35 + phase * 0.72) * width * (0.72 + taper * 1.7) +
          (hash(seed, 60 + index) - 0.5) * width * 2.8,
      ),
    );
  }
  const path = new CatmullRomCurve3(points, false, "centripetal", 0.45);
  const geometry = new ExtrudeGeometry(crossSection, {
    steps: 30,
    bevelEnabled: false,
    extrudePath: path,
  });
  geometry.computeVertexNormals();
  return geometry;
}

function createRadialTexture(inner: string, outer: string, size = 128) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.34, inner);
  gradient.addColorStop(1, outer);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function createStreakTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 32;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const horizontal = context.createLinearGradient(0, 0, canvas.width, 0);
  horizontal.addColorStop(0, "rgba(255, 255, 255, 0)");
  horizontal.addColorStop(0.38, "rgba(255, 255, 255, 0.38)");
  horizontal.addColorStop(0.5, "rgba(255, 255, 255, 1)");
  horizontal.addColorStop(0.62, "rgba(255, 255, 255, 0.38)");
  horizontal.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = horizontal;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "destination-in";
  const vertical = context.createLinearGradient(0, 0, 0, canvas.height);
  vertical.addColorStop(0, "rgba(255, 255, 255, 0)");
  vertical.addColorStop(0.45, "rgba(255, 255, 255, 0.92)");
  vertical.addColorStop(0.55, "rgba(255, 255, 255, 0.92)");
  vertical.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = vertical;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function createBeamTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const lengthFade = context.createLinearGradient(0, 0, canvas.width, 0);
  lengthFade.addColorStop(0, "rgba(255, 255, 255, 0)");
  lengthFade.addColorStop(0.06, "rgba(255, 255, 255, 0.96)");
  lengthFade.addColorStop(0.19, "rgba(255, 255, 255, 0.5)");
  lengthFade.addColorStop(0.62, "rgba(255, 255, 255, 0.13)");
  lengthFade.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = lengthFade;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "destination-in";
  const widthFade = context.createLinearGradient(0, 0, 0, canvas.height);
  widthFade.addColorStop(0, "rgba(255, 255, 255, 0)");
  widthFade.addColorStop(0.34, "rgba(255, 255, 255, 0.2)");
  widthFade.addColorStop(0.5, "rgba(255, 255, 255, 1)");
  widthFade.addColorStop(0.66, "rgba(255, 255, 255, 0.2)");
  widthFade.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = widthFade;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function disposeObject(object: Object3D, preserve: ReadonlySet<BufferGeometry | Material>) {
  const disposableGeometries = new Set<BufferGeometry>();
  const disposableMaterials = new Set<Material>();
  object.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    if (!preserve.has(child.geometry)) disposableGeometries.add(child.geometry);
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!preserve.has(material)) disposableMaterials.add(material);
    }
  });
  for (const geometry of disposableGeometries) geometry.dispose();
  for (const material of disposableMaterials) material.dispose();
}

type ClusterRecord = {
  group: Group;
  particle: MetalheartParticleState;
  seed: number;
};

class MetalheartSculptureRenderer {
  readonly canvas: HTMLCanvasElement;

  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.1, 80);
  private readonly sculpture = new Group();
  private readonly chromeMaterial: MeshPhysicalMaterial;
  private readonly blackChromeMaterial: MeshPhysicalMaterial;
  private readonly iridescentMaterial: MeshPhysicalMaterial;
  private readonly bladeGeometry = makeBladeGeometry();
  private readonly shardGeometry = new ConeGeometry(0.045, 2.1, 4, 1, false);
  private readonly glowTexture: CanvasTexture | null;
  private readonly streakTexture: CanvasTexture | null;
  private readonly beamTexture: CanvasTexture | null;
  private readonly glowMaterial: SpriteMaterial | null;
  private readonly streakMaterial: SpriteMaterial | null;
  private readonly orangeBeamMaterial: SpriteMaterial | null;
  private readonly pinkBeamMaterial: SpriteMaterial | null;
  private readonly pulseStreak: Sprite | null;
  private readonly orangeBeam: Sprite | null;
  private readonly pinkBeam: Sprite | null;
  private readonly pulseLight = new PointLight(0xffe4d1, 0, 9.5, 1.45);
  private readonly amberLight = new PointLight(0xff5f28, 46, 15, 1.7);
  private readonly pinkLight = new PointLight(0xff257e, 39, 15, 1.8);
  private readonly environmentTarget: WebGLRenderTarget;
  private readonly preservedResources: ReadonlySet<BufferGeometry | Material>;
  private readonly clusters = new Map<number, ClusterRecord>();
  private bridge: Mesh | null = null;
  private activeSignature = "";
  private width = 0;
  private height = 0;
  private viewWidth = 1;
  private viewHeight = 1;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("aria-hidden", "true");
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      depth: true,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
      precision: "mediump",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.48;
    this.renderer.setPixelRatio(1);

    const pmrem = new PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environmentTarget = pmrem.fromScene(room, 0.035, 0.1, 100, { size: 64 });
    pmrem.dispose();
    room.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
    this.scene.environment = this.environmentTarget.texture;

    this.chromeMaterial = new MeshPhysicalMaterial({
      color: new Color(0xd1aaa4),
      metalness: 1,
      roughness: 0.065,
      clearcoat: 1,
      clearcoatRoughness: 0.055,
      iridescence: 0.16,
      iridescenceIOR: 1.55,
      iridescenceThicknessRange: [135, 520],
      envMapIntensity: 1.75,
      emissive: new Color(0x1a0603),
      emissiveIntensity: 0.035,
      side: DoubleSide,
    });
    this.blackChromeMaterial = new MeshPhysicalMaterial({
      color: new Color(0x21080f),
      metalness: 1,
      roughness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      iridescence: 0.08,
      iridescenceIOR: 1.35,
      iridescenceThicknessRange: [160, 390],
      envMapIntensity: 1.45,
      emissive: new Color(0x070103),
      emissiveIntensity: 0.02,
      side: DoubleSide,
    });
    this.iridescentMaterial = new MeshPhysicalMaterial({
      color: new Color(0xefb0bd),
      metalness: 0.96,
      roughness: 0.052,
      clearcoat: 1,
      clearcoatRoughness: 0.035,
      iridescence: 0.28,
      iridescenceIOR: 1.82,
      iridescenceThicknessRange: [110, 690],
      envMapIntensity: 1.9,
      emissive: new Color(0x210510),
      emissiveIntensity: 0.06,
      side: DoubleSide,
    });

    // Keep the texture neutral so the warm Metalheart lighting can tint every
    // halo consistently without baking a colored fringe into the bitmap.
    this.glowTexture = createRadialTexture("rgba(255, 255, 255, 0.82)", "rgba(255, 255, 255, 0)");
    this.streakTexture = createStreakTexture();
    this.beamTexture = createBeamTexture();
    this.glowMaterial = this.glowTexture
      ? new SpriteMaterial({
          map: this.glowTexture,
          color: 0xc8eeff,
          transparent: true,
          opacity: 0.46,
          depthWrite: false,
          depthTest: false,
          blending: NormalBlending,
        })
      : null;
    this.streakMaterial = this.streakTexture
      ? new SpriteMaterial({
          map: this.streakTexture,
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          depthTest: false,
          blending: AdditiveBlending,
        })
      : null;
    this.pulseStreak = this.streakMaterial ? new Sprite(this.streakMaterial) : null;
    this.orangeBeamMaterial = this.beamTexture
      ? new SpriteMaterial({
          map: this.beamTexture,
          color: 0xff5424,
          transparent: true,
          opacity: 0.58,
          depthWrite: false,
          depthTest: false,
          blending: NormalBlending,
        })
      : null;
    this.pinkBeamMaterial = this.beamTexture
      ? new SpriteMaterial({
          map: this.beamTexture,
          color: 0xff247f,
          transparent: true,
          opacity: 0.48,
          depthWrite: false,
          depthTest: false,
          blending: NormalBlending,
        })
      : null;
    this.orangeBeam = this.orangeBeamMaterial ? new Sprite(this.orangeBeamMaterial) : null;
    this.pinkBeam = this.pinkBeamMaterial ? new Sprite(this.pinkBeamMaterial) : null;

    this.preservedResources = new Set<BufferGeometry | Material>([
      this.bladeGeometry,
      this.shardGeometry,
      this.chromeMaterial,
      this.blackChromeMaterial,
      this.iridescentMaterial,
      ...(this.glowMaterial ? [this.glowMaterial] : []),
      ...(this.streakMaterial ? [this.streakMaterial] : []),
      ...(this.orangeBeamMaterial ? [this.orangeBeamMaterial] : []),
      ...(this.pinkBeamMaterial ? [this.pinkBeamMaterial] : []),
    ]);

    this.camera.position.set(0, 0, CAMERA_DISTANCE);
    this.scene.add(this.sculpture);
    this.scene.add(new AmbientLight(0xd5a1a7, 0.5));
    const keyLight = new DirectionalLight(0xfff0df, 3.65);
    keyLight.position.set(-4.5, 5.6, 7.5);
    this.scene.add(keyLight);
    this.amberLight.position.set(-4.2, -1.4, 4.5);
    this.pinkLight.position.set(4.8, 2.2, 3.5);
    this.scene.add(this.amberLight, this.pinkLight, this.pulseLight);
    if (this.orangeBeam) {
      this.orangeBeam.center.set(0.07, 0.5);
      this.orangeBeam.renderOrder = -4;
      this.scene.add(this.orangeBeam);
    }
    if (this.pinkBeam) {
      this.pinkBeam.center.set(0.09, 0.5);
      this.pinkBeam.renderOrder = -3;
      this.scene.add(this.pinkBeam);
    }
    if (this.pulseStreak) {
      this.pulseStreak.renderOrder = 20;
      this.scene.add(this.pulseStreak);
    }
  }

  private syncSize(width: number, height: number) {
    const pixelScale = Math.min(1, Math.sqrt(WEBGL_PIXEL_BUDGET / Math.max(1, width * height)));
    const targetWidth = Math.max(1, Math.round(width * pixelScale));
    const targetHeight = Math.max(1, Math.round(height * pixelScale));
    if (targetWidth !== this.width || targetHeight !== this.height) {
      this.width = targetWidth;
      this.height = targetHeight;
      this.renderer.setSize(targetWidth, targetHeight, false);
    }
    const aspect = Math.max(0.2, width / Math.max(1, height));
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.viewHeight = 2 * Math.tan(MathUtils.degToRad(CAMERA_FOV) / 2) * CAMERA_DISTANCE;
    this.viewWidth = this.viewHeight * aspect;
  }

  private particlePosition(particle: MetalheartParticleState) {
    return new Vector3(
      (particle.x - 0.5) * this.viewWidth,
      (0.5 - particle.y) * this.viewHeight,
      lerp(-1.2, 1.25, hash(particle.id, 41)),
    );
  }

  private createCluster(particle: MetalheartParticleState) {
    const seed = particle.id * 4099 + particle.midi * 131 + particle.repeat * 17;
    const group = new Group();
    const length =
      (2.4 + particle.stretch * 0.68) *
      lerp(0.72, 1.72, Math.pow(hash(seed, 4), 1.7));
    const ribbonWidth = 0.035 + particle.thickness * 0.085;
    const tintMaterial = this.iridescentMaterial.clone();
    const warmHue = hash(seed, 303) > 0.46 ? 0.035 : 0.945;
    const secondaryHue = warmHue < 0.5 ? 0.945 : 0.035;
    tintMaterial.color.setHSL(warmHue, 0.38, 0.7);
    tintMaterial.emissive.setHSL(warmHue, 0.9, 0.1);
    tintMaterial.emissiveIntensity = 0.13;
    const secondaryTintMaterial = this.iridescentMaterial.clone();
    secondaryTintMaterial.color.setHSL(secondaryHue, 0.34, 0.73);
    secondaryTintMaterial.emissive.setHSL(secondaryHue, 0.88, 0.09);
    secondaryTintMaterial.emissiveIntensity = 0.115;
    const primaryGeometry = makeRibbonGeometry(seed, length, ribbonWidth, 0.021, particle.curvature);
    const primaryRibbon = new Mesh(
      primaryGeometry,
      hash(seed, 5) > 0.46 ? secondaryTintMaterial : tintMaterial,
    );
    primaryRibbon.rotation.x = (hash(seed, 7) - 0.5) * 0.62;
    group.add(primaryRibbon);

    const darkGeometry = makeRibbonGeometry(
      seed + 73,
      length * lerp(0.58, 1.08, hash(seed, 6)),
      ribbonWidth * 0.54,
      0.026,
      -particle.curvature,
      Math.PI * 0.56,
    );
    const darkRibbon = new Mesh(darkGeometry, this.blackChromeMaterial);
    darkRibbon.rotation.set(0.28 + hash(seed, 8) * 0.38, 0.12, -0.32);
    group.add(darkRibbon);

    const plateCount = 3 + Math.floor(hash(seed, 11) * 3);
    for (let index = 0; index < plateCount; index += 1) {
      const materialIndex = index % 5;
      const plate = new Mesh(
        this.bladeGeometry,
        materialIndex === 0
          ? tintMaterial
          : materialIndex === 2
            ? secondaryTintMaterial
            : materialIndex === 4
              ? this.blackChromeMaterial
              : this.chromeMaterial,
      );
      const progress = plateCount === 1 ? 0.5 : index / (plateCount - 1);
      plate.position.set(
        lerp(-length * 0.33, length * 0.34, progress),
        (hash(seed, 30 + index) - 0.5) * ribbonWidth * 8.4,
        (hash(seed, 50 + index) - 0.5) * 1.12,
      );
      plate.rotation.set(
        (hash(seed, 70 + index) - 0.5) * 1.82,
        (hash(seed, 90 + index) - 0.5) * 1.7,
        (hash(seed, 110 + index) - 0.5) * 1.46 + particle.angle * 0.36,
      );
      plate.scale.set(
        lerp(0.28, 1.18, Math.pow(hash(seed, 130 + index), 1.35)),
        lerp(0.18, 0.54, hash(seed, 150 + index)),
        lerp(0.48, 0.95, hash(seed, 170 + index)),
      );
      group.add(plate);
    }

    const shardCount = 1 + Math.floor(hash(seed, 181) * 2);
    for (let index = 0; index < shardCount; index += 1) {
      const materialIndex = (index + 2) % 5;
      const shard = new Mesh(
        this.shardGeometry,
        materialIndex === 0
          ? tintMaterial
          : materialIndex === 2
            ? secondaryTintMaterial
            : materialIndex === 4
              ? this.blackChromeMaterial
              : this.chromeMaterial,
      );
      shard.position.set(
        (hash(seed, 190 + index) - 0.5) * length * 0.74,
        (hash(seed, 200 + index) - 0.5) * ribbonWidth * 10,
        (hash(seed, 210 + index) - 0.5) * 1.18,
      );
      shard.rotation.set(
        hash(seed, 220 + index) * 2.1,
        hash(seed, 230 + index) * 1.9,
        particle.angle + hash(seed, 235 + index) * TAU,
      );
      shard.scale.set(
        lerp(0.42, 0.84, hash(seed, 238 + index)),
        lerp(0.72, 2.4, hash(seed, 240 + index)),
        lerp(0.42, 0.84, hash(seed, 244 + index)),
      );
      group.add(shard);
    }

    if (this.glowMaterial) {
      const glow = new Sprite(this.glowMaterial);
      glow.position.set(0, 0, -0.45);
      glow.scale.set(length * 1.18, length * 0.62, 1);
      glow.renderOrder = -1;
      group.add(glow);
    }
    group.scale.setScalar(0.001);
    this.sculpture.add(group);
    return { group, particle, seed } satisfies ClusterRecord;
  }

  private rebuildBridge(active: readonly MetalheartParticleState[]) {
    if (this.bridge) {
      this.sculpture.remove(this.bridge);
      this.bridge.geometry.dispose();
      this.bridge = null;
    }
    if (active.length < 2) return;
    const bridgeParticles = active.slice(Math.max(0, active.length - 5));
    const points = bridgeParticles.map((particle, index) => {
      const point = this.particlePosition(particle);
      point.z -= 0.35;
      point.y += Math.sin(index * 1.8 + particle.id * 0.03) * 0.18;
      return point;
    });
    if (points.length === 2) {
      points.splice(1, 0, points[0].clone().lerp(points[1], 0.5).add(new Vector3(0, 0.28, -0.3)));
    }
    const path = new CatmullRomCurve3(points, false, "centripetal", 0.5);
    const section = new Shape();
    section.moveTo(-0.012, -0.02);
    section.lineTo(0.012, -0.02);
    section.lineTo(0.012, 0.02);
    section.lineTo(-0.012, 0.02);
    section.closePath();
    const geometry = new ExtrudeGeometry(section, {
      steps: Math.min(36, 12 + points.length * 5),
      bevelEnabled: false,
      extrudePath: path,
    });
    geometry.computeVertexNormals();
    this.bridge = new Mesh(geometry, this.iridescentMaterial);
    this.bridge.renderOrder = -1;
    this.sculpture.add(this.bridge);
  }

  private syncParticles(particles: readonly MetalheartParticleState[]) {
    const metalParticles: MetalheartParticleState[] = [];
    for (let index = particles.length - 1; index >= 0 && metalParticles.length < MAX_SCULPTURE_NODES; index -= 1) {
      const particle = particles[index];
      if (particle.artStyle !== "style-3") continue;
      metalParticles.push(particle);
    }
    metalParticles.reverse();
    const signature = `${this.width}x${this.height}:${metalParticles.map((particle) => particle.id).join(":")}`;
    const activeIds = new Set(metalParticles.map((particle) => particle.id));
    for (const [id, record] of this.clusters) {
      if (activeIds.has(id)) continue;
      this.sculpture.remove(record.group);
      disposeObject(record.group, this.preservedResources);
      this.clusters.delete(id);
    }
    for (const particle of metalParticles) {
      let record = this.clusters.get(particle.id);
      if (!record) {
        record = this.createCluster(particle);
        this.clusters.set(particle.id, record);
      }
      record.particle = particle;
      record.group.position.copy(this.particlePosition(particle));
    }
    if (signature !== this.activeSignature) {
      this.activeSignature = signature;
      this.rebuildBridge(metalParticles);
    }
    return metalParticles;
  }

  render(options: MetalheartFrameOptions): MetalheartFrame | null {
    const { particles, width, height, now, reducedMotion, pulse } = options;
    if (width <= 0 || height <= 0) return null;
    this.syncSize(width, height);
    const active = this.syncParticles(particles);
    if (active.length === 0) {
      this.renderer.clear();
      return null;
    }

    const focusParticle = active[active.length - 1];
    const focus = this.particlePosition(focusParticle);
    this.amberLight.color.setHSL(0.035, 0.94, 0.66);
    this.pinkLight.color.setHSL(0.945, 0.92, 0.66);
    this.glowMaterial?.color.setHSL(0.975, 0.9, 0.72);
    this.streakMaterial?.color.setHSL(0.045, 0.92, 0.78);

    let forming = false;
    for (const record of this.clusters.values()) {
      const age = reducedMotion ? FORMATION_DURATION : Math.max(0, now - record.particle.createdAt);
      const arrival = easeOutCubic(age / FORMATION_DURATION);
      if (arrival < 0.999) forming = true;
      const scale = (0.38 + record.particle.radius * 3.5) * lerp(0.015, 1, arrival);
      record.group.scale.setScalar(scale);
      record.group.rotation.set(
        record.particle.curvature * 0.13 + Math.sin(record.seed * 0.013) * 0.12,
        (hash(record.seed, 301) - 0.5) * 0.8 + Math.sin(now * 0.00016 + record.seed) * 0.055,
        record.particle.angle * 0.68 + (1 - arrival) * 0.42,
      );
    }

    const pulseProgress = pulse?.progress ?? 2;
    const pulseEnvelope = pulseProgress >= 0 && pulseProgress < 1
      ? Math.sin(pulseProgress * Math.PI) * Math.pow(1 - pulseProgress, 0.65) * clamp(pulse?.strength ?? 0, 0, 1)
      : 0;
    this.pulseLight.position.set(
      lerp(-this.viewWidth * 0.56, this.viewWidth * 0.56, easeInOutSine(pulseProgress)),
      (0.5 - (pulse?.y ?? 0.5)) * this.viewHeight,
      4.8,
    );
    this.pulseLight.intensity = pulseEnvelope * 58;
    this.pulseLight.color.setHSL(0.055, 0.92, 0.78);
    if (this.pulseStreak && this.streakMaterial) {
      this.pulseStreak.position.set(
        lerp(-this.viewWidth * 0.35, this.viewWidth * 0.35, easeInOutSine(pulseProgress)),
        (0.5 - (pulse?.y ?? 0.5)) * this.viewHeight,
        3.6,
      );
      this.pulseStreak.scale.set(this.viewWidth * 0.72, 0.22 + pulseEnvelope * 0.18, 1);
      this.streakMaterial.opacity = pulseEnvelope * 0.62;
    }
    if (this.orangeBeam && this.orangeBeamMaterial) {
      this.orangeBeam.position.set(focus.x - 0.08, focus.y + 0.03, -1.8);
      this.orangeBeam.scale.set(Math.max(6.2, this.viewWidth * 0.92), this.viewHeight * 0.3, 1);
      this.orangeBeamMaterial.rotation = -0.16 + Math.sin(now * 0.00015) * 0.035;
      this.orangeBeamMaterial.opacity = 0.62 + pulseEnvelope * 0.22;
    }
    if (this.pinkBeam && this.pinkBeamMaterial) {
      this.pinkBeam.position.set(focus.x + 0.04, focus.y - 0.04, -1.7);
      this.pinkBeam.scale.set(Math.max(5.4, this.viewWidth * 0.78), this.viewHeight * 0.24, 1);
      this.pinkBeamMaterial.rotation = 0.42 + Math.cos(now * 0.00013) * 0.045;
      this.pinkBeamMaterial.opacity = 0.52 + pulseEnvelope * 0.2;
    }
    this.chromeMaterial.emissiveIntensity = 0.035 + pulseEnvelope * 0.2;
    this.iridescentMaterial.emissiveIntensity = 0.06 + pulseEnvelope * 0.34;
    this.iridescentMaterial.iridescence = 0.24 + pulseEnvelope * 0.08;
    if (this.glowMaterial) this.glowMaterial.opacity = 0.5 + pulseEnvelope * 0.2;
    this.renderer.toneMappingExposure = 1.52 + pulseEnvelope * 0.5;
    this.camera.position.z = CAMERA_DISTANCE - pulseEnvelope * 0.38;
    this.camera.position.x = Math.sin(now * 0.00011) * 0.08;
    this.camera.lookAt(0, 0, 0);
    this.sculpture.rotation.y = Math.sin(now * 0.00013) * 0.075;
    this.sculpture.rotation.x = Math.cos(now * 0.0001) * 0.035;
    this.amberLight.intensity = 49 + pulseEnvelope * 19;
    this.pinkLight.intensity = 42 + pulseEnvelope * 16;

    this.renderer.render(this.scene, this.camera);
    return { canvas: this.canvas, forming };
  }

  reset() {
    for (const record of this.clusters.values()) {
      this.sculpture.remove(record.group);
      disposeObject(record.group, this.preservedResources);
    }
    this.clusters.clear();
    if (this.bridge) {
      this.sculpture.remove(this.bridge);
      this.bridge.geometry.dispose();
      this.bridge = null;
    }
    this.activeSignature = "";
    this.renderer.clear();
  }

  dispose() {
    this.reset();
    this.bladeGeometry.dispose();
    this.shardGeometry.dispose();
    this.chromeMaterial.dispose();
    this.blackChromeMaterial.dispose();
    this.iridescentMaterial.dispose();
    this.glowMaterial?.dispose();
    this.streakMaterial?.dispose();
    this.orangeBeamMaterial?.dispose();
    this.pinkBeamMaterial?.dispose();
    this.glowTexture?.dispose();
    this.streakTexture?.dispose();
    this.beamTexture?.dispose();
    this.environmentTarget.dispose();
    this.renderer.dispose();
  }
}

let sculptureRenderer: MetalheartSculptureRenderer | null = null;
let webglUnavailable = false;

function getSculptureRenderer() {
  if (webglUnavailable) return null;
  try {
    sculptureRenderer ??= new MetalheartSculptureRenderer();
    return sculptureRenderer;
  } catch {
    webglUnavailable = true;
    return null;
  }
}

export function warmMetalheartRenderer() {
  void getSculptureRenderer();
}

export function renderMetalheartFrame(options: MetalheartFrameOptions) {
  return getSculptureRenderer()?.render(options) ?? null;
}

export function resetMetalheartRenderer() {
  sculptureRenderer?.reset();
}

export function disposeMetalheartRenderer() {
  sculptureRenderer?.dispose();
  sculptureRenderer = null;
  webglUnavailable = false;
}

// Canvas fallbacks keep the style responsive during the lazy WebGL warm-up and
// on browsers that cannot create a WebGL context.
export function drawMetalheartParticle(
  context: CanvasRenderingContext2D,
  options: MetalheartParticleOptions,
) {
  const { seed, radius, alpha, arrival, stretch, thickness, curvature, velocity } = options;
  const reveal = easeOutCubic(arrival);
  if (radius <= 0 || alpha <= 0 || reveal <= 0) return;
  const length = radius * (1.5 + stretch * 0.52) * lerp(0.24, 1, reveal);
  const height = radius * (0.24 + thickness * 0.42);
  context.save();
  context.globalAlpha = alpha;
  context.lineCap = "square";
  context.lineJoin = "miter";
  const gradient = context.createLinearGradient(-length / 2, -height, length / 2, height);
  gradient.addColorStop(0, "#03050b");
  gradient.addColorStop(0.22, "#9a6268");
  gradient.addColorStop(0.38, "#fff2df");
  gradient.addColorStop(0.52, "#ff7a43");
  gradient.addColorStop(0.66, "#13060a");
  gradient.addColorStop(0.82, hash(seed, 8) > 0.5 ? "#ff58a3" : "#ff9874");
  gradient.addColorStop(1, "#020309");
  context.strokeStyle = gradient;
  context.lineWidth = Math.max(1, height);
  context.beginPath();
  context.moveTo(-length / 2, height * curvature * 0.5);
  context.bezierCurveTo(-length * 0.18, -height * 2.4, length * 0.18, height * 2.2, length / 2, -height * curvature * 0.45);
  context.stroke();
  context.strokeStyle = `rgba(255, 255, 255, ${0.7 * reveal})`;
  context.lineWidth = Math.max(0.6, radius * (0.008 + velocity * 0.004));
  context.stroke();
  context.restore();
}

export function drawMetalheartPulse(
  context: CanvasRenderingContext2D,
  options: MetalheartPulseOptions,
) {
  const { centerX, centerY, width, height, progress, strength } = options;
  if (progress < 0 || progress >= 1 || strength <= 0) return;
  const fade = Math.pow(1 - progress, 2) * clamp(strength, 0, 1);
  const radius = Math.min(width, height) * lerp(0.035, 0.22, easeOutCubic(progress));
  context.save();
  context.globalCompositeOperation = "screen";
  context.beginPath();
  context.ellipse(centerX, centerY, radius * 1.75, radius, -0.12, 0, TAU);
  context.strokeStyle = `rgba(255, 223, 203, ${fade * 0.32})`;
  context.lineWidth = Math.max(0.6, Math.min(width, height) * 0.0015);
  context.stroke();
  context.restore();
}
