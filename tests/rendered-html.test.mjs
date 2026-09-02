import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";
import gifenc from "gifenc";

const { GIFEncoder, applyPalette, quantize } = gifenc;

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const url = new URL(entry.name, directory);
      return entry.isDirectory() ? filesBelow(new URL(`${entry.name}/`, directory)) : [url];
    }),
  );
  return nested.flat();
}

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Aura shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Aura<\/title>/i);
  assert.match(
    html,
    /A synesthesia simulator that turns melody into a luminous visual composition\./,
  );
  assert.match(html, /aria-label="Reset aura"/);
  assert.match(html, /aria-label="Sound mode: Piano"/);
  assert.match(html, /aria-label="Previous sound mode"/);
  assert.match(html, /aria-label="Next sound mode"/);
  assert.match(html, /aria-label="Art styles"/);
  assert.match(html, /aria-label="Aesthetic: Aura"/);
  assert.match(html, /aria-label="TouchDesigner overlay, off"/);
  assert.match(html, /role="switch" aria-checked="false"/);
  assert.match(html, /aria-label="Aura art style, selected"/);
  assert.match(html, /aria-label="Pixel art style"/);
  assert.match(html, /aria-label="Metalheart art style"/);
  assert.match(html, /aria-label="Liquid Metal art style"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /filled-triangle is-up/);
  assert.match(html, /filled-triangle is-left/);
  assert.match(html, /aria-label="C3"/);
  assert.match(html, /aria-label="B4"/);
  assert.match(html, /data-hand="left"/);
  assert.match(html, /data-hand="right"/);
  assert.match(html, /aria-label="Shift piano octave down"/);
  assert.match(html, /aria-label="Shift piano octave up"/);
  assert.match(html, /aria-label="Preview visual as PNG"/);
  assert.match(html, /aria-label="Preview visual as GIF"/);
  assert.match(html, /aria-label="Audio input"/);
  assert.match(html, /data-solid-icon="mic"/);
  assert.match(html, /data-solid-icon="external-input"/);
  assert.match(html, /aria-label="Start device audio capture; choose a tab, window, or entire screen"/);
  assert.match(html, /data-solid-icon="system-audio"/);
  assert.match(html, /title="Device audio \(Shift\+D\)/);
  assert.ok(
    html.indexOf('data-solid-icon="system-audio"') < html.indexOf('data-solid-icon="mic"'),
    "device audio control should appear before the microphone control",
  );
  assert.ok(
    html.indexOf('data-solid-icon="mic"') < html.indexOf('data-solid-icon="external-input"'),
    "external input control should appear directly after the microphone control",
  );
  assert.match(html, /aria-label="Microphone mode: Wide Spectrum"/);
  assert.match(html, /aria-label="Previous microphone mode"/);
  assert.match(html, /aria-label="Next microphone mode"/);
  assert.doesNotMatch(html, /role="slider"|microphone-mode-(?:rail|track|thumb|stop)/);
  assert.match(html, /data-solid-icon="image"/);
  assert.match(html, /data-solid-icon="video"/);
  assert.doesNotMatch(html, /class="lucide/);
  assert.doesNotMatch(html, /aria-haspopup|role="listbox"|sound-wheel|lucide-chevron/);
  assert.doesNotMatch(html, /entry-caret|aria-label="Seed word"|J-05/);
  assert.doesNotMatch(html, /aria-label="Save (?:portrait|square|wide) visual"/);
  assert.doesNotMatch(html, /<h1>Aura<\/h1>|>Save aura</i);
  assert.doesNotMatch(html, /WebM|\.webm/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("encodes motion output as a genuine animated GIF", () => {
  const gif = GIFEncoder();
  const frames = [
    new Uint8Array([255, 0, 128, 255, 250, 245, 255, 255, 80, 120, 255, 255, 255, 220, 80, 255]),
    new Uint8Array([80, 120, 255, 255, 255, 220, 80, 255, 255, 0, 128, 255, 250, 245, 255, 255]),
  ];
  for (const rgba of frames) {
    const palette = quantize(rgba, 16);
    gif.writeFrame(applyPalette(rgba, palette), 2, 2, { palette, delay: 80, repeat: 0 });
  }
  gif.finish();

  const bytes = gif.bytes();
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 6)), "GIF89a");
  assert.equal(bytes.at(-1), 0x3b);
  assert.match(new TextDecoder().decode(bytes), /NETSCAPE2\.0/);
});

