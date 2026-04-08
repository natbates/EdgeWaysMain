import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  VAD_RMS_THRESHOLD,
  VAD_ZCR_THRESHOLD,
  COSINE_MIN_CONFIDENCE,
  TRAINING_RECORD_DURATION_SEC,
} from '../constants/mlModel';
import { mapRmsThresholdToSlider, mapZcrThresholdToSlider } from './vad';

const STORAGE_KEY = '@edgeways_settings_v1';

export type Settings = {
  vadRmsThreshold: number;
  vadZcrThreshold: number;
  vadSmoothTicks: number;
  cosineMinConfidence: number;
  trainingRecordDurationSec: number;
};

export const DEFAULT_SETTINGS: Settings = {
  // Slider values mapped from the constant threshold defaults.
  vadRmsThreshold: mapRmsThresholdToSlider(VAD_RMS_THRESHOLD),
  vadZcrThreshold: mapZcrThresholdToSlider(VAD_ZCR_THRESHOLD),
  vadSmoothTicks: 0,
  cosineMinConfidence: COSINE_MIN_CONFIDENCE,
  trainingRecordDurationSec: TRAINING_RECORD_DURATION_SEC,
};

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<Settings>;
    const merged = { ...DEFAULT_SETTINGS, ...parsed };

    // Migrate old saved thresholds (values like 0.001–0.02) into the new 1–10 slider domain.
    const vadRmsThreshold =
      merged.vadRmsThreshold <= 1
        ? mapRmsThresholdToSlider(merged.vadRmsThreshold)
        : merged.vadRmsThreshold;
    const vadZcrThreshold =
      merged.vadZcrThreshold <= 1
        ? mapZcrThresholdToSlider(merged.vadZcrThreshold)
        : merged.vadZcrThreshold;

    return {
      ...merged,
      vadRmsThreshold,
      vadZcrThreshold,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore write errors
  }
}
