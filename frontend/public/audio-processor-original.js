/**
 * AudioWorklet Processor for Real-time Audio Processing
 * Replaces the deprecated ScriptProcessorNode for better performance
 */
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    // Audio processing configuration
    this.bufferSize = 4096;
    this.sampleRate = 16000;
    this.channelCount = 1;
    
    // Audio buffer for batching
    this.audioBuffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    
    // Audio quality metrics
    this.metrics = {
      totalSamples: 0,
      clippedSamples: 0,
      silentFrames: 0,
      lastActivityTime: 0
    };
    
    // Barge-in detection parameters
    this.bargeInThreshold = 0.04;
    this.noiseSuppression = true;
    this.activityDetectionEnabled = true;
    
    // Processing state
    this.isRecording = true;
    this.isMuted = false;
    this.isSystemPlaying = false;
    
    // Listen for messages from main thread
    this.port.onmessage = this.handleMessage.bind(this);
  }
  
  /**
   * Handle messages from the main thread
   */
  handleMessage(event) {
    const { type, data } = event.data;
    
    switch (type) {
      case 'SET_RECORDING':
        this.isRecording = data.recording;
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
        
      case 'RESET_BUFFER':
        this.resetBuffer();
        break;
    }
  }
  
  /**
   * Update processor configuration
   */
  updateConfiguration(config) {
    if (config.bufferSize && config.bufferSize !== this.bufferSize) {
      this.bufferSize = config.bufferSize;
      this.audioBuffer = new Float32Array(this.bufferSize);
      this.bufferIndex = 0;
    }
    
    if (config.bargeInThreshold !== undefined) {
      this.bargeInThreshold = config.bargeInThreshold;
    }
    
    if (config.noiseSuppression !== undefined) {
      this.noiseSuppression = config.noiseSuppression;
    }
  }
  
  /**
   * Reset audio buffer
   */
  resetBuffer() {
    this.bufferIndex = 0;
    this.audioBuffer.fill(0);
  }
  
  /**
   * Send metrics to main thread
   */
  sendMetrics() {
    this.port.postMessage({
      type: 'METRICS',
      data: {
        ...this.metrics,
        bufferFillLevel: this.bufferIndex / this.bufferSize,
        timestamp: Date.now()
      }
    });
  }
  
  /**
   * Detect audio activity for barge-in
   */
  detectAudioActivity(samples) {
    let maxAmplitude = 0;
    let rmsEnergy = 0;
    
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.abs(samples[i]);
      maxAmplitude = Math.max(maxAmplitude, sample);
      rmsEnergy += sample * sample;
    }
    
    rmsEnergy = Math.sqrt(rmsEnergy / samples.length);
    
    // Check if audio exceeds threshold
    const hasActivity = maxAmplitude > this.bargeInThreshold;
    
    if (hasActivity) {
      this.metrics.lastActivityTime = Date.now();
      
      // If system is playing and we detect user speech, trigger barge-in
      if (this.isSystemPlaying && this.activityDetectionEnabled) {
        this.port.postMessage({
          type: 'BARGE_IN_DETECTED',
          data: {
            maxAmplitude,
            rmsEnergy,
            timestamp: this.metrics.lastActivityTime
          }
        });
      }
    }
    
    return hasActivity;
  }
  
  /**
   * Apply noise suppression (simple implementation)
   */
  applyNoiseSuppression(samples) {
    if (!this.noiseSuppression) return samples;
    
    const noiseFloor = 0.01; // Adjustable noise floor
    const processed = new Float32Array(samples.length);
    
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      if (Math.abs(sample) < noiseFloor) {
        processed[i] = 0; // Suppress noise below floor
      } else {
        processed[i] = sample;
      }
    }
    
    return processed;
  }
  
  /**
   * Convert Float32 audio to Int16 PCM
   */
  convertToInt16PCM(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp to [-1, 1] range and convert to 16-bit
      const clampedSample = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = clampedSample * 32767;
      
      // Track clipping for metrics
      if (Math.abs(float32Array[i]) > 0.99) {
        this.metrics.clippedSamples++;
      }
    }
    
    return int16Array;
  }
  
  /**
   * Main audio processing function
   * Called for each audio quantum (128 samples by default)
   */
  process(inputs, outputs, parameters) {
    // Check if we should continue processing
    if (!this.isRecording || this.isMuted) {
      return true;
    }
    
    // Get input audio data
    const input = inputs[0];
    if (!input || !input[0]) {
      return true;
    }
    
    const inputSamples = input[0]; // Mono channel
    this.metrics.totalSamples += inputSamples.length;
    
    // Apply noise suppression if enabled
    const processedSamples = this.applyNoiseSuppression(inputSamples);
    
    // Detect audio activity for barge-in
    const hasActivity = this.detectAudioActivity(processedSamples);
    
    // Check for silent frames
    if (!hasActivity) {
      this.metrics.silentFrames++;
    }
    
    // Buffer the audio samples
    for (let i = 0; i < processedSamples.length; i++) {
      this.audioBuffer[this.bufferIndex] = processedSamples[i];
      this.bufferIndex++;
      
      // When buffer is full, send it to main thread
      if (this.bufferIndex >= this.bufferSize) {
        const int16PCM = this.convertToInt16PCM(this.audioBuffer);
        
        this.port.postMessage({
          type: 'AUDIO_DATA',
          data: {
            audioData: int16PCM.buffer,
            sampleRate: this.sampleRate,
            channelCount: this.channelCount,
            hasActivity: hasActivity,
            timestamp: Date.now()
          }
        });
        
        // Reset buffer
        this.bufferIndex = 0;
      }
    }
    
    return true; // Keep processor alive
  }
}

// Register the AudioWorklet processor
registerProcessor('audio-processor', AudioProcessor);