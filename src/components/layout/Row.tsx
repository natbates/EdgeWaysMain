import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';

export default function Row({ style, ...props }: ViewProps) {
  return <View style={[styles.row, style]} {...props} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
