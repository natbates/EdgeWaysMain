import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { CustomButton, CustomText } from '@components';
import { colorScheme } from '../constants/colorScheme';

type HomeScreenProps = {
  onGetStarted: () => void;
};

export default function HomeScreen({ onGetStarted }: HomeScreenProps) {
  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/images/edgeways-logo.png')}
        style={styles.logoImage}
        resizeMode="contain"
      />
      <CustomText style={styles.logo}>Edgeways</CustomText>
      <CustomText style={styles.tagline}>Record • Train • Recognize</CustomText>
      <CustomButton
        title="Get started"
        onPress={onGetStarted}
        style={styles.getStartedButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: colorScheme.background,
  },
  logoImage: {
    width: 140,
    height: 140,
    marginBottom: 16,
  },
  logo: {
    fontSize: 40,
    fontWeight: '800',
    color: colorScheme.primaryText,
    marginBottom: 12,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 16,
    color: colorScheme.subText,
    textAlign: 'center',
    marginBottom: 24,
  },
  getStartedButton: {},
});
