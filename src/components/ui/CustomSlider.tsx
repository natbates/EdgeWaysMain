import React from 'react';
import Slider from '@react-native-community/slider';
import { View, StyleSheet } from 'react-native';
import { colorScheme } from '../../constants/colorScheme';

type Props = {
  value: number;
  minimumValue: number;
  maximumValue: number;
  step?: number;
  onValueChange: (value: number) => void;
  onSlidingStart?: () => void;
  onSlidingComplete?: () => void;
  trackHeight?: number;
  thumbSize?: number;
  style?: any;
};

export default function CustomSlider({
  value,
  minimumValue,
  maximumValue,
  step = 0.01,
  onValueChange,
  onSlidingStart,
  onSlidingComplete,
  trackHeight = 6,
  thumbSize = 24,
  style,
}: Props) {
  return (
    <View style={[styles.container, style]}>
      <Slider
        value={value}
        minimumValue={minimumValue}
        maximumValue={maximumValue}
        step={step}
        onValueChange={onValueChange}
        onSlidingStart={onSlidingStart}
        onSlidingComplete={onSlidingComplete}
        minimumTrackTintColor={colorScheme.accent}
        maximumTrackTintColor={colorScheme.border}
        thumbTintColor={colorScheme.surface}
        style={{ width: '100%', height: trackHeight + thumbSize }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    justifyContent: 'center',
  },
});
