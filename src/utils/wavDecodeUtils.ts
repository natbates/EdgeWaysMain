// utils/wavDecodeUtils.ts
// Utility to decode WAV files to Float32Array in React Native
// Requires: npm install wav-decoder

import wav from 'wav-decoder';

/**
 * Decode a WAV file buffer to Float32Array (mono)
 * @param buffer - ArrayBuffer of WAV file
 * @returns Float32Array of PCM samples (mono)
 */
export async function decodeWavToFloat32(
  buffer: ArrayBuffer,
): Promise<Float32Array> {
  const audioData = await wav.decode(buffer);
  // If stereo, take only the first channel
  if (audioData.channelData.length > 0) {
    return audioData.channelData[0];
  }
  throw new Error('No audio channel data found');
}
