import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  TouchableOpacityProps,
} from 'react-native';
import { colorScheme } from '../../constants/colorScheme';

type Props = TouchableOpacityProps & {
  title: string;
  variant?: 'primary' | 'secondary';
};

export default function CustomButton({
  title,
  variant = 'primary',
  style,
  disabled,
  ...props
}: Props) {
  const isSecondary = variant === 'secondary';

  return (
    <TouchableOpacity
      style={[
        styles.button,
        isSecondary ? styles.secondaryButton : undefined,
        disabled ? styles.disabledButton : undefined,
        style,
      ]}
      disabled={disabled}
      {...props}
    >
      <Text
        style={[
          styles.text,
          isSecondary ? styles.secondaryText : undefined,
          disabled ? styles.disabledText : undefined,
        ]}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colorScheme.accent,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: colorScheme.border,
  },
  disabledButton: {
    opacity: 0.6,
  },
  text: {
    color: colorScheme.accentText,
    fontWeight: 'bold',
    fontSize: 16,
  },
  secondaryText: {
    color: colorScheme.primaryText,
  },
  disabledText: {
    color: colorScheme.disabledText,
  },
});
