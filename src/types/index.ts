// src/types/index.ts

export type VoiceProfile = {
  name: string;
  embedding: number[];
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
