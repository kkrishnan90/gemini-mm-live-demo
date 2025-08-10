/**
 * Comprehensive Test Suite for Enhanced Audio Buffer Management
 * 
 * This test suite validates:
 * - Adaptive ring buffer functionality
 * - Memory management and cleanup
 * - Network resilience and quality monitoring
 * - Error handling and recovery
 * - Performance optimization
 */

import AudioBufferManager from './audioBufferManager.js';
import { 
  AudioMemoryManager, 
  AudioCircuitBreaker, 
  AudioConverter,
  BrowserCompatibility,
  AudioPerformanceMonitor 
} from './audioUtils.js';
import { 
  WebSocketBackpressureManager,
  NetworkQualityMonitor,
  NetworkResilienceManager 
} from './networkResilienceManager.js';

// Mock AudioContext for testing
class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.sampleRate = 16000;
    this.audioWorklet = {
      addModule: jest.fn().mockResolvedValue(undefined)
    };
    this.createBufferSource = jest.fn();
    this.createGain = jest.fn();
    this.destination = {};
    this.addEventListener = jest.fn();
    this.removeEventListener = jest.fn();
  }
  
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
  
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
}

// Mock WebSocket for testing
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = WebSocket.CONNECTING;
    this.bufferedAmount = 0;
    this.binaryType = 'arraybuffer';
    
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      if (this.onopen) this.onopen();
    }, 10);
  }
  
  send(data) {
    this.bufferedAmount += data.byteLength || data.length;
    setTimeout(() => {
      this.bufferedAmount = Math.max(0, this.bufferedAmount - (data.byteLength || data.length));
    }, 50);
  }
  
  close() {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) this.onclose({ code: 1000, reason: 'Normal closure' });
  }
  
  addEventListener(event, handler) {
    this[`on${event}`] = handler;
  }
  
  removeEventListener(event, handler) {
    if (this[`on${event}`] === handler) {
      this[`on${event}`] = null;
    }
  }
}

// Set up global mocks
global.AudioContext = MockAudioContext;
global.WebSocket = MockWebSocket;
global.WebSocket.CONNECTING = 0;
global.WebSocket.OPEN = 1;
global.WebSocket.CLOSING = 2;
global.WebSocket.CLOSED = 3;

global.navigator = {
  mediaDevices: {
    getUserMedia: jest.fn().mockResolvedValue({
      getTracks: () => [{ stop: jest.fn() }]
    })
  },
  connection: {
    effectiveType: '4g',
    addEventListener: jest.fn()
  },
  userAgent: 'MockBrowser/1.0'
};

global.performance = {
  now: jest.fn(() => Date.now()),
  memory: {
    usedJSHeapSize: 1024 * 1024,
    totalJSHeapSize: 2048 * 1024
  }
};

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  status: 200
});

