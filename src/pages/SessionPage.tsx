import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AudioRecord from 'react-native-audio-record';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { CustomButton, CustomHeader, CustomText } from '@components';
import AudioDemoBox from '../components/misc/AudioDemoBox';
import VoiceProfileSpeakingBars from '../components/misc/VoiceProfileSpeakingBars';
import { colorScheme } from '../constants/colorScheme';
import { profileColors } from '../constants/profileColors';
import { runModelOnMFCC } from '../utils/mlModelUtils';
import { extractMFCC } from '../utils/mfccUtils';
import { scoreVoiceProfiles } from '../utils/voiceProfiles';
import { computeProfileSpeakingPercentages } from '../utils/sessionUtils';
import {
  createVad,
  isSpeech,
  computeZcr,
  mapRmsSliderToThreshold,
  mapZcrSliderToThreshold,
} from '../utils/vad';
import { computeRms, decodePcm16Base64ToFloat32 } from '../utils/audioUtils';
import {
  SAMPLE_RATE,
  WINDOW_LENGTH_SAMPLES,
  WINDOW_DURATION_SEC,
  VAD_RMS_THRESHOLD,
  VAD_ZCR_THRESHOLD,
} from '../constants/mlModel';

import type { Session } from '../types';
import VoiceProfileModal from '../components/modals/VoiceProfileModal';

// Force production mode rendering on this page (no dev debug UI)
const __DEV__ = true;

export type SessionPageProps = {
  session: Session;
  onUpdate: (session: Session) => void;
  onExit: () => void;
};

