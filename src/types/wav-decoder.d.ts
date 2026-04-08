declare module 'wav-decoder' {
  export type AudioData = {
    sampleRate: number;
    channelData: Float32Array[];
  };

  export function decode(buffer: ArrayBuffer | Uint8Array): Promise<AudioData>;
}
