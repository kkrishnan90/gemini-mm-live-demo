/**
 * ScriptProcessorNode Fallback for Older Browsers
 *
 * This module provides a compatibility layer for browsers that don't support AudioWorklet.
 * It uses the deprecated ScriptProcessorNode but provides the same interface as the enhanced
 * AudioWorklet processor.
 */

import { AudioConverter, AudioUtils, memoryManager } from "./audioUtils.js";
import { debugLog, debugWarn, debugError } from "../config/debug";

/**
 * ScriptProcessor-based Audio Processor
 * Mimics the AudioWorklet interface for compatibility
 */
export class ScriptProcessorFallback {
  constructor(audioContext, options = {}) {
    this.audioContext = audioContext;
    this.options = {
      bufferSize: options.bufferSize || 4096,
      inputChannels: options.inputChannels || 1,
      outputChannels: options.outputChannels || 1,
      sampleRate: options.sampleRate || 16000,
      ...options,
    };

    // Create ScriptProcessorNode
    this.scriptNode = this.audioContext.createScriptProcessor(
      this.options.bufferSize,
      this.options.inputChannels,
      this.options.outputChannels
    );

    // Audio processing state
    this.isRecording = true;
    this.isMuted = false;
    this.isSystemPlaying = false;

    // Buffer management using memory manager
    this.inputBuffer = memoryManager.allocateBuffer(
      Float32Array,
      this.options.bufferSize * 4
    );
    this.inputBufferIndex = 0;

    // VAD configuration
    this.vadConfig = {
      enabled: true, // Can be disabled when Gemini native VAD is used
      threshold: 0.04,
      minSpeechFrames: 3,
      minSilenceFrames: 10,
      energyHistory: [],
    };

    this.vadState = {
      isSpeechActive: false,
      speechFrameCount: 0,
      silenceFrameCount: 0,
    };

    // Performance tracking
    this.performance = {
      processingTimes: [],
      glitches: 0,
      totalFrames: 0,
      lastProcessTime: 0,
    };

    // Error handling
    this.errorCount = 0;
    this.maxErrors = 10;
    this.isHealthy = true;

    // Event handlers
    this.eventHandlers = new Map();

    // Initialize VAD configuration if enableVAD is specified
    if (options.enableVAD !== undefined) {
      this.vadConfig.enabled = options.enableVAD;
    }

    // Setup audio processing
    this.setupAudioProcessing();

    // Cleanup on context close
    this.cleanupHandlers = [];
    this.setupCleanup();
  }

  /**
   * Setup audio processing callback
   */
  setupAudioProcessing() {
    this.scriptNode.onaudioprocess = (event) => {
      const startTime = performance.now();

      try {
        this.performance.totalFrames++;

        if (!this.isRecording || this.isMuted || !this.isHealthy) {
          return;
        }

        const inputBuffer = event.inputBuffer;
        const inputData = inputBuffer.getChannelData(0); // Mono input

        // Process audio
        this.processAudioData(inputData);

        // Track performance
        const processingTime = performance.now() - startTime;
        this.performance.processingTimes.push(processingTime);

        if (this.performance.processingTimes.length > 100) {
          this.performance.processingTimes =
            this.performance.processingTimes.slice(-100);
        }

        // Detect glitches
        if (processingTime > 10) {
          // Higher threshold for ScriptProcessor
          this.performance.glitches++;
        }

        // Send periodic metrics
        if (this.performance.totalFrames % 500 === 0) {
          this.emitEvent("metrics", this.getMetrics());
        }
      } catch (error) {
        this.handleError("audio_processing", error);
      }
    };
  }

  /**
   * Process audio data (similar to AudioWorklet process method)
   */
  processAudioData(inputData) {
    const inputTimestamp = Date.now();

    // Apply noise suppression
    const processedSamples = this.applyNoiseSuppression(inputData);

    // Voice activity detection (only if enabled)
    let vadResult = null;
    if (this.vadConfig.enabled) {
      vadResult = this.detectVoiceActivity(processedSamples);

      // Barge-in detection
      if (vadResult.isSpeechActive && this.isSystemPlaying) {
        this.emitEvent("bargeInDetected", {
          energy: vadResult.energy,
          threshold: vadResult.adaptiveThreshold,
          timestamp: inputTimestamp,
        });
      }
    }

    // Buffer the audio data
    this.bufferAudioData(processedSamples, inputTimestamp);
  }

