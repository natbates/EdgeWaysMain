import React from 'react';
import { TextInput, TextInputProps, StyleSheet } from 'react-native';
import { colorScheme } from '../../constants/colorScheme';

export default function CustomInput(props: TextInputProps) {
  return <TextInput style={[styles.input, props.style]} {...props} />;
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: colorScheme.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: colorScheme.surface,
    color: colorScheme.primaryText,
    marginVertical: 8,
  },
});
