import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';

export default function Column({ style, ...props }: ViewProps) {
  return <View style={[styles.column, style]} {...props} />;
}

const styles = StyleSheet.create({
  column: {
    flexDirection: 'column',
  },
});
