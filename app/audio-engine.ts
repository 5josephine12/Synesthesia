import { Filter } from "tone/build/esm/component/filter/Filter.js";
import { start } from "tone/build/esm/core/Global.js";
import { Freeverb } from "tone/build/esm/effect/Freeverb.js";
import { PolySynth } from "tone/build/esm/instrument/PolySynth.js";
import { Synth } from "tone/build/esm/instrument/Synth.js";

export type AuraToneEngineMode = {
  oscillator: "triangle8" | "sine4" | "sine" | "triangle" | "square4";
  envelope: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  volume: number;
  filterFrequency: number;
  filterQ: number;
  reverb: {
    roomSize: number;
    dampening: number;
    wet: number;
  };
};

export async function createAuraToneEngine(mode: AuraToneEngineMode) {
  await start();
  const filter = new Filter({
    type: "lowpass",
    frequency: mode.filterFrequency,
    Q: mode.filterQ,
    rolloff: -12,
  });
  const reverb = new Freeverb(mode.reverb);
  const synth = new PolySynth(Synth, {
    oscillator: { type: mode.oscillator },
    envelope: mode.envelope,
    volume: mode.volume,
  }).connect(filter);
  synth.maxPolyphony = 16;
  filter.connect(reverb);
  reverb.toDestination();
  return { synth, filter, reverb };
}