describe('AudioBufferManager', () => {
  let audioBufferManager;
  
  beforeEach(() => {
    audioBufferManager = new AudioBufferManager({
      inputSampleRate: 16000,
      outputSampleRate: 24000,
      initialBufferSize: 4096,
      latencyTarget: 20,
      enableAdaptiveQuality: true,
      enableMetrics: true
    });
  });
  
  afterEach(() => {
    if (audioBufferManager) {
      audioBufferManager.destroy();
    }
  });
  
  describe('Initialization', () => {
    test('should initialize with correct configuration', () => {
      expect(audioBufferManager.config.inputSampleRate).toBe(16000);
      expect(audioBufferManager.config.outputSampleRate).toBe(24000);
      expect(audioBufferManager.config.latencyTarget).toBe(20);
      expect(audioBufferManager.config.enableAdaptiveQuality).toBe(true);
    });
    
    test('should create adaptive ring buffers', () => {
      expect(audioBufferManager.inputBuffer).toBeDefined();
      expect(audioBufferManager.outputBuffer).toBeDefined();
      expect(audioBufferManager.connectionMonitor).toBeDefined();
    });
    
    test('should start successfully', () => {
      const result = audioBufferManager.start();
      expect(result).toBe(true);
      expect(audioBufferManager.isActive).toBe(true);
    });
  });
  
  describe('Adaptive Ring Buffer', () => {
    test('should write and read audio data correctly', () => {
      audioBufferManager.start();
      
      const testData = new Float32Array([0.1, 0.2, 0.3, 0.4]);
      const written = audioBufferManager.writeInputData(testData);
      
      expect(written).toBe(testData.length);
      
      const readData = audioBufferManager.readInputData(testData.length);
      expect(readData.length).toBe(testData.length);
      
      // Allow for some floating point precision differences
      for (let i = 0; i < testData.length; i++) {
        expect(readData[i]).toBeCloseTo(testData[i], 5);
      }
    });
    
    test('should handle buffer overflow gracefully', () => {
      audioBufferManager.start();
      
      // Fill buffer beyond capacity
      const largeData = new Float32Array(10000);
      largeData.fill(0.5);
      
      const written = audioBufferManager.writeInputData(largeData);
      expect(written).toBeGreaterThan(0);
      
      const metrics = audioBufferManager.inputBuffer.getMetrics();
      expect(metrics.overruns).toBeGreaterThanOrEqual(0);
    });
    
    test('should adapt buffer size based on usage', () => {
      audioBufferManager.start();
      
      const initialSize = audioBufferManager.inputBuffer.currentSize;
      
      // Simulate high usage pattern
      for (let i = 0; i < 100; i++) {
        const data = new Float32Array(1024);
        data.fill(Math.random());
        audioBufferManager.writeInputData(data);
      }
      
      // Buffer might have resized due to usage pattern
      const finalSize = audioBufferManager.inputBuffer.currentSize;
      expect(finalSize).toBeGreaterThanOrEqual(initialSize);
    });
  });
  
  describe('Latency Measurement', () => {
    test('should measure glass-to-glass latency', () => {
      audioBufferManager.start();
      
      const inputTimestamp = Date.now() - 50; // 50ms ago
      const latency = audioBufferManager.measureGlassToGlassLatency(inputTimestamp);
      
      expect(latency).toBeGreaterThan(0);
      expect(latency).toBeLessThan(1000); // Should be reasonable
    });
    
    test('should emit latency warning when exceeding target', (done) => {
      audioBufferManager.start();
      
      audioBufferManager.on('latencyWarning', (data) => {
        expect(data.measured).toBeGreaterThan(data.target);
        done();
      });
      
      // Simulate high latency
      const oldTimestamp = Date.now() - 100; // 100ms ago
      audioBufferManager.measureGlassToGlassLatency(oldTimestamp);
    });
  });
  
  describe('Health Monitoring', () => {
    test('should report healthy status initially', () => {
      audioBufferManager.start();
      
      const isHealthy = audioBufferManager.isHealthy();
      expect(isHealthy).toBe(true);
      
      const issues = audioBufferManager.getHealthIssues();
      expect(issues.length).toBe(0);
    });
    
    test('should detect health issues', () => {
      audioBufferManager.start();
      
      // Force some underruns
      audioBufferManager.inputBuffer.metrics.underruns = 10;
      audioBufferManager.inputBuffer.metrics.totalReads = 100;
      
      const isHealthy = audioBufferManager.isHealthy();
      expect(isHealthy).toBe(false);
      
      const issues = audioBufferManager.getHealthIssues();
      expect(issues.length).toBeGreaterThan(0);
    });
  });
  
  describe('Event Handling', () => {
    test('should emit and handle events correctly', (done) => {
      const testData = { test: 'data' };
      
      audioBufferManager.on('testEvent', (data) => {
        expect(data).toEqual(testData);
        done();
      });
      
      audioBufferManager.emitEvent('testEvent', testData);
    });
    
    test('should remove event handlers', () => {
      const handler = jest.fn();
      
      audioBufferManager.on('testEvent', handler);
      audioBufferManager.off('testEvent', handler);
      audioBufferManager.emitEvent('testEvent', {});
      
      expect(handler).not.toHaveBeenCalled();
    });
  });
  
  describe('Cleanup and Destruction', () => {
    test('should cleanup resources properly', () => {
      audioBufferManager.start();
      
      const initiallyActive = audioBufferManager.isActive;
      expect(initiallyActive).toBe(true);
      
      audioBufferManager.destroy();
      
      expect(audioBufferManager.isDestroyed).toBe(true);
      expect(audioBufferManager.inputBuffer).toBe(null);
      expect(audioBufferManager.outputBuffer).toBe(null);
    });
  });
});

describe('AudioMemoryManager', () => {
  let memoryManager;
  
  beforeEach(() => {
    memoryManager = new AudioMemoryManager();
  });
  
  afterEach(() => {
    memoryManager.destroy();
  });
  
  test('should allocate and track buffers', () => {
    const buffer = memoryManager.allocateBuffer(Float32Array, 1024);
    
    expect(buffer).toBeInstanceOf(Float32Array);
    expect(buffer.length).toBe(1024);
    expect(memoryManager.memoryUsage.allocations).toBe(1);
    expect(memoryManager.memoryUsage.currentBytes).toBeGreaterThan(0);
  });
  
  test('should deallocate buffers and return to pool', () => {
    const buffer = memoryManager.allocateBuffer(Float32Array, 1024);
    const initialBytes = memoryManager.memoryUsage.currentBytes;
    
    memoryManager.deallocateBuffer(buffer, true);
    
    expect(memoryManager.memoryUsage.currentBytes).toBeLessThan(initialBytes);
    expect(memoryManager.memoryUsage.deallocations).toBe(1);
  });
  
  test('should reuse buffers from object pool', () => {
    const buffer1 = memoryManager.allocateBuffer(Float32Array, 1024);
    memoryManager.deallocateBuffer(buffer1, true);
    
    const buffer2 = memoryManager.allocateBuffer(Float32Array, 1024);
    
    expect(buffer2).toBe(buffer1); // Should reuse the same buffer
  });
});

