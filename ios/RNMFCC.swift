import Accelerate
import Foundation
import React

struct MFCCConstants: Codable {
    let window: [Float]
    let mel_filterbank: [[Float]]
}

func loadMFCCConstants() -> MFCCConstants? {
    guard let url = Bundle.main.url(forResource: "mfcc_constants", withExtension: "json") else {
        print("Could not find mfcc_constants.json in bundle")
        return nil
    }
    do {
        let data = try Data(contentsOf: url)
        let decoder = JSONDecoder()
        return try decoder.decode(MFCCConstants.self, from: data)
    } catch {
        print("Failed to load or decode mfcc_constants.json: \(error)")
        return nil
    }
}

@objc(RNMFCC)
class RNMFCC: NSObject {
    let mfccConstants: MFCCConstants? = loadMFCCConstants()
    // Constants (must match Python config)
    let FRAME_LENGTH = 512
    let FRAME_STEP = 160
    let FFT_LENGTH = 1024
    let NUM_MFCC = 40
    let MFCC_TIME_STEPS = 200

    @objc
    func extractMFCCFromWaveform(
        _ waveform: [NSNumber], resolver: @escaping RCTPromiseResolveBlock,
        rejecter: @escaping RCTPromiseRejectBlock
    ) {
        // --- 1. Cast waveform to float32 and preserve its length ---
        var signal = waveform.map { Float32(truncating: $0) }

        // --- 2. Pre-emphasis ---
        let preEmphasis: Float32 = 0.97
        var emphasized = [Float32](repeating: 0, count: signal.count)
        emphasized[0] = signal[0]
        for i in 1..<signal.count {
            emphasized[i] = signal[i] - preEmphasis * signal[i - 1]
        }

        // --- 3. Framing ---
        let numFrames = 1 + Int(ceil(Double(signal.count - FRAME_LENGTH) / Double(FRAME_STEP)))
        let padLength = (numFrames - 1) * FRAME_STEP + FRAME_LENGTH
        if emphasized.count < padLength {
            emphasized += [Float32](repeating: 0, count: padLength - emphasized.count)
        }
        var frames = [[Float32]]()
        for i in 0..<numFrames {
            let start = i * FRAME_STEP
            frames.append(Array(emphasized[start..<(start + FRAME_LENGTH)]))
        }

        // --- 4. Use precomputed Hann window from JSON ---
        guard let windowF = mfccConstants?.window, windowF.count == FRAME_LENGTH else {
            rejecter("MFCC_CONSTANTS_ERROR", "Window not loaded or wrong size", nil)
            return
        }
        let window = windowF.map { Float32($0) }
        for i in 0..<frames.count {
            vDSP_vmul(frames[i], 1, window, 1, &frames[i], 1, vDSP_Length(FRAME_LENGTH))
        }

        // --- 5. FFT magnitude ---
        // vDSP_DFT_zop: out-of-place DFT with separate real/imag input & output.
        // Input imag is all zeros (real signal). No scaling correction needed —
        // vDSP_DFT_zop magnitudes match np.fft.rfft directly.
        let numSpecBins = FFT_LENGTH / 2 + 1
        guard
            let dftSetup = vDSP_DFT_zop_CreateSetup(
                nil, vDSP_Length(FFT_LENGTH), .FORWARD
            )
        else {
            rejecter("DFT_SETUP_ERROR", "Failed to create DFT setup", nil)
            return
        }

        // Pre-allocate all FFT buffers at FFT_LENGTH to guarantee correct size.
        // Using array concatenation (frame + zeros) is avoided because Swift may
        // not always produce an array of exactly FFT_LENGTH elements in-place,
        // which causes vDSP_DFT_Execute to read out-of-bounds for high-freq bins.
        var inReal = [Float32](repeating: 0, count: FFT_LENGTH)
        var inImag = [Float32](repeating: 0, count: FFT_LENGTH)  // always zero (real signal)
        var outReal = [Float32](repeating: 0, count: FFT_LENGTH)
        var outImag = [Float32](repeating: 0, count: FFT_LENGTH)

        var magnitudeFrames = [[Float32]]()
        var debug: [String: Any] = [
            "windowed_frame": frames[0].map { Double($0) },
            "window": window.map { Double($0) },
        ]

        for (idx, frame) in frames.enumerated() {
            // Copy windowed frame into the first FRAME_LENGTH elements of inReal.
            // Elements FRAME_LENGTH..<FFT_LENGTH remain zero (zero-padding).
            for i in 0..<FRAME_LENGTH { inReal[i] = frame[i] }
            for i in FRAME_LENGTH..<FFT_LENGTH { inReal[i] = 0 }

            vDSP_DFT_Execute(dftSetup, inReal, inImag, &outReal, &outImag)

            // Magnitude for bins 0..FFT_LENGTH/2 only (matches np.fft.rfft output range)
            var mags = [Float32](repeating: 0, count: numSpecBins)
            for i in 0..<numSpecBins {
                mags[i] = sqrt(outReal[i] * outReal[i] + outImag[i] * outImag[i])
            }

            if idx == 0 { debug["fft_magnitude"] = mags.map { Double($0) } }
            magnitudeFrames.append(mags)
        }

        vDSP_DFT_DestroySetup(dftSetup)

        // --- 6. Use precomputed mel filterbank from JSON ---
        guard let melFilterbankF = mfccConstants?.mel_filterbank, melFilterbankF.count == NUM_MFCC,
            melFilterbankF.first?.count == numSpecBins
        else {
            rejecter("MFCC_CONSTANTS_ERROR", "Mel filterbank not loaded or wrong size", nil)
            return
        }
        // Convert [[Float]] to [[Float32]]
        let melFilterbank: [[Float32]] = melFilterbankF.map { $0.map { Float32($0) } }

        var melSpectrogram = [[Float32]]()
        for (idx, frame) in magnitudeFrames.enumerated() {
            var melFrame = [Float32](repeating: 0, count: NUM_MFCC)
            for m in 0..<NUM_MFCC {
                vDSP_dotpr(frame, 1, melFilterbank[m], 1, &melFrame[m], vDSP_Length(frame.count))
            }
            if idx == 0 { debug["mel_spectrum"] = melFrame.map { Double($0) } }
            melSpectrogram.append(melFrame)
        }

        // --- 7. Log mel ---
        for i in 0..<melSpectrogram.count {
            melSpectrogram[i] = melSpectrogram[i].map { log($0 + 1e-6) }
            if i == 0 { debug["log_mel_spectrum"] = melSpectrogram[i].map { Double($0) } }
        }

        // --- 8. DCT-II ortho ---
        // Matches scipy.fftpack.dct(x, type=2, norm='ortho') to float32 precision.
        var mfccs = melSpectrogram.map { self.dct($0, numCoeffs: NUM_MFCC) }
        if mfccs.count > 0 { debug["mfcc"] = mfccs[0].map { Double($0) } }

        // --- 9. Pad or trim to MFCC_TIME_STEPS ---
        if mfccs.count < MFCC_TIME_STEPS {
            mfccs += Array(
                repeating: [Float32](repeating: 0, count: NUM_MFCC),
                count: MFCC_TIME_STEPS - mfccs.count
            )
        } else if mfccs.count > MFCC_TIME_STEPS {
            mfccs = Array(mfccs[0..<MFCC_TIME_STEPS])
        }

        resolver(["mfccs": mfccs.flatMap { $0 }, "debug": debug])
    }

    // MARK: - Mel filterbank
    // MARK: - Mel filterbank
    // No longer needed: now loaded from JSON
}

// MARK: - DCT-II (ortho, Float32 only)
// Matches scipy.fftpack.dct(x, type=2, norm='ortho') to float32 precision.
extension RNMFCC {
    func dct(_ input: [Float32], numCoeffs: Int) -> [Float32] {
        let N = input.count
        var result = [Float32](repeating: 0, count: numCoeffs)
        for k in 0..<numCoeffs {
            var sum: Float32 = 0
            let kF = Float32(k)
            let NF = Float32(N)
            for n in 0..<N {
                let nF = Float32(n)
                sum += input[n] * cos(Float32.pi * kF * (nF + 0.5) / NF)
            }
            result[k] = sum * sqrt(2.0 / NF)
            if k == 0 {
                result[k] /= sqrt(2.0)
            }
        }
        return result
    }
}
