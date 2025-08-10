/**
 * Network Resilience Manager for Real-time Audio Applications
 * 
 * This module provides:
 * - Adaptive quality based on network conditions
 * - Backpressure handling for WebSocket transmission
 * - Connection quality detection and adaptation
 * - WiFi-to-cellular transition handling
 * - Network error recovery and circuit breaker patterns
 */

import { AudioCircuitBreaker, AudioErrorRecovery } from './audioUtils.js';

/**
 * WebSocket Backpressure Manager
 */
export class WebSocketBackpressureManager {
  constructor(options = {}) {
    this.options = {
      maxBufferSize: options.maxBufferSize || 65536, // 64KB
      highWaterMark: options.highWaterMark || 32768, // 32KB
      lowWaterMark: options.lowWaterMark || 8192,    // 8KB
      maxQueueSize: options.maxQueueSize || 100,
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      ...options
    };
    
    this.socket = null;
    this.isBackpressured = false;
    this.sendQueue = [];
    this.metrics = {
      bytesSent: 0,
      bytesQueued: 0,
      messagesDropped: 0,
      retryAttempts: 0,
      backpressureEvents: 0,
      lastBackpressureTime: 0
    };
    
    // Performance tracking
    this.performanceHistory = [];
    this.adaptiveThresholds = {
      current: this.options.highWaterMark,
      min: this.options.lowWaterMark,
      max: this.options.maxBufferSize
    };
    
    // Circuit breaker for connection reliability
    this.circuitBreaker = new AudioCircuitBreaker({
      failureThreshold: 5,
      timeout: 10000,
      monitoringPeriod: 5000
    });
    
    // Event handlers
    this.eventHandlers = new Map();
  }
  
  /**
   * Set WebSocket instance
   */
  setSocket(socket) {
    this.socket = socket;
    this.setupSocketMonitoring();
  }
  
  /**
   * Setup socket monitoring
   */
  setupSocketMonitoring() {
    if (!this.socket) return;
    
    // Monitor buffer size changes
    this.monitoringInterval = setInterval(() => {
      this.checkBackpressure();
      this.processQueue();
      this.updateAdaptiveThresholds();
    }, 100);
    
    // Handle socket close
    this.socket.addEventListener('close', () => {
      this.handleSocketClose();
    });
    
    this.socket.addEventListener('error', () => {
      this.handleSocketError();
    });
  }
  
