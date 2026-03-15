import { NativeModules } from 'react-native';
import { NUM_FRAMES, NUM_MFCC, INPUT_SHAPE } from '../constants/mlModel';

const { RNTensorflowLite } = NativeModules;

let modelLoaded = false;

/**
 * Loads the TFLite model (call once before inference).
 */
export async function loadTFLiteModel(
  modelName = 'speaker_id_embedding_model',
) {
  if (modelLoaded) return;
  await RNTensorflowLite.loadModel(modelName);
  modelLoaded = true;
}

/**
 * Run the TFLite model on MFCC input using the custom native module.
 * @param mfccFrames - Array of MFCC frames (shape: [numFrames][numMfcc])
 * @returns Promise<number[] | null> - Embedding output (length 128) or null on error
 */
export async function runModelOnMFCC(
  mfccFrames: number[][],
): Promise<number[] | null> {
  await loadTFLiteModel();
  // Check input shape
  if (!Array.isArray(mfccFrames) || mfccFrames.length !== NUM_FRAMES) {
    console.error(
      '[TFLITE] Input shape error: mfccFrames.length =',
      mfccFrames.length,
      'expected',
      NUM_FRAMES,
    );
    throw new Error(
      `Input shape error: mfccFrames.length = ${mfccFrames.length}, expected ${NUM_FRAMES}`,
    );
  }
  if (!Array.isArray(mfccFrames[0]) || mfccFrames[0].length !== NUM_MFCC) {
    console.error(
      '[TFLITE] Input shape error: mfccFrames[0].length =',
      mfccFrames[0]?.length,
      'expected',
      NUM_MFCC,
    );
    throw new Error(
      `Input shape error: mfccFrames[0].length = ${mfccFrames[0]?.length}, expected ${NUM_MFCC}`,
    );
  }
  // Flatten the MFCC frames to a 1D array
  const flatInput = mfccFrames.flat();
  try {
    const output = await RNTensorflowLite.runModelOnTensor(flatInput, [
      1,
      NUM_FRAMES,
      NUM_MFCC,
      1,
    ]);
    if (Array.isArray(output) && output.length === 128) {
      return output;
    }
    console.error('[TFLITE] Model returned unexpected output:', output);
    return null;
  } catch (err) {
    console.log('[TFLITE] Native inference error:', err);
    throw err;
  }
}

// For backward compatibility: runModelOnFakeData
export async function runModelOnFakeData(): Promise<number[] | null> {
  const fakeMFCC = Array.from({ length: NUM_FRAMES }, () =>
    Array.from({ length: NUM_MFCC }, () => Math.random()),
  );
  return runModelOnMFCC(fakeMFCC);
}
