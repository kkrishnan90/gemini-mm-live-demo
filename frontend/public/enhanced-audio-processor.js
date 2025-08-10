/**
 * Enhanced AudioWorklet Processor for Real-time Audio Processing
 * 
 * Features:
 * - Adaptive ring buffer management
 * - Comprehensive memory management
 * - Buffer underrun/overrun detection and recovery
 * - Latency optimization with <20ms target
 * - Production-ready error handling
 * - Performance monitoring and metrics
 * - Mobile optimization
 */

/**
 * Adaptive Ring Buffer for AudioWorklet
 */
class WorkletRingBuffer {
  constructor(initialSize = 8192, maxSize = 32768, minSize = 1024) {
    this.maxSize = maxSize;
    this.minSize = minSize;
    this.currentSize = Math.max(initialSize, minSize);
    
    this.buffer = new Float32Array(this.currentSize);
    this.writeIndex = 0;
    this.readIndex = 0;
    this.count = 0;
    
    // Metrics
    this.metrics = {
      underruns: 0,
      overruns: 0,
      resizes: 0,
      totalWrites: 0,
      totalReads: 0
    };
    
    // Adaptive parameters
    this.adaptiveHistory = [];
    this.adaptiveWindowSize = 50;
  }
  
  getFillLevel() {
    return this.count / this.currentSize;
  }
  
  getAvailableSpace() {
    return this.currentSize - this.count;
  }
  
  write(data) {
    const dataLength = data.length;
    const availableSpace = this.getAvailableSpace();
    
    if (dataLength > availableSpace) {
      this.metrics.overruns++;
      
      // Try to expand buffer if possible
      if (this.currentSize < this.maxSize) {
        this.resize(Math.min(this.currentSize * 2, this.maxSize));
      } else {
        // Drop oldest data
        const dataToDrop = dataLength - availableSpace;
        this.read(new Float32Array(dataToDrop));
      }
    }
    
    // Write data
    let written = 0;
    for (let i = 0; i < dataLength && written < dataLength; i++) {
      this.buffer[this.writeIndex] = data[i];
      this.writeIndex = (this.writeIndex + 1) % this.currentSize;
      this.count = Math.min(this.count + 1, this.currentSize);
      written++;
    }
    
    this.metrics.totalWrites++;
    this.updateAdaptiveHistory('write', this.getFillLevel());
    
    return written;
  }
  
  read(output) {
    const requestedLength = output.length;
    const availableData = Math.min(this.count, requestedLength);
    
    if (availableData === 0) {
      this.metrics.underruns++;
      output.fill(0);
      return 0;
    }
    
    for (let i = 0; i < availableData; i++) {
      output[i] = this.buffer[this.readIndex];
      this.readIndex = (this.readIndex + 1) % this.currentSize;
    }
    
    if (availableData < requestedLength) {
      for (let i = availableData; i < requestedLength; i++) {
        output[i] = 0;
      }
    }
    
    this.count -= availableData;
    this.metrics.totalReads++;
    this.updateAdaptiveHistory('read', this.getFillLevel());
    
    return availableData;
  }
  
  resize(newSize) {
    newSize = Math.max(this.minSize, Math.min(newSize, this.maxSize));
    if (newSize === this.currentSize) return;
    
    const oldBuffer = this.buffer;
    const oldSize = this.currentSize;
    const dataToPreserve = Math.min(this.count, newSize);
    
    this.buffer = new Float32Array(newSize);
    this.currentSize = newSize;
    
    // Copy existing data
    if (dataToPreserve > 0) {
      if (this.readIndex + dataToPreserve <= oldSize) {
        this.buffer.set(oldBuffer.subarray(this.readIndex, this.readIndex + dataToPreserve));
      } else {
        const firstPart = oldSize - this.readIndex;
        const secondPart = dataToPreserve - firstPart;
        this.buffer.set(oldBuffer.subarray(this.readIndex, oldSize));
        this.buffer.set(oldBuffer.subarray(0, secondPart), firstPart);
      }
    }
    
    this.readIndex = 0;
    this.writeIndex = dataToPreserve;
    this.count = dataToPreserve;
    
    this.metrics.resizes++;
  }
  
  updateAdaptiveHistory(operation, fillLevel) {
    this.adaptiveHistory.push({
      operation,
      fillLevel,
      timestamp: Date.now()
    });
    
    if (this.adaptiveHistory.length > this.adaptiveWindowSize) {
      this.adaptiveHistory = this.adaptiveHistory.slice(-this.adaptiveWindowSize);
    }
  }
  
