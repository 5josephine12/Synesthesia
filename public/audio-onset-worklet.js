/* global AudioWorkletProcessor, sampleRate, currentFrame, registerProcessor */
// Analyse short PCM windows on the audio thread. Only event times and levels
// leave this processor; input samples are neither retained nor played back.
class AuraOnsetProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.low = new Float64Array(2);
    this.mid = new Float64Array(2);
    this.energy = new Float64Array(3);
    this.baseline = new Float64Array(3);
    this.previous = new Float64Array(3);
    this.count = 0;
    this.lastOnset = -Infinity;
    this.minimumLevel = 0.0012;
    this.lowCoefficient = 1 - Math.exp(-2 * Math.PI * 180 / sampleRate);
    this.midCoefficient = 1 - Math.exp(-2 * Math.PI * 2500 / sampleRate);
    this.windowSize = Math.round(sampleRate * 0.008);
    this.port.onmessage = ({ data }) => {
      if (data?.type === 'configure' && Number.isFinite(data.minimumLevel)) {
        this.minimumLevel = Math.max(0.0005, Math.min(0.02, data.minimumLevel));
      }
      if (data?.type === 'reset') {
        this.energy.fill(0);
        this.baseline.fill(0);
        this.previous.fill(0);
        this.low.fill(0);
        this.mid.fill(0);
        this.count = 0;
        this.lastOnset = -Infinity;
      }
    };
  }

  process(inputs, outputs) {
    for (const output of outputs) for (const channel of output) channel.fill(0);
    const input = inputs[0];
    if (!input?.length || !input[0].length) return true;
    // Preserve energy in anti-phase stereo instead of cancelling the channels.
    const channels = Math.min(input.length, 2);
    for (let index = 0; index < input[0].length; index++) {
      for (let channel = 0; channel < channels; channel++) {
        const value = input[channel][index];
        this.low[channel] += this.lowCoefficient * (value - this.low[channel]);
        this.mid[channel] += this.midCoefficient * (value - this.mid[channel]);
        const low = this.low[channel];
        const mid = this.mid[channel] - low;
        const high = value - this.mid[channel];
        this.energy[0] += low * low / channels;
        this.energy[1] += mid * mid / channels;
        this.energy[2] += high * high / channels;
      }
      this.count++;
      if (this.count < this.windowSize) continue;
      const audioTime = (currentFrame + index + 1) / sampleRate;
      let attack = false;
      let peak = 0;
      for (let band = 0; band < 3; band++) {
        const level = Math.sqrt(this.energy[band] / this.count);
        peak = Math.max(peak, level);
        const threshold = Math.max(this.minimumLevel, this.baseline[band] * 1.65);
        if (level > threshold && level > this.previous[band] * 1.2) attack = true;
        this.baseline[band] += (level - this.baseline[band]) * 0.12;
        this.previous[band] = level;
        this.energy[band] = 0;
      }
      this.count = 0;
      if (attack && audioTime - this.lastOnset >= 0.09) {
        this.lastOnset = audioTime;
        for (let band = 0; band < 3; band++) {
          this.baseline[band] = Math.max(this.baseline[band], this.previous[band]);
        }
        this.port.postMessage({ type: 'onset', audioTime, level: peak });
      }
    }
    return true;
  }
}
registerProcessor('aura-onset', AuraOnsetProcessor);