  /**
   * Buffer audio data and send when ready
   */
  bufferAudioData(audioData, timestamp) {
    // Copy data to internal buffer
    const remainingSpace = this.inputBuffer.length - this.inputBufferIndex;
    const dataToCopy = Math.min(audioData.length, remainingSpace);

    for (let i = 0; i < dataToCopy; i++) {
      this.inputBuffer[this.inputBufferIndex + i] = audioData[i];
    }

    this.inputBufferIndex += dataToCopy;

    // Check if buffer is ready to send
    if (this.inputBufferIndex >= this.options.bufferSize) {
      const audioChunk = this.inputBuffer.subarray(0, this.inputBufferIndex);
      const int16PCM = AudioConverter.float32ToInt16(audioChunk);

      this.emitEvent("audioData", {
        audioData: int16PCM.buffer,
        sampleRate: this.options.sampleRate,
        channelCount: this.options.inputChannels,
        timestamp: timestamp,
      });

      // Reset buffer
      this.inputBufferIndex = 0;
    }

    // Handle overflow
    if (dataToCopy < audioData.length) {
      debugWarn("ScriptProcessor buffer overflow, dropping samples");
      this.performance.glitches++;
    }
  }

  /**
   * Voice activity detection (simplified version)
   */
  detectVoiceActivity(samples) {
    // Calculate RMS energy
    let energy = 0;
    for (let i = 0; i < samples.length; i++) {
      energy += samples[i] * samples[i];
    }
    energy = Math.sqrt(energy / samples.length);

    // Update energy history
    this.vadConfig.energyHistory.push(energy);
    if (this.vadConfig.energyHistory.length > 10) {
      this.vadConfig.energyHistory.shift();
    }

    // Simple threshold-based detection
    const hasActivity = energy > this.vadConfig.threshold;

    // State machine for speech detection
    if (hasActivity) {
      this.vadState.speechFrameCount++;
      this.vadState.silenceFrameCount = 0;

      if (this.vadState.speechFrameCount >= this.vadConfig.minSpeechFrames) {
        this.vadState.isSpeechActive = true;
      }
    } else {
      this.vadState.silenceFrameCount++;
      this.vadState.speechFrameCount = 0;

      if (this.vadState.silenceFrameCount >= this.vadConfig.minSilenceFrames) {
        this.vadState.isSpeechActive = false;
      }
    }

    return {
      hasActivity,
      energy,
      isSpeechActive: this.vadState.isSpeechActive,
      adaptiveThreshold: this.vadConfig.threshold,
    };
  }

  /**
   * Apply noise suppression
   */
  applyNoiseSuppression(samples) {
    const noiseFloor = 0.01;
    const processed = memoryManager.allocateBuffer(
      Float32Array,
      samples.length
    );

    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      if (Math.abs(sample) < noiseFloor) {
        processed[i] = 0;
      } else {
        processed[i] = sample;
      }
    }

    // Schedule cleanup of processed buffer
    setTimeout(() => {
      memoryManager.deallocateBuffer(processed);
    }, 100);

