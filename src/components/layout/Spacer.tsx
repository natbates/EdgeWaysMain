import React from 'react';
import { View, ViewProps } from 'react-native';

type SpacerProps = ViewProps & {
  size?: number;
  horizontal?: boolean;
};

export default function Spacer({
  size = 16,
  horizontal = false,
  style,
  ...props
}: SpacerProps) {
  return (
    <View
      style={[
        horizontal ? { width: size, height: 1 } : { height: size, width: 1 },
        style,
      ]}
      {...props}
    />
  );
}
