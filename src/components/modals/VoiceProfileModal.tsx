import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { Row } from '@components/layout';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetModalProvider,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import AudioRecord from 'react-native-audio-record';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { CustomButton, CustomInput, CustomText } from '@components';
import { colorScheme } from '@constants/colorScheme';
import { profileColors } from '@constants/profileColors';
import { runModelOnMFCC } from '@utils/mlModelUtils';
import { runMFCCOnWaveform } from '@utils/mfccUtils';
import { isSpeech } from '@utils/vad';
// import { extractMFCC } from '@utils/mfccUtils'; (removed Meyda dependency)
import { decodePcm16Base64ToFloat32 } from '@utils/audioUtils';
import {
  TRAINING_RECORD_DURATION_SEC,
  WINDOW_LENGTH_SAMPLES,
  WINDOW_DURATION_SEC,
} from '@constants/mlModel';
import { loadSettings, Settings } from '@utils/settings';
import type { VoiceProfile } from '@types';

export type VoiceProfileModalProps = {
  visible: boolean;
  onClose: () => void;
  profiles: VoiceProfile[];
  onAdd: (profile: VoiceProfile) => void;
  onUpdate?: (profile: VoiceProfile) => void;
  onDelete: (name: string) => void;
  showEmbeddingPreview?: boolean;
};

