import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@edgeways_settings_v1';

export type Settings = {
  vadRmsThreshold: number;
  vadSmoothTicks: number;
  cosineMinConfidence: number;
  trainingRecordDurationSec: number;
};

export const DEFAULT_SETTINGS: Settings = {
  vadRmsThreshold: 0.02,
  vadSmoothTicks: 0,
  cosineMinConfidence: 0.75,
  trainingRecordDurationSec: 10,
};

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
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
