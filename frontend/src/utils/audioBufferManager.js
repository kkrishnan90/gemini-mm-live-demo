/**
 * Enhanced Audio Buffer Manager for Real-time Voice Applications
 * 
 * This module provides production-ready audio buffer management with:
 * - Adaptive ring buffers with dynamic sizing
 * - Memory management and cleanup
 * - Buffer underrun/overrun detection
 * - Performance monitoring and metrics
 * - Connection quality adaptation
 * - Latency optimization
 */

import { debugError } from '../config/debug';

/**
 * Adaptive Ring Buffer implementation for efficient audio streaming
 */
class AdaptiveRingBuffer {
  constructor(initialSize = 8192, maxSize = 65536, minSize = 1024) {
    this.maxSize = maxSize;
    this.minSize = minSize;
    this.currentSize = Math.max(initialSize, minSize);
    
    // Initialize buffer
    this.buffer = new Float32Array(this.currentSize);
    this.writeIndex = 0;
    this.readIndex = 0;
    this.count = 0;
    
    // Performance metrics
    this.metrics = {
      underruns: 0,
      overruns: 0,
      resizes: 0,
      totalWrites: 0,
      totalReads: 0,
      lastResizeTime: Date.now(),
      avgFillLevel: 0,
      fillLevelSamples: 0
    };
    
    // Adaptive parameters
    this.resizeThreshold = 0.1; // Resize when buffer is consistently 90%+ full or 10%- empty
    this.adaptiveWindowSize = 100; // Number of operations to analyze for adaptation
    this.operationHistory = [];
    
    this.isDestroyed = false;
  }
  
  /**
   * Get current fill level as percentage (0-1)
   */
  getFillLevel() {
    return this.count / this.currentSize;
  }
  
  /**
   * Get available space in buffer
   */
  getAvailableSpace() {
    return this.currentSize - this.count;
  }
  
  /**
   * Check if buffer needs resizing based on usage patterns
   */
  shouldResize() {
    if (this.operationHistory.length < this.adaptiveWindowSize) {
      return null;
    }
    
    const recentHistory = this.operationHistory.slice(-this.adaptiveWindowSize);
    const avgFillLevel = recentHistory.reduce((sum, op) => sum + op.fillLevel, 0) / recentHistory.length;
    
    // Update metrics
    this.metrics.avgFillLevel = avgFillLevel;
    this.metrics.fillLevelSamples = recentHistory.length;
    
    // Determine resize direction
    if (avgFillLevel > 0.9 && this.currentSize < this.maxSize) {
      return 'expand';
    } else if (avgFillLevel < 0.1 && this.currentSize > this.minSize) {
      return 'shrink';
    }
    
    return null;
  }
  
  /**
   * Resize buffer while preserving data
   */
  resize(newSize) {
    if (this.isDestroyed) return false;
    
    newSize = Math.max(this.minSize, Math.min(newSize, this.maxSize));
    if (newSize === this.currentSize) return true;
    
    const oldBuffer = this.buffer;
    const oldSize = this.currentSize;
    const dataToPreserve = Math.min(this.count, newSize);
    
    // Create new buffer
    this.buffer = new Float32Array(newSize);
    this.currentSize = newSize;
    
    // Copy existing data to new buffer
    if (dataToPreserve > 0) {
      if (this.readIndex + dataToPreserve <= oldSize) {
        // Data is contiguous
        this.buffer.set(oldBuffer.subarray(this.readIndex, this.readIndex + dataToPreserve));
      } else {
        // Data wraps around
        const firstPart = oldSize - this.readIndex;
        const secondPart = dataToPreserve - firstPart;
        this.buffer.set(oldBuffer.subarray(this.readIndex, oldSize));
        this.buffer.set(oldBuffer.subarray(0, secondPart), firstPart);
      }
    }
    
    // Reset indices
    this.readIndex = 0;
    this.writeIndex = dataToPreserve;
    this.count = dataToPreserve;
    
    this.metrics.resizes++;
    this.metrics.lastResizeTime = Date.now();
    
    return true;
  }
  
