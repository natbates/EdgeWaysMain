import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
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
import { runModelOnMFCC } from '@utils/mlModelUtils';
import { extractMFCC } from '@utils/mfccUtils';
import { decodePcm16Base64ToFloat32 } from '@utils/audioUtils';
import {
  TRAINING_RECORD_DURATION_SEC,
  WINDOW_LENGTH_SAMPLES,
} from '@constants/mlModel';
import type { VoiceProfile } from '@types';

export type VoiceProfileModalProps = {
  visible: boolean;
  onClose: () => void;
  profiles: VoiceProfile[];
  onAdd: (profile: VoiceProfile) => void;
  onDelete: (name: string) => void;
  showEmbeddingPreview?: boolean;
};

export default function VoiceProfileModal({
  visible,
  onClose,
  profiles,
  onAdd,
  onDelete,
  showEmbeddingPreview = false,
}: VoiceProfileModalProps) {
  const [name, setName] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [recordProgress, setRecordProgress] = useState(0); // 0..1

  const stopRecordingRef = React.useRef<() => void>(() => {});
  const bottomSheetModalRef = React.useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['55%', '100%'], []);

  const openSheet = () => {
    bottomSheetModalRef.current?.present();
  };

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

  const canCreate = Boolean(name.trim()) && !isRecording;

  const recordAndTrain = async (profileName: string) => {
    setIsRecording(true);
    setProgress('Recording...');

    const targetSamples = TRAINING_RECORD_DURATION_SEC * 16000;
    const chunks: Float32Array[] = [];
    let totalSamples = 0;
    let stopped = false;

    const stop = async () => {
      if (stopped) return;
      stopped = true;
      try {
        await AudioRecord.stop();
      } catch {
        // ignore
      }

      // Clear the stop callback so it cannot be invoked repeatedly.
      stopRecordingRef.current = () => {};

      const flat = new Float32Array(targetSamples);
      let offset = 0;
      for (const chunk of chunks) {
        const remaining = targetSamples - offset;
        if (remaining <= 0) break;
        flat.set(chunk.subarray(0, Math.min(chunk.length, remaining)), offset);
        offset += Math.min(chunk.length, remaining);
      }

      const segmentSize = WINDOW_LENGTH_SAMPLES;
      const segmentCount = Math.floor(targetSamples / segmentSize);
      const embeddings: number[][] = [];

      for (let i = 0; i < segmentCount; i += 1) {
        setProgress(`Processing segment ${i + 1} / ${segmentCount}`);
        const segment = flat.subarray(i * segmentSize, (i + 1) * segmentSize);
        const frames = extractMFCC(segment);
        if (!frames.length) continue;
        const emb = await runModelOnMFCC(frames);
        if (emb) embeddings.push(emb);
      }

      if (!embeddings.length) {
        setProgress('Training failed: no embeddings');
        setIsRecording(false);
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

      onAdd({ name: profileName, embedding: avg });
      setProgress('Training complete');
      setIsRecording(false);
      setName('');
    };

    AudioRecord.init({
      sampleRate: 16000,
      channels: 1,
      bitsPerSample: 16,
      wavFile: '',
    });

    stopRecordingRef.current = stop;

    AudioRecord.on('data', (data: string) => {
      if (stopped) return;
      try {
        const float32 = decodePcm16Base64ToFloat32(data);
        chunks.push(float32);
        totalSamples += float32.length;
        setRecordProgress(Math.min(1, totalSamples / targetSamples));
        if (totalSamples >= targetSamples) {
          stop();
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

  const previewRows = useMemo(() => {
    return profiles.map(profile => (
      <View key={profile.name} style={styles.profileRow}>
        <View style={{ flex: 1 }}>
          <CustomText style={styles.profileName}>{profile.name}</CustomText>
          {showEmbeddingPreview && (
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
        <TouchableOpacity
          style={styles.deleteIcon}
          onPress={() => onDelete(profile.name)}
        >
          <MaterialCommunityIcons
            name="delete-outline"
            size={24}
            color={colorScheme.error}
          />
        </TouchableOpacity>
      </View>
    ));
  }, [profiles, showEmbeddingPreview, onDelete]);

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

              <View style={styles.row}>
                <CustomInput
                  style={styles.input}
                  placeholder="Profile name"
                  value={name}
                  onChangeText={setName}
                  editable={!isRecording}
                />
                <CustomButton
                  title={isRecording ? 'Stop' : 'Add'}
                  onPress={
                    isRecording ? stopRecordingRef.current : handleCreate
                  }
                  disabled={!canCreate && !isRecording}
                />
              </View>

              {isRecording ? (
                <View style={styles.progressBarContainer}>
                  <View
                    style={[
                      styles.progressBar,
                      { width: `${recordProgress * 100}%` },
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
    borderWidth: 1,
    borderColor: colorScheme.border,
    borderRadius: 4,
    padding: 8,
    marginRight: 8,
    backgroundColor: colorScheme.surface,
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
  },
  deleteIcon: {
    padding: 8,
  },
  profileName: {
    fontWeight: '600',
    color: colorScheme.primaryText,
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
