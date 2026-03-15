import type { Session } from '../types';

// Set to true to enable mock sessions in the Sessions screen.
// This file is meant to be easy to tweak for development/demo purposes.
export const USE_MOCK_SESSIONS = true;

/**
 * Generate a deterministic embedding vector of length `size`.
 * Uses a simple pseudo-random sequence for variation.
 */
function makeEmbedding(size: number, seed: number): number[] {
  const out = new Array<number>(size);
  let x = seed;
  for (let i = 0; i < size; i += 1) {
    // simple LCG-like repeatable sequence
    x = (x * 16807) % 2147483647;
    out[i] = (x / 2147483647) * 2 - 1; // range -1..1
  }
  return out;
}

export type MockSessionConfig = {
  id: string;
  name: string;
  createdAt: number;
  recordedTimeSec: number;
  profileCount: number;
  embeddingSize: number;
  timeline?: Array<{
    profileIndex: number;
    startTimeSec: number;
    durationSec: number;
  }>;
};

export function createMockSession(config: MockSessionConfig): Session {
  const voiceProfiles = Array.from(
    { length: config.profileCount },
    (_, idx) => ({
      name: `Profile ${idx + 1}`,
      embedding: makeEmbedding(config.embeddingSize, idx + 1),
    }),
  );

  const timeline = (config.timeline ?? []).map(entry => ({
    profileName:
      voiceProfiles[entry.profileIndex]?.name ??
      `Profile ${entry.profileIndex}`,
    startTimeSec: entry.startTimeSec,
    durationSec: entry.durationSec,
  }));

  return {
    id: config.id,
    name: config.name,
    createdAt: config.createdAt,
    recordedTimeSec: config.recordedTimeSec,
    voiceProfiles,
    timeline,
  };
}

export const MOCK_SESSIONS: Session[] = [
  createMockSession({
    id: 'mock-1',
    name: 'Demo Session A',
    createdAt: Date.now(),
    recordedTimeSec: 15,
    profileCount: 3,
    embeddingSize: 128,
    timeline: [
      { profileIndex: 0, startTimeSec: 0, durationSec: 4 },
      { profileIndex: 1, startTimeSec: 8, durationSec: 3 },
      { profileIndex: 2, startTimeSec: 14, durationSec: 2 },
    ],
  }),
  createMockSession({
    id: 'mock-2',
    name: 'Demo Session B',
    createdAt: Date.now() - 1000 * 60 * 60,
    recordedTimeSec: 32,
    profileCount: 2,
    embeddingSize: 128,
    timeline: [
      { profileIndex: 0, startTimeSec: 0, durationSec: 5 },
      { profileIndex: 1, startTimeSec: 10, durationSec: 6 },
    ],
  }),
];