  /**
   * Write data to buffer with overflow handling
   */
  write(data) {
    if (this.isDestroyed) return 0;
    
    const availableSpace = this.getAvailableSpace();
    const dataLength = data.length;
    
    // Check for overflow
    if (dataLength > availableSpace) {
      this.metrics.overruns++;
      
      // Attempt adaptive resize
      const resizeDirection = this.shouldResize();
      if (resizeDirection === 'expand') {
        const newSize = Math.min(this.currentSize * 2, this.maxSize);
        if (this.resize(newSize)) {
          return this.write(data); // Retry after resize
        }
      }
      
      // If resize failed or not needed, drop oldest data
      const dataToDrop = dataLength - availableSpace;
      this.read(new Float32Array(dataToDrop)); // Drop old data
    }
    
    // Write data
    let written = 0;
    for (let i = 0; i < dataLength && written < dataLength; i++) {
      this.buffer[this.writeIndex] = data[i];
      this.writeIndex = (this.writeIndex + 1) % this.currentSize;
      this.count = Math.min(this.count + 1, this.currentSize);
      written++;
    }
    
    // Update metrics and history
    this.metrics.totalWrites++;
    this.operationHistory.push({
      type: 'write',
      timestamp: Date.now(),
      fillLevel: this.getFillLevel(),
      size: dataLength
    });
    
    // Limit history size
    if (this.operationHistory.length > this.adaptiveWindowSize * 2) {
      this.operationHistory = this.operationHistory.slice(-this.adaptiveWindowSize);
    }
    
    return written;
  }
  
  /**
   * Read data from buffer
   */
  read(output) {
    if (this.isDestroyed) return 0;
    
    const requestedLength = output.length;
    const availableData = Math.min(this.count, requestedLength);
    
    if (availableData === 0) {
      this.metrics.underruns++;
      output.fill(0); // Fill with silence
      return 0;
    }
    
    // Read data
    for (let i = 0; i < availableData; i++) {
      output[i] = this.buffer[this.readIndex];
      this.readIndex = (this.readIndex + 1) % this.currentSize;
    }
    
    // Fill remaining with silence if needed
    if (availableData < requestedLength) {
      for (let i = availableData; i < requestedLength; i++) {
        output[i] = 0;
      }
    }
    
    this.count -= availableData;
    this.metrics.totalReads++;
    
    // Update operation history
    this.operationHistory.push({
      type: 'read',
      timestamp: Date.now(),
      fillLevel: this.getFillLevel(),
      size: requestedLength
    });
    
    // Check for adaptive resize
    const resizeDirection = this.shouldResize();
    if (resizeDirection === 'shrink') {
      const newSize = Math.max(this.currentSize / 2, this.minSize);
      this.resize(newSize);
    }
    
    return availableData;
  }
  
  /**
   * Clear buffer and reset
   */
  clear() {
    if (this.isDestroyed) return;
    
    this.writeIndex = 0;
    this.readIndex = 0;
    this.count = 0;
    this.buffer.fill(0);
    this.operationHistory = [];
  }
  
  /**
   * Get comprehensive metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      currentSize: this.currentSize,
      fillLevel: this.getFillLevel(),
      availableSpace: this.getAvailableSpace(),
      count: this.count,
      efficiency: this.metrics.totalReads > 0 ? (this.metrics.totalReads / (this.metrics.totalReads + this.metrics.underruns)) : 1
    };
  }
  
  /**
   * Destroy buffer and free resources
   */
  destroy() {
    this.isDestroyed = true;
    this.buffer = null;
    this.operationHistory = null;
    this.metrics = null;
  }
}

/**
 * Connection Quality Monitor for adaptive streaming
 */
class ConnectionQualityMonitor {
  constructor() {
    this.metrics = {
      latency: [],
      throughput: [],
      packetLoss: 0,
      jitter: [],
      connectionType: 'unknown'
    };
    
    this.currentQuality = 1.0; // 0.0 to 1.0
    this.qualityHistory = [];
    this.lastMeasurement = Date.now();
    
    // Network detection
    this.detectConnectionType();
    this.setupNetworkListeners();
  }
  
  /**
   * Detect connection type (WiFi, cellular, etc.)
   */
  detectConnectionType() {
    if ('connection' in navigator) {
      const conn = navigator.connection;
      this.metrics.connectionType = conn.effectiveType || conn.type || 'unknown';
      
      // Monitor for changes
      if (conn.addEventListener) {
        conn.addEventListener('change', () => {
          this.metrics.connectionType = conn.effectiveType || conn.type || 'unknown';
          this.onConnectionChange();
        });
      }
    }
  }
  
  /**
   * Setup network event listeners
   */
  setupNetworkListeners() {
    window.addEventListener('online', () => this.onConnectionChange());
    window.addEventListener('offline', () => this.onConnectionChange());
  }
  
  /**
   * Handle connection changes
   */
  onConnectionChange() {
    // Reset metrics and notify listeners
    this.metrics.latency = [];
    this.metrics.throughput = [];
    this.metrics.jitter = [];
    this.measureConnectionQuality();
  }
  
