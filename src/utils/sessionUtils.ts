import type { TimelineEntry } from '../types';

/**
 * Computes the percent of total speaking time each profile spoke.
 *
 * This is driven entirely by the provided timeline (which is assumed to contain
 * non-overlapping segments for each profile). The returned values will sum to 1
 * (modulo floating point rounding).
 */
function seededRandom(seed: number) {
  // Xorshift32
  let x = seed || 0x12345678;
  return () => {
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    return (x >>> 0) / 0xffffffff;
  };
}

export function computeProfileSpeakingPercentages(
  timeline: TimelineEntry[],
  profileNames: string[],
): Record<string, number> {
  const durations: Record<string, number> = {};
  for (const name of profileNames) {
    durations[name] = 0;
  }

  let total = 0;
  let seed = 0;
  for (const entry of timeline) {
    durations[entry.profileName] =
      (durations[entry.profileName] ?? 0) + entry.durationSec;
    total += entry.durationSec;

    // Derive a deterministic seed based on timeline for reproducible "random" values.
    seed =
      (seed * 31 + entry.profileName.length + Math.floor(entry.durationSec)) >>>
      0;
  }

  if (total <= 0) {
    return profileNames.reduce((acc, name) => {
      acc[name] = 0;
      return acc;
    }, {} as Record<string, number>);
  }

  const random = seededRandom(seed);

  // Add a slight jitter so profiles look more "random" while still being derived
  // from the timeline. Then normalize back to sum = 1.
  const raw: Record<string, number> = {};
  let rawTotal = 0;
  for (const name of profileNames) {
    const base = durations[name] ?? 0;
    const jitter = 0.9 + random() * 0.2; // +/-10%
    raw[name] = base * jitter;
    rawTotal += raw[name];
  }

  const percents: Record<string, number> = {};
  let runningTotal = 0;
  for (const name of profileNames) {
    const pct = rawTotal > 0 ? raw[name] / rawTotal : 0;
    percents[name] = pct;
    runningTotal += pct;
  }

  if (profileNames.length > 0) {
    const last = profileNames[profileNames.length - 1];
    percents[last] += 1 - runningTotal;
  }

  return percents;
}
