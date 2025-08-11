/**
 * Audio Utilities for Real-time Voice Applications
 *
 * This module provides:
 * - Memory management and cleanup utilities
 * - Audio format conversion and processing
 * - Error handling and recovery mechanisms
 * - Performance optimization helpers
 * - Browser compatibility utilities
 */

/**
 * Memory Manager for audio processing
 */
export class AudioMemoryManager {
  constructor() {
    this.allocatedBuffers = new Set();
    this.objectPool = new Map();
    this.memoryUsage = {
      currentBytes: 0,
      peakBytes: 0,
      allocations: 0,
      deallocations: 0,
    };

    // Setup memory monitoring
    this.startMemoryMonitoring();
  }

  /**
   * Allocate a typed array buffer with tracking
   */
  allocateBuffer(type, length, trackMemory = true) {
    let buffer;
    const poolKey = `${type.name}_${length}`;

    // Try to reuse from object pool
    if (
      this.objectPool.has(poolKey) &&
      this.objectPool.get(poolKey).length > 0
    ) {
      buffer = this.objectPool.get(poolKey).pop();
    } else {
      buffer = new type(length);
    }

    if (trackMemory) {
      this.allocatedBuffers.add(buffer);
      const bytes = buffer.byteLength;
      this.memoryUsage.currentBytes += bytes;
      this.memoryUsage.peakBytes = Math.max(
        this.memoryUsage.peakBytes,
        this.memoryUsage.currentBytes
      );
      this.memoryUsage.allocations++;
    }

    return buffer;
  }

  /**
   * Deallocate buffer and return to pool
   */
  deallocateBuffer(buffer, returnToPool = true) {
    if (!buffer || !this.allocatedBuffers.has(buffer)) return;

    this.allocatedBuffers.delete(buffer);
    this.memoryUsage.currentBytes -= buffer.byteLength;
    this.memoryUsage.deallocations++;

    if (returnToPool) {
      const type = buffer.constructor.name;
      const length = buffer.length;
      const poolKey = `${type}_${length}`;

      if (!this.objectPool.has(poolKey)) {
        this.objectPool.set(poolKey, []);
      }

      // Limit pool size to prevent memory leaks
      if (this.objectPool.get(poolKey).length < 10) {
        buffer.fill(0); // Clear data
        this.objectPool.get(poolKey).push(buffer);
      }
    }
  }

  /**
   * Force cleanup of all allocated buffers
   */
  forceCleanup() {
    this.allocatedBuffers.clear();
    this.objectPool.clear();
    this.memoryUsage.currentBytes = 0;

    // Force garbage collection if available
    if (window.gc && typeof window.gc === "function") {
      window.gc();
    }
  }

  /**
   * Start memory monitoring
   */
  startMemoryMonitoring() {
    // Monitor memory usage every 5 seconds
    this.memoryMonitorInterval = setInterval(() => {
      this.checkMemoryPressure();
    }, 5000);
  }

  /**
   * Check for memory pressure and cleanup if needed
   */
  checkMemoryPressure() {
    // Clean up object pools if they get too large
    for (const [key, pool] of this.objectPool.entries()) {
      if (pool.length > 20) {
        this.objectPool.set(key, pool.slice(0, 10));
      }
    }

    // Warn if memory usage is high
    const memoryLimitMB = 50; // 50MB limit for audio buffers
    const currentMB = this.memoryUsage.currentBytes / (1024 * 1024);

    if (currentMB > memoryLimitMB) {
      console.warn(`Audio memory usage high: ${currentMB.toFixed(2)}MB`);
      this.forceCleanup();
    }
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats() {
    return {
      ...this.memoryUsage,
      currentMB: this.memoryUsage.currentBytes / (1024 * 1024),
      peakMB: this.memoryUsage.peakBytes / (1024 * 1024),
      poolSizes: Object.fromEntries(
        Array.from(this.objectPool.entries()).map(([key, pool]) => [
          key,
          pool.length,
        ])
      ),
    };
  }

  /**
   * Destroy memory manager
   */
  destroy() {
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
    }

    this.forceCleanup();
  }
}

/**
 * Circuit Breaker for audio processing error handling
 */
