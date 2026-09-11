import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source = fs.readFileSync(new URL('../public/audio-onset-worklet.js', import.meta.url), 'utf8');
function run({ rate = 48000, beats = [], duration = 6, stereo = false, tone = 0, toneHz = 220, amplitude = .35 }) {
  const events = [];
  let Processor;
  const scope = vm.createContext({
    sampleRate: rate, currentFrame: 0,
    AudioWorkletProcessor: class { port = { postMessage: (e) => events.push(e) }; },
    registerProcessor: (name, processor) => { Processor = processor; },
  });
  vm.runInContext(source, scope);
  const processor = new Processor();
  const left = new Float32Array(128), right = new Float32Array(128), output = new Float32Array(128);
  for (let frame = 0; frame < rate * duration; frame += 128) {
    scope.currentFrame = frame;
    for (let i = 0; i < 128; i++) {
      const t = (frame + i) / rate;
      let value = tone * Math.sin(2 * Math.PI * toneHz * t);
      for (const beat of beats) {
        const age = t - beat;
        if (age >= 0 && age < .12) value += amplitude * Math.exp(-age * 45) * Math.sin(2 * Math.PI * 90 * age);
      }
      left[i] = value;
      right[i] = -value;
    }
    output.fill(1);
    processor.process([stereo ? [left, right] : [left]], [[output]]);
    assert.equal(output.some(value => value !== 0), false, 'capture must remain silent');
  }
  return events;
}
for (const rate of [44100, 48000]) {
  for (const bpm of [60, 120, 180, 240]) {
    test(`PCM kicks: ${bpm} BPM at ${rate} Hz`, () => {
      const beats = Array.from({ length: 8 }, (_, i) => .2 + i * 60 / bpm);
      const events = run({ rate, beats, duration: beats.at(-1) + .5 });
      assert.equal(events.length, beats.length);
      events.forEach((event, i) => {
        assert.ok(event.audioTime >= beats[i]);
        assert.ok(event.audioTime - beats[i] < .025, `late: ${event.audioTime - beats[i]}`);
      });
    });
  }
}
test('quiet and anti-phase stereo kicks are retained', () => {
  const beats = [.2, .7, 1.2, 1.7];
  assert.equal(run({ beats, amplitude: .012, stereo: true, duration: 2 }).length, beats.length);
});
test('silence and a sustained tone do not manufacture extra beats', () => {
  assert.equal(run({ duration: 2 }).length, 0);
  assert.equal(run({ tone: .2, duration: 2 }).length, 1);
});
test('irregular onsets keep their original timestamps, with no inferred beats in gaps', () => {
  const beats = [.2, .4, .73, 1.1, 2.9, 3.1];
  const events = run({ beats, duration: 4 });
  assert.equal(events.length, beats.length);
  events.forEach((event, i) => assert.ok(Math.abs(event.audioTime - beats[i]) < .025));
});

for (const toneHz of [30, 55, 110, 440, 2000]) {
  test(`sustained ${toneHz} Hz does not create recurring attacks`, () => {
    assert.equal(run({ tone: .2, toneHz, duration: 2 }).length, 1);
  });
}