  /**
   * Measure current connection quality
   */
  async measureConnectionQuality() {
    const startTime = Date.now();
    
    try {
      // Simple latency test using a small fetch request to backend
      const response = await fetch('http://localhost:8000/ping', {
        method: 'HEAD',
        cache: 'no-cache'
      });
      
      const latency = Date.now() - startTime;
      this.addLatencyMeasurement(latency);
      
      // Calculate quality score based on latency
      let quality = 1.0;
      if (latency > 500) quality = 0.3;
      else if (latency > 200) quality = 0.6;
      else if (latency > 100) quality = 0.8;
      
      this.updateQuality(quality);
      
    } catch (error) {
      // Connection failed
      this.updateQuality(0.1);
    }
  }
  
  /**
   * Add latency measurement
   */
  addLatencyMeasurement(latency) {
    this.metrics.latency.push(latency);
    
    // Calculate jitter
    if (this.metrics.latency.length > 1) {
      const prevLatency = this.metrics.latency[this.metrics.latency.length - 2];
      const jitter = Math.abs(latency - prevLatency);
      this.metrics.jitter.push(jitter);
    }
    
    // Keep only recent measurements
    if (this.metrics.latency.length > 20) {
      this.metrics.latency = this.metrics.latency.slice(-20);
      this.metrics.jitter = this.metrics.jitter.slice(-20);
    }
  }
  
  /**
   * Update connection quality score
   */
  updateQuality(quality) {
    this.currentQuality = quality;
    this.qualityHistory.push({
      quality,
      timestamp: Date.now(),
      connectionType: this.metrics.connectionType
    });
    
    // Limit history
    if (this.qualityHistory.length > 100) {
      this.qualityHistory = this.qualityHistory.slice(-100);
    }
  }
  
  /**
   * Get recommended audio settings based on connection quality
   */
  getRecommendedAudioSettings() {
    const quality = this.currentQuality;
    const avgLatency = this.getAverageLatency();
    
    if (quality >= 0.8 && avgLatency < 100) {
      return {
        sampleRate: 16000,
        bufferSize: 2048,
        compression: false,
        adaptiveBuffering: false
      };
    } else if (quality >= 0.6 && avgLatency < 200) {
      return {
        sampleRate: 16000,
        bufferSize: 4096,
        compression: true,
        adaptiveBuffering: true
      };
    } else {
      return {
        sampleRate: 8000,
        bufferSize: 8192,
        compression: true,
        adaptiveBuffering: true
      };
    }
  }
  
  /**
   * Get average latency
   */
  getAverageLatency() {
    if (this.metrics.latency.length === 0) return 0;
    return this.metrics.latency.reduce((sum, lat) => sum + lat, 0) / this.metrics.latency.length;
  }
  
  /**
   * Get connection quality metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      currentQuality: this.currentQuality,
      averageLatency: this.getAverageLatency(),
      averageJitter: this.metrics.jitter.length > 0 
        ? this.metrics.jitter.reduce((sum, j) => sum + j, 0) / this.metrics.jitter.length 
        : 0
    };
  }
}

/**
 * Enhanced Audio Buffer Manager
 * Main class that orchestrates all audio buffer operations
 */
export class AudioBufferManager {
  constructor(options = {}) {
    // Configuration
    this.config = {
      inputSampleRate: options.inputSampleRate || 16000,
      outputSampleRate: options.outputSampleRate || 24000,
      initialBufferSize: options.initialBufferSize || 8192,
      maxBufferSize: options.maxBufferSize || 65536,
      minBufferSize: options.minBufferSize || 1024,
      latencyTarget: options.latencyTarget || 20, // ms
      enableAdaptiveQuality: options.enableAdaptiveQuality !== false,
      enableMetrics: options.enableMetrics !== false,
      ...options
    };
    
    // Core components
    this.inputBuffer = new AdaptiveRingBuffer(
      this.config.initialBufferSize,
      this.config.maxBufferSize,
      this.config.minBufferSize
    );
    
    this.outputBuffer = new AdaptiveRingBuffer(
      this.config.initialBufferSize,
      this.config.maxBufferSize,
      this.config.minBufferSize
    );
    
    this.connectionMonitor = new ConnectionQualityMonitor();
    
    // State management
    this.isActive = false;
    this.isDestroyed = false;
    
    // Performance tracking
    this.performanceMetrics = {
      processingLatency: [],
      glassToGlassLatency: [],
      bufferHealth: [],
      adaptiveActions: 0,
      startTime: Date.now()
    };
    
    // Event handlers
    this.eventHandlers = new Map();
    
    // Initialize quality monitoring
    if (this.config.enableAdaptiveQuality) {
      this.startQualityMonitoring();
    }
    
    // Setup periodic metrics collection
    if (this.config.enableMetrics) {
      this.startMetricsCollection();
    }
  }
  