  /**
   * Check for backpressure conditions
   */
  checkBackpressure() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.isBackpressured = true;
      return true;
    }
    
    const bufferedAmount = this.socket.bufferedAmount || 0;
    const wasBackpressured = this.isBackpressured;
    
    // Dynamic threshold based on recent performance
    const currentThreshold = this.adaptiveThresholds.current;
    
    if (bufferedAmount > currentThreshold) {
      if (!wasBackpressured) {
        this.isBackpressured = true;
        this.metrics.backpressureEvents++;
        this.metrics.lastBackpressureTime = Date.now();
        this.emitEvent('backpressureStart', {
          bufferedAmount,
          threshold: currentThreshold
        });
      }
    } else if (bufferedAmount < this.options.lowWaterMark) {
      if (wasBackpressured) {
        this.isBackpressured = false;
        this.emitEvent('backpressureEnd', {
          bufferedAmount,
          queueLength: this.sendQueue.length
        });
      }
    }
    
    // Track performance metrics
    this.recordPerformanceMetric(bufferedAmount, this.sendQueue.length);
    
    return this.isBackpressured;
  }
  
  /**
   * Record performance metrics for adaptive thresholds
   */
  recordPerformanceMetric(bufferedAmount, queueLength) {
    this.performanceHistory.push({
      timestamp: Date.now(),
      bufferedAmount,
      queueLength,
      isBackpressured: this.isBackpressured
    });
    
    // Keep only recent history
    if (this.performanceHistory.length > 100) {
      this.performanceHistory = this.performanceHistory.slice(-100);
    }
  }
  
  /**
   * Update adaptive thresholds based on performance history
   */
  updateAdaptiveThresholds() {
    if (this.performanceHistory.length < 20) return;
    
    const recentHistory = this.performanceHistory.slice(-20);
    const avgBufferedAmount = recentHistory.reduce((sum, metric) => sum + metric.bufferedAmount, 0) / recentHistory.length;
    const backpressureRate = recentHistory.filter(metric => metric.isBackpressured).length / recentHistory.length;
    
    // Adapt threshold based on performance
    if (backpressureRate > 0.3) {
      // Frequent backpressure - lower threshold
      this.adaptiveThresholds.current = Math.max(
        this.adaptiveThresholds.current * 0.9,
        this.adaptiveThresholds.min
      );
    } else if (backpressureRate < 0.1 && avgBufferedAmount < this.adaptiveThresholds.current * 0.5) {
      // Good performance - can increase threshold
      this.adaptiveThresholds.current = Math.min(
        this.adaptiveThresholds.current * 1.1,
        this.adaptiveThresholds.max
      );
    }
  }
  
  /**
   * Send data with backpressure handling
   */
  async send(data, priority = 'normal') {
    try {
      return await this.circuitBreaker.execute(async () => {
        return this._sendInternal(data, priority);
      });
    } catch (error) {
      this.emitEvent('sendError', { error: error.message, data });
      throw error;
    }
  }
  
  /**
   * Internal send implementation
   */
  async _sendInternal(data, priority) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not ready');
    }
    
    // Check backpressure
    if (this.checkBackpressure() && priority !== 'high') {
      // Queue the message
      this.queueMessage(data, priority);
      return false;
    }
    
    // Attempt to send immediately
    try {
      this.socket.send(data);
      this.metrics.bytesSent += data.byteLength || data.length;
      this.emitEvent('dataSent', {
        size: data.byteLength || data.length,
        bufferedAmount: this.socket.bufferedAmount
      });
      return true;
    } catch (error) {
      // Failed to send - queue for retry
      this.queueMessage(data, priority);
      throw error;
    }
  }
  
  /**
   * Queue message for later transmission
   */
  queueMessage(data, priority = 'normal') {
    const message = {
      data,
      priority,
      timestamp: Date.now(),
      retryCount: 0
    };
    
    // Priority queue management
    if (priority === 'high') {
      this.sendQueue.unshift(message);
    } else {
      this.sendQueue.push(message);
    }
    
    // Drop old messages if queue is full
    if (this.sendQueue.length > this.options.maxQueueSize) {
      const dropped = this.sendQueue.splice(this.options.maxQueueSize);
      this.metrics.messagesDropped += dropped.length;
      this.emitEvent('messagesDropped', { count: dropped.length });
    }
    
    this.metrics.bytesQueued += data.byteLength || data.length;
  }
  
  /**
   * Process queued messages
   */
  async processQueue() {
    if (this.sendQueue.length === 0 || this.isBackpressured) {
      return;
    }
    
    const message = this.sendQueue.shift();
    if (!message) return;
    
    try {
      const sent = await this._sendInternal(message.data, message.priority);
      if (sent) {
        this.metrics.bytesQueued -= message.data.byteLength || message.data.length;
      } else {
        // Re-queue if not sent
        this.sendQueue.unshift(message);
      }
    } catch (error) {
      // Retry logic
      message.retryCount++;
      if (message.retryCount < this.options.maxRetries) {
        this.metrics.retryAttempts++;
        
        // Exponential backoff
        const delay = this.options.retryDelay * Math.pow(2, message.retryCount);
        setTimeout(() => {
          this.sendQueue.unshift(message);
        }, delay);
      } else {
        // Max retries reached - drop message
        this.metrics.messagesDropped++;
        this.metrics.bytesQueued -= message.data.byteLength || message.data.length;
        this.emitEvent('messageDropped', { message, error: error.message });
      }
    }
  }
  
  /**
   * Handle socket close
   */
  handleSocketClose() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    this.isBackpressured = true;
    this.emitEvent('socketClosed', {
      queueLength: this.sendQueue.length,
      bytesQueued: this.metrics.bytesQueued
    });
  }
  
  /**
   * Handle socket error
   */
  handleSocketError() {
    this.isBackpressured = true;
    this.emitEvent('socketError', {
      queueLength: this.sendQueue.length
    });
  }
  
  /**
   * Get backpressure metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      queueLength: this.sendQueue.length,
      isBackpressured: this.isBackpressured,
      adaptiveThreshold: this.adaptiveThresholds.current,
      socketBuffered: this.socket ? this.socket.bufferedAmount : 0,
      circuitBreakerState: this.circuitBreaker.getState()
    };
  }
  
  /**
   * Clear queue
   */
  clearQueue() {
    const droppedCount = this.sendQueue.length;
    this.sendQueue = [];
    this.metrics.messagesDropped += droppedCount;
    this.metrics.bytesQueued = 0;
    
    this.emitEvent('queueCleared', { droppedCount });
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
          console.error(`Error in backpressure manager event handler for ${event}:`, error);
        }
      });
    }
  }
  
  /**
   * Destroy manager
   */
  destroy() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    this.clearQueue();
    this.eventHandlers.clear();
    this.socket = null;
  }
}