export default function VoiceProfileModal({
  visible,
  onClose,
  profiles,
  onAdd,
  onUpdate,
  onDelete,
  showEmbeddingPreview = false,
}: VoiceProfileModalProps) {
  const [name, setName] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [recordProgress, setRecordProgress] = useState(0); // 0..1 raw
  const [reRecordTarget, setReRecordTarget] = useState<string | null>(null);
  const [smoothRecordProgress, setSmoothRecordProgress] = useState(0);
  const [settings, setSettings] = useState<Settings | null>(null);
  const effectiveSampleRateRef = React.useRef<number>(16000);
  const stopRecordingRef = React.useRef<() => void>(() => {});
  const nextProfileColor =
    profileColors[profiles.length % profileColors.length];
  const bottomSheetModalRef = React.useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['55%', '100%'], []);

  const openSheet = () => {
    bottomSheetModalRef.current?.present();
  };

  useEffect(() => {
    loadSettings()
      .then(setSettings)
      .catch(() => {});
  }, []);

  const closeSheet = () => {
    bottomSheetModalRef.current?.dismiss();
  };

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        pressBehavior="close"
        opacity={0.8}
        enableTouchThrough={false}
      />
    ),
    [],
  );

  useEffect(() => {
    if (visible) {
      openSheet();
      return;
    }

    closeSheet();
    stopRecordingRef.current();
    setIsRecording(false);
    setRecordProgress(0);
    setProgress('');
    setName('');
  }, [visible]);

  const handleRequestClose = () => {
    stopRecordingRef.current();
    closeSheet();
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setSmoothRecordProgress(prev => prev + (recordProgress - prev) * 0.18);
    }, 40);

    return () => clearInterval(interval);
  }, [recordProgress]);

  const handleDismiss = useCallback(() => {
    // Only call onClose if the modal is still intended to be visible.
    if (!visible) return;
    onClose();
  }, [onClose, visible]);

  const handleSheetChange = (index: number) => {
    if (index === -1) {
      handleRequestClose();
    }
  };

  const BUTTON_HEIGHT = 44;
  const canCreate = Boolean(name.trim()) && !isRecording;

  const recordAndTrain = async (profileName: string) => {
    setIsRecording(true);
    setProgress('Recording...');

    const chunks: Float32Array[] = [];
    let totalSamples = 0;
    let stopped = false;

    const getTargetSamples = () => {
      const durationSec =
        settings?.trainingRecordDurationSec ?? TRAINING_RECORD_DURATION_SEC;
      return Math.round(durationSec * effectiveSampleRateRef.current);
    };

    const getWindowSamples = () =>
      Math.max(
        256,
        Math.round(WINDOW_DURATION_SEC * 16000), // force 16kHz model expectations
      );

    const stop = async (shouldSave: boolean) => {
      if (stopped) return;
      stopped = true;
      try {
        await AudioRecord.stop();
      } catch {
        // ignore
      }

      // Clear the stop callback so it cannot be invoked repeatedly.
      stopRecordingRef.current = () => {};

      setIsRecording(false);
      setRecordProgress(0);

      if (!shouldSave) {
        setProgress('Recording canceled');
        setReRecordTarget(null);
        return;
      }

      const targetSamples = getTargetSamples();
      const flat = new Float32Array(targetSamples);
      let offset = 0;
      for (const chunk of chunks) {
        const remaining = targetSamples - offset;
        if (remaining <= 0) break;
        flat.set(chunk.subarray(0, Math.min(chunk.length, remaining)), offset);
        offset += Math.min(chunk.length, remaining);
      }

      const windowSamples = getWindowSamples();
      const segmentCount = Math.floor(targetSamples / windowSamples);
      const segmentSize = windowSamples;
      const embeddings: number[][] = [];

      for (let i = 0; i < segmentCount; i += 1) {
        setProgress(`Processing segment ${i + 1} / ${segmentCount}`);
        const segment = flat.subarray(i * segmentSize, (i + 1) * segmentSize);
        if (!isSpeech(segment)) {
          continue;
        }
        const mfccResult = await runMFCCOnWaveform(segment);
        if (!mfccResult) continue;
        const emb = await runModelOnMFCC(mfccResult.mfcc);
        if (emb) {
          const norm = Math.sqrt(emb.reduce((sum, v) => sum + v * v, 0));
          if (norm > 0) {
            embeddings.push(emb.map(v => v / norm));
          } else {
            embeddings.push(emb);
          }
        }
      }

      if (!embeddings.length) {
        setProgress('Training failed: no embeddings');
        setName('');
        setReRecordTarget(null);
        return;
      }

      const avg = new Array(embeddings[0].length).fill(0);
      for (const emb of embeddings) {
        for (let i = 0; i < emb.length; i += 1) {
          avg[i] += emb[i];
        }
      }
      for (let i = 0; i < avg.length; i += 1) {
        avg[i] /= embeddings.length;
      }

      // Normalize profile embedding to unit length, matching Python behavior.
      const norm = Math.sqrt(avg.reduce((sum, v) => sum + v * v, 0));
      if (norm > 0) {
        for (let i = 0; i < avg.length; i += 1) {
          avg[i] /= norm;
        }
      }

      const profileData = {
        name: profileName,
        embedding: avg,
        segmentEmbeddings: embeddings,
      };

      if (reRecordTarget && onUpdate) {
        onUpdate(profileData);
        setReRecordTarget(null);
      } else {
        if (reRecordTarget) {
          onDelete(reRecordTarget);
          setReRecordTarget(null);
        }
        onAdd(profileData);
      }
      setProgress('Training complete');
      setName('');
    };

    AudioRecord.init({
      sampleRate: 16000,
      channels: 1,
      bitsPerSample: 16,
      wavFile: '',
    });

    stopRecordingRef.current = () => stop(false);

    const lastChunkAtRef = { current: Date.now() };

    AudioRecord.on('data', (data: string) => {
      if (stopped) return;
      try {
        const float32 = decodePcm16Base64ToFloat32(data);

        const now = Date.now();
        const deltaMs = now - lastChunkAtRef.current;
        lastChunkAtRef.current = now;
        if (deltaMs > 0) {
          const observedSampleRate = (float32.length * 1000) / deltaMs;
          effectiveSampleRateRef.current =
            effectiveSampleRateRef.current * 0.85 + observedSampleRate * 0.15;
        }

        chunks.push(float32);
        totalSamples += float32.length;
        const targetSamples = getTargetSamples();
        setRecordProgress(Math.min(1, totalSamples / targetSamples));
        if (totalSamples >= targetSamples) {
          stop(true);
        }
      } catch (err) {
        console.warn('[VoiceProfileModal] PCM decode error', err);
      }
    });

    AudioRecord.start();
  };

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    recordAndTrain(trimmed);
  };

  const hexToRgba = (hex: string, alpha = 0.2) => {
    const normalized = hex.replace('#', '');
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const previewRows = useMemo(() => {
    return profiles.map((profile, idx) => {
      const bgColor = hexToRgba(profileColors[idx % profileColors.length], 1);
      return (
        <View
          key={profile.name}
          style={[styles.profileRow, { backgroundColor: bgColor }]}
        >
          <View style={{ flex: 1 }}>
            <CustomText style={styles.profileName}>{profile.name}</CustomText>
            {false && (
              <CustomText style={styles.profileEmbedding}>
                [
                {profile.embedding
                  .slice(0, 10)
                  .map(v => v.toFixed(3))
                  .join(', ')}
                {profile.embedding.length > 10 ? ' ...' : ''}]
              </CustomText>
            )}
          </View>
          <View style={styles.profileActions}>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                setName(profile.name);
                setReRecordTarget(profile.name);
                recordAndTrain(profile.name);
              }}
              disabled={isRecording}
            >
              <MaterialCommunityIcons
                name="autorenew"
                size={22}
                color={
                  isRecording ? colorScheme.subText : colorScheme.accentText
                }
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteIcon}
              onPress={() => onDelete(profile.name)}
            >
              <MaterialCommunityIcons
                name="delete-outline"
                size={24}
                color={colorScheme.accentText}
              />
            </TouchableOpacity>
          </View>
        </View>
      );
    });
  }, [profiles, showEmbeddingPreview, onDelete, isRecording]);

  return (
    <BottomSheetModalProvider>
      <BottomSheetModal
        ref={bottomSheetModalRef}
        index={0}
        snapPoints={snapPoints}
        enablePanDownToClose
        enableHandlePanningGesture
        enableContentPanningGesture
        enableDismissOnClose
        onChange={handleSheetChange}
        onDismiss={handleDismiss}
        backdropComponent={renderBackdrop}
        style={styles.bottomSheet}
        backgroundStyle={styles.bottomSheetBackground}
        handleIndicatorStyle={styles.handleIndicator}
      >
        <BottomSheetScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View>
              <CustomText style={styles.title}>Voice Profiles</CustomText>

              <Row style={styles.row}>
                <CustomInput
                  style={styles.input}
                  placeholder="Profile name"
                  value={name}
                  onChangeText={setName}
                  editable={!isRecording}
                />
                <CustomButton
                  title={isRecording ? 'Cancel' : 'Add'}
                  onPress={
                    isRecording
                      ? () => stopRecordingRef.current()
                      : handleCreate
                  }
                  disabled={!canCreate && !isRecording}
                  style={styles.addButton}
                />
              </Row>

              {isRecording ? (
                <View style={styles.progressBarContainer}>
                  <View
                    style={[
                      styles.progressBar,
                      {
                        width: `${smoothRecordProgress * 100}%`,
                        backgroundColor: nextProfileColor,
                      },
                    ]}
                  />
                </View>
              ) : null}

              {progress ? (
                <CustomText style={styles.debug}>{progress}</CustomText>
              ) : null}

              <View style={styles.list}>{previewRows}</View>
            </View>
          </TouchableWithoutFeedback>
        </BottomSheetScrollView>
      </BottomSheetModal>
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  bottomSheet: {
    position: 'absolute',
    zIndex: 9999,
    elevation: 9999,
  },
  bottomSheetBackground: {
    backgroundColor: colorScheme.background,
  },
  handleIndicator: {
    backgroundColor: colorScheme.subText,
  },
  container: {
    flex: 1,
    padding: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    color: colorScheme.primaryText,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  input: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: colorScheme.border,
    borderRadius: 4,
    paddingHorizontal: 12,
    marginRight: 8,
    backgroundColor: colorScheme.surface,
  },
  addButton: {
    height: 44,
    justifyContent: 'center',
    paddingVertical: 0,
  },
  list: {
    maxHeight: 260,
    marginBottom: 12,
  },
  listContent: {
    paddingBottom: 12,
  },
  progressBarContainer: {
    height: 10,
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBar: {
    height: '100%',
    backgroundColor: colorScheme.accent,
  },
  profileRow: {
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    padding: 10,
  },
  profileActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  retryButton: {
    padding: 8,
  },
  deleteIcon: {
    padding: 8,
  },
  profileName: {
    fontWeight: '600',
    fontSize: 20,
    color: colorScheme.accentText,
  },
  profileEmbedding: {
    fontSize: 11,
    color: colorScheme.subText,
  },
  debug: {
    marginBottom: 8,
    color: colorScheme.subText,
  },
});
