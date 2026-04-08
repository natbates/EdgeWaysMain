import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Text,
  ScrollView,
} from 'react-native';
import { Row, Column, Center, Spacer } from '@components/layout';
import { SafeAreaView } from 'react-native-safe-area-context';
// Removed useSafeAreaInsets, using SafeAreaView instead
import { CustomHeader, CustomText } from '@components';
import { colorScheme } from '../constants/colorScheme';
import { loadSettings, saveSettings, Settings } from '../utils/settings';
import CustomSlider from '../components/ui/CustomSlider';
// Removed useScrollLock, not needed
import { settingsConfig } from '../config/settingsConfig';

const HELP_TEXTS = [
  'Tip: Tap the Sessions tab to start recording and train voice profiles.',
  'Did you know? The model runs fully on your device—no data leaves your phone.',
  'Pro tip: Create multiple voice profiles for better recognition accuracy.',
  'Want to reset? Delete sessions from the Sessions tab and start fresh.',
];

type SettingsScreenProps = {
  showBackToSession?: boolean;
  onBackToSession?: () => void;
  showHeader?: boolean;
};

export default function SettingsScreen({
  showBackToSession,
  onBackToSession,
  showHeader,
}: SettingsScreenProps) {
  const [showHelp, setShowHelp] = useState(false);
  const [helpText, setHelpText] = useState('');
  const [settings, setSettings] = useState<Settings | null>(null);

  const openHelp = () => {
    const idx = Math.floor(Math.random() * HELP_TEXTS.length);
    setHelpText(HELP_TEXTS[idx]);
    setShowHelp(true);
  };

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const updateSetting = async (key: keyof Settings, value: any) => {
    const next = { ...(settings ?? {}), [key]: value } as Settings;
    setSettings(next);
    await saveSettings(next);
  };

  return (
    <Column style={styles.container}>
      {showHeader !== false ? (
        <CustomHeader
          title="Settings"
          leftIcon={showBackToSession ? 'chevron-left' : undefined}
          onLeftPress={showBackToSession ? onBackToSession : undefined}
          hideLogo={showBackToSession}
          rightIcon="help-circle-outline"
          onRightPress={openHelp}
        />
      ) : null}
      {showHeader !== false && <Spacer size={12} />}
      <SafeAreaView
        edges={['bottom']}
        style={[
          styles.body,
          showBackToSession ? styles.bodyNoBottomPadding : null,
        ]}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: 16,
            paddingHorizontal: 16,
            paddingTop: 16,
          }}
          scrollIndicatorInsets={{ bottom: 16 }}
        >
          {settings &&
            settingsConfig.map(setting => {
              const currentValue = settings[setting.key] as number | undefined;
              const value = currentValue ?? setting.min;
              const formattedValue = setting.format
                ? setting.format(value)
                : String(value);

              return (
                <View key={setting.key}>
                  <Row style={styles.settingRow}>
                    <CustomText style={styles.settingLabel}>
                      {setting.label}
                    </CustomText>
                    <CustomText style={styles.settingValue}>
                      {formattedValue}
                    </CustomText>
                  </Row>

                  <CustomSlider
                    value={value}
                    minimumValue={setting.min}
                    maximumValue={setting.max}
                    step={setting.step}
                    onValueChange={newValue =>
                      updateSetting(setting.key, newValue)
                    }
                    style={styles.slider}
                  />

                  <CustomText style={styles.description}>
                    {setting.description}
                  </CustomText>
                </View>
              );
            })}
        </ScrollView>
        <Modal
          visible={showHelp}
          transparent
          animationType="fade"
          onRequestClose={() => setShowHelp(false)}
        >
          <Center style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <ScrollView>
                <Text style={styles.modalTitle}>Help</Text>
                <Text style={styles.modalText}>{helpText}</Text>
                <Text style={styles.modalText}>
                  This screen will get additional settings soon — including
                  voice calibration and model tweaks.
                </Text>
              </ScrollView>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setShowHelp(false)}
              >
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </Center>
        </Modal>
      </SafeAreaView>
    </Column>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 0,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    backgroundColor: colorScheme.background,
  },
  body: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 0,
    paddingTop: 16,
    paddingBottom: 40,
    overflow: 'visible',
  },
  bodyNoBottomPadding: {
    paddingBottom: 0,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  settingLabel: {
    fontSize: 16,
    color: colorScheme.primaryText,
    marginBottom: 20,
  },
  settingValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colorScheme.accent,
  },
  slider: {
    width: '100%',
    height: 40,
    marginBottom: 10,
  },
  description: {
    fontSize: 15,
    color: colorScheme.subText,
    lineHeight: 22,
    marginBottom: 28,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colorScheme.surface,
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colorScheme.primaryText,
    marginBottom: 12,
  },
  modalText: {
    fontSize: 16,
    color: colorScheme.primaryText,
    marginBottom: 10,
  },
  modalClose: {
    marginTop: 12,
    alignSelf: 'flex-end',
  },
  modalCloseText: {
    color: colorScheme.accent,
    fontWeight: '700',
    fontSize: 16,
  },
});
