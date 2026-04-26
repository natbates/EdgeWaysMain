import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Column } from '@components/layout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AudioRecord from 'react-native-audio-record';

import { CustomButton, CustomHeader, CustomText } from '@components';
import RecordingControls from '../components/misc/RecordingControls';
import VoiceProfileSpeakingBars from '../components/misc/VoiceProfileSpeakingBars';
import VoiceSessionTimeline from '../components/misc/VoiceSessionTimeline';
import { colorScheme } from '../constants/colorScheme';
import { profileColors } from '../constants/profileColors';
import { runModelOnWaveform } from '../utils/mlModelUtils';
// extractMFCC and Meyda were removed in waveform-first migration
import { scoreVoiceProfiles } from '../utils/voiceProfiles';
import { computeProfileSpeakingPercentages } from '../utils/sessionUtils';
import {
  createVad,
  computeZcr,
  mapRmsSliderToThreshold,
  mapZcrSliderToThreshold,
} from '../utils/vad';
import { computeProfileSpeakingDurations } from '../utils/sessionUtils';
import { computeRms, decodePcm16Base64ToFloat32 } from '../utils/audioUtils';
import {
  SAMPLE_RATE,
  WINDOW_LENGTH_SAMPLES,
  WINDOW_DURATION_SEC,
  COSINE_MIN_CONFIDENCE,
} from '../constants/mlModel';

import type { Session } from '../types';
import VoiceProfileModal from '../components/modals/VoiceProfileModal';

const __DEV__ = false;

export type SessionPageProps = {
  session: Session;
  onUpdate: (session: Session) => void;
  onExit: () => void;
  onChildHorizontalScrollStart?: () => void;
  onChildHorizontalScrollEnd?: () => void;
  onOpenSettings?: () => void;
  hideBottomPadding?: boolean;
};

