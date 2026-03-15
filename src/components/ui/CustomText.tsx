import React from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import { colorScheme } from '../../constants/colorScheme';

export default function CustomText(props: TextProps) {
  return <Text style={[styles.text, props.style]} {...props} />;
}

const styles = StyleSheet.create({
  text: {
    fontSize: 16,
    color: colorScheme.primaryText,
  },
});
