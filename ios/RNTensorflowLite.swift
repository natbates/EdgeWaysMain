import Foundation
import React
import TensorFlowLite

@objc(RNTensorflowLite)
class RNTensorflowLite: NSObject {

    private var interpreter: Interpreter?

    @objc
    func loadModel(
        _ modelName: String, resolver: @escaping RCTPromiseResolveBlock,
        rejecter: @escaping RCTPromiseRejectBlock
    ) {
        do {
            guard let modelPath = Bundle.main.path(forResource: modelName, ofType: "tflite") else {
                rejecter("NO_MODEL", "Model file not found", nil)
                return
            }
            interpreter = try Interpreter(modelPath: modelPath)
            try interpreter?.allocateTensors()
            resolver(true)
        } catch {
            rejecter("LOAD_ERROR", "Failed to load model", error)
        }
    }

    @objc
    func runModelOnTensor(
        _ input: [NSNumber], inputShape: [NSNumber], resolver: @escaping RCTPromiseResolveBlock,
        rejecter: @escaping RCTPromiseRejectBlock
    ) {
        guard let interpreter = interpreter else {
            rejecter("NO_MODEL", "Model not loaded", nil)
            return
        }
        do {
            let floatArray = input.map { Float32(truncating: $0) }
            let inputData = Data(
                buffer: UnsafeBufferPointer(start: floatArray, count: floatArray.count))
            try interpreter.copy(inputData, toInputAt: 0)
            try interpreter.invoke()
            let outputTensor = try interpreter.output(at: 0)
            let outputData = outputTensor.data
            let outputArray = outputData.withUnsafeBytes {
                Array(
                    UnsafeBufferPointer<Float32>(
                        start: $0.baseAddress!.assumingMemoryBound(to: Float32.self),
                        count: outputData.count / MemoryLayout<Float32>.size))
            }
            resolver(outputArray)
        } catch {
            rejecter("INFER_ERROR", "Failed to run inference", error)
        }
    }
}
