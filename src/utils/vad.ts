// src/utils/vad.ts

import { VAD_RMS_THRESHOLD, VAD_ZCR_THRESHOLD } from '../constants/mlModel';

export type VadOptions = {
  // Thresholds used for decision-making (values are in the same units as computeRms/computeZcr).
  rmsThreshold?: number;
  zcrThreshold?: number;
  smoothingFrames?: number; // number of recent frames to use for smoothing
};

/**
 * The slider range exposed in Settings (1-10).
 * Internally we map these to actual RMS/ZCR threshold values.
 */
const VAD_SLIDER_MIN = 1;
const VAD_SLIDER_MAX = 10;

// RMS thresholds (speech is typically > 0.01, silence often ~0.001).
const VAD_RMS_THRESHOLD_MIN = 0.0003;
const VAD_RMS_THRESHOLD_MAX = 0.02;

// ZCR thresholds (speech is usually lower; noise/unvoiced tends to be higher).
const VAD_ZCR_THRESHOLD_MIN = 0.02;
const VAD_ZCR_THRESHOLD_MAX = 0.5;

/**
 * Map the 1-10 slider value into a real RMS threshold (log-scaled).
 */
export function mapRmsSliderToThreshold(sliderValue: number): number {
  const clamped = Math.min(
    Math.max(sliderValue, VAD_SLIDER_MIN),
    VAD_SLIDER_MAX,
  );
  const t = (clamped - VAD_SLIDER_MIN) / (VAD_SLIDER_MAX - VAD_SLIDER_MIN);
  const logMin = Math.log(VAD_RMS_THRESHOLD_MIN);
  const logMax = Math.log(VAD_RMS_THRESHOLD_MAX);
  return Math.exp(logMin + t * (logMax - logMin));
}

/**
 * Map a real RMS threshold into the 1-10 slider domain.
 */
export function mapRmsThresholdToSlider(rmsThreshold: number): number {
  const clamped = Math.min(
    Math.max(rmsThreshold, VAD_RMS_THRESHOLD_MIN),
    VAD_RMS_THRESHOLD_MAX,
  );
  const logMin = Math.log(VAD_RMS_THRESHOLD_MIN);
  const logMax = Math.log(VAD_RMS_THRESHOLD_MAX);
  const t = (Math.log(clamped) - logMin) / (logMax - logMin);
  return VAD_SLIDER_MIN + t * (VAD_SLIDER_MAX - VAD_SLIDER_MIN);
}

/**
 * Map the 1-10 slider value into a real ZCR threshold (linear scale).
 */
export function mapZcrSliderToThreshold(sliderValue: number): number {
  const clamped = Math.min(
    Math.max(sliderValue, VAD_SLIDER_MIN),
    VAD_SLIDER_MAX,
  );
  const t = (clamped - VAD_SLIDER_MIN) / (VAD_SLIDER_MAX - VAD_SLIDER_MIN);
  return (
    VAD_ZCR_THRESHOLD_MIN + t * (VAD_ZCR_THRESHOLD_MAX - VAD_ZCR_THRESHOLD_MIN)
  );
}

/**
 * Map a real ZCR threshold into the 1-10 slider domain.
 */
export function mapZcrThresholdToSlider(zcrThreshold: number): number {
  const clamped = Math.min(
    Math.max(zcrThreshold, VAD_ZCR_THRESHOLD_MIN),
    VAD_ZCR_THRESHOLD_MAX,
  );
  const t =
    (clamped - VAD_ZCR_THRESHOLD_MIN) /
    (VAD_ZCR_THRESHOLD_MAX - VAD_ZCR_THRESHOLD_MIN);
  return VAD_SLIDER_MIN + t * (VAD_SLIDER_MAX - VAD_SLIDER_MIN);
}

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
    zcrThreshold = VAD_ZCR_THRESHOLD,
    smoothingFrames = 3,
  } = opts;

  // A smoothing value of 0 or 1 means no smoothing (immediate frame decision).
  const needsSmoothing = smoothingFrames > 1;
  const rmsHistory: number[] = [];
  const zcrHistory: number[] = [];

  const average = (arr: number[]) =>
    arr.reduce((sum, v) => sum + v, 0) / Math.max(arr.length, 1);

  return {
    isSpeech(samples: Float32Array) {
      const rms = computeRms(samples);
      const zcr = computeZcr(samples);

      if (!needsSmoothing) {
        return rms >= rmsThreshold && zcr < zcrThreshold;
      }

      rmsHistory.push(rms);
      zcrHistory.push(zcr);
      if (rmsHistory.length > smoothingFrames) rmsHistory.shift();
      if (zcrHistory.length > smoothingFrames) zcrHistory.shift();

      const avgRms = average(rmsHistory);
      const avgZcr = average(zcrHistory);

      return avgRms >= rmsThreshold && avgZcr < zcrThreshold;
    },

    getDebugState() {
      return {
        rmsThreshold,
        zcrThreshold,
        smoothingFrames,
        rmsHistory: [...rmsHistory],
        zcrHistory: [...zcrHistory],
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
  const { rmsThreshold = VAD_RMS_THRESHOLD, zcrThreshold = VAD_ZCR_THRESHOLD } =
    opts;
  const rms = computeRms(samples);
  if (rms < rmsThreshold) return false;
  const zcr = computeZcr(samples);
  return zcr < zcrThreshold;
}
