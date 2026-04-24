// src/types/index.ts

export type VoiceProfile = {
  name: string;
  embedding: number[];
  segmentEmbeddings?: number[][];
  /**
   * Optional demo value: percentage of speaking time in a mock session.
   * This is used for UI/visualization purposes only.
   */
  speakingPercentage?: number;
};

export type TimelineEntry = {
  profileName: string;
  startTimeSec: number;
  durationSec: number;
};

export type Session = {
  id: string;
  name: string;
  createdAt: number;
  recordedTimeSec: number; // current recording position (doesn't go backwards)
  voiceProfiles: VoiceProfile[];
  timeline: TimelineEntry[];
};