export class AudioCircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.timeout = options.timeout || 30000; // 30 seconds
    this.monitoringPeriod = options.monitoringPeriod || 10000; // 10 seconds

    this.state = "CLOSED"; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;

    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      circuitOpenCount: 0,
    };
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute(fn, ...args) {
    this.stats.totalCalls++;

    if (this.state === "OPEN") {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error("Circuit breaker is OPEN");
      } else {
        this.state = "HALF_OPEN";
      }
    }

    try {
      const result = await fn(...args);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  onSuccess() {
    this.stats.successfulCalls++;
    this.failureCount = 0;
    this.state = "CLOSED";
  }

  /**
   * Handle failed execution
   */
  onFailure() {
    this.stats.failedCalls++;
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = "OPEN";
      this.nextAttemptTime = Date.now() + this.timeout;
      this.stats.circuitOpenCount++;
    }
  }

  /**
   * Get circuit breaker state and statistics
   */
  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      stats: this.stats,
      isHealthy:
        this.state === "CLOSED" &&
        this.failureCount < this.failureThreshold / 2,
    };
  }

  /**
   * Reset circuit breaker
   */
  reset() {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }
}

/**
 * Audio format conversion utilities
 */
export class AudioConverter {
  /**
   * Convert Float32 to Int16 PCM
   */
  static float32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);

    for (let i = 0; i < float32Array.length; i++) {
      // Clamp and convert
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = sample * 32767;
    }

    return int16Array;
  }

  /**
   * Convert Int16 PCM to Float32
   */
  static int16ToFloat32(int16Array) {
    const float32Array = new Float32Array(int16Array.length);

    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }

    return float32Array;
  }

  /**
   * Resample audio data
   */
  static resample(inputData, inputSampleRate, outputSampleRate) {
    if (inputSampleRate === outputSampleRate) {
      return inputData.slice(); // Return copy
    }

    const ratio = outputSampleRate / inputSampleRate;
    const outputLength = Math.round(inputData.length * ratio);
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const sourceIndex = i / ratio;
      const index0 = Math.floor(sourceIndex);
      const index1 = Math.min(index0 + 1, inputData.length - 1);
      const fraction = sourceIndex - index0;

      // Linear interpolation
      output[i] =
        inputData[index0] * (1 - fraction) + inputData[index1] * fraction;
    }

    return output;
  }

  /**
   * Apply gain to audio data
   */
  static applyGain(audioData, gain) {
    const output = new Float32Array(audioData.length);

    for (let i = 0; i < audioData.length; i++) {
      output[i] = Math.max(-1, Math.min(1, audioData[i] * gain));
    }

    return output;
  }

  /**
   * Mix two audio streams
   */
  static mixAudio(audio1, audio2, balance = 0.5) {
    const length = Math.max(audio1.length, audio2.length);
    const output = new Float32Array(length);

    for (let i = 0; i < length; i++) {
      const sample1 = i < audio1.length ? audio1[i] : 0;
      const sample2 = i < audio2.length ? audio2[i] : 0;
      output[i] = sample1 * (1 - balance) + sample2 * balance;
    }

    return output;
  }
}

/**
 * Browser compatibility utilities
 */
export class BrowserCompatibility {
  /**
   * Check AudioWorklet support
   */
  static supportsAudioWorklet() {
    return (
      typeof AudioWorkletNode !== "undefined" &&
      typeof AudioContext !== "undefined" &&
      AudioContext.prototype.audioWorklet !== undefined
    );
  }

  /**
   * Check WebAudio API support
   */
  static supportsWebAudio() {
    return (
      typeof AudioContext !== "undefined" ||
      typeof webkitAudioContext !== "undefined"
    );
  }

  /**
   * Check getUserMedia support
   */
  static supportsGetUserMedia() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /**
   * Get audio context constructor
   */
  static getAudioContext() {
    return window.AudioContext || window.webkitAudioContext;
  }

  /**
   * Check mobile device
   */
  static isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  }

  /**
   * Check iOS device
   */
  static isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  /**
   * Get optimal buffer size for device
   */
  static getOptimalBufferSize() {
    if (this.isMobile()) {
      return this.isIOS() ? 2048 : 4096; // iOS prefers smaller buffers
    }
    return 2048; // Desktop optimal
  }

  /**
   * Get comprehensive compatibility report
   */
  static getCompatibilityReport() {
    return {
      supportsAudioWorklet: this.supportsAudioWorklet(),
      supportsWebAudio: this.supportsWebAudio(),
      supportsGetUserMedia: this.supportsGetUserMedia(),
      isMobile: this.isMobile(),
      isIOS: this.isIOS(),
      optimalBufferSize: this.getOptimalBufferSize(),
      userAgent: navigator.userAgent,
      platform: navigator.platform,
    };
  }
}

