import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { colorScheme } from '@constants/colorScheme';

export type VoiceProfileSpeakBar = {
  name: string;
  percentage: number; // 0..1
  color?: string;
};

export type VoiceProfileSpeakingBarsProps = {
  profiles: VoiceProfileSpeakBar[];
  highlighted?: string | null;
};

export default function VoiceProfileSpeakingBars({
  profiles,
  highlighted,
}: VoiceProfileSpeakingBarsProps) {
  if (!profiles.length) {
    return null;
  }

  return (
    <View style={styles.container}>
      {profiles.map(profile => {
        const barHeight = Math.max(0, Math.min(1, profile.percentage)) * 100;
        const isActive = profile.name === highlighted;
        return (
          <View key={profile.name} style={styles.column}>
            <View
              style={[
                styles.bar,
                { height: `${barHeight}%` },
                { backgroundColor: profile.color ?? colorScheme.accent },
                isActive && styles.activeBar,
              ]}
            />
            <Text style={styles.label} numberOfLines={1}>
              {profile.name}
            </Text>
            <Text style={styles.percent} numberOfLines={1}>
              {Math.round(profile.percentage * 100)}%
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colorScheme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    marginTop: 16,
  },
  column: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 4,
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
});
