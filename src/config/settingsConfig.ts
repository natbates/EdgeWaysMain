import type { Settings } from '../utils/settings';

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
    label: 'VAD RMS Threshold',
    description:
      'Adjust how sensitive voice detection is. Higher values require louder input before processing.',
    type: 'slider',
    min: 0.1,
    max: 1,
    step: 0.01,
    format: v => v.toFixed(2),
  },
  {
    key: 'vadSmoothTicks',
    label: 'VAD Smooth Ticks',
    description:
      'Number of consecutive VAD frames required for a stable voice decision.',
    type: 'slider',
    min: 1,
    max: 8,
    step: 1,
    format: v => String(Math.round(v)),
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
