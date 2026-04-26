import { NativeModules } from 'react-native';
import {
  NUM_FRAMES,
  NUM_MFCC,
  EMBEDDING_DIM,
  WINDOW_LENGTH_SAMPLES,
  WAVEFORM_MODEL_REQUIRED_SAMPLES,
} from '../constants/mlModel';
import { runMFCCOnWaveform } from './mfccUtils';

const { RNTensorflowLite } = NativeModules;

const loadedModels = new Set<string>();
let cachedModelInputCount: number | null = null;

async function getModelInputCount(): Promise<number | null> {
  if (cachedModelInputCount !== null) {
    return cachedModelInputCount;
  }

  try {
    const shapeRaw = await RNTensorflowLite.getInputTensorShape?.();
    if (Array.isArray(shapeRaw) && shapeRaw.length > 0) {
      const dims = shapeRaw.map((d: any) => Number(d));
      const count = dims.reduce((acc: number, d: number) => acc * d, 1);
      if (Number.isFinite(count) && count > 0) {
        cachedModelInputCount = count;
        console.log(
          '[TFLITE] detected model input shape:',
          dims,
          'count=',
          count,
        );
        return count;
      }
    }
  } catch (err) {
    console.warn(
      '[TFLITE] getInputTensorShape failed, using fallback logic',
      err,
    );
  }

  return null;
}