  shouldResize() {
    if (this.adaptiveHistory.length < this.adaptiveWindowSize) return null;
    
    const avgFillLevel = this.adaptiveHistory.reduce((sum, entry) => sum + entry.fillLevel, 0) / this.adaptiveHistory.length;
    
    if (avgFillLevel > 0.9 && this.currentSize < this.maxSize) {
      return 'expand';
    } else if (avgFillLevel < 0.1 && this.currentSize > this.minSize) {
      return 'shrink';
    }
    
    return null;
  }
  
  clear() {
    this.writeIndex = 0;
    this.readIndex = 0;
    this.count = 0;
    this.buffer.fill(0);
  }
  
  getMetrics() {
    return {
      ...this.metrics,
      currentSize: this.currentSize,
      fillLevel: this.getFillLevel(),
      count: this.count
    };
  }
}

/**
 * Enhanced AudioWorklet Processor
 */
class EnhancedAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    // Configuration
    this.config = {
      sampleRate: 16000,
      channelCount: 1,
      bufferSize: 4096,
      latencyTarget: 20, // ms
      enableAdaptive: true,
      enableMetrics: true
    };
    
    // Buffer management
    this.inputBuffer = new WorkletRingBuffer(
      this.config.bufferSize,
      this.config.bufferSize * 4,
      this.config.bufferSize / 4
    );
    
    this.outputBuffer = new WorkletRingBuffer(
      this.config.bufferSize / 2,
      this.config.bufferSize * 2,
      this.config.bufferSize / 8
    );
    
    // Audio processing state
    this.isRecording = true;
    this.isMuted = false;
    this.isSystemPlaying = false;
    
    // VAD and barge-in detection
    this.vadConfig = {
      threshold: 0.04,
      minSpeechFrames: 3,
      minSilenceFrames: 10,
      energyHistory: []
    };
    
    this.vadState = {
      isSpeechActive: false,
      speechFrameCount: 0,
      silenceFrameCount: 0
    };
    
    // Performance tracking
    this.performance = {
      processingTimes: [],
      glitches: 0,
      underruns: 0,
      overruns: 0,
      lastProcessTime: 0,
      totalFrames: 0
    };
    
    // Error handling
    this.errorCount = 0;
    this.maxErrors = 10;
    this.isHealthy = true;
    
    // Latency measurement
    this.latencyMeasurement = {
      inputTimestamp: 0,
      outputTimestamp: 0,
      measurements: []
    };
    
    // Mobile optimization
    this.isMobile = this.detectMobile();
    if (this.isMobile) {
      this.optimizeForMobile();
    }
    
    // Message handling
    this.port.onmessage = this.handleMessage.bind(this);
    
    // Initialize performance monitoring
    this.startPerformanceMonitoring();
  }
  
  /**
   * Detect mobile device
   */
  detectMobile() {
    // Simple mobile detection in AudioWorklet context
    // Note: navigator.userAgent might not be available in all AudioWorklet contexts
    try {
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    } catch (e) {
      return false;
    }
  }
  
  /**
   * Optimize for mobile devices
   */
  optimizeForMobile() {
    // Reduce buffer sizes for lower latency on mobile
    this.config.bufferSize = Math.max(this.config.bufferSize / 2, 1024);
    this.vadConfig.threshold *= 1.5; // Less sensitive VAD on mobile
    
    // Recreate buffers with optimized sizes
    this.inputBuffer = new WorkletRingBuffer(
      this.config.bufferSize,
      this.config.bufferSize * 2,
      this.config.bufferSize / 4
    );
  }
  
  /**
   * Start performance monitoring
   */
  startPerformanceMonitoring() {
    // Use a simple counter-based approach for timing in AudioWorklet
    this.performanceCounter = 0;
  }
  
  /**
   * Handle messages from main thread
   */
  handleMessage(event) {
    const { type, data } = event.data;
    
    try {
      switch (type) {
        case 'SET_RECORDING':
          this.isRecording = data.recording;
          if (!this.isRecording) {
            this.inputBuffer.clear();
          }
          break;
          
        case 'SET_MUTED':
          this.isMuted = data.muted;
          break;
          
        case 'SET_SYSTEM_PLAYING':
          this.isSystemPlaying = data.playing;
          break;
          
        case 'UPDATE_CONFIG':
          this.updateConfiguration(data);
          break;
          
        case 'GET_METRICS':
          this.sendMetrics();
          break;
          
        case 'RESET_BUFFERS':
          this.resetBuffers();
          break;
          
        case 'SET_VAD_CONFIG':
          this.updateVADConfig(data);
          break;
          
        default:
          console.warn('Unknown message type:', type);
      }
    } catch (error) {
      this.handleError('message_handling', error);
    }
  }
  
  /**
   * Update processor configuration
   */
  updateConfiguration(config) {
    if (config.bufferSize && config.bufferSize !== this.config.bufferSize) {
      this.config.bufferSize = config.bufferSize;
      this.inputBuffer.resize(config.bufferSize);
    }
    
    if (config.vadThreshold !== undefined) {
      this.vadConfig.threshold = config.vadThreshold;
    }
    
    if (config.enableAdaptive !== undefined) {
      this.config.enableAdaptive = config.enableAdaptive;
    }
  }
  
  /**
   * Update VAD configuration
   */
  updateVADConfig(config) {
    Object.assign(this.vadConfig, config);
  }
  
  /**
   * Reset all buffers
   */
  resetBuffers() {
    this.inputBuffer.clear();
    this.outputBuffer.clear();
    this.vadState.isSpeechActive = false;
    this.vadState.speechFrameCount = 0;
    this.vadState.silenceFrameCount = 0;
  }
  
  /**
   * Advanced VAD with energy-based detection
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
    
    // Dynamic threshold adaptation
    const avgEnergy = this.vadConfig.energyHistory.reduce((sum, e) => sum + e, 0) / this.vadConfig.energyHistory.length;
    const adaptiveThreshold = this.vadConfig.threshold + (avgEnergy * 0.1);
    
    const hasActivity = energy > adaptiveThreshold;
    
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
      adaptiveThreshold
    };
  }
  
  /**
   * Apply noise suppression
   */
  applyNoiseSuppression(samples) {
    const noiseFloor = 0.005; // Reduced noise floor for better quality
    const processed = new Float32Array(samples.length);
    
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      if (Math.abs(sample) < noiseFloor) {
        processed[i] = 0;
      } else {
        // Apply gentle compression to reduce noise
        const sign = sample >= 0 ? 1 : -1;
        const magnitude = Math.abs(sample);
        processed[i] = sign * Math.pow(magnitude, 0.8);
      }
    }
    
    return processed;
  }
  
  /**
   * Convert Float32 to Int16 with dithering
   */
  convertToInt16PCM(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    
    for (let i = 0; i < float32Array.length; i++) {
      // Add small amount of dither to reduce quantization noise
      const dither = (Math.random() - 0.5) * (1 / 32768);
      const sample = Math.max(-1, Math.min(1, float32Array[i] + dither));
      int16Array[i] = Math.round(sample * 32767);
    }
    
    return int16Array;
  }
  
  /**
   * Measure and optimize latency
   */
  measureLatency(inputTimestamp) {
    const currentTime = Date.now();
    const latency = currentTime - inputTimestamp;
    
    this.latencyMeasurement.measurements.push(latency);
    if (this.latencyMeasurement.measurements.length > 20) {
      this.latencyMeasurement.measurements = this.latencyMeasurement.measurements.slice(-20);
    }
    
    // Auto-optimize buffer size if latency is too high
    const avgLatency = this.latencyMeasurement.measurements.reduce((sum, l) => sum + l, 0) / this.latencyMeasurement.measurements.length;
    
    if (this.config.enableAdaptive && avgLatency > this.config.latencyTarget) {
      // Reduce buffer size to decrease latency
      const newSize = Math.max(this.inputBuffer.currentSize * 0.8, this.inputBuffer.minSize);
      this.inputBuffer.resize(newSize);
    }
    
    return latency;
  }
  
  /**
   * Handle processing errors
   */
  handleError(context, error) {
    this.errorCount++;
    
    if (this.errorCount > this.maxErrors) {
      this.isHealthy = false;
      this.port.postMessage({
        type: 'FATAL_ERROR',
        data: {
          context,
          error: error.message,
          errorCount: this.errorCount
        }
      });
      return false;
    }
    
    this.port.postMessage({
      type: 'ERROR',
      data: {
        context,
        error: error.message,
        errorCount: this.errorCount
      }
    });
    
    return true;
  }
  
  /**
   * Send comprehensive metrics
   */
  sendMetrics() {
    const inputMetrics = this.inputBuffer.getMetrics();
    const outputMetrics = this.outputBuffer.getMetrics();
    
    const avgProcessingTime = this.performance.processingTimes.length > 0
      ? this.performance.processingTimes.reduce((sum, time) => sum + time, 0) / this.performance.processingTimes.length
      : 0;
    
    const avgLatency = this.latencyMeasurement.measurements.length > 0
      ? this.latencyMeasurement.measurements.reduce((sum, lat) => sum + lat, 0) / this.latencyMeasurement.measurements.length
      : 0;
    
    this.port.postMessage({
      type: 'METRICS',
      data: {
        inputBuffer: inputMetrics,
        outputBuffer: outputMetrics,
        performance: {
          ...this.performance,
          avgProcessingTime,
          avgLatency,
          isHealthy: this.isHealthy,
          errorCount: this.errorCount
        },
        vad: {
          isSpeechActive: this.vadState.isSpeechActive,
          threshold: this.vadConfig.threshold
        },
        config: this.config,
        timestamp: Date.now()
      }
    });
  }
  
  /**
   * Main audio processing function
   */
  process(inputs, outputs, parameters) {
    const startTime = Date.now();
    
    try {
      this.performance.totalFrames++;
      
      // Check if we should continue processing
      if (!this.isRecording || this.isMuted || !this.isHealthy) {
        return true;
      }
      
      // Get input audio data
      const input = inputs[0];
      if (!input || !input[0]) {
        return true;
      }
      
      const inputSamples = input[0]; // Mono channel
      const inputTimestamp = Date.now();
      
      // Apply noise suppression
      const processedSamples = this.applyNoiseSuppression(inputSamples);
      
      // Voice activity detection
      const vadResult = this.detectVoiceActivity(processedSamples);
      
      // Barge-in detection
      if (vadResult.isSpeechActive && this.isSystemPlaying) {
        this.port.postMessage({
          type: 'BARGE_IN_DETECTED',
          data: {
            energy: vadResult.energy,
            threshold: vadResult.adaptiveThreshold,
            timestamp: inputTimestamp
          }
        });
      }
      
      // Buffer the audio samples
      this.inputBuffer.write(processedSamples);
      
      // Check if we have enough data to send
      const bufferFillLevel = this.inputBuffer.getFillLevel();
      if (bufferFillLevel >= 0.5 || this.inputBuffer.count >= this.config.bufferSize) {
        const audioChunk = new Float32Array(this.config.bufferSize);
        const samplesRead = this.inputBuffer.read(audioChunk);
        
        if (samplesRead > 0) {
          const int16PCM = this.convertToInt16PCM(audioChunk.subarray(0, samplesRead));
          
          // Measure latency
          const latency = this.measureLatency(inputTimestamp);
          
          this.port.postMessage({
            type: 'AUDIO_DATA',
            data: {
              audioData: int16PCM.buffer,
              sampleRate: this.config.sampleRate,
              channelCount: this.config.channelCount,
              hasActivity: vadResult.isSpeechActive,
              latency: latency,
              timestamp: inputTimestamp
            }
          });
        }
      }
      
      // Adaptive buffer management
      if (this.config.enableAdaptive) {
        const resizeDirection = this.inputBuffer.shouldResize();
        if (resizeDirection === 'expand') {
          this.inputBuffer.resize(Math.min(this.inputBuffer.currentSize * 1.5, this.inputBuffer.maxSize));
        } else if (resizeDirection === 'shrink') {
          this.inputBuffer.resize(Math.max(this.inputBuffer.currentSize * 0.75, this.inputBuffer.minSize));
        }
      }
      
      // Performance tracking
      const processingTime = Date.now() - startTime;
      this.performance.processingTimes.push(processingTime);
      
      if (this.performance.processingTimes.length > 100) {
        this.performance.processingTimes = this.performance.processingTimes.slice(-100);
      }
      
      // Detect glitches (processing time > 5ms in AudioWorklet is concerning)
      if (processingTime > 5) {
        this.performance.glitches++;
      }
      
      // Send periodic metrics
      if (this.performance.totalFrames % 1000 === 0) {
        this.sendMetrics();
      }
      
      return true; // Keep processor alive
      
    } catch (error) {
      const canContinue = this.handleError('process', error);
      return canContinue;
    }
  }
}

// Register the enhanced AudioWorklet processor
registerProcessor('enhanced-audio-processor', EnhancedAudioProcessor);