    return processed;
  }

  /**
   * Handle processing errors
   */
  handleError(context, error) {
    this.errorCount++;

    if (this.errorCount > this.maxErrors) {
      this.isHealthy = false;
      this.emitEvent("fatalError", {
        context,
        error: error.message,
        errorCount: this.errorCount,
      });
      return false;
    }

    this.emitEvent("error", {
      context,
      error: error.message,
      errorCount: this.errorCount,
    });

    return true;
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    const avgProcessingTime =
      this.performance.processingTimes.length > 0
        ? this.performance.processingTimes.reduce(
            (sum, time) => sum + time,
            0
          ) / this.performance.processingTimes.length
        : 0;

    return {
      performance: {
        ...this.performance,
        avgProcessingTime,
        isHealthy: this.isHealthy,
        errorCount: this.errorCount,
      },
      vad: {
        enabled: this.vadConfig.enabled,
        isSpeechActive: this.vadState.isSpeechActive,
        threshold: this.vadConfig.threshold,
      },
      config: this.options,
      timestamp: Date.now(),
    };
  }

  /**
   * Event handling
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  off(event, handler) {
    if (this.eventHandlers.has(event)) {
      const handlers = this.eventHandlers.get(event);
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  emitEvent(event, data) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event).forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          debugError(
            `Error in ScriptProcessor event handler for ${event}:`,
            error
          );
        }
      });
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config) {
    Object.assign(this.options, config);

    if (config.vadThreshold !== undefined) {
      this.vadConfig.threshold = config.vadThreshold;
    }
  }

  updateVADConfig(config) {
    Object.assign(this.vadConfig, config);
  }

  /**
   * Set recording state
   */
  setRecording(recording) {
    this.isRecording = recording;
    if (!recording) {
      this.inputBufferIndex = 0;
    }
  }

  /**
   * Start audio processing with media stream
   */
  async start(mediaStream) {
    if (!mediaStream) {
      throw new Error("Media stream is required to start audio processing");
    }

    // Create media stream source
    this.mediaStreamSource = this.audioContext.createMediaStreamSource(mediaStream);
    
    // Connect the audio graph: MediaStreamSource -> ScriptProcessor -> Destination
    this.connect(this.mediaStreamSource);
    
    // Set recording state
    this.setRecording(true);
    
    return this;
  }

  /**
   * Pause audio processing
   */
  pause() {
    this.setRecording(false);
    return this;
  }

  /**
   * Resume/unpause audio processing
   */
  unpause() {
    this.setRecording(true);
    return this;
  }

  /**
   * Stop audio processing
   */
  stop() {
    this.setRecording(false);
    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }
    return this;
  }

  /**
   * Set muted state
   */
  setMuted(muted) {
    this.isMuted = muted;
  }

  /**
   * Set system playing state
   */
  setSystemPlaying(playing) {
    this.isSystemPlaying = playing;
  }

  /**
   * Connect to audio source
   */
  connect(source) {
    if (source) {
      source.connect(this.scriptNode);
    }
    // Connect to destination only if not already connected
    try {
      this.scriptNode.connect(this.audioContext.destination);
    } catch (error) {
      // Already connected, ignore error
      if (!error.message.includes('already connected')) {
        debugWarn('ScriptProcessor connection warning:', error.message);
      }
    }
    return this;
  }

  /**
   * Disconnect from audio graph
   */
  disconnect() {
    this.scriptNode.disconnect();
    return this;
  }

  /**
   * Setup cleanup handlers
   */
  setupCleanup() {
    // Clean up when the audio context is closed
    const handleContextStateChange = () => {
      if (this.audioContext.state === "closed") {
        this.cleanup();
      }
    };

    this.audioContext.addEventListener("statechange", handleContextStateChange);
    this.cleanupHandlers.push(() => {
      this.audioContext.removeEventListener(
        "statechange",
        handleContextStateChange
      );
    });

    // Clean up on page unload
    const handleBeforeUnload = () => {
      this.cleanup();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    this.cleanupHandlers.push(() => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    });
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    // Stop and disconnect media stream source
    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }

    // Disconnect from audio graph
    this.disconnect();

    // Cleanup buffers
    if (this.inputBuffer) {
      memoryManager.deallocateBuffer(this.inputBuffer);
      this.inputBuffer = null;
    }

    // Clear event handlers
    this.eventHandlers.clear();

    // Run cleanup handlers
    this.cleanupHandlers.forEach((cleanup) => {
      try {
        cleanup();
      } catch (error) {
        debugError("Error during ScriptProcessor cleanup:", error);
      }
    });

    this.cleanupHandlers = [];

    // Mark as destroyed
    this.isHealthy = false;
  }

  /**
   * Destroy the processor
   */
  destroy() {
    this.cleanup();
  }
}

/**
 * Factory function to create audio processor with fallback
 */
export async function createAudioProcessor(audioContext, options = {}) {
  // Check if AudioWorklet is supported
  const supportsAudioWorklet =
    typeof AudioWorkletNode !== "undefined" &&
    audioContext.audioWorklet !== undefined;

  if (supportsAudioWorklet) {
    try {
      // Try to load enhanced AudioWorklet
      debugLog("Attempting to load enhanced AudioWorklet processor...");
      await audioContext.audioWorklet.addModule("/enhanced-audio-processor.js");
      debugLog("Enhanced AudioWorklet processor loaded successfully");

      const workletNode = new AudioWorkletNode(
        audioContext,
        "enhanced-audio-processor"
      );
      debugLog("AudioWorklet node created successfully");

      // Wrap AudioWorklet in a compatible interface
      return new AudioWorkletWrapper(workletNode, options);
    } catch (error) {
      debugWarn(
        "Failed to load AudioWorklet, falling back to ScriptProcessor:",
        error
      );
      debugWarn("Error details:", error.message);

      // Log specific error types for debugging
      if (error.name === "NotSupportedError") {
        debugWarn("AudioWorklet not supported in this context");
      } else if (error.name === "NetworkError") {
        debugWarn("Failed to fetch AudioWorklet module");
      } else if (error.name === "SyntaxError") {
        debugWarn("AudioWorklet module has syntax errors");
      }
    }
  } else {
    debugLog("AudioWorklet not supported in this browser");
  }

  // Fallback to ScriptProcessor
  debugLog("Using ScriptProcessor fallback for audio processing");
  return new ScriptProcessorFallback(audioContext, options);
}

