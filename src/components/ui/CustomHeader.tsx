import React from 'react';
import {
  Image,
  ImageSourcePropType,
  StyleSheet,
  View,
  ViewProps,
  Text,
} from 'react-native';
import { Appbar } from 'react-native-paper';
import { colorScheme } from '../../constants/colorScheme';

type Props = ViewProps & {
  title: string;
  logo?: ImageSourcePropType;
  leftIcon?: string;
  onLeftPress?: () => void;
  rightIcon?: string;
  onRightPress?: () => void;
  hideLogo?: boolean;
};

export default function CustomHeader({
  title,
  logo,
  style,
  leftIcon,
  onLeftPress,
  rightIcon,
  onRightPress,
  hideLogo,
  ...props
}: Props) {
  return (
    <Appbar.Header style={[styles.header, style]} {...props}>
      {/* Left section - fixed width for balance */}
      <View style={styles.leftSection}>
        {leftIcon && onLeftPress ? (
          <Appbar.Action icon={leftIcon} onPress={onLeftPress} />
        ) : !hideLogo ? (
          <Image
            source={logo ?? require('../../../assets/images/edgeways-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        ) : null}
      </View>

      {/* Center section - title always centered */}
      <View style={styles.centerSection}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>

      {/* Right section - fixed width for balance */}
      <View style={styles.rightSection}>
        {rightIcon && onRightPress ? (
          <Appbar.Action icon={rightIcon} onPress={onRightPress} />
        ) : null}
      </View>
    </Appbar.Header>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: 'transparent',
    elevation: 0,
    shadowOpacity: 0,
    justifyContent: 'space-between',
  },
  leftSection: {
    width: 56,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  centerSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightSection: {
    width: 56,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  logo: {
    width: 34,
    height: 34,
    marginLeft: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colorScheme.primaryText,
    textAlign: 'center',
  },
});