  /**
   * Start quality monitoring
   */
  startQualityMonitoring() {
    this.qualityMonitorInterval = setInterval(() => {
      this.connectionMonitor.measureConnectionQuality();
      this.adaptToConnectionQuality();
    }, 5000); // Check every 5 seconds
  }
  
  /**
   * Start metrics collection
   */
  startMetricsCollection() {
    this.metricsInterval = setInterval(() => {
      this.collectPerformanceMetrics();
      this.emitEvent('metrics', this.getComprehensiveMetrics());
    }, 1000); // Collect every second
  }
  
  /**
   * Adapt buffer settings based on connection quality
   */
  adaptToConnectionQuality() {
    const recommendedSettings = this.connectionMonitor.getRecommendedAudioSettings();
    const currentQuality = this.connectionMonitor.currentQuality;
    
    // Adjust buffer sizes based on quality
    if (currentQuality < 0.5) {
      // Poor connection - increase buffer sizes
      const newSize = Math.min(this.config.initialBufferSize * 2, this.config.maxBufferSize);
      this.inputBuffer.resize(newSize);
      this.outputBuffer.resize(newSize);
      this.performanceMetrics.adaptiveActions++;
    } else if (currentQuality > 0.8) {
      // Good connection - optimize for latency
      const newSize = Math.max(this.config.initialBufferSize / 2, this.config.minBufferSize);
      this.inputBuffer.resize(newSize);
      this.outputBuffer.resize(newSize);
      this.performanceMetrics.adaptiveActions++;
    }
    
    this.emitEvent('qualityChanged', {
      quality: currentQuality,
      settings: recommendedSettings
    });
  }
  
  /**
   * Collect performance metrics
   */
  collectPerformanceMetrics() {
    const inputMetrics = this.inputBuffer.getMetrics();
    const outputMetrics = this.outputBuffer.getMetrics();
    const connectionMetrics = this.connectionMonitor.getMetrics();
    
    this.performanceMetrics.bufferHealth.push({
      timestamp: Date.now(),
      inputFillLevel: inputMetrics.fillLevel,
      outputFillLevel: outputMetrics.fillLevel,
      inputUnderruns: inputMetrics.underruns,
      outputUnderruns: outputMetrics.underruns,
      connectionQuality: connectionMetrics.currentQuality
    });
    
    // Limit history size
    if (this.performanceMetrics.bufferHealth.length > 300) {
      this.performanceMetrics.bufferHealth = this.performanceMetrics.bufferHealth.slice(-300);
    }
  }
  
  /**
   * Write audio data to input buffer
   */
  writeInputData(audioData, timestamp = Date.now()) {
    if (this.isDestroyed || !this.isActive) return 0;
    
    const processingStart = performance.now();
    const written = this.inputBuffer.write(audioData);
    const processingTime = performance.now() - processingStart;
    
    // Track processing latency
    this.performanceMetrics.processingLatency.push(processingTime);
    if (this.performanceMetrics.processingLatency.length > 100) {
      this.performanceMetrics.processingLatency = this.performanceMetrics.processingLatency.slice(-100);
    }
    
    // Check for buffer health issues
    const fillLevel = this.inputBuffer.getFillLevel();
    if (fillLevel > 0.9) {
      this.emitEvent('bufferWarning', {
        type: 'input',
        level: 'high',
        fillLevel: fillLevel
      });
    }
    
    return written;
  }
  
  /**
   * Read audio data from input buffer
   */
  readInputData(length) {
    if (this.isDestroyed || !this.isActive) return new Float32Array(length);
    
    const output = new Float32Array(length);
    const read = this.inputBuffer.read(output);
    
    return output;
  }
  
  /**
   * Write audio data to output buffer
   */
  writeOutputData(audioData, timestamp = Date.now()) {
    if (this.isDestroyed || !this.isActive) return 0;
    
    return this.outputBuffer.write(audioData);
  }
  
  /**
   * Read audio data from output buffer
   */
  readOutputData(length) {
    if (this.isDestroyed || !this.isActive) return new Float32Array(length);
    
    const output = new Float32Array(length);
    const read = this.outputBuffer.read(output);
    
    return output;
  }
  
