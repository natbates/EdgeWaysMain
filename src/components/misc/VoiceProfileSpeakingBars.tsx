import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

import { colorScheme } from '@constants/colorScheme';

export type VoiceProfileSpeakBar = {
  name: string;
  percentage: number; // 0..1
  timeSec?: number; // seconds spoken
  color?: string;
};

export type VoiceProfileSpeakingBarsProps = {
  profiles: VoiceProfileSpeakBar[];
  highlighted?: number | null;
};

export default function VoiceProfileSpeakingBars({
  profiles,
  highlighted,
}: VoiceProfileSpeakingBarsProps) {
  useEffect(() => {
    console.log('[VoiceProfileSpeakingBars] render', {
      profiles,
      highlighted,
    });
  }, [profiles, highlighted]);

  const hasProfiles = profiles.length > 0;
  const isScroll = profiles.length > 3;

  const renderProfiles = () =>
    profiles.map((profile, index) => {
      const barHeight = Math.max(0, Math.min(1, profile.percentage)) * 100;
      const isActive = highlighted === index;
      const profileKey = `${profile.name}-${profile.timeSec ?? '0'}-${
        profile.color ?? 'none'
      }-${index}`;

      return (
        <View
          key={profileKey}
          style={[
            styles.column,
            isScroll ? styles.scrollColumn : styles.flexColumn,
            isScroll && styles.scrollPadding,
          ]}
        >
          <View style={styles.barContainer}>
            <View
              style={[
                styles.bar,
                {
                  height: `${Math.max(0, Math.min(barHeight, 100))}%`,
                  backgroundColor: profile.color ?? colorScheme.accent,
                  opacity: isActive ? 1 : 0.6,
                },
              ]}
            />
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {profile.name}
          </Text>
          <Text style={styles.percent} numberOfLines={1}>
            {Math.round(profile.percentage * 100)}% •
            {profile.timeSec != null ? ` ${profile.timeSec.toFixed(1)}s` : ''}
          </Text>
        </View>
      );
    });

  return (
    <View style={[styles.container, !hasProfiles && styles.containerEmpty]}>
      {hasProfiles ? (
        isScroll ? (
          <ScrollView
            horizontal
            style={styles.scrollView}
            contentContainerStyle={styles.scrollList}
            showsHorizontalScrollIndicator={false}
          >
            {renderProfiles()}
          </ScrollView>
        ) : (
          <View style={styles.rowContent}>{renderProfiles()}</View>
        )
      ) : (
        <View style={styles.emptyContent}>
          <Text style={styles.emptyText} numberOfLines={1}>
            Add a voice profile to see speaking bars
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colorScheme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colorScheme.border,
    marginBottom: 0,
  },
  containerEmpty: {
    minHeight: 200,
    justifyContent: 'center',
  },
  column: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 4,
  },
  flexColumn: {
    flex: 1,
    minWidth: 0,
  },
  scrollColumn: {
    width: 120,
  },
  scrollPadding: {
    paddingHorizontal: 6,
  },
  rowContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    width: '100%',
  },

  scrollView: {
    flex: 1,
  },

  scrollList: {
    flexGrow: 1,
    paddingVertical: 8,
    alignItems: 'flex-end',
  },
  barContainer: {
    width: '100%',
    flex: 1,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  bar: {
    width: '100%',
    borderRadius: 8,
    backgroundColor: colorScheme.accent,
  },
  activeBar: {
    borderWidth: 2,
    borderColor: colorScheme.accent,
  },
  label: {
    marginTop: 6,
    fontSize: 12,
    color: colorScheme.primaryText,
  },
  percent: {
    fontSize: 10,
    color: colorScheme.subText,
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: colorScheme.subText,
    fontSize: 14,
  },
});
