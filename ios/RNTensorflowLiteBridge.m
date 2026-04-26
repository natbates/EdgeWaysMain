#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE (RNTensorflowLite, NSObject)
RCT_EXTERN_METHOD(loadModel : (NSString *)modelName resolver : (
    RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(runModelOnTensor : (NSArray<NSNumber *> *)input inputShape : (
    NSArray<NSNumber *> *)inputShape resolver : (RCTPromiseResolveBlock)
                      resolve rejecter : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getInputTensorShape : (RCTPromiseResolveBlock)
                      resolve rejecter : (RCTPromiseRejectBlock)reject)
@end

@interface RCT_EXTERN_MODULE (RNMFCC, NSObject)
RCT_EXTERN_METHOD(extractMFCCFromWaveform : (NSArray<NSNumber *> *)
                      waveform resolver : (RCTPromiseResolveBlock)
                          resolve rejecter : (RCTPromiseRejectBlock)reject)
@end