/**
 * Network Quality Monitor and Adapter
 */
export class NetworkQualityMonitor {
  constructor(options = {}) {
    this.options = {
      measurementInterval: options.measurementInterval || 5000,
      historySize: options.historySize || 20,
      ...options
    };
    
    this.measurements = [];
    this.currentQuality = {
      score: 1.0, // 0.0 to 1.0
      latency: 0,
      throughput: 0,
      stability: 1.0,
      connectionType: 'unknown'
    };
    
    this.isMonitoring = false;
    this.eventHandlers = new Map();
    
    // Network detection
    this.detectNetworkCapabilities();
    this.setupNetworkListeners();
  }
  
  /**
   * Detect network capabilities
   */
  detectNetworkCapabilities() {
    if ('connection' in navigator) {
      const conn = navigator.connection;
      this.currentQuality.connectionType = conn.effectiveType || conn.type || 'unknown';
      
      // Initial quality estimation based on connection type
      switch (this.currentQuality.connectionType) {
        case '4g':
          this.currentQuality.score = 0.9;
          break;
        case '3g':
          this.currentQuality.score = 0.6;
          break;
        case '2g':
          this.currentQuality.score = 0.3;
          break;
        case 'wifi':
          this.currentQuality.score = 0.95;
          break;
        default:
          this.currentQuality.score = 0.7;
      }
    }
  }
  
  /**
   * Setup network event listeners
   */
  setupNetworkListeners() {
    // Connection change detection
    if ('connection' in navigator && navigator.connection.addEventListener) {
      navigator.connection.addEventListener('change', () => {
        this.handleConnectionChange();
      });
    }
    
    // Online/offline events
    window.addEventListener('online', () => {
      this.handleNetworkStatusChange(true);
    });
    
    window.addEventListener('offline', () => {
      this.handleNetworkStatusChange(false);
    });
  }
  
  /**
   * Handle connection type changes
   */
  handleConnectionChange() {
    const conn = navigator.connection;
    const oldType = this.currentQuality.connectionType;
    const newType = conn.effectiveType || conn.type || 'unknown';
    
    this.currentQuality.connectionType = newType;
    
    // Trigger immediate measurement on connection change
    this.measureQuality();
    
    this.emitEvent('connectionTypeChanged', {
      oldType,
      newType,
      quality: this.currentQuality
    });
  }
  
  /**
   * Handle online/offline status changes
   */
  handleNetworkStatusChange(isOnline) {
    if (!isOnline) {
      this.currentQuality.score = 0;
      this.currentQuality.latency = Infinity;
    } else {
      // Trigger immediate measurement when back online
      this.measureQuality();
    }
    
    this.emitEvent('networkStatusChanged', {
      isOnline,
      quality: this.currentQuality
    });
  }
  
  /**
   * Start monitoring network quality
   */
  startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    
    // Initial measurement
    this.measureQuality();
    
