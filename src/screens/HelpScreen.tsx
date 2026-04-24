import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { CustomText, CustomHeader } from '@components';
import { colorScheme } from '../constants/colorScheme';

type HelpScreenProps = {};

export default function HelpScreen({}: HelpScreenProps) {
  return (
    <View style={styles.container}>
      <CustomHeader title="Help" />
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
      >
        <CustomText style={styles.sectionHeading}>
          How to use the app
        </CustomText>
        <CustomText style={styles.text}>
          1. Use the Sessions tab to record or replay a conversation.
        </CustomText>
        <CustomText style={styles.text}>
          2. Add voice profiles for each speaker so the app can identify who is
          talking.
        </CustomText>
        <CustomText style={styles.text}>
          3. The session timeline shows when each speaker talked and how much.
        </CustomText>

        <CustomText style={styles.sectionHeading}>
          How Edgeways works
        </CustomText>
        <CustomText style={styles.text}>
          The app uses machine learning to create a unique voice profile for
          each person. When you record, it analyzes short audio windows and
          compares them to your saved profiles. The most similar profile is
          assigned to each segment, so you can see who spoke when and for how
          long—all on your device, with no cloud processing.
        </CustomText>

        <CustomText style={styles.sectionHeading}>
          Tips for using the app
        </CustomText>
        <CustomText style={styles.text}>
          • Add a speaker profile before recording for better speaker tracking.
        </CustomText>
        <CustomText style={styles.text}>
          • Profile colors are assigned in order as you create them (red, blue,
          green, etc.).
        </CustomText>
        <CustomText style={styles.text}>
          • If a profile is missing, create it using the voice training flow in
          Sessions.
        </CustomText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colorScheme.background,
    paddingTop: 16,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  contentInner: {
    paddingBottom: 28,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: colorScheme.primaryText,
    marginBottom: 20,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: colorScheme.primaryText,
    marginTop: 18,
    marginBottom: 10,
  },
  text: {
    fontSize: 15,
    color: colorScheme.subText,
    lineHeight: 22,
    marginBottom: 10,
  },
  // button removed
});
