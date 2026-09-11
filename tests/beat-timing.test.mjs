import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../app/AuraToy.tsx', import.meta.url), 'utf8');
const start = source.indexOf('function normalizeBeatInterval(');
const end = source.indexOf('function updateSpectrumAnalysis(', start);
const exports = {};
vm.runInNewContext(ts.transpileModule(source.slice(start, end) + '\nexports.track = trackMicrophoneBeat; exports.metal = trackStyleThreeBeat;', {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText, {
  exports,
  clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
  lerp: (a, b, t) => a + (b - a) * t,
});

function runtime() {
  return {
    beatBandEnergy: 1, smoothedFlux: 1,
    onsetBaseline: 0, onsetDeviation: 0, onsetRising: false, previousOnsetStrength: 0,
    lastOnsetAt: -Infinity, lastBeatAt: -Infinity, nextBeatAt: Infinity,
    beatInterval: 500, beatConfidence: 0,
    styleThreeOnsetBaseline: 0, styleThreeOnsetDeviation: 0,
    styleThreePreviousOnsetStrength: 0, styleThreeOnsetRising: false,
    lastStyleThreeSignalAt: -Infinity, lastStyleThreeAttackAt: -Infinity,
    lastStyleThreeBeatAt: -Infinity, nextStyleThreeBeatAt: Infinity,
    styleThreeBeatInterval: 500, styleThreeBeatConfidence: 0,
  };
}

for (const [name, track] of Object.entries(exports)) {
  for (const bpm of [60, 90, 120, 180, 240]) {
    test(`${name}: each clean onset at ${bpm} BPM triggers immediately, without duplicates`, () => {
      const state = runtime();
      const period = 60000 / bpm;
      let count = 0;
      for (let beat = 0; beat < 16; beat++) {
        const now = 1000 + beat * period;
        assert.equal(track(state, now, true, 2, 4, 2), true, `beat ${beat}`);
        count++;
        // Falling edges and quiet frames must not create a second graphic.
        for (let offset = 33; offset < period; offset += 33) {
          assert.equal(track(state, now + offset, true, 1, 0.1, 1), false, `duplicate at ${now + offset}`);
        }
      }
      assert.equal(count, 16);
    });
  }
}

test('silence does not produce a beat', () => {
  const state = runtime();
  for (let now = 0; now < 3000; now += 33) {
    assert.equal(exports.track(state, now, false, 0, 0, 0), false);
    assert.equal(exports.metal(state, now, false, 0, 0, 0), false);
  }
});

for (const [name, track] of Object.entries(exports)) {
  test(`${name}: an estimated grid never manufactures an onset`, () => {
    const state = runtime();
    Object.assign(state, {
      beatConfidence: 4, beatInterval: 500, nextBeatAt: 2000, lastBeatAt: 1500, lastOnsetAt: 1500,
      styleThreeBeatConfidence: 4, styleThreeBeatInterval: 500,
      nextStyleThreeBeatAt: 2000, lastStyleThreeBeatAt: 1500, lastStyleThreeSignalAt: 1500,
    });
    assert.equal(track(state, 2000, true, 1, 0.1, 1), false);
    assert.equal(track(state, 2500, false, 0, 0, 0), false);
  });
}
