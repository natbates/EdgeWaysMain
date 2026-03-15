declare module 'react-native-tflite' {
  export default class Tflite {
    loadModel(
      params: {
        model: string;
        labels?: string;
      },
      callback: (err: any, res: any) => void,
    ): void;
    runModelOnBinary(
      params: {
        path: string;
        input: any;
        inputShape: number[];
        outputShape: number[];
        outputType: string;
      },
      callback: (err: any, res: any) => void,
    ): void;
  }
}
