import { Buffer } from 'buffer';

/**
 * Converts a base64-encoded PCM16 (little-endian) audio chunk into a Float32Array.
 *
 * This is the format returned by react-native-audio-record's `on('data')` callback.
 */
export function decodePcm16Base64ToFloat32(base64Chunk: string): Float32Array {
  const raw = Buffer.from(base64Chunk, 'base64');
  const byteCount = raw.length - (raw.length % 2);
  if (byteCount <= 0) {
    return new Float32Array(0);
  }

  const samples = new Int16Array(raw.buffer, raw.byteOffset, byteCount / 2);
  const float32 = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    float32[i] = samples[i] / 32768;
  }
  return float32;
}

/**
 * Computes the root-mean-square level for the given audio samples.
 */
export function computeRms(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}