export default function SessionPage({
  session,
  onUpdate,
  onExit,
  onChildHorizontalScrollStart,
  onChildHorizontalScrollEnd,
  onOpenSettings,
  hideBottomPadding,
}: SessionPageProps) {
  const insets = useSafeAreaInsets();
  const [output, setOutput] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastInferenceTime, setLastInferenceTime] = useState<string | null>(
    null,
  );
  const [lastInferenceOk, setLastInferenceOk] = useState<boolean>(false);
  const [lastInferenceError, setLastInferenceError] = useState<string | null>(
    null,
  );
  const [vadStatus, setVadStatus] = useState<
    'waiting' | 'silence' | 'speaking'
  >('waiting');
  const vadStatusRef = useRef<typeof vadStatus>('waiting');
  const [vadStatusTime, setVadStatusTime] = useState<string | null>(null);
  const [lastRms, setLastRms] = useState<number | null>(null);
  const [lastZcr, setLastZcr] = useState<number | null>(null);
  const [lastPassRms, setLastPassRms] = useState<boolean | null>(null);
  const [lastPassZcr, setLastPassZcr] = useState<boolean | null>(null);
  const [effectiveSampleRate, setEffectiveSampleRate] =
    useState<number>(SAMPLE_RATE);
  const [effectiveWindowLength, setEffectiveWindowLength] = useState<number>(
    WINDOW_LENGTH_SAMPLES,
  );

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
  const rawAudioLevelFraction = Math.min(Math.max(audioLevel * 12, 0), 1);
  const audioLevelFraction = isRecording ? rawAudioLevelFraction : 0;
  const audioLevelDisplayFraction = isRecording
    ? 0.2 + 0.8 * Math.sqrt(rawAudioLevelFraction)
    : 0; // no visual noise while paused

  const [debug, setDebug] = useState('');
  const [mfccTick, setMfccTick] = useState(0);
  const mfccTickRef = useRef(0);
  const [mfccLastTime, setMfccLastTime] = useState<string>('');
  const [speakingTime, setSpeakingTime] = useState<Record<string, number>>({});
  const [totalSpeakingTime, setTotalSpeakingTime] = useState(0);

  const [settings, setSettings] = useState<
    import('../utils/settings').Settings | null
  >(null);
  const settingsRef = useRef<typeof settings>(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const vadRmsSlider = settings?.vadRmsThreshold ?? 5;
  const vadZcrSlider = settings?.vadZcrThreshold ?? 5;
  const vadRmsThreshold = mapRmsSliderToThreshold(vadRmsSlider);
  const vadZcrThreshold = mapZcrSliderToThreshold(vadZcrSlider);
  const cosineThreshold =
    settings?.cosineMinConfidence ?? COSINE_MIN_CONFIDENCE;

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
  const [localTimeline, setLocalTimeline] = useState<
    import('../types').TimelineEntry[]
  >(session.timeline ?? []);
  const localTimelineRef = useRef<import('../types').TimelineEntry[]>(
    session.timeline ?? [],
  );
  const currentSessionRef = useRef<Session>(sanitizeSession(session));

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
      setEffectiveWindowLength(newWindowLength);
      setEffectiveSampleRate(sampleRate);
    }
  };

  const vadStateRef = useRef({
    active: false,
  });

  const updateSpeakingPercentages = (
    session: Session,
    timeline = localTimeline,
  ) => {
    currentSessionRef.current = session;
    const profileNames = session.voiceProfiles.map(p => p.name);

    const hasTimeline = (timeline?.length ?? 0) > 0;
    if (hasTimeline) {
      const durations = computeProfileSpeakingDurations(timeline, profileNames);
      const total = Object.values(durations).reduce((sum, v) => sum + v, 0);
      console.log('[SessionPage] updateSpeakingPercentages', {
        timeline,
        durations,
        total,
      });
      setSpeakingTime(durations);
      setTotalSpeakingTime(total || 1);
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
    const normalized = sanitizeSession(session);

    // While recording, keep the local timeline as source of truth and do not
    // accept incoming parent timeline updates. This prevents the "flash then disappear" bug.
    if (isRecording) {
      const recordingSession = {
        ...currentSessionRef.current,
        ...normalized,
        timeline: localTimeline,
      };
      setCurrentSession(recordingSession);
      currentSessionRef.current = recordingSession;
      updateSpeakingPercentages(recordingSession, localTimeline);
      setRecordTime(formatTime(normalized.recordedTimeSec ?? 0));
      return;
    }

    // Not recording: prefer the longer timeline (parent vs local) to avoid
    // stale parent timeline overwriting the current recording results.
    const parentTimeline = normalized.timeline ?? [];
    const mergedTimeline =
      parentTimeline.length >= localTimeline.length
        ? parentTimeline
        : localTimeline;

    const sessionWithMergedTimeline = {
      ...normalized,
      timeline: mergedTimeline,
    };

    setCurrentSession(sessionWithMergedTimeline);
    setLocalTimeline(mergedTimeline);
    currentSessionRef.current = sessionWithMergedTimeline;
    updateSpeakingPercentages(sessionWithMergedTimeline, mergedTimeline);
    setRecordTime(formatTime(normalized.recordedTimeSec ?? 0));
  }, [session, isRecording, localTimeline]);

  useEffect(() => {
    console.log('[SessionPage] speakingTime updated', {
      speakingTime,
      totalSpeakingTime,
      timelineLength: currentSessionRef.current.timeline?.length ?? 0,
    });
  }, [speakingTime, totalSpeakingTime]);

  useEffect(() => {
    console.log(
      '[SessionPage] currentSession timeline',
      currentSession.timeline,
    );
  }, [currentSession.timeline]);

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
    const base = currentSessionRef.current;
    const normalized = sanitizeSession({ ...base, ...updated });

    // Preserve existing local timeline unless caller intentionally replaced it.
    const currentLocalTimeline = localTimelineRef.current;
    if (updated.timeline === undefined) {
      normalized.timeline = currentLocalTimeline;
    }

    console.log('[SessionPage] persistSession timeline', normalized.timeline);
    setCurrentSession(normalized);
    setLocalTimeline(normalized.timeline ?? []);
    localTimelineRef.current = normalized.timeline ?? [];
    currentSessionRef.current = normalized;

    // ensure bars are derived from timeline each update (no stale 0.5/1.0 mismatch)
    updateSpeakingPercentages(normalized, normalized.timeline ?? []);

    // Avoid constant parent re-render while recording.
    if (!isRecording) {
      onUpdate(normalized);
    }
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
    persistSession({ recordedTimeSec: next });
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
      sampleRate: SAMPLE_RATE,
      windowLengthSamples: WINDOW_LENGTH_SAMPLES,
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
        const zcr = computeZcr(float32);

        // Update visible RMS/ZCR immediately, even before the buffer is full.
        setLastRms(rms);
        setLastZcr(zcr);

        const vadRmsSlider = settings?.vadRmsThreshold ?? 5;
        const vadZcrSlider = settings?.vadZcrThreshold ?? 5;
        const vadRmsThreshold = mapRmsSliderToThreshold(vadRmsSlider);
        const vadZcrThreshold = mapZcrSliderToThreshold(vadZcrSlider);
        setLastPassRms(rms >= vadRmsThreshold);
        setLastPassZcr(zcr < vadZcrThreshold);

        const now = Date.now();
        const deltaMs = now - lastAudioChunkAtRef.current;
        lastAudioChunkAtRef.current = now;
        chunkCountRef.current += 1;

        // Estimate effective sample rate from incoming chunk size + timing.
        // Keep model input in the expected 16kHz window; do NOT adapt window size for drift.
        // Paging data outside 16k samples would break MFCC / model expectations.
        const state = audioBufferRef.current;
        if (deltaMs > 0) {
          const observedSampleRate = (float32.length * 1000) / deltaMs;
          const nextSampleRate =
            state.sampleRate * 0.85 + observedSampleRate * 0.15;
          state.sampleRate = nextSampleRate;
          // Always preserve 1 second at 16kHz for model inputs.
          state.windowLengthSamples = WINDOW_LENGTH_SAMPLES;

          if (Math.abs(nextSampleRate - effectiveSampleRate) > 10) {
            setEffectiveSampleRate(nextSampleRate);
          }

          // Warn if recorder is not producing 16kHz as expected.
          if (Math.abs(nextSampleRate - SAMPLE_RATE) > 100) {
            console.warn(
              `[SessionPage] sample rate drift: observed=${Math.round(
                observedSampleRate,
              )} target=${SAMPLE_RATE}`,
            );
            setDebug(
              `[WARN] sample rate drift: observed=${Math.round(
                observedSampleRate,
              )} target=${SAMPLE_RATE}. MFCC may be degraded.`,
            );
          }
        }

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
        if (
          !state.filled &&
          state.samplesWritten >= state.windowLengthSamples
        ) {
          state.filled = true;
        }

        // Debug buffer progress
        // console.log(
        //   '[VAD] buffer',
        //   `writeIndex=${state.writeIndex}`,
        //   `samplesWritten=${state.samplesWritten}`,
        //   `filled=${state.filled}`,
        // );

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

      const buffer = state.buffer;
      let out: Float32Array;
      if (state.filled) {
        out = new Float32Array(buffer.length);
        const start = state.writeIndex;
        out.set(buffer.subarray(start));
        if (start > 0) {
          out.set(buffer.subarray(0, start), buffer.length - start);
        }
      } else {
        // When buffering, only use the filled portion.
        out = buffer.subarray(0, state.writeIndex);
      }

      const rms = computeRms(out);
      const zcr = out.length < 2 ? 0 : computeZcr(out);

      setLastRms(rms);
      setLastZcr(zcr);

      const currentSettings = settingsRef.current;
      const vadRmsSlider = currentSettings?.vadRmsThreshold ?? 5;
      const vadZcrSlider = currentSettings?.vadZcrThreshold ?? 5;
      const vadRmsThreshold = mapRmsSliderToThreshold(vadRmsSlider);
      const vadZcrThreshold = mapZcrSliderToThreshold(vadZcrSlider);
      const passRms = rms >= vadRmsThreshold;
      const passZcr = zcr < vadZcrThreshold;

      setLastPassRms(passRms);
      setLastPassZcr(passZcr);

      // Use VAD smoothing implementation from utils/vad.ts so ticks can tolerate
      // transient noise/silence before dropping model inference.
      const vad = vadRef.current;
      const speech = vad.isSpeech(out);
      const smoothTicks = currentSettings?.vadSmoothTicks ?? 0;

      // Keep this diagnostic mapping as before for UI and debugging.
      if (!speech) {
        setVadStatus('silence');
      } else {
        setVadStatus('speaking');
      }

      const nowTime = new Date().toLocaleTimeString();

      const newVadStatus = speech ? 'speaking' : 'silence';
      if (newVadStatus !== vadStatusRef.current) {
        vadStatusRef.current = newVadStatus;
        setVadStatus(newVadStatus);
        setVadStatusTime(nowTime);
      }

      if (speech) {
        mfccTickRef.current = smoothTicks;
        setMfccTick(smoothTicks);
      }

      if (!speech && !state.filled) {
        setDebug(
          `Buffering audio (${state.samplesWritten}/${state.windowLengthSamples} samples) — waiting to fill before MFCC extraction. (last chunk: ${msSinceLastChunk}ms ago)`,
        );
        setProfilePrediction(null);
        setProfileScores([]);
        setOutput(null);
        setLastInferenceOk(false);
        return;
      }

      if (!speech && mfccTickRef.current <= 0) {
        setDebug(`VAD: silence (rms=${rms.toFixed(5)} zcr=${zcr.toFixed(4)})`);
        setProfilePrediction(null);
        setProfileScores([]);
        setOutput(null);
        setLastInferenceOk(false);
        return;
      }

      if (!speech && mfccTickRef.current > 0) {
        setDebug(
          `VAD: silence holdoff (${mfccTickRef.current} ticks remaining)`,
        );
        const nextTick = Math.max(0, mfccTickRef.current - 1);
        mfccTickRef.current = nextTick;
        setMfccTick(nextTick);
      }

      if (!state.filled) {
        setDebug(
          `VAD: speaking but buffer not full (${state.samplesWritten}/${state.windowLengthSamples}) — running analysis on partial buffer`,
        );
      }

      if (speech) {
        setDebug(`VAD: speaking (rms=${rms.toFixed(5)} zcr=${zcr.toFixed(4)})`);
      }

      // Run model on current waveform window.
      setDebug(`[DEBUG] Waveform shape: ${out.length}`);
      setMfccFrames([]);
      const inferenceTime = new Date().toLocaleTimeString();
      setLastInferenceTime(inferenceTime);
      try {
        // Use shared waveform model path that works in Troubleshoot.
        // runModelOnWaveform will run MFCC + model or fallback to waveform route.
        const embRaw = await runModelOnWaveform(out);

        if (!embRaw) {
          setDebug('[SessionPage] runModelOnWaveform returned null');
        }

        const emb = embRaw
          ? (() => {
              const norm = Math.sqrt(embRaw.reduce((sum, v) => sum + v * v, 0));
              if (norm > 0) {
                return embRaw.map(v => v / norm);
              }
              return embRaw;
            })()
          : null;

        setOutput(emb);
        const ok = Boolean(emb);
        setLastInferenceOk(ok);
        setLastInferenceError(ok ? null : 'Model returned null output');
        const session = currentSessionRef.current;
        if (ok && session.voiceProfiles.length) {
          const currentSettings = settingsRef.current;
          const cosineThreshold =
            currentSettings?.cosineMinConfidence ?? COSINE_MIN_CONFIDENCE;
          const prediction = scoreVoiceProfiles(
            emb as number[],
            session.voiceProfiles,
            cosineThreshold,
          );
          setProfileScores(prediction.scores);
          setProfilePrediction(prediction.bestMatch);
          console.log('[SessionPage] prediction', {
            bestMatch: prediction.bestMatch,
            scores: prediction.scores,
            confidenceThreshold: cosineThreshold,
          });
          if (!prediction.bestMatch) {
            console.warn(
              '[SessionPage] no profile best match (below threshold):',
              prediction.scores,
            );
          }
          if (prediction.bestMatch?.name) {
            const entry = {
              profileName: prediction.bestMatch.name,
              startTimeSec: session.recordedTimeSec,
              durationSec: WINDOW_DURATION_SEC,
            };
            console.log('[SessionPage] timeline add', entry);
            setSpeakingTime(prev => ({
              ...prev,
              [entry.profileName]:
                (prev[entry.profileName] ?? 0) + WINDOW_DURATION_SEC,
            }));
            setTotalSpeakingTime(prev => prev + WINDOW_DURATION_SEC);
            persistSession({
              ...session,
              timeline: [...(session.timeline ?? []), entry],
            });
          } else {
            console.log('[SessionPage] no profile match this tick', {
              profiles: session.voiceProfiles.length,
              prediction,
            });
          }
        }
      } catch (err: any) {
        const message =
          err?.message || err?.toString?.() || 'Unknown model error';
        console.error('[SessionPage] inference error in catch:', err);
        setLastInferenceOk(false);
        setLastInferenceError(message);
        setProfilePrediction(null);
        setProfileScores([]);
      }
    }, WINDOW_DURATION_SEC * 1000);
  };

  const onStopRecord = async () => {
    try {
      await AudioRecord.stop();

      setIsRecording(false);
      setAudioLevel(0);

      const finalSession = {
        ...currentSession,
        timeline: localTimeline,
      };
      setCurrentSession(finalSession);
      currentSessionRef.current = finalSession;
      updateSpeakingPercentages(finalSession, localTimeline);
      onUpdate(finalSession);

      setRecordTime(formatTime(finalSession.recordedTimeSec));

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

  const handleExit = () => {
    // Allow immediate exit in all cases
    const shouldStop = isRecording;
    if (shouldStop) {
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      AudioRecord.stop().catch(() => {});
      setAudioLevel(0);
    }

    // Persist final session so changes are not lost.
    const finalSession = {
      ...currentSessionRef.current,
      timeline: localTimeline,
    };
    setCurrentSession(finalSession);
    currentSessionRef.current = finalSession;
    updateSpeakingPercentages(finalSession, localTimeline);

    onExit();

    // Fire-and-forget save; do not rely on `onUpdate` to control visible route state.
    Promise.resolve(onUpdate(finalSession)).catch(() => {});
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

  return (
    <Column
      style={[
        styles.container,
        { paddingBottom: insets.bottom + (hideBottomPadding ? 0 : 140) },
      ]}
    >
      <CustomHeader
        title={currentSession.name}
        leftIcon="chevron-left"
        onLeftPress={handleExit}
        rightIcon="plus"
        onRightPress={() => {
          if (isRecording) {
            onStopRecord();
          }
          setIsProfileModalVisible(true);
        }}
        rightIcon2="cog"
        onRight2Press={onOpenSettings}
      />

      <View style={styles.audioDemoContainer}>
        <RecordingControls
          isRecording={isRecording}
          recordTime={recordTime}
          audioLevelFraction={audioLevelFraction}
          activeProfileName={profilePrediction?.name ?? null}
          activeProfileColor={activeProfileColor}
          activeProfileConfidence={profilePrediction?.score ?? null}
          cosineThreshold={cosineThreshold}
          onToggleRecording={isRecording ? onStopRecord : onStartRecord}
        />

        {!__DEV__ && (
          <>
            <VoiceSessionTimeline
              timeline={localTimeline}
              voiceProfiles={currentSession.voiceProfiles || []}
              totalRecordedTimeSec={currentSession.recordedTimeSec || 0}
              onInteractionStart={onChildHorizontalScrollStart}
              onInteractionEnd={onChildHorizontalScrollEnd}
            />

            <VoiceProfileSpeakingBars
              profiles={currentSession.voiceProfiles.map((p, idx) => ({
                name: p.name,
                percentage: totalSpeakingTime
                  ? (speakingTime[p.name] ?? 0) / totalSpeakingTime
                  : 0,
                timeSec: speakingTime[p.name] ?? 0,
                color: profileColors[idx % profileColors.length],
              }))}
              highlighted={activeProfileIndex >= 0 ? activeProfileIndex : null}
            />
          </>
        )}

        <CustomButton
          title="Add Voice Profile"
          style={styles.addVoiceProfileButton}
          onPress={() => {
            if (isRecording) {
              onStopRecord();
            }
            setIsProfileModalVisible(true);
          }}
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
          onUpdate={profile => {
            const updatedSession = {
              ...currentSession,
              voiceProfiles: currentSession.voiceProfiles.map(p =>
                p.name === profile.name
                  ? { ...p, embedding: profile.embedding }
                  : p,
              ),
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

        {__DEV__ && (
          <>
            <View style={{ marginTop: 12 }}>
              {output ? (
                <>
                  <CustomText style={styles.output}>
                    Model output (len {output.length}):{' '}
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
                </>
              ) : (
                <CustomText style={styles.value}>
                  No model output yet
                </CustomText>
              )}
            </View>

            <View style={{ marginTop: 4 }}>
              <CustomText style={styles.debug}>
                Best match:{' '}
                {profilePrediction
                  ? `${
                      profilePrediction.name
                    } (${profilePrediction.score.toFixed(3)})`
                  : 'None'}
              </CustomText>
              <CustomText style={styles.debug}>Similarity scores:</CustomText>
              {profileScores.length > 0 ? (
                profileScores.map(profile => (
                  <CustomText style={styles.debug} key={profile.name}>
                    {profile.name}: {profile.score.toFixed(3)}
                  </CustomText>
                ))
              ) : (
                <CustomText style={styles.value}>
                  No profile scores yet
                </CustomText>
              )}
            </View>
          </>
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
              Recent MFCC frame 0 (first 10 coeffs):
            </CustomText>
            <CustomText style={styles.debug}>
              [
              {mfccFrames[0]
                .slice(0, 10)
                .map(v => v.toFixed(2))
                .join(', ')}
              ]
            </CustomText>
            <CustomText style={styles.debug}>
              Frame count: {mfccFrames.length}, coeffs/frame:{' '}
              {mfccFrames[0].length}
            </CustomText>
          </View>
        )}

        {__DEV__ && (
          <>
            <CustomText style={styles.debug}>{debug}</CustomText>
            <CustomText style={styles.debug}>
              Effective sample rate: {effectiveSampleRate.toFixed(1)} Hz
            </CustomText>
            <CustomText style={styles.debug}>
              Effective window length: {effectiveWindowLength} samples
            </CustomText>
            {lastInferenceTime ? (
              <CustomText
                style={styles.debug}
              >{`Last inference: ${lastInferenceTime} (${
                lastInferenceOk ? 'OK' : 'no output'
              })`}</CustomText>
            ) : null}
            {debug.startsWith('Buffering audio') && (
              <CustomText
                style={[styles.debug, { color: colorScheme.warning }]}
              >
                Collecting enough audio for MFCC (normal while recording)...
              </CustomText>
            )}
            <CustomText style={styles.debug}>
              MFCC Timer Tick: {mfccTick} | Last: {mfccLastTime}
            </CustomText>
            <CustomText style={styles.debug}>
              VAD: {vadStatus} {vadStatusTime ? `(@ ${vadStatusTime})` : ''}
            </CustomText>
            <CustomText style={styles.debug}>
              RMS: {lastRms?.toFixed(5) ?? 'n/a'} | ZCR:{' '}
              {lastZcr?.toFixed(5) ?? 'n/a'}
            </CustomText>
            <CustomText style={styles.debug}>
              {`VAD thresholds: RMS >= ${vadRmsThreshold.toFixed(
                6,
              )} (slider ${vadRmsSlider}) | ZCR < ${vadZcrThreshold.toFixed(
                6,
              )} (slider ${vadZcrSlider})`}
            </CustomText>
            <CustomText style={styles.debug}>
              {`Cosine threshold: ${
                settings?.cosineMinConfidence?.toFixed(2) ??
                COSINE_MIN_CONFIDENCE.toFixed(2)
              }`}
            </CustomText>
            <CustomText style={styles.debug}>
              {`RMS pass: ${
                lastPassRms == null ? 'n/a' : lastPassRms ? 'YES' : 'NO'
              } | ZCR pass: ${
                lastPassZcr == null ? 'n/a' : lastPassZcr ? 'YES' : 'NO'
              }`}
            </CustomText>
            <CustomText style={styles.debug}>
              {`VAD smooth ticks: ${
                settings?.vadSmoothTicks ?? 0
              } | holdoff remaining: ${mfccTick}`}
            </CustomText>
            {lastInferenceTime ? (
              <CustomText style={styles.debug}>
                Last inference: {lastInferenceTime} (
                {lastInferenceOk ? 'ok' : 'failed'})
              </CustomText>
            ) : null}
            {lastInferenceError ? (
              <CustomText style={[styles.debug, { color: colorScheme.error }]}>
                Last inference error: {lastInferenceError}
              </CustomText>
            ) : null}
          </>
        )}
      </View>

      {error && <CustomText style={styles.error}>{error}</CustomText>}
    </Column>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
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
    padding: 14,
    paddingBottom: 0,
    paddingTop: 0,
    backgroundColor: 'transparent',
    height: '100%',
  },
  addVoiceProfileButton: {
    width: '100%',
    marginTop: 16,
  },
  timelineTable: {
    width: '100%',
    borderWidth: 1,
    borderColor: colorScheme.border,
    borderRadius: 12,
    padding: 8,
    backgroundColor: '#f8f8f8',
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
    color: colorScheme.primaryText,
  },
  timelineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colorScheme.border,
    paddingVertical: 4,
  },
  timelineText: {
    fontSize: 12,
    color: colorScheme.primaryText,
  },
  timelineEmpty: {
    fontSize: 12,
    color: colorScheme.subText,
    marginBottom: 10,
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

  value: {
    fontSize: 13,
    marginTop: 4,
    color: colorScheme.primaryText,
  },

  error: {
    color: colorScheme.error,
    marginTop: 10,
  },
});
