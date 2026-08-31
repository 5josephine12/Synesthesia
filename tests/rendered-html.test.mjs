import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import gifenc from "gifenc";

const { GIFEncoder, applyPalette, quantize } = gifenc;

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
  assert.match(html, /aria-label="Style 2 art style"/);
  assert.match(html, /aria-label="Style 4 art style"/);
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
  assert.match(html, /aria-label="Start device audio capture; choose a tab or screen with audio"/);
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

test("remembers device audio for the page session and provides a cohesive permission dialog", async () => {
  const source = await readFile(new URL("../app/AuraToy.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(source, /const systemAudioStreamRef = useRef<MediaStream \| null>\(null\)/);
  assert.match(source, /rememberedStream\?\.getAudioTracks\(\)\.some/);
  assert.match(source, /reusedSystemAudio = true/);
  assert.match(source, /disposeMicrophoneRuntime\(runtime, !retainSystemAudio\)/);
  assert.match(source, /permissionPromptSource === "system"/);
  assert.match(source, /\? "Device audio"/);
  assert.match(source, /Continue to device audio/);
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

test("keeps visual effects bounded and free of production diagnostics", async () => {
  const auraSource = await readFile(new URL("../app/AuraToy.tsx", import.meta.url), "utf8");
  const telemetrySource = await readFile(
    new URL("../app/art-styles/telemetry.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(auraSource, /127\.0\.0\.1:7309|X-Debug-Session-Id|console\.warn\s*=/);
  assert.match(auraSource, /const DOTTED_MOTION_IDLE_DURATION = 12000/);
  assert.match(auraSource, /now - newestDottedCreatedAt < DOTTED_MOTION_IDLE_DURATION/);
  assert.match(auraSource, /drawDottedSigilFlowLayer\(\s*offscreenContext/);
  assert.match(auraSource, /context\.drawImage\(offscreen, 0, 0, width, height\)/);
  assert.match(auraSource, /const rgb565Cache = new Int16Array\(65536\)/);
  assert.doesNotMatch(auraSource, /const dottedBlobs = blobs\.slice/);
  assert.match(auraSource, /blurredSettledCount !== settledCount/);
  assert.match(telemetrySource, /function chordLabelsForActiveNodes/);
  assert.match(telemetrySource, /nodes\.length !== cachedChordNodeCount/);
});
