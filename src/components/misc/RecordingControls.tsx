import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { CustomButton, CustomText } from '@components';
import { colorScheme } from '@constants/colorScheme';

export type RecordingControlsProps = {
  isRecording: boolean;
  recordTime: string;
  audioLevelFraction: number;
  activeProfileName: string | null;
  activeProfileColor?: string | null;
  activeProfileConfidence?: number | null;
  cosineThreshold?: number | null;
  onToggleRecording: () => void;
};

export default function RecordingControls({
  isRecording,
  recordTime,
  audioLevelFraction,
  activeProfileName,
  activeProfileColor = null,
  activeProfileConfidence = null,
  cosineThreshold = null,
  onToggleRecording,
}: RecordingControlsProps) {
  const levelHeight = Math.max(0, Math.min(1, audioLevelFraction)) * 100;

  const translucentProfileColor = (hex: string) => {
    const normalized = hex.replace('#', '');
    if (normalized.length === 6) {
      return `#${normalized}22`;
    }
    return hex;
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.playBox,
          activeProfileColor && {
            backgroundColor: translucentProfileColor(activeProfileColor),
            borderColor: activeProfileColor,
          },
        ]}
      >
        <View style={[styles.playBoxLevel, { height: `${levelHeight}%` }]} />
        <TouchableOpacity
          style={styles.playCircle}
          onPress={onToggleRecording}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name={isRecording ? 'pause' : 'play'}
            size={20}
            color={colorScheme.accentText}
          />
        </TouchableOpacity>
        <CustomText style={styles.playTime}>{recordTime.slice(3)}</CustomText>
        {typeof cosineThreshold === 'number' ? (
          <CustomText style={styles.thresholdText} numberOfLines={1}>
            {`Cosine threshold: ${cosineThreshold.toFixed(2)}`}
          </CustomText>
        ) : null}
        {activeProfileName ? (
          <View style={styles.predictionBox} pointerEvents="none">
            <CustomText style={styles.playPrediction} numberOfLines={1}>
              {activeProfileName}
            </CustomText>
            {typeof activeProfileConfidence === 'number' ? (
              <CustomText style={styles.confidenceText} numberOfLines={1}>
                {`Confidence: ${activeProfileConfidence.toFixed(3)}`}
              </CustomText>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  playBox: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colorScheme.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 16,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  playBoxLevel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  playCircle: {
    width: 44,
    height: 44,
    borderRadius: 44 / 2,
    backgroundColor: colorScheme.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playTime: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '700',
    color: colorScheme.primaryText,
  },
  playPrediction: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '600',
    color: colorScheme.subText,
  },
  thresholdText: {
    position: 'absolute',
    left: 14,
    bottom: 14,
    fontSize: 12,
    color: colorScheme.subText,
  },
  predictionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    minHeight: 24,
  },
  predictionBox: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    alignItems: 'flex-end',
  },
  confidenceText: {
    marginTop: 2,
    fontSize: 12,
    color: colorScheme.subText,
  },
  predictionPlaceholder: {
    width: '100%',
    minHeight: 24,
  },
});
