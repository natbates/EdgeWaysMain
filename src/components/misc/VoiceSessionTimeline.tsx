import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { colorScheme } from '@constants/colorScheme';
import { profileColors } from '@constants/profileColors';

import type { TimelineEntry, VoiceProfile } from '../../types';

export type VoiceSessionTimelineProps = {
  timeline: TimelineEntry[];
  voiceProfiles: VoiceProfile[];
  totalRecordedTimeSec: number;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
};

const getProfileColorMap = (voiceProfiles: VoiceProfile[]) => {
  const map = new Map<string, string>();
  voiceProfiles.forEach((profile, idx) => {
    map.set(profile.name, profileColors[idx % profileColors.length]);
  });
  return map;
};

function VoiceSessionTimeline({
  timeline,
  voiceProfiles,
  totalRecordedTimeSec,
  onInteractionStart,
  onInteractionEnd,
}: VoiceSessionTimelineProps) {
  const scrollViewRef = React.useRef<ScrollView>(null);
  const isInteractingRef = React.useRef(false);
  const isFollowingLiveRef = React.useRef(true);
  const [containerWidth, setContainerWidth] = React.useState(0);

  const scrollToEnd = (animated = false) => {
    if (isFollowingLiveRef.current && scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated });
    }
  };

  const profileColorByName = React.useMemo(
    () => getProfileColorMap(voiceProfiles),
    [voiceProfiles],
  );

  const mergedTimeline = React.useMemo(() => {
    if (!timeline?.length) return [];

    const sorted = [...timeline];
    let isSorted = true;
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i - 1].startTimeSec > sorted[i].startTimeSec) {
        isSorted = false;
        break;
      }
    }

    if (!isSorted) {
      sorted.sort((a, b) => a.startTimeSec - b.startTimeSec);
    }

    const merged: typeof timeline = [];
    for (const entry of sorted) {
      if (merged.length === 0) {
        merged.push({ ...entry });
        continue;
      }

      const last = merged[merged.length - 1];
      const lastEnd = last.startTimeSec + last.durationSec;
      const gap = entry.startTimeSec - lastEnd;

      if (entry.profileName === last.profileName && gap <= 0.05) {
        last.durationSec = Math.max(
          last.durationSec,
          entry.startTimeSec + entry.durationSec - last.startTimeSec,
        );
      } else {
        merged.push({ ...entry });
      }
    }

    return merged;
  }, [timeline]);

  React.useEffect(() => {
    if (!isInteractingRef.current && isFollowingLiveRef.current) {
      requestAnimationFrame(() => scrollToEnd(true));
    }
  }, [mergedTimeline]);

  const totalSpoken = React.useMemo(
    () => mergedTimeline.reduce((sum, entry) => sum + entry.durationSec, 0),
    [mergedTimeline],
  );

  const timelineLength = React.useMemo(
    () =>
      Math.max(
        totalRecordedTimeSec,
        ...timeline.map(entry => entry.startTimeSec + entry.durationSec),
        1,
      ),
    [timeline, totalRecordedTimeSec],
  );

  const secondsWidthPx = 40;
  const trackWidth = Math.max(
    containerWidth || 300,
    300,
    timelineLength * secondsWidthPx,
  );

  const secondsInterval = React.useMemo(() => {
    if (timelineLength <= 30) return 1;
    if (timelineLength <= 120) return 5;
    if (timelineLength <= 240) return 10;
    return 15;
  }, [timelineLength]);

  const secondsTicks = React.useMemo(
    () =>
      Array.from(
        { length: Math.floor(timelineLength / secondsInterval) + 1 },
        (_, index) => index * secondsInterval,
      ),
    [timelineLength, secondsInterval],
  );

  const timelineLabels = React.useMemo(
    () =>
      timeline.map((entry, idx) => ({
        key: `time-${idx}`,
        left: (entry.startTimeSec / timelineLength) * trackWidth,
        label: `${entry.startTimeSec.toFixed(1)}s`,
      })),
    [timeline, timelineLength, trackWidth],
  );

  const timelineBars = React.useMemo(
    () =>
      mergedTimeline.map((entry, idx) => {
        const profileColor =
          profileColorByName.get(entry.profileName) ?? colorScheme.border;
        const left = (entry.startTimeSec / timelineLength) * trackWidth;
        const width = (entry.durationSec / timelineLength) * trackWidth;
        return {
          key: `bar-${idx}`,
          style: {
            backgroundColor: profileColor,
            left,
            width: Math.max(width, 4),
          },
        };
      }),
    [mergedTimeline, profileColorByName, timelineLength, trackWidth],
  );

  return (
    <View
      style={styles.container}
      onLayout={event => setContainerWidth(event.nativeEvent.layout.width)}
    >
      <Text style={styles.title}>Session Timeline</Text>

      <ScrollView
        ref={scrollViewRef}
        horizontal
        nestedScrollEnabled
        scrollEnabled
        showsHorizontalScrollIndicator
        bounces={false}
        decelerationRate="fast"
        contentContainerStyle={[styles.timelineScroll, { width: trackWidth }]}
        style={styles.timelineScrollWrapper}
        onScrollBeginDrag={() => {
          isInteractingRef.current = true;
          isFollowingLiveRef.current = false;
          onInteractionStart?.();
        }}
        onMomentumScrollBegin={() => {
          isInteractingRef.current = true;
          isFollowingLiveRef.current = false;
          onInteractionStart?.();
        }}
        onScrollEndDrag={() => {
          isInteractingRef.current = false;
          isFollowingLiveRef.current = true;
          onInteractionEnd?.();
        }}
        onMomentumScrollEnd={() => {
          isInteractingRef.current = false;
          isFollowingLiveRef.current = true;
          onInteractionEnd?.();
        }}
        onTouchStart={() => {
          isInteractingRef.current = true;
          isFollowingLiveRef.current = false;
          onInteractionStart?.();
        }}
        onTouchEnd={() => {
          isInteractingRef.current = false;
          isFollowingLiveRef.current = true;
          onInteractionEnd?.();
        }}
        onContentSizeChange={() => {
          if (isFollowingLiveRef.current && !isInteractingRef.current) {
            scrollToEnd(true);
          }
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onStartShouldSetResponderCapture={() => true}
        onMoveShouldSetResponderCapture={() => true}
      >
        <View style={[styles.timelineContent, { width: trackWidth }]}>
          <View style={styles.secondsRuler}>
            {secondsTicks.map(sec => {
              const left = (sec / timelineLength) * trackWidth;
              return (
                <View
                  key={`sec-tick-${sec}`}
                  style={[styles.secondTick, { left }]}
                >
                  <Text style={styles.tickLabel}>{sec}s</Text>
                </View>
              );
            })}
          </View>

          <View style={styles.timesRow}>
            {timelineLabels.map(label => (
              <Text
                key={label.key}
                style={[
                  styles.timeLabel,
                  {
                    position: 'absolute',
                    left: Math.max(label.left - 10, 0),
                    minWidth: 30,
                    textAlign: 'center',
                  },
                ]}
              >
                {label.label}
              </Text>
            ))}
          </View>

          <View style={styles.timelineTrack}>
            {timelineBars.map(bar => (
              <View key={bar.key} style={[styles.timelineBar, bar.style]} />
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>
          Spoken: {totalSpoken.toFixed(1)}s / {totalRecordedTimeSec.toFixed(1)}s
        </Text>
        <Text style={styles.summaryText}>
          Ratio:{' '}
          {(totalRecordedTimeSec > 0
            ? (totalSpoken / totalRecordedTimeSec) * 100
            : 0
          ).toFixed(1)}
          %
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colorScheme.border,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: colorScheme.primaryText,
    marginBottom: 8,
  },
  scrollContent: {
    paddingVertical: 4,
    alignItems: 'center',
  },
  timelineScroll: {
    width: '100%',
    minHeight: 32,
  },
  timelineContainer: {
    width: '100%',
    overflow: 'hidden',
  },
  timelineContent: {
    flexShrink: 0,
  },
  timelineTrack: {
    height: 28,
    backgroundColor: colorScheme.surface,
    borderRadius: 6,
    position: 'relative',
    marginTop: 4,
    marginBottom: 8,
  },
  timelineBar: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    borderRadius: 6,
    minWidth: 10,
    opacity: 0.95,
  },
  secondsRuler: {
    height: 10,
    position: 'relative',
    marginBottom: 4,
  },
  secondTick: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
    width: 48,
    marginLeft: -12,
  },
  tickLabel: {
    fontSize: 10,
    color: colorScheme.subText,
    textAlign: 'center',
  },
  timesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
    paddingHorizontal: 4,
    flexWrap: 'nowrap',
    overflow: 'hidden',
  },
  timeLabel: {
    fontSize: 10,
    color: colorScheme.subText,
    marginRight: 8,
  },
  summaryRow: {
    marginTop: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timelineScrollWrapper: {
    maxWidth: '100%',
    overflow: 'hidden',
    marginTop: 10,
  },
  summaryText: {
    fontSize: 11,
    color: colorScheme.subText,
  },
  emptyContainer: {
    padding: 12,
    borderRadius: 12,
    borderColor: colorScheme.border,
    borderWidth: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 12,
    color: colorScheme.subText,
  },
});

export default React.memo(
  VoiceSessionTimeline,
  (prev, next) =>
    prev.timeline === next.timeline &&
    prev.voiceProfiles === next.voiceProfiles &&
    prev.totalRecordedTimeSec === next.totalRecordedTimeSec &&
    prev.onInteractionStart === next.onInteractionStart &&
    prev.onInteractionEnd === next.onInteractionEnd,
);
