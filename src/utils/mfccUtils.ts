// src/utils/mfccUtils.ts
// Unified MFCC extraction for React Native (RNMFCC native module)

import { NativeModules } from 'react-native';
import {
  NUM_FRAMES,
  NUM_MFCC,
  WINDOW_LENGTH_SAMPLES,
} from '../constants/mlModel';

function getRNMFCC() {
  try {
    return NativeModules?.RNMFCC || null;
  } catch (e) {
    return null;
  }
}

export function isMFCCLoaded(): boolean {
  const RNMFCC = getRNMFCC();
  return !!(RNMFCC && typeof RNMFCC.extractMFCCFromWaveform === 'function');
}

export async function runMFCCOnWaveform(
  waveform: number[] | Float32Array,
): Promise<{ mfcc: number[][]; debug: any } | null> {
  if (!Array.isArray(waveform) && !(waveform instanceof Float32Array)) {
    throw new Error('[MFCC] waveform must be an array or Float32Array');
  }
  const fixed = new Float32Array(WINDOW_LENGTH_SAMPLES);
  const copyLen = Math.min(waveform.length, WINDOW_LENGTH_SAMPLES);
  for (let i = 0; i < copyLen; i += 1) {
    fixed[i] = waveform[i];
  }
  const RNMFCC = getRNMFCC();
  if (!RNMFCC || typeof RNMFCC.extractMFCCFromWaveform !== 'function') {
    throw new Error(
      '[MFCC] Native extractMFCCFromWaveform not available. Make sure the native module is linked and available at runtime.',
    );
  }
  const output = await RNMFCC.extractMFCCFromWaveform(Array.from(fixed));
  // Output: { mfccs: flatArray, debug: ... }
  if (output && typeof output === 'object' && output.mfccs && output.debug) {
    const mfccsFlat = output.mfccs;
    if (
      !Array.isArray(mfccsFlat) ||
      mfccsFlat.length !== NUM_FRAMES * NUM_MFCC
    ) {
      throw new Error(
        `[MFCC] Invalid output length: expected ${NUM_FRAMES * NUM_MFCC}, got ${
          mfccsFlat?.length
        }`,
      );
    }
    const mfcc = [];
    for (let i = 0; i < NUM_FRAMES; i += 1) {
      mfcc.push(mfccsFlat.slice(i * NUM_MFCC, (i + 1) * NUM_MFCC));
    }
    return { mfcc, debug: output.debug };
  } else if (Array.isArray(output) && output.length === NUM_FRAMES * NUM_MFCC) {
    // Legacy: just a flat array
    const mfcc = [];
    for (let i = 0; i < NUM_FRAMES; i += 1) {
      mfcc.push(output.slice(i * NUM_MFCC, (i + 1) * NUM_MFCC));
    }
    return { mfcc, debug: null };
  } else {
    throw new Error(
      `[MFCC] Invalid output: expected flat array or object with mfccs/debug, got ${typeof output}`,
    );
  }
}