/**
 * Wrapper for AudioWorkletNode to provide consistent interface
 */
class AudioWorkletWrapper {
  constructor(workletNode, options = {}) {
    this.workletNode = workletNode;
    this.options = options;

    // Event handlers
    this.eventHandlers = new Map();

    // Initialize VAD configuration if enableVAD is specified
    if (options.enableVAD !== undefined) {
      this.updateVADConfig({ enabled: options.enableVAD });
    }

    // Setup message handling
    this.workletNode.port.onmessage = (event) => {
      const { type, data } = event.data;

      switch (type) {
        case "AUDIO_DATA":
          this.emitEvent("audioData", data);
          break;

        case "BARGE_IN_DETECTED":
          this.emitEvent("bargeInDetected", data);
          break;

        case "METRICS":
          this.emitEvent("metrics", data);
          break;

        case "ERROR":
          this.emitEvent("error", data);
          break;

        case "FATAL_ERROR":
          this.emitEvent("fatalError", data);
          break;

        default:
          debugLog("AudioWorklet message:", type, data);
      }
    };
  }

  /**
   * Event handling (same as ScriptProcessor)
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  off(event, handler) {
    if (this.eventHandlers.has(event)) {
      const handlers = this.eventHandlers.get(event);
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  emitEvent(event, data) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event).forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          debugError(
            `Error in AudioWorklet event handler for ${event}:`,
            error
          );
        }
      });
    }
  }

  /**
   * Configuration methods
   */
  updateConfig(config) {
    this.workletNode.port.postMessage({
      type: "UPDATE_CONFIG",
      data: config,
    });
  }

  updateVADConfig(config) {
    this.workletNode.port.postMessage({
      type: "SET_VAD_CONFIG",
      data: config,
    });
  }

  setRecording(recording) {
    this.workletNode.port.postMessage({
      type: "SET_RECORDING",
      data: { recording },
    });
  }

  setMuted(muted) {
    this.workletNode.port.postMessage({
      type: "SET_MUTED",
      data: { muted },
    });
  }

  setSystemPlaying(playing) {
    this.workletNode.port.postMessage({
      type: "SET_SYSTEM_PLAYING",
      data: { playing },
    });
  }

  /**
   * Start audio processing with media stream
   */
  async start(mediaStream) {
    if (!mediaStream) {
      throw new Error("Media stream is required to start audio processing");
    }

    // Create media stream source and connect to worklet
    this.mediaStreamSource = this.workletNode.context.createMediaStreamSource(mediaStream);
    this.mediaStreamSource.connect(this.workletNode);
    
    // Notify worklet to start processing
    this.workletNode.port.postMessage({
      type: "START_PROCESSING",
      data: { recording: true },
    });
    
    return this;
  }

  /**
   * Pause audio processing
   */
  pause() {
    this.setRecording(false);
    return this;
  }

  /**
   * Resume/unpause audio processing
   */
  unpause() {
    this.setRecording(true);
    return this;
  }

  /**
   * Stop audio processing
   */
  stop() {
    this.setRecording(false);
    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }
    this.workletNode.port.postMessage({
      type: "STOP_PROCESSING",
    });
    return this;
  }

  getMetrics() {
    this.workletNode.port.postMessage({
      type: "GET_METRICS",
    });
  }

  /**
   * Audio graph methods
   */
  connect(destination) {
    this.workletNode.connect(destination);
    return this;
  }

  disconnect() {
    this.workletNode.disconnect();
    return this;
  }

  /**
   * Cleanup
   */
  destroy() {
    // Stop and disconnect media stream source
    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }
    
    this.workletNode.disconnect();
    this.eventHandlers.clear();
  }
}

export default {
  ScriptProcessorFallback,
  createAudioProcessor,
  AudioWorkletWrapper,
};