test("exports GIFs at preview quality with a stable full palette", async () => {
  const source = await readFile(new URL("../app/AuraToy.tsx", import.meta.url), "utf8");

  assert.match(source, /const GIF_FRAME_DELAY = 60/);
  assert.match(source, /const GIF_MAX_DIMENSION = 1200/);
  assert.match(source, /const GIF_PALETTE_SIZE = 256/);
  assert.match(source, /output\.width = preview\.width/);
  assert.match(source, /output\.height = preview\.height/);
  assert.match(source, /const globalPalette = quantize\(finalFrameRgba, GIF_PALETTE_SIZE/);
  assert.match(source, /const indexGifFrame = createGifPaletteIndexer\(globalPalette\)/);
  assert.match(source, /const indexedFrame = indexGifFrame\(rgba\)/);
  assert.match(source, /const rgb565Cache = new Int16Array\(65536\)/);
  assert.match(source, /palette: frame === 0 \? globalPalette : undefined/);
});

test("exports the still image directly from its preview-quality canvas", async () => {
  const source = await readFile(new URL("../app/AuraToy.tsx", import.meta.url), "utf8");

  assert.match(source, /const output = previewCanvasRef\.current \?\? createExportCanvas\(\)/);
  assert.match(source, /canvasToBlob\(output, "image\/png"\)/);
  assert.match(source, /downloadBlob\(blob, `\$\{exportFileStem\(\)\}\.png`\)/);
});

test("binds Shift+D to device audio without legacy shortcut entries", async () => {
  const source = await readFile(new URL("../app/AuraToy.tsx", import.meta.url), "utf8");
  assert.match(source, /event\.shiftKey && key === "d"/);
  assert.match(source, /run\(toggleSystemAudio\)/);
  assert.doesNotMatch(source, /<kbd>&lt; &gt;<\/kbd> Mic mode/);
  assert.doesNotMatch(source, /key === "," \|\| key === "<"/);
  assert.doesNotMatch(source, /<kbd>← →<\/kbd> Octave/);
  assert.doesNotMatch(source, /event\.key === "ArrowLeft" \|\| event\.key === "ArrowRight"/);
});

test("keeps the shortcut guide on desktop and only the restore control on mobile", async () => {
  const source = await readFile(new URL("../app/AuraToy.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(source, /aria-label="Show interface controls"/);
  assert.match(source, /<SolidControlIcon name="exit-fullscreen" size=\{15\} \/>/);
  assert.match(source, /M3 8h5V3h2v7H3V8Zm11-5h2v5h5v2h-7V3Z/);
  assert.match(source, /M3 3h7v2H5v5H3V3Zm11 0h7v7h-2V5h-5V3Z/);
  assert.match(source, /event\.key === "\?" && window\.matchMedia\("\(min-width: 1101px\)"\)\.matches/);
  assert.match(source, /\? shows shortcuts/);
  assert.match(source, /className="presentation-shortcut-guide"/);
  assert.doesNotMatch(source, /aria-label="Show shortcut guide"/);
  assert.match(source, /setInterfaceHidden\(false\)/);
  assert.match(styles, /\.interface-hidden-mobile-actions\s*\{[\s\S]*?display: none/);
  assert.match(styles, /@media \(max-width: 1100px\)[\s\S]*?\.interface-hidden-mobile-actions\s*\{\s*display: flex/);
  assert.match(styles, /\.interface-hidden-mobile-action\s*\{[\s\S]*?width: clamp\(24px, var\(--header-control-height\), 34px\)/);
  assert.match(styles, /\.presentation-shortcut-guide\s*\{[\s\S]*?animation: shortcutGuideDismiss/);
  assert.match(styles, /@media \(max-width: 1100px\)[\s\S]*?\.presentation-shortcut-guide\s*\{\s*display: none !important/);
});

test("connects external MIDI and USB audio inputs from the hardware control", async () => {
  const source = await readFile(new URL("../app/AuraToy.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(source, /aria-label=\{externalInputLabel\}/);
  assert.match(source, /onClick=\{toggleExternalInput\}/);
  assert.match(source, /requestMIDIAccess\?\.\(\{ sysex: false \}\)/);
  assert.match(source, /midiInput\.onmidimessage/);
  assert.match(source, /mediaDevices\.enumerateDevices\(\)/);
  assert.match(source, /deviceId: externalDeviceId \? \{ exact: externalDeviceId \} : undefined/);
  assert.match(source, /Teenage Engineering gear|Teenage Engineering|teenage engineering/i);
  assert.match(source, /Connect external input/);
  assert.match(styles, /\.external-input-button\.is-listening/);
  assert.match(styles, /\.microphone-permission-icon\.is-external-input/);
});

test("opens a fresh device-audio picker and provides a cohesive permission dialog", async () => {
  const source = await readFile(new URL("../app/AuraToy.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(source, /const systemAudioStreamRef = useRef<MediaStream \| null>\(null\)/);
  assert.match(source, /systemAudioStreamRef\.current = null;\s*stream = await mediaDevices\.getDisplayMedia/);
  assert.match(source, /disposeMicrophoneRuntime\(runtime\)/);
  assert.match(source, /disposeMicrophoneRuntime\(previousRuntime\)/);
  assert.doesNotMatch(source, /rememberedStream|reusedSystemAudio|retainSystemAudio|retainPreviousSystemAudio/);
  assert.match(source, /const SYSTEM_AUDIO_INTRO_SESSION_KEY = "aura-system-audio-introduction-shown"/);
  assert.match(source, /sessionFlag\(SYSTEM_AUDIO_INTRO_SESSION_KEY\)/);
  assert.match(source, /rememberSessionFlag\(SYSTEM_AUDIO_INTRO_SESSION_KEY\)/);
  assert.match(source, /systemAudio: "include"/);
  assert.match(source, /windowAudio: "window"/);
  assert.match(source, /audioSelection: "preferred"/);
  assert.match(source, /video: \{ displaySurface: "monitor" \}/);
  assert.match(source, /monitorTypeSurfaces: "include"/);
  assert.match(source, /selfBrowserSurface: "exclude"/);
  assert.match(source, /restrictOwnAudio: false/);
  assert.match(source, /suppressLocalAudioPlayback: false/);
  assert.match(
    source,
    /if \(isSystemAudio\) \{[\s\S]*?audioContext = new AudioContextConstructor[\s\S]*?initialResumeAttempt = audioContext\.resume\(\)[\s\S]*?mediaDevices\.getDisplayMedia/,
  );
  assert.match(
    source,
    /const analysisStream = isSystemAudio[\s\S]*?new MediaStream\(\[stream\.getAudioTracks\(\)\[0\]\]\)[\s\S]*?createMediaStreamSource\(analysisStream\)/,
  );
  assert.match(
    source,
    /if \(inputSource === "system"\) \{[\s\S]*?void startAudioInput\(inputSource\);[\s\S]*?closeMicrophonePrompt\(undefined, null\);[\s\S]*?return;/,
  );
  assert.match(source, /systemAudioStreamRef\.current = stream;\s*systemAudioIntroductionShownRef\.current = true;\s*rememberSessionFlag\(SYSTEM_AUDIO_INTRO_SESSION_KEY\)/);
  assert.match(source, /permissionPromptSource === "system"/);
  assert.match(source, /\? "Device audio"/);
  assert.match(source, /Continue to device audio/);
  assert.match(source, /Keep Share audio turned on\./);
  assert.match(source, /Screen & System Audio Recording/);
  assert.match(source, /displaySurface === "monitor"[\s\S]*?"Entire screen audio"/);
  assert.match(source, /displaySurface === "window"[\s\S]*?"Window audio"/);
  assert.match(source, /Audio is never saved\./);
  assert.match(styles, /\.microphone-permission-icon\.is-system-audio/);
  assert.match(styles, /\.microphone-permission\.is-system-audio/);
});

test("keeps the TouchDesigner overlay independent from beat timing", async () => {
  const auraSource = await readFile(new URL("../app/AuraToy.tsx", import.meta.url), "utf8");
  const telemetrySource = await readFile(
    new URL("../app/art-styles/telemetry.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(auraSource, /registerTelemetryBeat|telemetryBeatRef/);
  assert.doesNotMatch(telemetrySource, /TelemetryBeatClock|telemetryBeatPulse|telemetryActivationAt/);
});

test("switches art styles synchronously without duplicate pointer work", async () => {
  const source = await readFile(new URL("../app/AuraToy.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(
    source,
    /artStyleRef\.current = nextStyle\.id;\s*setArtStyle\(nextStyle\.id\);[\s\S]*?wakeRendererRef\.current\?\.\(\)/,
  );
  assert.match(source, /onPointerDown=\{\(event\) => \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?selectStyle\(\)/);
  assert.match(source, /onClick=\{\(event\) => \{[\s\S]*?if \(event\.detail === 0\) selectStyle\(\)/);
  assert.doesNotMatch(source, /artStyleDirection|setArtStyleDirection/);
  assert.match(styles, /\.art-style-pad\s*\{[\s\S]*?transition: none;/);
  assert.match(styles, /\.art-style-screen \.mode-readout\s*\{\s*animation: none;/);
});

test("keeps every shipped client asset inside a kilobyte budget", async () => {
  const clientDirectory = new URL("../dist/client/", import.meta.url);
  const files = await filesBelow(clientDirectory);
  const sizes = await Promise.all(
    files.map(async (file) => ({ file, bytes: (await stat(file)).size })),
  );
  const largest = sizes.reduce((current, candidate) =>
    candidate.bytes > current.bytes ? candidate : current,
  );
  const totalBytes = sizes.reduce((total, asset) => total + asset.bytes, 0);
  // The physically based Three.js renderer is an idle-loaded optional style;
  // keep it bounded while preserving the sub-100 KiB interactive core.
  assert.ok(
    largest.bytes <= 600 * 1024,
    `${largest.file.pathname} exceeds 600 KiB (${largest.bytes} bytes)`,
  );
  assert.ok(totalBytes <= 1_280 * 1024, `client payload exceeds 1,280 KiB (${totalBytes} bytes)`);

  const manifest = JSON.parse(
    await readFile(new URL("../dist/client/.vite/manifest.json", import.meta.url), "utf8"),
  );
  const auraEntry = manifest["app/AuraToy.tsx"];
  assert.ok(auraEntry?.file, "Aura client entry is missing from the build manifest");
  const auraEntrySize = (await stat(new URL(`../dist/client/${auraEntry.file}`, import.meta.url))).size;
  assert.ok(auraEntrySize <= 100 * 1024, `Aura entry exceeds 100 KiB (${auraEntrySize} bytes)`);

  const auraSource = await readFile(new URL("../app/AuraToy.tsx", import.meta.url), "utf8");
  const layoutSource = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(auraSource, /await import\("\.\/audio-engine"\)/);
  assert.match(auraSource, /await import\("gifenc"\)/);
  assert.match(auraSource, /const pitchDetectorModule = import\("pitchy"\)/);
  assert.doesNotMatch(layoutSource, /VercelAnalytics|@fontsource\/inter\/400\.css/);
  assert.match(styles, /inter-latin-400-normal\.woff2/);
  assert.doesNotMatch(styles, /\.woff["')]/);
});

test("keeps visual effects bounded and free of production diagnostics", async () => {
  const auraSource = await readFile(new URL("../app/AuraToy.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const styleTwoSource = await readFile(
    new URL("../app/art-styles/style-2.ts", import.meta.url),
    "utf8",
  );
  const styleThreeSource = await readFile(
    new URL("../app/art-styles/style-3.ts", import.meta.url),
    "utf8",
  );
  const styleFourSource = await readFile(
    new URL("../app/art-styles/style-4.ts", import.meta.url),
    "utf8",
  );
  const telemetrySource = await readFile(
    new URL("../app/art-styles/telemetry.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(auraSource, /127\.0\.0\.1:7309|X-Debug-Session-Id|console\.warn\s*=/);
  assert.match(auraSource, /const DOTTED_VISIBLE_FORMATIONS = 4/);
  assert.match(auraSource, /const overlapsNewerFormation = dottedIndices\.some/);
  assert.match(auraSource, /Math\.hypot\(candidate\.x - selected\.x, candidate\.y - selected\.y\) < 0\.16/);
  assert.match(auraSource, /const DOTTED_FORMATION_SETTLE_DURATION = 2200/);
  assert.match(auraSource, /const DOTTED_RENDER_INTERVAL = 1000 \/ 20/);
  assert.match(auraSource, /const DOTTED_GLOW_MATURATION_DURATION = 7200/);
  assert.match(auraSource, /now - newestDottedCreatedAt < DOTTED_FORMATION_SETTLE_DURATION/);
  assert.match(auraSource, /drawDottedSigilFlowLayer\(\s*pixelContext/);
  assert.match(auraSource, /context\.drawImage\(pixelLayer, 0, 0, width, height\)/);
  assert.match(auraSource, /const displayedPixelSize = displayWidth < 500 \? 2 : 3/);
  assert.match(auraSource, /const displayedGridStep = displayedPixelSize \* 2/);
  assert.match(auraSource, /centerX: blob\.x \* width/);
  assert.match(auraSource, /context\.imageSmoothingEnabled = false/);
  assert.match(auraSource, /Math\.min\(age, DOTTED_FORMATION_SETTLE_DURATION\)/);
  assert.doesNotMatch(styleTwoSource, /context\.rotate|context\.scale/);
  assert.match(styleTwoSource, /"murmuration",\s*"topography",\s*"signal-weave"/);
  assert.doesNotMatch(styleTwoSource, /const PALETTES/);
  assert.match(styleTwoSource, /const PIXEL_PALETTES/);
  assert.match(styleTwoSource, /primary: \{ h: 8, s: 94, l: 64 \}, accent: \{ h: 42, s: 96, l: 68 \}/);
  assert.match(styleTwoSource, /primary: \{ h: 278, s: 82, l: 72 \}, accent: \{ h: 320, s: 89, l: 67 \}/);
  assert.doesNotMatch(styleTwoSource, /h: 220|h: 238|h: 248|h: 260/);
  assert.match(styleTwoSource, /const tone = toneRoll < 0\.2 \? 0 : toneRoll < 0\.4 \? 1 : toneRoll < 0\.6 \? 2/);
  assert.match(styleTwoSource, /const gridX = column \* gridStep/);
  assert.match(styleTwoSource, /const gridY = row \* gridStep/);
  assert.match(styleTwoSource, /const pixelSize = Math\.max\(1, Math\.round\(gridStep \* 0\.5\)\)/);
  assert.doesNotMatch(styleTwoSource, /sizeRoll|sizeRatio|maximumPixelSize/);
  assert.match(styleTwoSource, /const density = clamp\(0\.56 \+ velocity \* 0\.08/);
  assert.match(styleTwoSource, /const footprintGrowth = Math\.pow\(clamp\(expansion, 0, 1\), 0\.82\)/);
  assert.match(styleTwoSource, /const compactWidth = lerp\(0\.09, 0\.145, hash\(seed, 211\)\)/);
  assert.match(styleTwoSource, /const expandedWidth = lerp\(0\.32, 0\.5, hash\(seed, 211\)\)/);
  assert.match(styleTwoSource, /const compactHeight = lerp\(0\.09, 0\.15, hash\(seed, 227\)\)/);
  assert.match(styleTwoSource, /const expandedHeight = lerp\(0\.24, 0\.38, hash\(seed, 227\)\)/);
  assert.match(auraSource, /const PIXEL_COMPOSITION_ANCHORS =/);
  assert.match(auraSource, /expansion: clamp\(blob\.compositionIndex \/ 12, 0, 1\)/);
  assert.match(auraSource, /const occupiedGridCells = new Set<string>\(\)/);
  assert.match(styleTwoSource, /const reservedCells = occupiedCells \?\? new Set<string>\(\)/);
  assert.doesNotMatch(styleTwoSource, /candidateCells|activeCells|\.sort\(/);
  assert.match(styleTwoSource, /const bodyPaths = bodyColors\.map\(\(\) => new Path2D\(\)\)/);
  assert.match(styleTwoSource, /const glowPath = new Path2D\(\)/);
  assert.match(styleTwoSource, /const cellKey = `\$\{column\}:\$\{row\}`/);
  assert.match(styleTwoSource, /if \(reservedCells\.has\(cellKey\)\) continue/);
  assert.doesNotMatch(styleTwoSource, /rowOffset|columnOffset|touchesOccupiedCell/);
  assert.match(styleTwoSource, /pixel\(bodyPaths\[tone\], gridX, gridY, pixelSize\)/);
  assert.doesNotMatch(styleTwoSource, /cellWidth|cellHeight/);
  assert.doesNotMatch(styleTwoSource, /fixedOffsetX|fixedOffsetY/);
  assert.match(styleTwoSource, /const reveal = clamp\(\(arrival - revealOrder\) \/ 0\.26, 0, 1\)/);
  assert.match(styleTwoSource, /const side = Math\.max\(1, Math\.round\(size\)\)/);
  assert.match(styleTwoSource, /path\.rect\(left, top, side, side\)/);
  assert.doesNotMatch(styleTwoSource, /right - left|bottom - top/);
  assert.match(styleTwoSource, /const saturatedBodyColors = \[\s*saturatedPrimary,\s*mixColor\(saturatedPrimary, saturatedAccent, 0\.24\)/);
  assert.doesNotMatch(styleTwoSource, /haloCells/);
  assert.doesNotMatch(styleTwoSource, /glowCells/);
  assert.match(styleTwoSource, /const glowDensity = layered\s*\? 0\.14 \+ emphasis \* 0\.08/);
  assert.match(styleTwoSource, /const whiteTransition = maturation \* maturation \* \(3 - maturation \* 2\)/);
  assert.match(styleTwoSource, /const luminosityStops = \[0, 0\.02, 0\.05, 0\.1, 0\.2\]/);
  assert.match(styleTwoSource, /whiteTransition \* \(0\.02 \+ index \* 0\.025\)/);
  assert.match(styleTwoSource, /layered \? index \* 0\.015 : 0/);
  assert.doesNotMatch(styleTwoSource, /createRadialGradient|shadowBlur|shadowColor/);
  assert.match(styleTwoSource, /context\.imageSmoothingEnabled = false;\s*for \(let tone/);
  assert.match(styleTwoSource, /context\.fill\(bodyPaths\[tone\]\)/);
  assert.match(styleTwoSource, /for \(let tone = 0; tone < bodyColors\.length; tone \+= 1\)/);
  assert.match(auraSource, /alpha: clamp\(\(0\.94 \+ blob\.velocity \* 0\.06\) \* arrival \* layerEmphasis, 0, 1\)/);
  assert.match(auraSource, /lerp\(0\.74, 0\.92, recency \* recency\)/);
  assert.match(auraSource, /const blendsWithEarlierArtwork = runStart > 0 \|\| hasEarlierArtwork/);
  assert.match(auraSource, /if \(runEnd <= dottedWindowStart\)/);
  assert.match(auraSource, /context\.globalCompositeOperation = "screen"/);
  assert.match(auraSource, /context\.filter = `blur\(\$\{clamp\(Math\.min\(width, height\) \* 0\.009, 4, 9\)\}px\)`/);
  assert.match(auraSource, /context\.globalCompositeOperation = "color"/);
  assert.match(auraSource, /context\.globalCompositeOperation = "luminosity"/);
  assert.match(auraSource, /context\.globalAlpha = blendsWithEarlierArtwork \? 0\.94 : 1/);
  assert.match(auraSource, /context\.globalCompositeOperation = "difference"/);
  assert.match(auraSource, /context\.drawImage\(pixelAccentLayer/);
  assert.match(auraSource, /const pixelWidth = Math\.max\(1, Math\.round\(width\)\)/);
  assert.match(auraSource, /pixelLayer\.width = output\.width/);
  assert.match(auraSource, /const AURA_BACKING_PIXEL_BUDGET = 1_500_000/);
  assert.match(auraSource, /const AURA_RENDER_PIXEL_BUDGET = 360_000/);
  assert.match(auraSource, /dpr = Math\.max\(1, Math\.min\(window\.devicePixelRatio \|\| 1, 1\.25, pixelBudgetRatio\)\)/);
  assert.match(styleTwoSource, /accentContext\.globalAlpha = clamp\(alpha \* \(0\.55 \+ emphasis \* 0\.3\)/);
  assert.match(auraSource, /const rgb565Cache = new Int16Array\(65536\)/);
  assert.doesNotMatch(auraSource, /const dottedBlobs = blobs\.slice/);
  assert.match(auraSource, /blurredSettledCount !== settledCount/);
  assert.match(auraSource, /const MAX_LIVE_VISUAL_PARTICLES = 48/);
  assert.match(auraSource, /const HARD_MAX_LIVE_VISUAL_PARTICLES = 72/);
  assert.match(auraSource, /const VISUAL_COMPACTION_BATCH_SIZE = 2/);
  assert.match(auraSource, /const compactVisualHistory = \(now: number, blurRadius: number\) =>/);
  assert.match(auraSource, /blobs\.length <= MAX_LIVE_VISUAL_PARTICLES/);
  assert.match(
    auraSource,
    /const minimumAge = isDotted\s*\? DOTTED_GLOW_MATURATION_DURATION\s*: blobStyle === "style-3"\s*\? METALHEART_FORMATION_DURATION\s*: blobStyle === "style-4"\s*\? LIQUID_METAL_FORMATION_DURATION\s*: BLOB_ARRIVAL_DURATION/,
  );
  assert.match(auraSource, /Math\.min\(\s*VISUAL_COMPACTION_BATCH_SIZE,/);
  assert.match(auraSource, /const compactedBlobs = blobs\.slice\(0, compactCount\)/);
  assert.match(auraSource, /const compactedVisibleBlobs = compactedBlobs\.filter/);
  assert.match(auraSource, /const isInvisibleDotted = isDotted && index < oldestVisibleDottedIndex/);
  assert.match(auraSource, /index >= oldestVisibleDottedIndex/);
  assert.match(auraSource, /drawChronologicalAuraLayers\(\s*historyCompositeContext/);
  assert.match(auraSource, /blobsRef\.current = blobs\.slice\(compactCount\)/);
  assert.match(auraSource, /compactedHistoryActiveRef\.current = true/);
  assert.match(auraSource, /context\.drawImage\(historyComposite, 0, 0, width, height\)/);
  assert.match(auraSource, /hasCompactedHistory \|\|\s*hasMetalheartStyle \|\|/);
  assert.doesNotMatch(auraSource, /hasCompactedOrganicHistory|historyBlurred|settledOrganicPrefix/);
  assert.match(auraSource, /artStyleLayerCountRef\.current\[currentArtStyle\]/);
  assert.doesNotMatch(auraSource, /blobsRef\.current\.reduce\(/);
  assert.match(telemetrySource, /function chordLabelsForActiveNodes/);
  assert.match(telemetrySource, /nodes\.length !== cachedChordNodeCount/);
  assert.match(telemetrySource, /const SNAPSHOT_FRAME_INTERVAL = 1000 \/ 15/);
  assert.match(telemetrySource, /export function telemetryNextFrameAt/);
  assert.match(auraSource, /scheduleRendererWake\(nextTelemetryFrameAt\)/);
  assert.match(auraSource, /now - runtime\.lastReadingAt >= 250/);
  assert.match(styles, /button\s*\{[\s\S]*?touch-action: manipulation/);
  assert.match(styles, /\.instrument-cluster\s*\{[\s\S]*?contain: layout paint style/);
  assert.match(styles, /\.piano-key\s*\{[\s\S]*?transition: transform 90ms/);
  assert.match(auraSource, /\{ id: "style-3", label: "Metalheart" \}/);
  assert.match(auraSource, /metalheartRendererReady \?\?= import\("\.\/art-styles\/style-3"\)/);
  assert.match(auraSource, /\{ id: "style-4", label: "Liquid Metal" \}/);
  assert.match(auraSource, /liquidMetalRendererReady \?\?= import\("\.\/art-styles\/style-4"\)/);
  assert.match(auraSource, /const telemetryRendererReady = import\("\.\/art-styles\/telemetry"\)/);
  assert.match(auraSource, /const METALHEART_FORMATION_DURATION = 1900/);
  assert.match(auraSource, /const METALHEART_PULSE_DURATION = 920/);
  assert.match(auraSource, /const metalheartIsActive = artStyleRef\.current === "style-3"/);
  assert.match(auraSource, /metalheartRenderer\?\.drawMetalheartPulse/);
  assert.match(styleThreeSource, /export function drawMetalheartParticle/);
  assert.match(styleThreeSource, /export function drawMetalheartPulse/);
  assert.match(styleThreeSource, /export function renderMetalheartFrame/);
  assert.match(styleThreeSource, /new MeshPhysicalMaterial/);
  assert.match(styleThreeSource, /metalness: 1/);
  assert.match(styleThreeSource, /iridescence: 1/);
  assert.match(styleThreeSource, /new PMREMGenerator/);
  assert.match(styleThreeSource, /new RoomEnvironment/);
  assert.match(styleThreeSource, /new ExtrudeGeometry/);
  assert.match(styleThreeSource, /const MAX_SCULPTURE_NODES = 8/);
  assert.match(styleThreeSource, /const WEBGL_PIXEL_BUDGET = 1_050_000/);
  assert.match(styleThreeSource, /antialias: true/);
  assert.match(styleThreeSource, /const plateCount = 3 \+ Math\.floor/);
  assert.match(styleThreeSource, /const shardCount = 1 \+ Math\.floor/);
  assert.doesNotMatch(styleThreeSource, /shadowTexture|shadowMaterial|NormalBlending/);
  assert.match(styleThreeSource, /this\.amberLight\.color\.setHSL\(0\.035/);
  assert.match(styleThreeSource, /this\.pinkLight\.color\.setHSL\(0\.945/);
  assert.match(styleThreeSource, /this\.glowMaterial\?\.color\.setHSL\(0\.975/);
  assert.match(styleThreeSource, /function createBeamTexture/);
  assert.match(styleThreeSource, /this\.orangeBeamMaterial\.opacity = 0\.15/);
  assert.match(styleThreeSource, /this\.pinkBeamMaterial\.opacity = 0\.11/);
  assert.match(auraSource, /brightness\(1\.68\) saturate\(1\.42\)/);
  assert.match(auraSource, /context\.globalAlpha = 0\.69/);
  assert.doesNotMatch(styleThreeSource, /shadowBlur|createPattern|getImageData/);
  assert.match(styleFourSource, /new ShaderMaterial/);
  assert.match(styleFourSource, /const fragmentShader = \/\* glsl \*\//);
  assert.match(styleFourSource, /uniform vec4 uNodes\[MAX_LIQUID_NODES\]/);
  assert.match(styleFourSource, /float field = 0\.0/);
  assert.match(styleFourSource, /vec3 reflected = reflect/);
  assert.match(styleFourSource, /const MAX_LIQUID_NODES = 12/);
  assert.match(styleFourSource, /const LIQUID_PIXEL_BUDGET = 820_000/);
  assert.doesNotMatch(styleFourSource, /getImageData|createRadialGradient|shadowBlur/);
});