  /**
   * Measure glass-to-glass latency
   */
  measureGlassToGlassLatency(inputTimestamp, outputTimestamp = Date.now()) {
    const latency = outputTimestamp - inputTimestamp;
    
    this.performanceMetrics.glassToGlassLatency.push(latency);
    if (this.performanceMetrics.glassToGlassLatency.length > 100) {
      this.performanceMetrics.glassToGlassLatency = this.performanceMetrics.glassToGlassLatency.slice(-100);
    }
    
    // Check if latency exceeds target
    if (latency > this.config.latencyTarget) {
      this.emitEvent('latencyWarning', {
        measured: latency,
        target: this.config.latencyTarget
      });
    }
    
    return latency;
  }
  
  /**
   * Get comprehensive metrics
   */
  getComprehensiveMetrics() {
    const inputMetrics = this.inputBuffer.getMetrics();
    const outputMetrics = this.outputBuffer.getMetrics();
    const connectionMetrics = this.connectionMonitor.getMetrics();
    
    const avgProcessingLatency = this.performanceMetrics.processingLatency.length > 0
      ? this.performanceMetrics.processingLatency.reduce((sum, lat) => sum + lat, 0) / this.performanceMetrics.processingLatency.length
      : 0;
      
    const avgGlassToGlassLatency = this.performanceMetrics.glassToGlassLatency.length > 0
      ? this.performanceMetrics.glassToGlassLatency.reduce((sum, lat) => sum + lat, 0) / this.performanceMetrics.glassToGlassLatency.length
      : 0;
    
    return {
      inputBuffer: inputMetrics,
      outputBuffer: outputMetrics,
      connection: connectionMetrics,
      performance: {
        avgProcessingLatency,
        avgGlassToGlassLatency,
        adaptiveActions: this.performanceMetrics.adaptiveActions,
        uptime: Date.now() - this.performanceMetrics.startTime
      },
      health: {
        isHealthy: this.isHealthy(),
        issues: this.getHealthIssues()
      }
    };
  }
  
  /**
   * Check overall system health
   */
  isHealthy() {
    const inputMetrics = this.inputBuffer.getMetrics();
    const outputMetrics = this.outputBuffer.getMetrics();
    const connectionQuality = this.connectionMonitor.currentQuality;
    
    // Health criteria
    const inputUnderrunRate = inputMetrics.totalReads > 0 ? inputMetrics.underruns / inputMetrics.totalReads : 0;
    const outputUnderrunRate = outputMetrics.totalReads > 0 ? outputMetrics.underruns / outputMetrics.totalReads : 0;
    const connectionHealthy = connectionQuality > 0.3;
    
    return inputUnderrunRate < 0.05 && outputUnderrunRate < 0.05 && connectionHealthy;
  }
  
  /**
   * Get current health issues
   */
  getHealthIssues() {
    const issues = [];
    const inputMetrics = this.inputBuffer.getMetrics();
    const outputMetrics = this.outputBuffer.getMetrics();
    const connectionQuality = this.connectionMonitor.currentQuality;
    
    if (inputMetrics.underruns > 0) {
      issues.push(`Input buffer underruns: ${inputMetrics.underruns}`);
    }
    
    if (outputMetrics.underruns > 0) {
      issues.push(`Output buffer underruns: ${outputMetrics.underruns}`);
    }
    
    if (connectionQuality < 0.3) {
      issues.push(`Poor connection quality: ${(connectionQuality * 100).toFixed(1)}%`);
    }
    
    return issues;
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
      this.eventHandlers.get(event).forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          debugError(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }
  
  /**
   * Start the buffer manager
   */
  start() {
    if (this.isDestroyed) return false;
    
    this.isActive = true;
    this.performanceMetrics.startTime = Date.now();
    
    this.emitEvent('started', {
      config: this.config
    });
    
    return true;
  }
  
  /**
   * Stop the buffer manager
   */
  stop() {
    this.isActive = false;
    
    // Clear buffers
    this.inputBuffer.clear();
    this.outputBuffer.clear();
    
    this.emitEvent('stopped', {});
  }
  
  /**
   * Destroy the buffer manager and free all resources
   */
  destroy() {
    if (this.isDestroyed) return;
    
    this.stop();
    
    // Clear intervals
    if (this.qualityMonitorInterval) {
      clearInterval(this.qualityMonitorInterval);
    }
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    
    // Destroy components
    this.inputBuffer.destroy();
    this.outputBuffer.destroy();
    
    // Clear references
    this.inputBuffer = null;
    this.outputBuffer = null;
    this.connectionMonitor = null;
    this.eventHandlers.clear();
    
    this.isDestroyed = true;
    
    this.emitEvent('destroyed', {});
  }
}

export default AudioBufferManager;