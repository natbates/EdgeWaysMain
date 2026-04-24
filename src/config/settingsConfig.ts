import type { Settings } from '../utils/settings';
import { mapRmsSliderToThreshold, mapZcrSliderToThreshold } from '../utils/vad';

export type SettingType = 'slider';

export type SettingConfig<T extends SettingType = SettingType> = {
  key: keyof Settings;
  label: string;
  description: string;
  type: T;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
};

export const settingsConfig: SettingConfig[] = [
  {
    key: 'vadRmsThreshold',
    label: 'VAD RMS Sensitivity',
    description:
      'Adjust how sensitive voice detection is. Higher values require louder input before processing.',
    type: 'slider',
    min: 1,
    max: 10,
    step: 1,
    format: v => `${Math.round(v)} (≈${mapRmsSliderToThreshold(v).toFixed(5)})`,
  },
  {
    key: 'vadSmoothTicks',
    label: 'VAD Smooth Ticks',
    description:
      'Number of consecutive VAD frames required for a stable voice decision. Set to 0 to disable smoothing.',
    type: 'slider',
    min: 0,
    max: 3,
    step: 1,
    format: v => String(Math.round(v)),
  },
  {
    key: 'vadZcrThreshold',
    label: 'VAD ZCR Sensitivity',
    description:
      'Adjust how much noise/unvoiced energy is allowed. Higher values allow more noisy frames to count as speech.',
    type: 'slider',
    min: 1,
    max: 10,
    step: 1,
    format: v => `${Math.round(v)} (≈${mapZcrSliderToThreshold(v).toFixed(3)})`,
  },
  {
    key: 'cosineMinConfidence',
    label: 'Cosine Confidence',
    description:
      'Minimum similarity score required to consider a voice profile match.',
    type: 'slider',
    min: 0.5,
    max: 1,
    step: 0.01,
    format: v => v.toFixed(2),
  },
  {
    key: 'trainingRecordDurationSec',
    label: 'Training Duration (s)',
    description:
      'Length of time (seconds) used when recording a voice profile.',
    type: 'slider',
    min: 3,
    max: 20,
    step: 1,
    format: v => `${Math.round(v)}s`,
  },
];
