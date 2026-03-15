/**
 * Generate fake audio and extract MFCCs for testing.
 * Returns array of MFCC frames.
 */
export function testMeydaMFCC(): number[][] {
  // Generate a fake sine wave buffer
  const len = 8192;
  const freq = 440;
  const sr = SAMPLE_RATE;
  const audio = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    audio[i] = Math.sin((2 * Math.PI * freq * i) / sr);
  }
  return extractMFCC(audio);
}
// utils/mfccUtils.ts
// Utility for extracting MFCCs from audio buffers using Meyda
// Requires: npm install meyda

import Meyda from 'meyda';
import {
  SAMPLE_RATE,
  N_FFT,
  HOP_LENGTH,
  NUM_MFCC,
  NUM_FRAMES,
  MEL_BANDS,
} from '../constants/mlModel';

/**
 * Extract MFCCs from a Float32Array audio buffer.
 * @param audioBuffer - The raw audio buffer (mono, 16kHz recommended)
 * @param sampleRate - The sample rate of the audio buffer (default 16000)
 * @param mfccCount - Number of MFCCs to extract (default 64)
 * @param windowSize - Window size in samples (default 512)
 * @param hopSize - Hop size in samples (default 256)
 * @returns Array of MFCC frames (shape: [numFrames][mfccCount])
 */
export function extractMFCC(
  audioBuffer: Float32Array,
  sampleRate = SAMPLE_RATE,
  mfccCount = NUM_MFCC,
  windowSize = N_FFT,
  hopSize = HOP_LENGTH,
): number[][] {
  const mfccFrames: number[][] = [];
  // Set Meyda config globally (per docs)
  Meyda.bufferSize = windowSize;
  Meyda.sampleRate = sampleRate;
  Meyda.melBands = MEL_BANDS;
  Meyda.numberOfMFCCCoefficients = NUM_MFCC;
  console.log(
    '[MFCC] Meyda config: bufferSize',
    windowSize,
    'sampleRate',
    sampleRate,
    'melBands',
    Meyda.melBands,
    'numberOfMFCCCoefficients',
    Meyda.numberOfMFCCCoefficients,
  );

  // Calculate the exact number of frames needed to match NUM_FRAMES
  // and the audio length needed for that many frames
  const requiredAudioLength = windowSize + (NUM_FRAMES - 1) * hopSize;
  let buf = audioBuffer;
  if (audioBuffer.length < requiredAudioLength) {
    // If too short, pad with zeros
    buf = new Float32Array(requiredAudioLength);
    buf.set(audioBuffer);
  } else if (audioBuffer.length > requiredAudioLength) {
    // If too long, use last requiredAudioLength samples
    buf = audioBuffer.slice(audioBuffer.length - requiredAudioLength);
  }
  for (
    let i = 0;
    i + windowSize <= buf.length && mfccFrames.length < NUM_FRAMES;
    i += hopSize
  ) {
    const frame = buf.slice(i, i + windowSize);
    let mfcc: any = null;
    try {
      mfcc = Meyda.extract('mfcc', frame);
      // eslint-disable-next-line no-console
      console.log(
        '[MFCC] Meyda.extract called, frame length:',
        frame.length,
        'result:',
        mfcc,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log('[MFCC] Meyda.extract error:', err);
      mfcc = null;
    }
    // Robustly handle both array and object return types
    if (Array.isArray(mfcc)) {
      mfccFrames.push(mfcc);
    } else if (mfcc && Array.isArray(mfcc.mfcc)) {
      mfccFrames.push(mfcc.mfcc);
    } else if (mfcc) {
      // eslint-disable-next-line no-console
      console.log('[MFCC] Unexpected Meyda.extract return type:', mfcc);
    }
  }
  // Confirm shape
  console.log(
    '[MFCC] Final mfccFrames shape:',
    mfccFrames.length,
    mfccFrames[0]?.length,
  );
  return mfccFrames;
}