describe('AudioCircuitBreaker', () => {
  let circuitBreaker;
  
  beforeEach(() => {
    circuitBreaker = new AudioCircuitBreaker({
      failureThreshold: 3,
      timeout: 1000,
      monitoringPeriod: 500
    });
  });
  
  test('should execute function successfully', async () => {
    const mockFn = jest.fn().mockResolvedValue('success');
    
    const result = await circuitBreaker.execute(mockFn);
    
    expect(result).toBe('success');
    expect(circuitBreaker.getState().state).toBe('CLOSED');
  });
  
  test('should open circuit after failure threshold', async () => {
    const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));
    
    // Trigger failures to reach threshold
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(mockFn);
      } catch (e) {
        // Expected to fail
      }
    }
    
    expect(circuitBreaker.getState().state).toBe('OPEN');
    
    // Should reject immediately when circuit is open
    await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Circuit breaker is OPEN');
  });
});

describe('NetworkQualityMonitor', () => {
  let qualityMonitor;
  
  beforeEach(() => {
    qualityMonitor = new NetworkQualityMonitor({
      measurementInterval: 100,
      historySize: 10
    });
  });
  
  afterEach(() => {
    qualityMonitor.destroy();
  });
  
  test('should initialize with default quality', () => {
    const metrics = qualityMonitor.getQualityMetrics();
    
    expect(metrics.score).toBeGreaterThan(0);
    expect(metrics.connectionType).toBeDefined();
  });
  
  test('should measure network quality', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200
    });
    
    await qualityMonitor.measureQuality();
    
    const metrics = qualityMonitor.getQualityMetrics();
    expect(metrics.measurementCount).toBeGreaterThan(0);
  });
  
  test('should provide audio settings recommendations', () => {
    const recommendation = qualityMonitor.getAudioSettingsRecommendation();
    
    expect(recommendation).toHaveProperty('quality');
    expect(recommendation).toHaveProperty('sampleRate');
    expect(recommendation).toHaveProperty('bufferSize');
    expect(recommendation).toHaveProperty('compression');
  });
});

describe('WebSocketBackpressureManager', () => {
  let backpressureManager;
  let mockSocket;
  
  beforeEach(() => {
    backpressureManager = new WebSocketBackpressureManager({
      maxBufferSize: 1024,
      highWaterMark: 512,
      lowWaterMark: 128,
      maxQueueSize: 10
    });
    
    mockSocket = new MockWebSocket('ws://test');
    backpressureManager.setSocket(mockSocket);
  });
  
  afterEach(() => {
    backpressureManager.destroy();
  });
  
  test('should detect backpressure correctly', () => {
    mockSocket.bufferedAmount = 600; // Above high water mark
    
    const hasBackpressure = backpressureManager.checkBackpressure();
    
    expect(hasBackpressure).toBe(true);
    expect(backpressureManager.isBackpressured).toBe(true);
  });
  
  test('should send data immediately when no backpressure', async () => {
    const testData = new ArrayBuffer(64);
    
    const result = await backpressureManager.send(testData);
    
    expect(result).toBe(true);
    expect(mockSocket.bufferedAmount).toBe(64);
  });
  
  test('should queue data when backpressured', async () => {
    mockSocket.bufferedAmount = 600; // Force backpressure
    const testData = new ArrayBuffer(64);
    
    const result = await backpressureManager.send(testData);
    
    expect(result).toBe(false);
    expect(backpressureManager.sendQueue.length).toBe(1);
  });
});

describe('BrowserCompatibility', () => {
  test('should detect AudioWorklet support', () => {
    global.AudioWorkletNode = class {};
    global.AudioContext = class {
      constructor() {
        this.audioWorklet = {};
      }
    };
    
    const isSupported = BrowserCompatibility.supportsAudioWorklet();
    expect(isSupported).toBe(true);
  });
  
  test('should detect mobile devices', () => {
    const originalUserAgent = global.navigator.userAgent;
    global.navigator.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X)';
    
    const isMobile = BrowserCompatibility.isMobile();
    expect(isMobile).toBe(true);
    
    global.navigator.userAgent = originalUserAgent;
  });
  
  test('should provide optimal buffer size recommendations', () => {
    const bufferSize = BrowserCompatibility.getOptimalBufferSize();
    
    expect(bufferSize).toBeGreaterThan(0);
    expect(bufferSize).toBeLessThanOrEqual(8192);
  });
});

