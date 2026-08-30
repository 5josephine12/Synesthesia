import assert from "node:assert/strict";
import test from "node:test";

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
  assert.match(html, /aria-label="Preview visual as video"/);
  assert.match(html, /data-solid-icon="mic"/);
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
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});
