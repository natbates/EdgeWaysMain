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

export function computeProfileSpeakingDurations(
  timeline: TimelineEntry[],
  profileNames: string[],
): Record<string, number> {
  const durations: Record<string, number> = {};
  for (const name of profileNames) {
    durations[name] = 0;
  }

  for (const entry of timeline) {
    durations[entry.profileName] =
      (durations[entry.profileName] ?? 0) + entry.durationSec;
  }

  return durations;
}

export function computeProfileSpeakingPercentages(
  timeline: TimelineEntry[],
  profileNames: string[],
): Record<string, number> {
  const durations = computeProfileSpeakingDurations(timeline, profileNames);
  const total = Object.values(durations).reduce((sum, v) => sum + v, 0);

  if (total <= 0) {
    return profileNames.reduce((acc, name) => {
      acc[name] = 0;
      return acc;
    }, {} as Record<string, number>);
  }

  const percents = profileNames.reduce((acc, name) => {
    acc[name] = (durations[name] ?? 0) / total;
    return acc;
  }, {} as Record<string, number>);

  // console.log('[sessionUtils] percentages', {
  //   total,
  //   durations,
  //   percents,
  // });

  return percents;
}
