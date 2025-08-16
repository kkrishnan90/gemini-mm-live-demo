// /frontend/src/worklets/denoiser.worklet.js

// The package only exports a factory function.
import { createRNNWasmModuleSync } from '@jitsi/rnnoise-wasm';

// We must create the module first to get access to the class and constants.
const rnnoiseModule = createRNNWasmModuleSync();
const { RNNoise, RNNOISE_SAMPLE_LENGTH } = rnnoiseModule;

/**
 * This class is the core of our AudioWorklet.
 * It is registered as a processor and handles the audio buffering and processing.
 */
class DenoiserWorkletProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        
        // Now we can create an instance of the RNNoise processor.
        this._rnnoise = new RNNoise();
        
        this._inputBuffer = new Float32Array(RNNOISE_SAMPLE_LENGTH);
        this._inputBufferPos = 0;
        this._outputBuffer = new Float32Array(RNNOISE_SAMPLE_LENGTH);
        this._outputBufferPos = RNNOISE_SAMPLE_LENGTH; // Start as "empty"

        this.port.postMessage({ ready: true });
        console.log("Denoiser worklet (final fix) initialized successfully.");
    }

    process(inputs, outputs) {
        const inputChannel = inputs[0][0];
        const outputChannel = outputs[0][0];

        if (!inputChannel || !outputChannel) {
            return true;
        }

        // Buffering and processing logic remains the same.
        let inputPos = 0;
        while (inputPos < inputChannel.length) {
            const bufferSpace = RNNOISE_SAMPLE_LENGTH - this._inputBufferPos;
            const copyCount = Math.min(bufferSpace, inputChannel.length - inputPos);
            
            this._inputBuffer.set(inputChannel.subarray(inputPos, inputPos + copyCount), this._inputBufferPos);
            this._inputBufferPos += copyCount;
            inputPos += copyCount;

            if (this._inputBufferPos === RNNOISE_SAMPLE_LENGTH) {
                this._rnnoise.process(this._inputBuffer);
                this._outputBuffer.set(this._inputBuffer);
                this._inputBufferPos = 0;
                this._outputBufferPos = 0;
            }
        }

        let outputPos = 0;
        while (outputPos < outputChannel.length) {
            if (this._outputBufferPos < RNNOISE_SAMPLE_LENGTH) {
                const bufferRemaining = RNNOISE_SAMPLE_LENGTH - this._outputBufferPos;
                const copyCount = Math.min(bufferRemaining, outputChannel.length - outputPos);
                outputChannel.set(this._outputBuffer.subarray(this._outputBufferPos, this._outputBufferPos + copyCount), outputPos);
                outputPos += copyCount;
                this._outputBufferPos += copyCount;
            } else {
                outputChannel.fill(0, outputPos, outputChannel.length - outputPos);
                break; 
            }
        }
        return true;
    }
}

try {
    registerProcessor('denoiser-worklet-processor', DenoiserWorkletProcessor);
} catch (error) {
    console.error("Failed to register DenoiserWorkletProcessor:", error);
}