function toNumberArray(output: any): number[] | null {
  if (Array.isArray(output)) {
    return output as number[];
  }
  if (ArrayBuffer.isView(output)) {
    // DataView / TypedArray types have numeric indices and length-like behavior.
    const len = (
      output as { readonly byteLength: number; readonly length?: number }
    ).length;
    if (typeof len === 'number') {
      const arr = new Array<number>(len);
      for (let i = 0; i < len; i += 1) {
        arr[i] = (output as any)[i];
      }
      return arr;
    }
    // fallback for DataView where `length` property is absent
    const view = output as DataView;
    if (view && typeof view.byteLength === 'number') {
      const arr = new Array<number>(view.byteLength / 4);
      let idx = 0;
      for (let i = 0; i < view.byteLength; i += 4) {
        arr[idx++] = view.getFloat32(i, true);
      }
      return arr;
    }
    return null;
  }
  if (
    output &&
    typeof output === 'object' &&
    typeof output.length === 'number' &&
    output.length >= 0
  ) {
    try {
      return Array.from(output as ArrayLike<number>);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Loads the TFLite model (call once before inference).
 */
export async function loadTFLiteModel(
  modelName = 'speaker_id_embedding_model',
) {
  if (loadedModels.has(modelName)) {
    console.log(`[TFLITE] Model '${modelName}' already loaded.`);
    return;
  }
  console.log(`[TFLITE] Attempting to load model: '${modelName}'`);
  try {
    const result = await RNTensorflowLite.loadModel(modelName);
    console.log(
      `[TFLITE] Model '${modelName}' loaded successfully. Result:`,
      result,
    );
    loadedModels.add(modelName);
    cachedModelInputCount = null;
  } catch (err) {
    console.error(`[TFLITE] Model load failed for '${modelName}':`, err);
    throw err;
  }
}

/**
 * Run the TFLite model on MFCC input using the custom native module.
 * @param mfccFrames - Array of MFCC frames (shape: [numFrames][numMfcc])
 * @returns Promise<number[] | null> - Embedding output (length EMBEDDING_DIM) or null on error
 */
export async function runModelOnWaveform(
  waveform: number[] | Float32Array,
): Promise<number[] | null> {
  await loadTFLiteModel();
  const modelInputCount = await getModelInputCount();

  if (!Array.isArray(waveform) && !(waveform instanceof Float32Array)) {
    throw new Error('[TFLITE] waveform must be an array or Float32Array');
  }

  const mfccInputCount = NUM_FRAMES * NUM_MFCC;

  // Only use MFCC route if the loaded model input count matches MFCC flatten size.
  if (modelInputCount === mfccInputCount) {
    try {
      const mfccResult = await runMFCCOnWaveform(waveform);
      if (mfccResult && mfccResult.mfcc) {
        console.log(
          '[TFLITE] Using MFCC-based inference path (1,',
          mfccResult.mfcc.length,
          ', 40, 1)',
        );
        const emb = await runModelOnMFCC(mfccResult.mfcc);
        if (emb) {
          return emb;
        }
        console.warn(
          '[TFLITE] runModelOnMFCC returned null after extracting MFCC',
        );
      }
    } catch (mfccErr) {
      console.warn(
        '[TFLITE] MFCC extraction path failed, falling back to waveform candidate lengths:',
        mfccErr,
      );
    }
  } else if (modelInputCount !== null) {
    console.log(
      '[TFLITE] Model expects waveform-sized input count:',
      modelInputCount,
      '(skipping MFCC path)',
    );
  }

  // Legacy waveform path fallback (for older model variants or experimental support).
  // Keep 1.5s app windows (24000 at 16kHz) for app logic, but prioritize
  // model-required input length for inference to avoid per-tick mismatch errors.
  const candidateLengths = Array.from(
    new Set([
      ...(modelInputCount && modelInputCount !== mfccInputCount
        ? [modelInputCount]
        : []),
      WAVEFORM_MODEL_REQUIRED_SAMPLES,
      WINDOW_LENGTH_SAMPLES,
      64000,
    ]),
  );

  const prepareFixed = (targetLength: number): Float32Array => {
    const fixed = new Float32Array(targetLength);
    if (waveform.length >= targetLength) {
      for (let i = 0; i < targetLength; i += 1) {
        fixed[i] = waveform[i];
      }
    } else {
      let filled = 0;
      while (filled + waveform.length <= targetLength) {
        for (let i = 0; i < waveform.length; i += 1) {
          fixed[filled + i] = waveform[i];
        }
        filled += waveform.length;
      }
      for (let i = 0; i < targetLength - filled; i += 1) {
        fixed[filled + i] = waveform[i % waveform.length];
      }
    }
    return fixed;
  };

  for (const target of candidateLengths) {
    const fixed = prepareFixed(target);
    const flatInput = Array.from(fixed);

    try {
      const minSample = Math.min(...fixed);
      const maxSample = Math.max(...fixed);
      console.log(
        '[TFLITE] waveform inference input candidate: length=',
        fixed.length,
        'min=',
        minSample,
        'max=',
        maxSample,
      );

      const outputRaw = await RNTensorflowLite.runModelOnTensor(flatInput, [
        1,
        target,
      ]);
      const output = toNumberArray(outputRaw);
      if (output && output.length === EMBEDDING_DIM) {
        console.log(
          '[TFLITE] waveform inference succeeded with target length',
          target,
        );
        return output;
      }

      console.warn(
        '[TFLITE] Model returned unexpected output for target',
        target,
        'raw type',
        typeof outputRaw,
        'raw length',
        outputRaw?.length,
        'array length',
        output?.length,
      );
    } catch (err: any) {
      console.warn(
        '[TFLITE] RunModelOnTensor failed for target length',
        target,
        'error:',
        err,
      );
      continue;
    }
  }

  console.error(
    '[TFLITE] waveform inference failed for all candidate lengths',
    candidateLengths,
  );
  return null;
}

export async function runPreprocOnWaveform(
  waveform: number[] | Float32Array,
): Promise<number[][] | null> {
  const result = await runMFCCOnWaveform(waveform);
  return result ? result.mfcc : null;
}

export async function runSpeakerFromWaveform(
  waveform: number[] | Float32Array,
): Promise<number[] | null> {
  const mfccResult = await runMFCCOnWaveform(waveform);
  if (!mfccResult) {
    console.warn('[TFLITE] MFCC preproc failed, abort speaker inference.');
    return null;
  }
  return runModelOnMFCC(mfccResult.mfcc);
}

export async function runModelOnMFCC(
  mfccFrames: number[][],
): Promise<number[] | null> {
  await loadTFLiteModel();
  const modelInputCount = await getModelInputCount();
  const mfccInputCount = NUM_FRAMES * NUM_MFCC;

  if (modelInputCount !== null && modelInputCount !== mfccInputCount) {
    console.warn(
      '[TFLITE] Skipping MFCC inference: model expects input count',
      modelInputCount,
      'but MFCC count is',
      mfccInputCount,
    );
    return null;
  }
  // Check input shape
  if (!Array.isArray(mfccFrames) || mfccFrames.length !== NUM_FRAMES) {
    console.error(
      '[TFLITE] Input shape error: mfccFrames.length =',
      mfccFrames.length,
      'expected',
      NUM_FRAMES,
    );
    console.error(
      '[TFLITE] mfccFrames first few lengths:',
      mfccFrames.slice(0, 3).map(f => f.length),
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
  console.log(
    '[TFLITE] Running model: input shape',
    mfccFrames.length,
    'x',
    mfccFrames[0].length,
    'flat length',
    flatInput.length,
  );
  try {
    const outputRaw = await RNTensorflowLite.runModelOnTensor(flatInput, [
      1,
      NUM_FRAMES,
      NUM_MFCC,
      1,
    ]);
    console.log('[TFLITE] Native raw output:', outputRaw);

    const output = toNumberArray(outputRaw);
    if (output && output.length === EMBEDDING_DIM) {
      return output;
    }
    console.error(
      '[TFLITE] Model returned unexpected output for MFCC path:',
      'raw type',
      typeof outputRaw,
      'raw length',
      outputRaw?.length,
      'converted length',
      output?.length,
      'expected',
      EMBEDDING_DIM,
    );
    return null;
  } catch (err) {
    console.error('[TFLITE] Native inference error', err);
    /*
      To avoid breaking the entire loop, return null and let the
      calling controller handle absence of embedding. This allows
      UI to continue and avoids repeated exception bubbles.
    */
    return null;
  }
}

// For backward compatibility: runModelOnFakeData
export async function runModelOnFakeData(): Promise<number[] | null> {
  const fakeMFCC = Array.from({ length: NUM_FRAMES }, () =>
    Array.from({ length: NUM_MFCC }, () => Math.random()),
  );
  return runModelOnMFCC(fakeMFCC);
}

export function isModelLoaded(): boolean {
  return loadedModels.size > 0;
}
