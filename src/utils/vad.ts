// src/utils/vad.ts

import { VAD_RMS_THRESHOLD } from '../constants/mlModel';

export type VadOptions = {
  rmsThreshold?: number;
  zcrThreshold?: number;
  smoothingFrames?: number; // number of recent frames to use for smoothing
};

/**
 * Compute root mean square (RMS) of a signal.
 */
export function computeRms(samples: Float32Array): number {
  let sumSq = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i];
    sumSq += v * v;
  }
  return Math.sqrt(sumSq / samples.length);
}

/**
 * Compute zero-crossing rate (ZCR) of a signal.
 */
export function computeZcr(samples: Float32Array): number {
  let crossings = 0;
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i - 1] >= 0 !== samples[i] >= 0) {
      crossings += 1;
    }
  }
  return crossings / (samples.length - 1);
}

/**
 * Create a VAD instance with smoothing (keeps recent decisions in a short buffer).
 * The returned object is stateful; use it once per recording session.
 */
export function createVad(opts: VadOptions = {}) {
  const {
    rmsThreshold = VAD_RMS_THRESHOLD,
    zcrThreshold = 0.25,
    smoothingFrames = 3,
  } = opts;

  const history: boolean[] = [];

  return {
    isSpeech(samples: Float32Array) {
      const rms = computeRms(samples);
      const isFrameSpeech =
        rms >= rmsThreshold && computeZcr(samples) < zcrThreshold;

      history.push(isFrameSpeech);
      if (history.length > smoothingFrames) {
        history.shift();
      }

      // If any recent frame is speech, consider it speech.
      return history.some(Boolean);
    },

    getDebugState() {
      return {
        rmsThreshold,
        zcrThreshold,
        smoothingFrames,
        history: [...history],
      };
    },
  };
}

/**
 * Simple stateless helper based on RMS + ZCR.
 */
export function isSpeech(
  samples: Float32Array,
  opts: VadOptions = {},
): boolean {
  const { rmsThreshold = VAD_RMS_THRESHOLD, zcrThreshold = 0.25 } = opts;
  const rms = computeRms(samples);
  if (rms < rmsThreshold) return false;
  const zcr = computeZcr(samples);
  return zcr < zcrThreshold;
}
