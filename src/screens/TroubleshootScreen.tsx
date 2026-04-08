import React, { useMemo, useRef, useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { CustomButton, CustomHeader, CustomText } from '@components';
import { colorScheme } from '../constants/colorScheme';
import VoiceProfileModal from '../components/modals/VoiceProfileModal';
import type { VoiceProfile } from '../types';
import AudioRecord from 'react-native-audio-record';
import { decodePcm16Base64ToFloat32 } from '../utils/audioUtils';
// import { extractMFCC } from '../utils/mfccUtils';
import {
  runModelOnMFCC,
  runModelOnWaveform,
  isModelLoaded,
  loadTFLiteModel,
} from '../utils/mlModelUtils';
import { scoreVoiceProfiles } from '../utils/voiceProfiles';
import {
  WINDOW_LENGTH_SAMPLES,
  SAMPLE_RATE,
  INPUT_SHAPE,
} from '../constants/mlModel';
import { runMFCCOnWaveform, isMFCCLoaded } from '../utils/mfccUtils';

function lcg(seed: number, size: number): number[] {
  var a = 1664525,
    c = 1013904223,
    m = Math.pow(2, 32);
  var x = seed;
  var out = [];
  for (var i = 0; i < size; i++) {
    x = (a * x + c) % m;
    out.push(2.0 * (x / m) - 1.0);
  }
  return out;
}
// Usage: let randomWave = lcg(42, 16000);

export default function TroubleshootScreen() {
  // Clear debug output
  const clearDebug = () => setDebugLines([]);
  // Test MFCC native module with a synthetic sine wave
  const testNativeMFCC = async () => {
    const audio = lcg(42, 16000);

    appendDebug(
      'Tesing mfcc with audio, preview of first 10 samples: ' +
        Array.from(audio.slice(0, 10))
          .map(v => v.toFixed(5))
          .join(', '),
    );

    try {
      const result = await runMFCCOnWaveform(audio);
      if (!result) {
        appendDebug('MFCC extraction failed: result is null');
        return;
      }
      const mfcc = result.mfcc;
      const debug = result.debug;
      appendDebug(
        `MFCC extraction successful, output shape: ${mfcc?.length} frames x ${
          mfcc && mfcc[0]?.length
        } coeffs/frame`,
      );
      if (debug) {
        if (debug.windowed_frame) {
          appendDebug(
            'windowed_frame[0..9]: ' +
              debug.windowed_frame
                .slice(0, 10)
                .map((v: number) => v.toFixed(5))
                .join(', '),
          );
        }
        if (debug.fft_magnitude) {
          appendDebug(
            'fft_magnitude[0..9]: ' +
              debug.fft_magnitude
                .slice(0, 10)
                .map((v: number) => v.toFixed(5))
                .join(', '),
          );
        }
        if (debug.mel_spectrum) {
          appendDebug(
            'mel_spectrum[0..9]: ' +
              debug.mel_spectrum
                .slice(0, 10)
                .map((v: number) => v.toFixed(5))
                .join(', '),
          );
        }
        if (debug.log_mel_spectrum) {
          appendDebug(
            'log_mel_spectrum[0..9]: ' +
              debug.log_mel_spectrum
                .slice(0, 10)
                .map((v: number) => v.toFixed(5))
                .join(', '),
          );
        }
        if (debug.mfcc) {
          appendDebug(
            'mfcc[0..9]: ' +
              debug.mfcc
                .slice(0, 10)
                .map((v: number) => v.toFixed(5))
                .join(', '),
          );
        }
      }
      // mfcc is number[][]
      const firstFrame =
        Array.isArray(mfcc) && Array.isArray(mfcc[0]) ? mfcc[0] : undefined;
      if (firstFrame && firstFrame.length > 0) {
        const first10 = firstFrame
          .slice(0, 10)
          .map(v => v.toFixed(4))
          .join(', ');
        appendDebug(`MFCC[0][0..9]: ${first10}`);
      } else {
        appendDebug('MFCC output was empty or invalid');
      }
    } catch (err) {
      appendDebug(`Native MFCC error: ${err}`);
    }
  };
  const [isProfileModalVisible, setIsProfileModalVisible] = useState(false);
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [debugLines, setDebugLines] = useState<string[]>([]);

  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState('00:00:00');
  const [modelEmbedding, setModelEmbedding] = useState<number[] | null>(null);
  const [mfccOutput, setMfccOutput] = useState<number[][] | null>(null);
  const [isModelLoadedState, setIsModelLoadedState] = useState(false);
  const [voiceScores, setVoiceScores] = useState<
    { name: string; score: number }[]
  >([]);
  const [audioLen, setAudioLen] = useState(0);
  const [isMFCCLoadedState, setIsMFCCLoadedState] = useState(false);

  const audioBufferRef = useRef<Float32Array>(new Float32Array(0));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef(false);

  const profileSummary = useMemo(
    () => profiles.map(p => p.name).join(', ') || 'No profiles yet',
    [profiles],
  );

  const appendDebug = (line: string) => {
    setDebugLines(prev => [line, ...prev.slice(0, 49)]);
  };

  useEffect(() => {
    setIsModelLoadedState(isModelLoaded());
    setIsMFCCLoadedState(isMFCCLoaded());

    // Attempt to load model on troubleshoot mount for immediate feedback.
    (async () => {
      try {
        await loadTFLiteModel();
        setIsModelLoadedState(true);
        appendDebug('TFLite model loaded successfully on screen open');
      } catch (err) {
        appendDebug(`TFLite model load failed: ${err}`);
      }
    })();
  }, []);

  const updateEmbeddingFromBuffer = async () => {
    const seed = Date.now() % 1000000;
    appendDebug(
      `Using random synthetic waveform from lcg(seed=${seed}) for MFCC + model inference`,
    );
    const randomWave = lcg(seed, WINDOW_LENGTH_SAMPLES);
    const segment = new Float32Array(randomWave);

    appendDebug(`Running MFCC extraction on segment length ${segment.length}`);
    // Debug: log waveform shape
    appendDebug(`[DEBUG] Waveform shape: ${segment.length}`);
    try {
      const result = await runMFCCOnWaveform(segment);
      if (!result) {
        appendDebug('MFCC extraction failed: result is null');
        setMfccOutput(null);
        setModelEmbedding(null);
        return;
      }
      const mfcc = result.mfcc;
      setMfccOutput(mfcc);

      // Debug: log MFCC shape
      appendDebug(
        `[DEBUG] MFCC shape: ${Array.isArray(mfcc) ? mfcc.length : 'null'} x ${
          Array.isArray(mfcc) && Array.isArray(mfcc[0])
            ? mfcc[0].length
            : 'null'
        }`,
      );
      appendDebug(
        `MFCC frame 0 (first 10 coeffs): ${mfcc[0]
          .slice(0, 10)
          .map(v => v.toFixed(4))
          .join(', ')}`,
      );
      const emb = await runModelOnWaveform(segment);
      setModelEmbedding(emb);
      setIsModelLoadedState(isModelLoaded());
      appendDebug(`Model embedding returned length ${emb?.length ?? 0}`);
      if (emb && profiles.length) {
        const scored = scoreVoiceProfiles(emb, profiles, -1); // legacy no strict unknown threshold
        setVoiceScores(scored.scores);
        appendDebug(
          `Best match: ${scored.bestMatch?.name ?? 'unknown'} (${(
            scored.bestMatch?.score ?? 0
          ).toFixed(4)})`,
        );
      } else {
        setVoiceScores([]);
      }
    } catch (err) {
      appendDebug(`Model inference error: ${String(err)}`);
    }
  };

  const startAudio = () => {
    if (isRecording) return;

    audioBufferRef.current = new Float32Array(0);
    setAudioLen(0);
    setModelEmbedding(null);
    setRecordTime('00:00:00');

    AudioRecord.init({
      sampleRate: 16000,
      channels: 1,
      bitsPerSample: 16,
      wavFile: '',
    });

    AudioRecord.on('data', (data: string) => {
      try {
        const chunk = decodePcm16Base64ToFloat32(data);
        const prev = audioBufferRef.current;
        const combined = new Float32Array(prev.length + chunk.length);
        combined.set(prev);
        combined.set(chunk, prev.length);
        // keep last 2x window length for continuity, to avoid runaway buffer
        const maxSamples = WINDOW_LENGTH_SAMPLES * 2;
        audioBufferRef.current =
          combined.length > maxSamples
            ? combined.subarray(combined.length - maxSamples)
            : combined;
        setAudioLen(audioBufferRef.current.length);

        // If we reach the required window length, stop automatically and run inference
        if (
          audioBufferRef.current.length >= WINDOW_LENGTH_SAMPLES &&
          !autoStopRef.current
        ) {
          autoStopRef.current = true;
          appendDebug(
            `${WINDOW_LENGTH_SAMPLES} samples collected, auto-stop requested; stopping and running inference`,
          );
          setTimeout(async () => {
            await stopAudio();
            await runInference();
            autoStopRef.current = false;
          }, 0);
        }
      } catch (err) {
        appendDebug(`audio decode error: ${err}`);
      }
    });

    AudioRecord.start();
    setIsRecording(true);
    autoStopRef.current = false;
    setDebugLines(prev => ['Recording started', ...prev.slice(0, 48)]);

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const s = String(elapsed % 60).padStart(2, '0');
      setRecordTime(`00:${m}:${s}`);
    }, 500);
  };

  const stopAudio = async () => {
    if (!isRecording) return;
    try {
      await AudioRecord.stop();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsRecording(false);
      setDebugLines(prev => ['Recording stopped', ...prev.slice(0, 48)]);
    } catch (err) {
      appendDebug(`stop audio error: ${err}`);
    }
  };

  const runInference = async () => {
    await updateEmbeddingFromBuffer();
  };

  return (
    <View style={styles.container}>
      <CustomHeader title="Troubleshoot" />

      <View style={styles.content}>
        <CustomButton
          title="Test Native MFCC (Sine Wave)"
          onPress={testNativeMFCC}
          style={styles.button}
        />

        <CustomButton
          title="Clear Debug Output"
          onPress={clearDebug}
          style={styles.button}
        />

        <CustomButton
          title={isRecording ? 'Stop recording' : 'Start recording'}
          onPress={() => {
            if (isRecording) stopAudio();
            else startAudio();
          }}
          style={styles.button}
        />
        <CustomButton
          title="Run MFCC + model inference"
          onPress={runInference}
          style={styles.button}
          disabled={isRecording}
        />
        <CustomButton
          title="Open voice profile modal"
          onPress={() => {
            appendDebug('Opening voice profile modal');
            setIsProfileModalVisible(true);
          }}
          style={styles.button}
        />

        <CustomText style={styles.statusLine}>
          Record time: {recordTime} | Buffer: {audioLen} | Model:{' '}
          {isModelLoadedState ? 'Yes' : 'No'} | MFCC:{' '}
          {isMFCCLoadedState ? 'Yes' : 'No'} | Input shape:{' '}
          {`[${INPUT_SHAPE.join(', ')}]`}
        </CustomText>

        <CustomText style={styles.label}>
          Current profiles ({profiles.length}):
        </CustomText>
        <CustomText style={styles.value}>{profileSummary}</CustomText>

        <View style={styles.divider} />

        <CustomText style={styles.heading}>Embedding result</CustomText>
        {modelEmbedding ? (
          <ScrollView style={styles.embeddingBox}>
            <CustomText style={styles.debugText}>
              {modelEmbedding
                .slice(0, 30)
                .map(v => v.toFixed(4))
                .join(', ')}
              {modelEmbedding.length > 30 ? ' ...' : ''}
            </CustomText>
          </ScrollView>
        ) : (
          <CustomText style={styles.value}>No embedding yet</CustomText>
        )}

        <CustomText style={styles.heading}>MFCC result</CustomText>
        {mfccOutput ? (
          <ScrollView style={styles.embeddingBox}>
            <CustomText style={styles.debugText}>
              Frame 0 (first 10):{' '}
              {mfccOutput[0]
                .slice(0, 10)
                .map(v => v.toFixed(4))
                .join(', ')}
            </CustomText>
            <CustomText style={styles.debugText}>
              Total frames: {mfccOutput.length}, coeffs/frame:{' '}
              {mfccOutput[0]?.length ?? 0}
            </CustomText>
          </ScrollView>
        ) : (
          <CustomText style={styles.value}>No MFCC yet</CustomText>
        )}

        <View style={styles.divider} />

        <CustomText style={styles.heading}>Voice profile scores</CustomText>
        {voiceScores.length > 0 ? (
          voiceScores.map(item => (
            <CustomText key={item.name} style={styles.debugText}>
              {item.name}: {item.score.toFixed(4)}
            </CustomText>
          ))
        ) : (
          <CustomText style={styles.value}>No score yet</CustomText>
        )}

        <View style={styles.divider} />

        <CustomText style={styles.heading}>Debug output</CustomText>
        <ScrollView
          style={styles.debugBox}
          contentContainerStyle={styles.debugContent}
        >
          {debugLines.length === 0 ? (
            <CustomText style={styles.debugText}>No events yet.</CustomText>
          ) : (
            debugLines.map((line, idx) => (
              <CustomText key={`${idx}-${line}`} style={styles.debugText}>
                {line}
              </CustomText>
            ))
          )}
        </ScrollView>
      </View>

      <VoiceProfileModal
        visible={isProfileModalVisible}
        onClose={() => {
          appendDebug('Closing voice profile modal');
          setIsProfileModalVisible(false);
        }}
        profiles={profiles}
        onAdd={profile => {
          setProfiles(prev => [...prev, profile]);
          appendDebug(`Added profile: ${profile.name}`);
        }}
        onUpdate={profile => {
          setProfiles(prev =>
            prev.map(p => (p.name === profile.name ? profile : p)),
          );
          appendDebug(`Updated profile: ${profile.name}`);
        }}
        onDelete={name => {
          setProfiles(prev => prev.filter(p => p.name !== name));
          appendDebug(`Deleted profile: ${name}`);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  statusLine: {
    fontSize: 13,
    marginTop: 12,
    color: colorScheme.subText,
    flexWrap: 'wrap',
    flexDirection: 'row',
  },
  container: {
    flex: 1,
    backgroundColor: colorScheme.background,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  heading: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    color: colorScheme.primaryText,
  },
  label: {
    fontSize: 14,
    marginTop: 12,
    color: colorScheme.subText,
  },
  value: {
    fontSize: 13,
    marginTop: 4,
    color: colorScheme.primaryText,
  },
  button: {
    marginBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: colorScheme.border,
    marginVertical: 12,
  },
  debugBox: {
    maxHeight: 180,
    borderWidth: 1,
    borderColor: colorScheme.border,
    borderRadius: 8,
    padding: 8,
    backgroundColor: '#fff',
  },
  embeddingBox: {
    maxHeight: 80,
    borderWidth: 1,
    borderColor: colorScheme.border,
    borderRadius: 8,
    padding: 8,
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  debugContent: {
    flexGrow: 1,
  },
  debugText: {
    fontSize: 12,
    color: colorScheme.subText,
    marginBottom: 4,
  },
  tip: {
    fontSize: 13,
    color: colorScheme.subText,
    marginTop: 4,
  },
});
