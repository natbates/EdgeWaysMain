import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';

export default function Center({ style, ...props }: ViewProps) {
  return <View style={[styles.center, style]} {...props} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
