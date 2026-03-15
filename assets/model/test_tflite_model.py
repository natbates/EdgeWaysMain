import numpy as np
import tensorflow as tf

# Model and input requirements
MODEL_PATH = 'speaker_id_embedding_model.tflite'
NUM_FRAMES = 92
NUM_MFCC = 64

# Generate random MFCC input (float32)
fake_mfcc = np.random.rand(NUM_FRAMES, NUM_MFCC).astype(np.float32)

# Load TFLite model
interpreter = tf.lite.Interpreter(model_path=MODEL_PATH)
interpreter.allocate_tensors()

# Get input and output details
input_details = interpreter.get_input_details()
output_details = interpreter.get_output_details()

# Check input shape
expected_shape = (1, NUM_FRAMES, NUM_MFCC)
if tuple(input_details[0]['shape']) != expected_shape:
    print(f"Warning: Model expects input shape {input_details[0]['shape']}, but requirements specify {expected_shape}")

# Add batch dimension
input_data = np.expand_dims(fake_mfcc, axis=(0, 3))
# Run inference
interpreter.set_tensor(input_details[0]['index'], input_data)
interpreter.invoke()
output_data = interpreter.get_tensor(output_details[0]['index'])

print("Output embedding shape:", output_data.shape)
print("Output embedding (first 5 values):", output_data.flatten()[:5])