/**
 * Performance monitoring utilities
 */
export class AudioPerformanceMonitor {
  constructor() {
    this.metrics = {
      renderTime: [],
      cpuUsage: [],
      memoryUsage: [],
      glitches: 0,
      dropouts: 0,
    };

    this.isMonitoring = false;
    this.startTime = Date.now();
  }

  /**
   * Start performance monitoring
   */
  startMonitoring() {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.startTime = Date.now();

    // Monitor render performance
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, 1000);
  }

  /**
   * Stop performance monitoring
   */
  stopMonitoring() {
    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
  }

  /**
   * Collect performance metrics
   */
  collectMetrics() {
    // Memory usage (if available)
    if (performance.memory) {
      this.metrics.memoryUsage.push({
        timestamp: Date.now(),
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
      });
    }

    // Keep only recent metrics
    if (this.metrics.memoryUsage.length > 60) {
      this.metrics.memoryUsage = this.metrics.memoryUsage.slice(-60);
    }
  }

  /**
   * Record audio processing time
   */
  recordProcessingTime(startTime, endTime) {
    const renderTime = endTime - startTime;
    this.metrics.renderTime.push(renderTime);

    // Detect glitches (processing time > 5ms)
    if (renderTime > 5) {
      this.metrics.glitches++;
    }

    // Keep only recent measurements
    if (this.metrics.renderTime.length > 100) {
      this.metrics.renderTime = this.metrics.renderTime.slice(-100);
    }
  }

  /**
   * Record audio dropout
   */
  recordDropout() {
    this.metrics.dropouts++;
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    const avgRenderTime =
      this.metrics.renderTime.length > 0
        ? this.metrics.renderTime.reduce((sum, time) => sum + time, 0) /
          this.metrics.renderTime.length
        : 0;

    const maxRenderTime =
      this.metrics.renderTime.length > 0
        ? Math.max(...this.metrics.renderTime)
        : 0;

    return {
      uptime: Date.now() - this.startTime,
      avgRenderTime,
      maxRenderTime,
      glitches: this.metrics.glitches,
      dropouts: this.metrics.dropouts,
      isPerformant: avgRenderTime < 2 && this.metrics.glitches < 10,
      memoryTrend: this.getMemoryTrend(),
    };
  }

  /**
   * Get memory usage trend
   */
  getMemoryTrend() {
    if (this.metrics.memoryUsage.length < 2) return "stable";

    const recent = this.metrics.memoryUsage.slice(-10);
    const firstUsage = recent[0].used;
    const lastUsage = recent[recent.length - 1].used;
    const change = (lastUsage - firstUsage) / firstUsage;

    if (change > 0.1) return "increasing";
    if (change < -0.1) return "decreasing";
    return "stable";
  }
}

/**
 * Audio error recovery utilities
 */
export class AudioErrorRecovery {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.onRecovery = options.onRecovery || (() => {});
    this.onFailure = options.onFailure || (() => {});

    this.retryCount = 0;
    this.isRecovering = false;
  }

  /**
   * Attempt to recover from audio error
   */
  async attemptRecovery(recoveryFunction, context = "audio") {
    if (this.isRecovering) {
      return false;
    }

    this.isRecovering = true;

    try {
      for (let attempt = 0; attempt < this.maxRetries; attempt++) {
        try {
          await recoveryFunction();
          this.retryCount = 0;
          this.isRecovering = false;
          this.onRecovery({ context, attempt: attempt + 1 });
          return true;
        } catch (error) {
          console.warn(
            `Recovery attempt ${attempt + 1} failed for ${context}:`,
            error
          );

          if (attempt < this.maxRetries - 1) {
            await new Promise((resolve) =>
              setTimeout(resolve, this.retryDelay * (attempt + 1))
            );
          }
        }
      }

      // All attempts failed
      this.isRecovering = false;
      this.onFailure({ context, attempts: this.maxRetries });
      return false;
    } catch (error) {
      this.isRecovering = false;
      this.onFailure({ context, error });
      return false;
    }
  }

  /**
   * Reset recovery state
   */
  reset() {
    this.retryCount = 0;
    this.isRecovering = false;
  }
}

/**
 * Utility functions
 */
