import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  LayoutChangeEvent,
  Animated,
  GestureResponderEvent,
} from 'react-native';
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
  const trackWidth = useRef(0);
  const animatedValue = useRef(new Animated.Value(0)).current;

  const ratio = useMemo(() => {
    const clamped = Math.min(Math.max(value, minimumValue), maximumValue);
    return (clamped - minimumValue) / (maximumValue - minimumValue);
  }, [value, minimumValue, maximumValue]);

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: ratio,
      duration: 100,
      useNativeDriver: false,
    }).start();
  }, [ratio, animatedValue]);

  const toValue = (gestureX: number) => {
    const w = trackWidth.current;
    if (!w) return value;
    const raw = gestureX / w;
    const clamped = Math.min(1, Math.max(0, raw));
    const stepped =
      Math.round((clamped * (maximumValue - minimumValue)) / step) * step;
    return minimumValue + stepped;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      // allow the responder to be taken by another slider/button when the user taps elsewhere
      onPanResponderTerminationRequest: () => true,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        onSlidingStart?.();
        const next = toValue(evt.nativeEvent.locationX);
        onValueChange(next);
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        const next = toValue(evt.nativeEvent.locationX);
        onValueChange(next);
      },
      onPanResponderRelease: (evt: GestureResponderEvent) => {
        const next = toValue(evt.nativeEvent.locationX);
        onValueChange(next);
        onSlidingComplete?.();
      },
      onPanResponderTerminate: (evt: GestureResponderEvent) => {
        const next = toValue(evt.nativeEvent.locationX);
        onValueChange(next);
        onSlidingComplete?.();
      },
    }),
  ).current;

  const thumbPosition = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, trackWidth.current],
    extrapolate: 'clamp',
  });

  return (
    <View
      style={[styles.container, style]}
      onLayout={(event: LayoutChangeEvent) => {
        trackWidth.current = event.nativeEvent.layout.width - thumbSize;
      }}
      {...panResponder.panHandlers}
    >
      <View style={[styles.track, { height: trackHeight }]} />
      <Animated.View
        style={[
          styles.thumb,
          {
            width: thumbSize,
            height: thumbSize,
            borderRadius: thumbSize / 2,
            transform: [
              {
                translateX: Animated.add(
                  thumbPosition,
                  new Animated.Value(thumbSize / -2),
                ),
              },
            ],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    justifyContent: 'center',
  },
  track: {
    backgroundColor: colorScheme.border,
    borderRadius: 999,
  },
  thumb: {
    position: 'absolute',
    backgroundColor: colorScheme.accent,
    borderWidth: 2,
    borderColor: colorScheme.surface,
    elevation: 2,
  },
});
