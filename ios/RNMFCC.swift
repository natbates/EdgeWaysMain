import Accelerate
import Foundation
import React

@objc(RNMFCC)
class RNMFCC: NSObject {
    // Constants (should match your Python config)
    let FRAME_LENGTH = 400
    let FRAME_STEP = 160
    let FFT_LENGTH = 512
    let NUM_MFCC = 13
    let MFCC_TIME_STEPS = 49
    let SAMPLE_RATE = 16000

    @objc
    func extractMFCCFromWaveform(
        _ waveform: [NSNumber], resolver: @escaping RCTPromiseResolveBlock,
        rejecter: @escaping RCTPromiseRejectBlock
    ) {
        // Convert input to Float32
        var waveform = waveform.map { Float32(truncating: $0) }
        if waveform.count < SAMPLE_RATE {
            waveform += [Float32](repeating: 0, count: SAMPLE_RATE - waveform.count)
        } else if waveform.count > SAMPLE_RATE {
            waveform = Array(waveform[0..<SAMPLE_RATE])
        }

        // Pre-emphasis
        let pre_emphasis: Float32 = 0.97
        var emphasized = [Float32](repeating: 0, count: waveform.count)
        emphasized[0] = waveform[0]
        for i in 1..<waveform.count {
            emphasized[i] = waveform[i] - pre_emphasis * waveform[i - 1]
        }

        // Framing
        let num_frames = 1 + Int(ceil(Double(waveform.count - FRAME_LENGTH) / Double(FRAME_STEP)))
        let pad_length = (num_frames - 1) * FRAME_STEP + FRAME_LENGTH
        if emphasized.count < pad_length {
            emphasized += [Float32](repeating: 0, count: pad_length - emphasized.count)
        }
        var frames = [[Float32]]()
        for i in 0..<num_frames {
            let start = i * FRAME_STEP
            let end = start + FRAME_LENGTH
            frames.append(Array(emphasized[start..<end]))
        }

        // Windowing (Hanning)
        var window = [Float32](repeating: 0, count: FRAME_LENGTH)
        vDSP_hann_window(&window, vDSP_Length(FRAME_LENGTH), Int32(vDSP_HANN_NORM))
        for i in 0..<frames.count {
            vDSP_vmul(frames[i], 1, window, 1, &frames[i], 1, vDSP_Length(FRAME_LENGTH))
        }

        // FFT and magnitude
        let num_spectrogram_bins = FFT_LENGTH / 2 + 1
        var magnitudeFrames = [[Float32]]()
        var fftSetup = vDSP_DFT_zop_CreateSetup(nil, vDSP_Length(FFT_LENGTH), .FORWARD)!
        for frame in frames {
            var real = [Float](frame + [Float](repeating: 0, count: FFT_LENGTH - FRAME_LENGTH))
            var imag = [Float](repeating: 0, count: FFT_LENGTH)
            var splitComplex = DSPSplitComplex(realp: &real, imagp: &imag)
            vDSP_DFT_Execute(fftSetup, real, imag, &real, &imag)
            let mags = stride(from: 0, to: num_spectrogram_bins, by: 1).map { i in
                sqrt(real[i] * real[i] + imag[i] * imag[i])
            }
            magnitudeFrames.append(mags)
        }
        vDSP_DFT_DestroySetup(fftSetup)

        // Mel filterbank
        let melFilterbank = self.melFilterbank(
            numMelBins: NUM_MFCC, numSpectrogramBins: num_spectrogram_bins, sampleRate: SAMPLE_RATE,
            lowerEdgeHz: 0.0, upperEdgeHz: Float(SAMPLE_RATE) / 2.0)
        var melSpectrogram = magnitudeFrames.map { frame in
            vDSP.matrixMultiply(frame, melFilterbank)
        }

        // Log mel
        for i in 0..<melSpectrogram.count {
            melSpectrogram[i] = melSpectrogram[i].map { log($0 + 1e-6) }
        }

        // DCT (type II, ortho)
        var mfccs = melSpectrogram.map { frame in
            self.dct(frame, numCoeffs: NUM_MFCC)
        }

        // Pad or trim to MFCC_TIME_STEPS
        if mfccs.count < MFCC_TIME_STEPS {
            let padding = MFCC_TIME_STEPS - mfccs.count
            mfccs += Array(repeating: [Float32](repeating: 0, count: NUM_MFCC), count: padding)
        } else if mfccs.count > MFCC_TIME_STEPS {
            mfccs = Array(mfccs[0..<MFCC_TIME_STEPS])
        }

        // Return as array of arrays
        resolver(mfccs)
    }

    // Helper: Mel filterbank
    func melFilterbank(
        numMelBins: Int, numSpectrogramBins: Int, sampleRate: Int, lowerEdgeHz: Float,
        upperEdgeHz: Float
    ) -> [[Float32]] {
        func hzToMel(_ hz: Float) -> Float { 2595.0 * log10(1.0 + hz / 700.0) }
        func melToHz(_ mel: Float) -> Float { 700.0 * (pow(10.0, mel / 2595.0) - 1.0) }
        let lowerMel = hzToMel(lowerEdgeHz)
        let upperMel = hzToMel(upperEdgeHz)
        let melEdges = (0..<(numMelBins + 2)).map { i in
            lowerMel + (upperMel - lowerMel) * Float(i) / Float(numMelBins + 1)
        }
        let hzEdges = melEdges.map(melToHz)
        var fftBins = hzEdges.map { Int(floor((Float(FFT_LENGTH) + 1) * $0 / Float(sampleRate))) }
        fftBins = fftBins.map { min(max($0, 0), numSpectrogramBins - 1) }
        var filterbank = Array(
            repeating: [Float32](repeating: 0, count: numSpectrogramBins), count: numMelBins)
        for i in 0..<numMelBins {
            let start = fftBins[i]
            let center = fftBins[i + 1]
            let end = fftBins[i + 2]
            if start < center {
                for j in start..<center {
                    filterbank[i][j] = Float32(j - start) / Float32(center - start)
                }
            }
            if center < end {
                for j in center..<end {
                    filterbank[i][j] = Float32(end - j) / Float32(end - center)
                }
            }
        }
        return filterbank
    }

    // Helper: DCT-II (ortho)
    func dct(_ input: [Float32], numCoeffs: Int) -> [Float32] {
        var result = [Float32](repeating: 0, count: numCoeffs)
        let N = input.count
        for k in 0..<numCoeffs {
            var sum: Float32 = 0
            for n in 0..<N {
                sum += input[n] * cos(Float.pi * Float(k) * (Float(n) + 0.5) / Float(N))
            }
            result[k] = sum * sqrt(2.0 / Float(N))
        }
        return result
    }
}
