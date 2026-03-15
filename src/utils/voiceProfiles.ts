// src/utils/voiceProfiles.ts

import { COSINE_MIN_CONFIDENCE } from '../constants/mlModel';

export type VoiceProfile = {
  name: string;
  embedding: number[];
};

/**
 * Compute cosine similarity between two equal-length vectors.
 * Result ranges from -1 to 1.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Cosine similarity requires equal-length vectors');
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export type VoiceProfileScore = {
  name: string;
  score: number;
};

export type VoiceProfilePrediction = {
  bestMatch: VoiceProfileScore | null;
  scores: VoiceProfileScore[];
};

/**
 * Score an embedding against a set of voice profiles.
 * Returns the list of similarity scores (highest first) and the best match.
 */
export function scoreVoiceProfiles(
  embedding: number[],
  profiles: VoiceProfile[],
  threshold = COSINE_MIN_CONFIDENCE,
): VoiceProfilePrediction {
  const scores: VoiceProfileScore[] = profiles.map(p => ({
    name: p.name,
    score: cosineSimilarity(embedding, p.embedding),
  }));
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0] || null;
  return {
    bestMatch: best && best.score >= threshold ? best : null,
    scores,
  };
}