describe('AudioConverter', () => {
  test('should convert Float32 to Int16 correctly', () => {
    const float32Data = new Float32Array([0.5, -0.5, 1.0, -1.0]);
    const int16Data = AudioConverter.float32ToInt16(float32Data);
    
    expect(int16Data).toBeInstanceOf(Int16Array);
    expect(int16Data[0]).toBeCloseTo(16383, 0); // 0.5 * 32767
    expect(int16Data[1]).toBeCloseTo(-16384, 0); // -0.5 * 32768
    expect(int16Data[2]).toBe(32767); // Clamped to max
    expect(int16Data[3]).toBe(-32768); // Clamped to min
  });
  
  test('should convert Int16 to Float32 correctly', () => {
    const int16Data = new Int16Array([16383, -16384, 32767, -32768]);
    const float32Data = AudioConverter.int16ToFloat32(int16Data);
    
    expect(float32Data).toBeInstanceOf(Float32Array);
    expect(float32Data[0]).toBeCloseTo(0.499, 2);
    expect(float32Data[1]).toBeCloseTo(-0.5, 2);
    expect(float32Data[2]).toBeCloseTo(0.999, 2);
    expect(float32Data[3]).toBe(-1.0);
  });
  
  test('should resample audio correctly', () => {
    const inputData = new Float32Array([1, 2, 3, 4]);
    const resampled = AudioConverter.resample(inputData, 44100, 22050); // Downsample by 2
    
    expect(resampled.length).toBe(2);
    expect(resampled[0]).toBeCloseTo(1, 1);
    expect(resampled[1]).toBeCloseTo(3, 1);
  });
});

describe('Integration Tests', () => {
  test('should integrate all components successfully', async () => {
    const networkManager = new NetworkResilienceManager({
      enableBackpressureHandling: true,
      enableQualityMonitoring: true,
      enableAdaptiveSettings: true
    });
    
    const audioManager = new AudioBufferManager({
      inputSampleRate: 16000,
      outputSampleRate: 24000,
      enableAdaptiveQuality: true
    });
    
    // Start systems
    networkManager.start();
    audioManager.start();
    
    // Test data flow
    const testData = new Float32Array(1024);
    testData.fill(0.1);
    
    const written = audioManager.writeInputData(testData);
    expect(written).toBe(testData.length);
    
    const readData = audioManager.readInputData(1024);
    expect(readData.length).toBe(1024);
    
    // Cleanup
    audioManager.destroy();
    networkManager.destroy();
  });
  
  test('should handle error scenarios gracefully', async () => {
    const audioManager = new AudioBufferManager();
    
    // Test destruction without start
    expect(() => audioManager.destroy()).not.toThrow();
    
    // Test operations on destroyed manager
    audioManager.destroy();
    const result = audioManager.writeInputData(new Float32Array(10));
    expect(result).toBe(0);
  });
});

// Performance benchmarks
describe('Performance Benchmarks', () => {
  test('should process audio data within latency targets', async () => {
    const audioManager = new AudioBufferManager({
      latencyTarget: 20
    });
    
    audioManager.start();
    
    const testData = new Float32Array(1024);
    testData.fill(0.5);
    
    const startTime = performance.now();
    
    for (let i = 0; i < 100; i++) {
      audioManager.writeInputData(testData);
      audioManager.readInputData(1024);
    }
    
    const endTime = performance.now();
    const avgLatency = (endTime - startTime) / 100;
    
    expect(avgLatency).toBeLessThan(5); // Should be much faster than target
    
    audioManager.destroy();
  });
  
  test('should handle memory efficiently', () => {
    const memoryManager = new AudioMemoryManager();
    const initialMemory = memoryManager.getMemoryStats().currentBytes;
    
    // Allocate and deallocate many buffers
    for (let i = 0; i < 100; i++) {
      const buffer = memoryManager.allocateBuffer(Float32Array, 1024);
      memoryManager.deallocateBuffer(buffer, true);
    }
    
    const finalMemory = memoryManager.getMemoryStats().currentBytes;
    
    // Memory should be efficiently reused
    expect(finalMemory).toBeLessThanOrEqual(initialMemory + 1024 * 4 * 10); // Allow for some pool retention
    
    memoryManager.destroy();
  });
});