    // Periodic measurements
    this.monitoringInterval = setInterval(() => {
      this.measureQuality();
    }, this.options.measurementInterval);
  }
  
  /**
   * Stop monitoring
   */
  stopMonitoring() {
    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
  }
  
  /**
   * Measure network quality
   */
  async measureQuality() {
    try {
      const measurement = await this.performMeasurement();
      this.recordMeasurement(measurement);
      this.updateQualityScore();
      
      this.emitEvent('qualityMeasured', {
        measurement,
        quality: this.currentQuality
      });
      
    } catch (error) {
      console.warn('Network quality measurement failed:', error);
      this.recordFailedMeasurement();
    }
  }
  
  /**
   * Perform actual network measurement
   */
  async performMeasurement() {
    const startTime = Date.now();
    
    try {
      // Simple latency test using fetch
      const response = await fetch('/favicon.ico?' + Date.now(), {
        method: 'HEAD',
        cache: 'no-cache',
        mode: 'no-cors'
      });
      
      const endTime = Date.now();
      const latency = endTime - startTime;
      
      return {
        timestamp: startTime,
        latency,
        success: true,
        connectionType: this.currentQuality.connectionType
      };
      
    } catch (error) {
      return {
        timestamp: startTime,
        latency: Infinity,
        success: false,
        error: error.message,
        connectionType: this.currentQuality.connectionType
      };
    }
  }
  
  /**
   * Record successful measurement
   */
  recordMeasurement(measurement) {
    this.measurements.push(measurement);
    
    // Keep only recent measurements
    if (this.measurements.length > this.options.historySize) {
      this.measurements = this.measurements.slice(-this.options.historySize);
    }
  }
  
  /**
   * Record failed measurement
   */
  recordFailedMeasurement() {
    this.recordMeasurement({
      timestamp: Date.now(),
      latency: Infinity,
      success: false,
      connectionType: this.currentQuality.connectionType
    });
  }
  
  /**
   * Update quality score based on measurements
   */
  updateQualityScore() {
    if (this.measurements.length === 0) return;
    
    const recentMeasurements = this.measurements.slice(-10);
    const successfulMeasurements = recentMeasurements.filter(m => m.success);
    
    if (successfulMeasurements.length === 0) {
      this.currentQuality.score = 0;
      this.currentQuality.latency = Infinity;
      this.currentQuality.stability = 0;
      return;
    }
    
    // Calculate average latency
    const avgLatency = successfulMeasurements.reduce((sum, m) => sum + m.latency, 0) / successfulMeasurements.length;
    this.currentQuality.latency = avgLatency;
    
    // Calculate stability (consistency of measurements)
    const latencyVariance = this.calculateVariance(successfulMeasurements.map(m => m.latency));
    const stabilityScore = Math.max(0, 1 - (latencyVariance / 1000)); // Normalize variance
    this.currentQuality.stability = stabilityScore;
    
    // Calculate overall quality score
    let qualityScore = 1.0;
    
    // Latency penalty
    if (avgLatency > 500) {
      qualityScore *= 0.3;
    } else if (avgLatency > 200) {
      qualityScore *= 0.6;
    } else if (avgLatency > 100) {
      qualityScore *= 0.8;
    }
    
    // Success rate penalty
    const successRate = successfulMeasurements.length / recentMeasurements.length;
    qualityScore *= successRate;
    
    // Stability penalty
    qualityScore *= stabilityScore;
    
    this.currentQuality.score = Math.max(0, Math.min(1, qualityScore));
  }
  
  /**
   * Calculate variance of an array
   */
  calculateVariance(values) {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    
    return variance;
  }
  
  /**
   * Get audio settings recommendations based on quality
   */
  getAudioSettingsRecommendation() {
    const score = this.currentQuality.score;
    const latency = this.currentQuality.latency;
    
    if (score >= 0.8 && latency < 100) {
      return {
        quality: 'high',
        sampleRate: 16000,
        bufferSize: 2048,
        compression: false,
        adaptiveBuffering: false,
        maxConcurrentStreams: 2
      };
    } else if (score >= 0.6 && latency < 200) {
      return {
        quality: 'medium',
        sampleRate: 16000,
        bufferSize: 4096,
        compression: true,
        adaptiveBuffering: true,
        maxConcurrentStreams: 1
      };
    } else {
      return {
        quality: 'low',
        sampleRate: 8000,
        bufferSize: 8192,
        compression: true,
        adaptiveBuffering: true,
        maxConcurrentStreams: 1
      };
    }
  }
  
  /**
   * Get current quality metrics
   */
  getQualityMetrics() {
    return {
      ...this.currentQuality,
      measurementCount: this.measurements.length,
      recentMeasurements: this.measurements.slice(-5),
      recommendation: this.getAudioSettingsRecommendation()
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
      this.eventHandlers.get(event).forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in network quality monitor event handler for ${event}:`, error);
        }
      });
    }
  }
  
  /**
   * Destroy monitor
   */
  destroy() {
    this.stopMonitoring();
    this.eventHandlers.clear();
  }
}

/**
 * Comprehensive Network Resilience Manager
 */
export class NetworkResilienceManager {
  constructor(options = {}) {
    this.options = {
      enableBackpressureHandling: true,
      enableQualityMonitoring: true,
      enableAdaptiveSettings: true,
      ...options
    };
    
    // Initialize components
    this.backpressureManager = new WebSocketBackpressureManager(options.backpressure);
    this.qualityMonitor = new NetworkQualityMonitor(options.quality);
    
    // Current settings
    this.currentSettings = {
      quality: 'high',
      sampleRate: 16000,
      bufferSize: 2048,
      compression: false
    };
    
    // Event handlers
    this.eventHandlers = new Map();
    
    // Setup cross-component communication
    this.setupComponentCommunication();
  }
  
  /**
   * Setup communication between components
   */
  setupComponentCommunication() {
    // React to quality changes
    this.qualityMonitor.on('qualityMeasured', (data) => {
      if (this.options.enableAdaptiveSettings) {
        this.adaptToQuality(data.quality);
      }
      
      this.emitEvent('qualityChanged', data);
    });
    
    // React to backpressure events
    this.backpressureManager.on('backpressureStart', (data) => {
      this.handleBackpressure(true);
      this.emitEvent('backpressureChanged', { active: true, ...data });
    });
    
    this.backpressureManager.on('backpressureEnd', (data) => {
      this.handleBackpressure(false);
      this.emitEvent('backpressureChanged', { active: false, ...data });
    });
    
    // Handle network status changes
    this.qualityMonitor.on('networkStatusChanged', (data) => {
      this.handleNetworkStatusChange(data);
      this.emitEvent('networkStatusChanged', data);
    });
  }
  
  /**
   * Adapt settings based on network quality
   */
  adaptToQuality(quality) {
    const recommendation = this.qualityMonitor.getAudioSettingsRecommendation();
    
    // Only change if significantly different
    if (recommendation.quality !== this.currentSettings.quality) {
      this.currentSettings = recommendation;
      
      this.emitEvent('settingsChanged', {
        newSettings: this.currentSettings,
        reason: 'quality_adaptation'
      });
    }
  }
  
  /**
   * Handle backpressure conditions
   */
  handleBackpressure(isActive) {
    if (isActive) {
      // Temporarily reduce quality during backpressure
      const emergencySettings = {
        ...this.currentSettings,
        bufferSize: Math.min(this.currentSettings.bufferSize * 2, 16384),
        compression: true
      };
      
      this.emitEvent('settingsChanged', {
        newSettings: emergencySettings,
        reason: 'backpressure_mitigation',
        temporary: true
      });
    }
  }
  
  /**
   * Handle network status changes
   */
  handleNetworkStatusChange(data) {
    if (!data.isOnline) {
      // Network offline - prepare for reconnection
      this.backpressureManager.clearQueue();
      
      this.emitEvent('settingsChanged', {
        newSettings: { ...this.currentSettings, enabled: false },
        reason: 'network_offline'
      });
    } else {
      // Network back online - resume with conservative settings
      const conservativeSettings = {
        ...this.currentSettings,
        bufferSize: Math.max(this.currentSettings.bufferSize, 4096)
      };
      
      this.emitEvent('settingsChanged', {
        newSettings: conservativeSettings,
        reason: 'network_reconnection'
      });
    }
  }
  
  /**
   * Start resilience management
   */
  start() {
    if (this.options.enableQualityMonitoring) {
      this.qualityMonitor.startMonitoring();
    }
  }
  
  /**
   * Stop resilience management
   */
  stop() {
    this.qualityMonitor.stopMonitoring();
  }
  
  /**
   * Set WebSocket for backpressure management
   */
  setWebSocket(socket) {
    this.backpressureManager.setSocket(socket);
  }
  
  /**
   * Send data with resilience handling
   */
  async sendData(data, priority = 'normal') {
    return await this.backpressureManager.send(data, priority);
  }
  
  /**
   * Get comprehensive metrics
   */
  getMetrics() {
    return {
      quality: this.qualityMonitor.getQualityMetrics(),
      backpressure: this.backpressureManager.getMetrics(),
      currentSettings: this.currentSettings,
      timestamp: Date.now()
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
      this.eventHandlers.get(event).forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in network resilience manager event handler for ${event}:`, error);
        }
      });
    }
  }
  
  /**
   * Destroy manager
   */
  destroy() {
    this.stop();
    this.backpressureManager.destroy();
    this.qualityMonitor.destroy();
    this.eventHandlers.clear();
  }
}

export default {
  WebSocketBackpressureManager,
  NetworkQualityMonitor,
  NetworkResilienceManager
};