export default function SessionPage({
  session,
  onUpdate,
  onExit,
}: SessionPageProps) {
  const insets = useSafeAreaInsets();
  const [output, setOutput] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mfccFrames, setMfccFrames] = useState<number[][]>([]);

  const [profileScores, setProfileScores] = useState<
    { name: string; score: number }[]
  >([]);
  const [profilePrediction, setProfilePrediction] = useState<{
    name: string;
    score: number;
  } | null>(null);

  const [isProfileModalVisible, setIsProfileModalVisible] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState('00:00:00');

  const [audioLevel, setAudioLevel] = useState(0);
  // Amplify RMS so small signals are visible; clamp to 0..1.
  const audioLevelFraction = Math.min(Math.max(audioLevel * 12, 0), 1);
  const audioLevelDisplayFraction = 0.2 + 0.8 * Math.sqrt(audioLevelFraction); // remain visible at low levels

  const [debug, setDebug] = useState('');
  const [mfccTick, setMfccTick] = useState(0);
  const [mfccLastTime, setMfccLastTime] = useState<string>('');
  const [speakingTime, setSpeakingTime] = useState<Record<string, number>>({});
  const [totalSpeakingTime, setTotalSpeakingTime] = useState(0);

  const [settings, setSettings] = useState<
    import('../utils/settings').Settings | null
  >(null);

  // Default to no smoothing until settings are loaded.
  const vadRef = useRef(createVad({ smoothingFrames: 0 }));
  const lastAudioChunkAtRef = useRef<number>(0);
  const chunkCountRef = useRef<number>(0);

  const sanitizeSession = (s: Partial<Session>): Session => ({
    id: s.id || '',
    name: s.name || 'Untitled',
    createdAt: s.createdAt ?? Date.now(),
    recordedTimeSec: s.recordedTimeSec ?? 0,
    voiceProfiles: s.voiceProfiles ?? [],
    timeline: s.timeline ?? [],
  });

  const [currentSession, setCurrentSession] = useState<Session>(
    sanitizeSession(session),
  );

  const activeProfileName = profilePrediction?.name ?? null;
  const activeProfileIndex = currentSession.voiceProfiles.findIndex(
    p => p.name === activeProfileName,
  );
  const hasActiveProfile = activeProfileIndex >= 0;
  const activeProfileColor = hasActiveProfile
    ? profileColors[activeProfileIndex % profileColors.length]
    : colorScheme.border;

  const getRgba = (hex: string, alpha: number) => {
    const normalized = hex.replace('#', '');
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };
  const activeProfileBg = hasActiveProfile
    ? getRgba(activeProfileColor, 0.12)
    : 'transparent';

  const audioBufferRef = useRef<{
    buffer: Float32Array;
    writeIndex: number;
    filled: boolean;
    samplesWritten: number;
    sampleRate: number;
    windowLengthSamples: number;
  }>({
    buffer: new Float32Array(WINDOW_LENGTH_SAMPLES),
    writeIndex: 0,
    filled: false,
    samplesWritten: 0,
    sampleRate: SAMPLE_RATE,
    windowLengthSamples: WINDOW_LENGTH_SAMPLES,
  });
  const timerRef = useRef<any>(null);

  const getWindowLengthForRate = (sampleRate: number) =>
    Math.max(256, Math.round(sampleRate * WINDOW_DURATION_SEC));

  const updateWindowLength = (sampleRate: number) => {
    const state = audioBufferRef.current;
    const newWindowLength = getWindowLengthForRate(sampleRate);
    const diff = Math.abs(newWindowLength - state.windowLengthSamples);
    // Only rebuild buffer if window size changes enough to matter (avoid jitter).
    if (diff >= 32) {
      state.windowLengthSamples = newWindowLength;
      state.buffer = new Float32Array(newWindowLength);
      state.writeIndex = 0;
      state.samplesWritten = 0;
      state.filled = false;
      setDebug(
        `Adjusted window size to ${newWindowLength} (sampleRate=${sampleRate.toFixed(
          0,
        )})`,
      );
    }
  };

  const vadStateRef = useRef({
    active: false,
  });

  const updateSpeakingPercentages = (session: Session) => {
    const profileNames = session.voiceProfiles.map(p => p.name);

    const hasTimeline = (session.timeline?.length ?? 0) > 0;
    const fromTimeline = computeProfileSpeakingPercentages(
      session.timeline ?? [],
      profileNames,
    );

    if (hasTimeline) {
      setSpeakingTime(fromTimeline);
      setTotalSpeakingTime(1);
      return;
    }

    const fromProfile = session.voiceProfiles.reduce((acc, p) => {
      acc[p.name] = p.speakingPercentage ?? 0;
      return acc;
    }, {} as Record<string, number>);

    const total = Object.values(fromProfile).reduce((sum, v) => sum + v, 0);
    setSpeakingTime(fromProfile);
    setTotalSpeakingTime(total || 1);
  };

  useEffect(() => {
    setCurrentSession(sanitizeSession(session));
    setRecordTime(formatTime(session.recordedTimeSec ?? 0));
    updateSpeakingPercentages(session);
  }, [session]);

  useEffect(() => {
    import('../utils/settings')
      .then(({ loadSettings }) => loadSettings())
      .then(settings => {
        setSettings(settings);
      })
      .catch(() => {
        // If settings fail to load, keep the default VAD configuration.
      });
  }, []);

  useEffect(() => {
    if (!settings) return;

    vadRef.current = createVad({
      smoothingFrames: settings.vadSmoothTicks,
      rmsThreshold: mapRmsSliderToThreshold(settings.vadRmsThreshold),
      zcrThreshold: mapZcrSliderToThreshold(settings.vadZcrThreshold),
    });
  }, [settings]);

  const persistSession = (updated: Partial<Session>) => {
    const normalized = sanitizeSession(updated);
    setCurrentSession(normalized);
    updateSpeakingPercentages(normalized);
    onUpdate(normalized);
  };

  /* ---------------------------------- */
  /* RECORD TIME UTILS */
  /* ---------------------------------- */

  const formatTime = (seconds: number) => {
    const m = String(Math.floor(seconds / 60)).padStart(2, '0');
    const s = String(Math.floor(seconds % 60)).padStart(2, '0');
    return `00:${m}:${s}`;
  };

  const updateRecordedTime = (newSeconds: number) => {
    // never go backwards
    const next = Math.max(currentSession.recordedTimeSec, newSeconds);
    persistSession({ ...currentSession, recordedTimeSec: next });
    setRecordTime(formatTime(next));
  };

  /* ---------------------------------- */
  /* START RECORDING */
  /* ---------------------------------- */

  const onStartRecord = async () => {
    setError(null);

    audioBufferRef.current = {
      buffer: new Float32Array(WINDOW_LENGTH_SAMPLES),
      writeIndex: 0,
      filled: false,
      samplesWritten: 0,
    };

    let startTime = Date.now() - currentSession.recordedTimeSec * 1000;

    AudioRecord.init({
      sampleRate: SAMPLE_RATE,
      channels: 1,
      bitsPerSample: 16,
      wavFile: '',
    });

    AudioRecord.on('data', (data: string) => {
      try {
        const float32 = decodePcm16Base64ToFloat32(data);
        const rms = computeRms(float32);
        const now = Date.now();
        const deltaMs = now - lastAudioChunkAtRef.current;
        lastAudioChunkAtRef.current = now;
        chunkCountRef.current += 1;

        // Estimate effective sample rate from incoming chunk size + timing.
        // This helps when the recorder returns 8kHz even though we request 16kHz.
        const state = audioBufferRef.current;
        if (deltaMs > 0) {
          const observedSampleRate = (float32.length * 1000) / deltaMs;
          // Smooth the estimate a bit to avoid jumpiness.
          state.sampleRate = state.sampleRate * 0.85 + observedSampleRate * 0.15;
          updateWindowLength(state.sampleRate);
        }

        // Debug visibility for chunk size and buffer progress
        console.log(
          '[VAD] chunk',
          chunkCountRef.current,
          'len',
          float32.length,
          'rms',
          rms,
        );

        const state = audioBufferRef.current;
        const buf = state.buffer;
        let writeIndex = state.writeIndex;

        setAudioLevel(rms);

        for (let i = 0; i < float32.length; i++) {
          buf[writeIndex] = float32[i];
          writeIndex = (writeIndex + 1) % state.windowLengthSamples;
        }

        state.writeIndex = writeIndex;
        state.samplesWritten = Math.min(
          state.samplesWritten + float32.length,
          state.windowLengthSamples,
        );
        if (!state.filled && state.samplesWritten >= state.windowLengthSamples) {
          state.filled = true;
        }

        // Debug buffer progress
        console.log(
          '[VAD] buffer',
          `writeIndex=${state.writeIndex}`,
          `samplesWritten=${state.samplesWritten}`,
          `filled=${state.filled}`,
        );

        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        updateRecordedTime(elapsed);
      } catch (err: any) {
        const message = err?.message || err?.toString?.() || String(err);
        console.warn('[SessionPage] PCM decode error', err);
        setDebug(`PCM decode error: ${message}`);
      }
    });

    AudioRecord.start();
    setIsRecording(true);

    /* MODEL LOOP */

    timerRef.current = setInterval(async () => {
      setMfccTick(tick => tick + 1);
      setMfccLastTime(new Date().toLocaleTimeString());
      const state = audioBufferRef.current;
      const msSinceLastChunk = Date.now() - lastAudioChunkAtRef.current;

      // If no audio arrived for a while, reset buffer to avoid being stuck just below fill threshold.
      if (msSinceLastChunk > 1000) {
        state.writeIndex = 0;
        state.samplesWritten = 0;
        state.filled = false;
        setDebug(
          `No audio for ${msSinceLastChunk}ms — resetting buffer (writeIndex=${state.writeIndex})`,
        );
      }

      if (!state.filled) {
        setDebug(
          `Waiting for audio... written ${state.samplesWritten} / ${state.windowLengthSamples} (last chunk ${msSinceLastChunk}ms ago)`,
        );
        return;
      }

      const buffer = state.buffer;
      const out = new Float32Array(buffer.length);
      const start = state.writeIndex;
      out.set(buffer.subarray(start));
      if (start > 0) {
        out.set(buffer.subarray(0, start), buffer.length - start);
      }

      const zcr = computeZcr(out);
      const rms = computeRms(out);

      const vadRmsSlider = settings?.vadRmsThreshold ?? 5;
      const vadZcrSlider = settings?.vadZcrThreshold ?? 5;
      const vadRmsThreshold = mapRmsSliderToThreshold(vadRmsSlider);
      const vadZcrThreshold = mapZcrSliderToThreshold(vadZcrSlider);
      const passRms = rms >= vadRmsThreshold;
      const passZcr = zcr < vadZcrThreshold;

      const speech = vadRef.current.isSpeech(out);

      const vadDebug = vadRef.current.getDebugState?.();
      const avgRms = vadDebug?.rmsHistory
        ? vadDebug.rmsHistory.reduce((acc, v) => acc + v, 0) /
          vadDebug.rmsHistory.length
        : rms;
      const avgZcr = vadDebug?.zcrHistory
        ? vadDebug.zcrHistory.reduce((acc, v) => acc + v, 0) /
          vadDebug.zcrHistory.length
        : zcr;

      console.log('[VAD]', {
        rms: rms.toFixed(5),
        avgRms: avgRms.toFixed(5),
        zcr: zcr.toFixed(4),
        avgZcr: avgZcr.toFixed(4),
        passRms,
        passZcr,
        speech,
      });

      if (!speech) {
        setDebug(
          `VAD: silence (rms=${rms.toFixed(5)} avgRms=${avgRms.toFixed(
            5,
          )} passRms=${passRms} zcr=${zcr.toFixed(4)} avgZcr=${avgZcr.toFixed(
            4,
          )} passZcr=${passZcr} rmsSlider=${vadRmsSlider} rmsThresh=${vadRmsThreshold} zcrSlider=${vadZcrSlider} zcrThresh=${vadZcrThreshold})`,
        );
        setProfilePrediction(null);
        setProfileScores([]);
        return;
      }

      // Append a timeline entry for the detected speaker so the UI can
      // compute percent of speaking time using the timeline helper.
      if (profilePrediction?.name) {
        const entry = {
          profileName: profilePrediction.name,
          startTimeSec: currentSession.recordedTimeSec,
          durationSec: WINDOW_DURATION_SEC,
        };
        persistSession({
          ...currentSession,
          timeline: [...(currentSession.timeline ?? []), entry],
        });
      }
    }, WINDOW_DURATION_SEC * 1000);
  };

  /* ---------------------------------- */
  /* STOP RECORDING */

  const onStopRecord = async () => {
    try {
      await AudioRecord.stop();

      setIsRecording(false);

      setRecordTime(formatTime(currentSession.recordedTimeSec));

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      const len = audioBufferRef.current.windowLengthSamples;
      audioBufferRef.current = {
        ...audioBufferRef.current,
        buffer: new Float32Array(len),
        writeIndex: 0,
        filled: false,
        samplesWritten: 0,
      };
    } catch (err: any) {
      setError('Stop recording error');
    }
  };

  const handleExit = async () => {
    if (isRecording) {
      await onStopRecord();
    }
    onExit();
  };

  useEffect(() => {
    return () => {
      // Ensure we stop recording and clear intervals if the component unmounts.
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      // Fire and forget; we just want to stop the native recorder if it's still on.
      AudioRecord.stop().catch(() => {});
    };
  }, []);

  /* ---------------------------------- */
  /* UI */

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 140 }]}>
      <CustomHeader
        title={currentSession.name}
        leftIcon="chevron-left"
        onLeftPress={handleExit}
        rightIcon="plus"
        onRightPress={() => setIsProfileModalVisible(true)}
      />

      <View style={styles.audioDemoContainer}>
        <AudioDemoBox
          isRecording={isRecording}
          recordTime={recordTime}
          audioLevelFraction={audioLevelFraction}
          activeProfileName={profilePrediction?.name ?? null}
          onToggleRecording={isRecording ? onStopRecord : onStartRecord}
          onAddProfile={() => setIsProfileModalVisible(true)}
        />

        <VoiceProfileSpeakingBars
          profiles={currentSession.voiceProfiles.map((p, idx) => ({
            name: p.name,
            percentage: totalSpeakingTime
              ? (speakingTime[p.name] ?? 0) / totalSpeakingTime
              : 0,
            color: profileColors[idx % profileColors.length],
          }))}
          highlighted={profilePrediction?.name ?? null}
        />

        <VoiceProfileModal
          visible={isProfileModalVisible}
          onClose={() => setIsProfileModalVisible(false)}
          profiles={currentSession.voiceProfiles}
          showEmbeddingPreview={__DEV__}
          onAdd={profile => {
            const updatedSession = {
              ...currentSession,
              voiceProfiles: [...currentSession.voiceProfiles, profile],
            };
            persistSession(updatedSession);
            setIsProfileModalVisible(false);
          }}
          onDelete={name => {
            const updatedSession = {
              ...currentSession,
              voiceProfiles: currentSession.voiceProfiles.filter(
                p => p.name !== name,
              ),
            };
            persistSession(updatedSession);
          }}
        />

        {__DEV__ && output && (
          <View style={{ marginTop: 12 }}>
            <CustomText style={styles.output}>
              Output (len {output.length}):{' '}
              {output
                .slice(0, 5)
                .map(v => v.toFixed(3))
                .join(', ')}
              {output.length > 5 ? ' ...' : ''}
            </CustomText>
            <CustomText style={styles.debug}>
              Full output length: {output.length} (first 10 shown)
            </CustomText>
            <CustomText style={styles.debug}>
              {JSON.stringify(output.slice(0, 10))}
            </CustomText>
          </View>
        )}

        {__DEV__ && profileScores.length > 0 && (
          <View style={{ marginTop: 4 }}>
            <CustomText style={styles.debug}>Similarity scores:</CustomText>
            {profileScores.map(profile => (
              <CustomText style={styles.debug} key={profile.name}>
                {profile.name}: {profile.score.toFixed(3)}
              </CustomText>
            ))}
          </View>
        )}

        {__DEV__ && currentSession.voiceProfiles.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <CustomText style={styles.debug}>
              Voice profile embeddings (preview):
            </CustomText>
            {currentSession.voiceProfiles.map(profile => (
              <CustomText style={styles.debug} key={profile.name}>
                {profile.name}: [
                {profile.embedding
                  .slice(0, 10)
                  .map(v => v.toFixed(3))
                  .join(', ')}
                {profile.embedding.length > 10 ? ' ...' : ''}]
              </CustomText>
            ))}
          </View>
        )}

        {__DEV__ && mfccFrames.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <CustomText style={styles.debug}>
              Recent MFCC frames (all 40 coefficients):
            </CustomText>
            {mfccFrames.map((frame, idx) => (
              <CustomText style={styles.debug} key={idx}>
                [{frame.map(v => v.toFixed(2)).join(', ')}]
              </CustomText>
            ))}
          </View>
        )}

        {__DEV__ && (
          <>
            <CustomText style={styles.debug}>{debug}</CustomText>
            {debug.startsWith('Waiting for audio') && (
              <CustomText
                style={[styles.debug, { color: colorScheme.warning }]}
              >
                Waiting for enough audio for MFCC extraction...
              </CustomText>
            )}
            <CustomText style={styles.debug}>
              MFCC Timer Tick: {mfccTick} | Last: {mfccLastTime}
            </CustomText>
          </>
        )}
      </View>

      {error && <CustomText style={styles.error}>{error}</CustomText>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    padding: 0,
    backgroundColor: colorScheme.background,
  },

  header: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: colorScheme.primaryText,
  },

  audioDemoContainer: {
    borderWidth: 0,
    padding: 24,
    paddingTop: 4,
    backgroundColor: 'transparent',
    height: '100%',
  },
  addVoiceProfileButton: {
    width: '100%',
  },
  playBox: {
    width: '100%',
    height: 200,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colorScheme.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 16,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  playBoxLevel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  playCircle: {
    width: 44,
    height: 44,
    borderRadius: 44 / 2,
    backgroundColor: colorScheme.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playTime: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '700',
    color: colorScheme.primaryText,
  },
  playPrediction: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '600',
    color: colorScheme.subText,
  },

  meterBarBackground: {
    width: 200,
    height: 16,
    backgroundColor: colorScheme.border,
    marginVertical: 10,
  },

  meterBar: {
    height: 16,
    backgroundColor: colorScheme.accent,
  },

  output: {
    marginTop: 20,
    fontFamily: 'monospace',
    color: colorScheme.primaryText,
  },

  debug: {
    fontSize: 12,
    marginTop: 6,
    color: colorScheme.subText,
    zIndex: 0,
  },

  error: {
    color: colorScheme.error,
    marginTop: 10,
  },
});
