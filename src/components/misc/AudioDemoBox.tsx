import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { CustomButton, CustomText } from '@components';
import { colorScheme } from '@constants/colorScheme';

export type AudioDemoBoxProps = {
  isRecording: boolean;
  recordTime: string;
  audioLevelFraction: number; // 0..1
  activeProfileName: string | null;
  onToggleRecording: () => void;
  onAddProfile: () => void;
};

export default function AudioDemoBox({
  isRecording,
  recordTime,
  audioLevelFraction,
  activeProfileName,
  onToggleRecording,
  onAddProfile,
}: AudioDemoBoxProps) {
  const levelHeight = Math.max(0, Math.min(1, audioLevelFraction)) * 100;

  return (
    <View style={styles.container}>
      <View style={styles.playBox}>
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
        {activeProfileName ? (
          <CustomText style={styles.playPrediction} numberOfLines={1}>
            {activeProfileName}
          </CustomText>
        ) : null}
      </View>

      <CustomButton
        title="Add Voice Profile"
        style={styles.addVoiceProfileButton}
        onPress={onAddProfile}
      />
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
    borderRadius: 24,
    borderWidth: 2,
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
  addVoiceProfileButton: {
    width: '100%',
  },
});
