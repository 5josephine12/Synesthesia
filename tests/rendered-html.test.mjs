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
    /A synesthesia simulator that turns a word and a melody into a luminous aura\./,
  );
  assert.match(html, /entry-caret/);
  assert.match(html, /aria-label="Seed word"/);
  assert.match(html, /aria-label="Reset aura"/);
  assert.match(html, /aria-label="Sound mode: Piano"/);
  assert.match(html, /aria-label="Download visual as PNG"/);
  assert.match(html, /aria-label="Download visual as video"/);
  assert.doesNotMatch(html, /aria-label="Save (?:portrait|square|wide) visual"/);
  assert.doesNotMatch(html, /<h1>Aura<\/h1>|>Save aura</i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});