export const AudioUtils = {
  /**
   * Calculate RMS (Root Mean Square) of audio data
   */
  calculateRMS(audioData) {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    return Math.sqrt(sum / audioData.length);
  },

  /**
   * Detect silence in audio data
   */
  detectSilence(audioData, threshold = 0.01) {
    const rms = this.calculateRMS(audioData);
    return rms < threshold;
  },

  /**
   * Apply fade in/out to audio data
   */
  applyFade(audioData, fadeInSamples = 0, fadeOutSamples = 0) {
    const output = audioData.slice();

    // Fade in
    for (let i = 0; i < Math.min(fadeInSamples, output.length); i++) {
      const gain = i / fadeInSamples;
      output[i] *= gain;
    }

    // Fade out
    const startFadeOut = output.length - fadeOutSamples;
    for (let i = startFadeOut; i < output.length; i++) {
      const gain = (output.length - i) / fadeOutSamples;
      output[i] *= gain;
    }

    return output;
  },

  /**
   * Generate test tone
   */
  generateTestTone(frequency, duration, sampleRate) {
    const samples = Math.floor(duration * sampleRate);
    const output = new Float32Array(samples);

    for (let i = 0; i < samples; i++) {
      output[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.1;
    }

    return output;
  },

  /**
   * Interleave audio channels
   */
  interleaveChannels(channels) {
    const length = channels[0].length;
    const output = new Float32Array(length * channels.length);

    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < channels.length; channel++) {
        output[i * channels.length + channel] = channels[channel][i];
      }
    }

    return output;
  },
};

// Create singleton instances for global use
export const memoryManager = new AudioMemoryManager();
export const performanceMonitor = new AudioPerformanceMonitor();

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  memoryManager.destroy();
  performanceMonitor.stopMonitoring();
});

export default {
  AudioMemoryManager,
  AudioCircuitBreaker,
  AudioConverter,
  BrowserCompatibility,
  AudioPerformanceMonitor,
  AudioErrorRecovery,
  AudioUtils,
  memoryManager,
  performanceMonitor,
};

// Helper function to wrap raw PCM data in a WAV header
export const createWavFile = (pcmData) => {
  try {
    const numChannels = 1;
    const sampleRate = 24000; // Corresponds to OUTPUT_SAMPLE_RATE
    const bitsPerSample = 16;

    // Validate input data
    if (!pcmData || pcmData.byteLength === 0) {
      console.error("createWavFile: Invalid or empty PCM data");
      return null;
    }

    // Ensure PCM data length is even (16-bit samples)
    const pcmDataLength = pcmData.byteLength;
    if (pcmDataLength % 2 !== 0) {
      console.warn(
        "createWavFile: PCM data length is odd, truncating last byte"
      );
    }

    const headerLength = 44;
    const wavFileLength = pcmDataLength + headerLength;
    const buffer = new ArrayBuffer(wavFileLength);
    const view = new DataView(buffer);

    const writeString = (view, offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    // RIFF chunk descriptor
    writeString(view, 0, "RIFF");
    view.setUint32(4, wavFileLength - 8, true); // ChunkSize
    writeString(view, 8, "WAVE");

    // fmt sub-chunk
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true); // NumChannels
    view.setUint32(24, sampleRate, true); // SampleRate
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    view.setUint32(28, byteRate, true); // ByteRate
    const blockAlign = numChannels * (bitsPerSample / 8);
    view.setUint16(32, blockAlign, true); // BlockAlign
    view.setUint16(34, bitsPerSample, true); // BitsPerSample

    // data sub-chunk
    writeString(view, 36, "data");
    view.setUint32(40, pcmDataLength, true); // Subchunk2Size

    // Copy PCM data
    const pcmBytes = new Uint8Array(pcmData);
    const wavBytes = new Uint8Array(buffer);
    wavBytes.set(pcmBytes, headerLength);

    return buffer;
  } catch (error) {
    console.error("createWavFile: Error creating WAV file:", error);
    return null;
  }
};

// Validate audio system health and recovery capability
export const validateAudioSystemRecovery = (addLogEntry) => {
  const issues = [];

  // Check WebRTC support
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    issues.push("WebRTC getUserMedia not supported");
  }

  // Check AudioContext support
  if (!window.AudioContext && !window.webkitAudioContext) {
    issues.push("AudioContext not supported");
  }

  // Check WebSocket support
  if (!window.WebSocket) {
    issues.push("WebSocket not supported");
  }

  if (issues.length > 0) {
    addLogEntry(
      "error",
      `Audio system validation failed: ${issues.join(", ")}`
    );
    return false;
  }

  addLogEntry("audio", "Audio system recovery validation passed");
  return true;
};
