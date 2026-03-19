// src/constants/mlModel.ts

export const SAMPLE_RATE = 16000; // Hz
export const WINDOW_DURATION_SEC = 0.5; // seconds
export const WINDOW_LENGTH_SAMPLES = Math.floor(
  SAMPLE_RATE * WINDOW_DURATION_SEC,
); // samples per window
export const NUM_FRAMES = 92;
export const NUM_MFCC = 40;
export const MEL_BANDS = 40;
export const INPUT_SHAPE = [1, NUM_FRAMES, NUM_MFCC, 1];
export const EMBEDDING_DIM = 128;
export const COSINE_MIN_CONFIDENCE = 0.75;

// Voice activity detection (VAD) settings
// If RMS is below this, treat as silence and skip MFCC/model inference.
// Lowering this value makes the VAD more sensitive to quieter speech.
export const VAD_RMS_THRESHOLD = 0.001; // energy threshold for VAD (tune per mic/environment)

// Maximum allowed zero-crossing rate for speech segments.
// Higher values allow more noisy/unvoiced content to be treated as speech.
export const VAD_ZCR_THRESHOLD = 0.25; // tune per mic/environment

// Training (voice profile) settings
export const TRAINING_RECORD_DURATION_SEC = 10; // seconds of audio to record for a profile

// MFCC extraction parameters (should match model training)
export const N_FFT = 512;
export const HOP_LENGTH = 256;
