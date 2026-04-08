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

            let inputTensorBeforeInvoke = try interpreter.input(at: 0)
            let expectedInputCount = inputTensorBeforeInvoke.shape.dimensions.reduce(1, *)
            let actualInputCount = floatArray.count
            print(
                "[TFLITE] Input tensor info: shape=\(inputTensorBeforeInvoke.shape), type=\(inputTensorBeforeInvoke.dataType), expectedCount=\(expectedInputCount), actualCount=\(actualInputCount)"
            )

            if expectedInputCount != actualInputCount {
                print(
                    "[TFLITE] WARNING: input count mismatch (expected \(expectedInputCount) but got \(actualInputCount))"
                )
            }

            try interpreter.copy(inputData, toInputAt: 0)
            try interpreter.invoke()

            let inputTensor = try interpreter.input(at: 0)
            print(
                "[TFLITE] After invoke input tensor shape=\(inputTensor.shape), type=\(inputTensor.dataType)"
            )

            let outputTensorBefore = try interpreter.output(at: 0)
            print(
                "[TFLITE] Output tensor shape=\(outputTensorBefore.shape) type=\(outputTensorBefore.dataType)"
            )
            let outputTensor = outputTensorBefore
            let outputData = outputTensor.data
            let outputArray = outputData.withUnsafeBytes {
                Array(
                    UnsafeBufferPointer<Float32>(
                        start: $0.baseAddress!.assumingMemoryBound(to: Float32.self),
                        count: outputData.count / MemoryLayout<Float32>.size))
            }
            print("[TFLITE] Inference output count=\(outputArray.count)")
            resolver(outputArray)
        } catch let tfliteError as NSError {
            print(
                "[TFLITE] Inference error (NSError): domain=\(tfliteError.domain) code=\(tfliteError.code) desc=\(tfliteError.localizedDescription)"
            )
            print("[TFLITE] Inference error userInfo=\(tfliteError.userInfo)")
            rejecter(
                "INFER_ERROR",
                "Failed to run inference: \(tfliteError.localizedDescription) (code \(tfliteError.code))",
                tfliteError)
        } catch {
            print("[TFLITE] Inference error: \(error)")
            rejecter("INFER_ERROR", "Failed to run inference", error)
        }
    }
}
