/**
 * Performance Benchmarks for Enhanced Audio Buffer Management
 * 
 * This script provides comprehensive performance testing and benchmarking
 * for the enhanced audio buffer management system.
 */

import AudioBufferManager from './audioBufferManager.js';
import { AudioMemoryManager, AudioPerformanceMonitor } from './audioUtils.js';
import { NetworkResilienceManager } from './networkResilienceManager.js';

/**
 * Performance Benchmark Suite
 */
export class AudioPerformanceBenchmark {
  constructor() {
    this.results = {
      latency: [],
      throughput: [],
      memory: [],
      cpu: [],
      bufferHealth: [],
      networkAdaptation: []
    };
    
    this.testConfigurations = [
      {
        name: 'Low Latency',
        config: {
          inputSampleRate: 16000,
          initialBufferSize: 1024,
          latencyTarget: 10
        }
      },
      {
        name: 'Standard Quality',
        config: {
          inputSampleRate: 16000,
          initialBufferSize: 2048,
          latencyTarget: 20
        }
      },
      {
        name: 'High Quality',
        config: {
          inputSampleRate: 48000,
          initialBufferSize: 4096,
          latencyTarget: 50
        }
      },
      {
        name: 'Mobile Optimized',
        config: {
          inputSampleRate: 16000,
          initialBufferSize: 1024,
          latencyTarget: 30,
          enableAdaptiveQuality: true
        }
      }
    ];
  }
  
  /**
   * Run comprehensive performance benchmarks
   */
  async runBenchmarks() {
    console.log('🚀 Starting Enhanced Audio Buffer Management Performance Benchmarks...\n');
    
    for (const testConfig of this.testConfigurations) {
      console.log(`📊 Running benchmark: ${testConfig.name}`);
      await this.runSingleBenchmark(testConfig);
    }
    
    this.generateReport();
    return this.results;
  }
  
  /**
   * Run a single benchmark configuration
   */
  async runSingleBenchmark(testConfig) {
    const audioManager = new AudioBufferManager(testConfig.config);
    const memoryManager = new AudioMemoryManager();
    const performanceMonitor = new AudioPerformanceMonitor();
    
    try {
      audioManager.start();
      performanceMonitor.startMonitoring();
      
      // Latency benchmark
      const latencyResults = await this.benchmarkLatency(audioManager);
      
      // Throughput benchmark
      const throughputResults = await this.benchmarkThroughput(audioManager);
      
      // Memory efficiency benchmark
      const memoryResults = await this.benchmarkMemory(audioManager, memoryManager);
      
      // Buffer health benchmark
      const bufferResults = await this.benchmarkBufferHealth(audioManager);
      
      // Network adaptation benchmark
      const networkResults = await this.benchmarkNetworkAdaptation(audioManager);
      
      // Store results
      this.results.latency.push({
        config: testConfig.name,
        ...latencyResults
      });
      
      this.results.throughput.push({
        config: testConfig.name,
        ...throughputResults
      });
      
      this.results.memory.push({
        config: testConfig.name,
        ...memoryResults
      });
      
      this.results.bufferHealth.push({
        config: testConfig.name,
        ...bufferResults
      });
      
      this.results.networkAdaptation.push({
        config: testConfig.name,
        ...networkResults
      });
      
      console.log(`  ✅ Latency: ${latencyResults.averageLatency.toFixed(2)}ms`);
      console.log(`  ✅ Throughput: ${throughputResults.samplesPerSecond.toFixed(0)} samples/sec`);
      console.log(`  ✅ Memory efficiency: ${memoryResults.efficiency.toFixed(1)}%`);
      console.log(`  ✅ Buffer health: ${bufferResults.healthScore.toFixed(1)}%\n`);
      
    } finally {
      performanceMonitor.stopMonitoring();
      audioManager.destroy();
      memoryManager.destroy();
    }
  }
  
  /**
   * Benchmark latency performance
   */
  async benchmarkLatency(audioManager) {
    const latencies = [];
    const testDuration = 5000; // 5 seconds
    const sampleRate = audioManager.config.inputSampleRate;
    const bufferSize = 1024;
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < testDuration) {
      const inputTimestamp = Date.now();
      
      // Simulate audio processing
      const testData = new Float32Array(bufferSize);
      for (let i = 0; i < testData.length; i++) {
        testData[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate); // 440Hz tone
      }
      
      const processingStart = performance.now();
      audioManager.writeInputData(testData, inputTimestamp);
      const readData = audioManager.readInputData(bufferSize);
      const processingEnd = performance.now();
      
      const processingLatency = processingEnd - processingStart;
      const glassToGlassLatency = audioManager.measureGlassToGlassLatency(inputTimestamp);
      
      latencies.push({
        processing: processingLatency,
        glassToGlass: glassToGlassLatency
      });
      
      // Wait for next frame (simulate real-time processing)
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    const processingLatencies = latencies.map(l => l.processing);
    const glassToGlassLatencies = latencies.map(l => l.glassToGlass);
    
    return {
      averageLatency: this.calculateAverage(processingLatencies),
      maxLatency: Math.max(...processingLatencies),
      minLatency: Math.min(...processingLatencies),
      p95Latency: this.calculatePercentile(processingLatencies, 95),
      averageGlassToGlass: this.calculateAverage(glassToGlassLatencies),
      maxGlassToGlass: Math.max(...glassToGlassLatencies),
      jitter: this.calculateJitter(processingLatencies),
      sampleCount: latencies.length
    };
  }
  
  /**
   * Benchmark throughput performance
   */
  async benchmarkThroughput(audioManager) {
    const testDuration = 3000; // 3 seconds
    const bufferSize = 2048;
    let totalSamples = 0;
    let totalOperations = 0;
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < testDuration) {
      const testData = new Float32Array(bufferSize);
      testData.fill(Math.random() * 0.1);
      
      const written = audioManager.writeInputData(testData);
      const readData = audioManager.readInputData(bufferSize);
      
      totalSamples += written;
      totalOperations++;
    }
    
    const actualDuration = Date.now() - startTime;
    
    return {
      samplesPerSecond: (totalSamples / actualDuration) * 1000,
      operationsPerSecond: (totalOperations / actualDuration) * 1000,
      totalSamples,
      totalOperations,
      duration: actualDuration
    };
  }
  
  /**
   * Benchmark memory efficiency
   */
  async benchmarkMemory(audioManager, memoryManager) {
    const initialMemory = memoryManager.getMemoryStats();
    const bufferSizes = [512, 1024, 2048, 4096, 8192];
    let totalAllocations = 0;
    let totalDeallocations = 0;
    
    // Stress test memory allocation/deallocation
    for (let cycle = 0; cycle < 100; cycle++) {
      for (const size of bufferSizes) {
        const buffer = memoryManager.allocateBuffer(Float32Array, size);
        totalAllocations++;
        
        // Simulate some processing
        buffer.fill(Math.random());
        
        memoryManager.deallocateBuffer(buffer, true);
        totalDeallocations++;
      }
    }
    
    const finalMemory = memoryManager.getMemoryStats();
    const memoryGrowth = finalMemory.currentBytes - initialMemory.currentBytes;
    const efficiency = totalDeallocations / totalAllocations;
    
    return {
      initialMemoryMB: initialMemory.currentMB,
      finalMemoryMB: finalMemory.currentMB,
      memoryGrowthMB: memoryGrowth / (1024 * 1024),
      efficiency: efficiency * 100,
      allocations: totalAllocations,
      deallocations: totalDeallocations,
      poolEfficiency: this.calculatePoolEfficiency(finalMemory.poolSizes)
    };
  }
  
  /**
   * Benchmark buffer health
   */
  async benchmarkBufferHealth(audioManager) {
    const testDuration = 2000; // 2 seconds
    const startTime = Date.now();
    
    let healthChecks = 0;
    let healthyChecks = 0;
    let totalUnderruns = 0;
    let totalOverruns = 0;
    
    while (Date.now() - startTime < testDuration) {
      // Vary the data size to stress the buffers
      const dataSize = Math.floor(Math.random() * 4096) + 512;
      const testData = new Float32Array(dataSize);
      testData.fill(Math.random() * 0.5);
      
      audioManager.writeInputData(testData);
      audioManager.readInputData(Math.floor(dataSize * 0.8));
      
      const isHealthy = audioManager.isHealthy();
      const metrics = audioManager.getComprehensiveMetrics();
      
      healthChecks++;
      if (isHealthy) healthyChecks++;
      
      totalUnderruns += metrics.inputBuffer.underruns;
      totalOverruns += metrics.inputBuffer.overruns;
      
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    
    const healthScore = (healthyChecks / healthChecks) * 100;
    
    return {
      healthScore,
      totalHealthChecks: healthChecks,
      healthyChecks,
      totalUnderruns,
      totalOverruns,
      underrunRate: totalUnderruns / healthChecks,
      overrunRate: totalOverruns / healthChecks
    };
  }
  
  /**
   * Benchmark network adaptation
   */
  async benchmarkNetworkAdaptation(audioManager) {
    const networkManager = new NetworkResilienceManager();
    networkManager.start();
    
    // Simulate varying network conditions
    const networkScenarios = [
      { quality: 1.0, latency: 20, name: 'Excellent' },
      { quality: 0.8, latency: 50, name: 'Good' },
      { quality: 0.5, latency: 100, name: 'Poor' },
      { quality: 0.2, latency: 300, name: 'Very Poor' }
    ];
    
    const adaptationResults = [];
    
    for (const scenario of networkScenarios) {
      // Simulate network conditions
      networkManager.qualityMonitor.currentQuality = scenario;
      
      const startTime = Date.now();
      let adaptations = 0;
      
      // Listen for adaptations
      const adaptationHandler = () => adaptations++;
      networkManager.on('settingsChanged', adaptationHandler);
      
      // Run for a short period
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      networkManager.off('settingsChanged', adaptationHandler);
      
      adaptationResults.push({
        scenario: scenario.name,
        quality: scenario.quality,
        latency: scenario.latency,
        adaptations,
        duration: Date.now() - startTime
      });
    }
    
    networkManager.destroy();
    
    return {
      scenarioResults: adaptationResults,
      totalAdaptations: adaptationResults.reduce((sum, r) => sum + r.adaptations, 0),
      adaptationEfficiency: this.calculateAdaptationEfficiency(adaptationResults)
    };
  }
  
  /**
   * Calculate various statistics
   */
  calculateAverage(values) {
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }
  
  calculatePercentile(values, percentile) {
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }
  
  calculateJitter(values) {
    if (values.length < 2) return 0;
    
    let jitterSum = 0;
    for (let i = 1; i < values.length; i++) {
      jitterSum += Math.abs(values[i] - values[i - 1]);
    }
    
    return jitterSum / (values.length - 1);
  }
  
  calculatePoolEfficiency(poolSizes) {
    const totalPools = Object.keys(poolSizes).length;
    const nonEmptyPools = Object.values(poolSizes).filter(size => size > 0).length;
    return totalPools > 0 ? (nonEmptyPools / totalPools) * 100 : 0;
  }
  
  calculateAdaptationEfficiency(results) {
    const totalScenarios = results.length;
    const adaptiveScenarios = results.filter(r => r.adaptations > 0).length;
    return totalScenarios > 0 ? (adaptiveScenarios / totalScenarios) * 100 : 0;
  }
  
  /**
   * Generate comprehensive performance report
   */
  generateReport() {
    console.log('\n📋 PERFORMANCE BENCHMARK REPORT');
    console.log('═══════════════════════════════════════\n');
    
    // Latency Report
    console.log('⏱️  LATENCY PERFORMANCE');
    console.log('─────────────────────────');
    this.results.latency.forEach(result => {
      console.log(`${result.config}:`);
      console.log(`  Average: ${result.averageLatency.toFixed(2)}ms`);
      console.log(`  P95: ${result.p95Latency.toFixed(2)}ms`);
      console.log(`  Max: ${result.maxLatency.toFixed(2)}ms`);
      console.log(`  Jitter: ${result.jitter.toFixed(2)}ms`);
      console.log(`  Glass-to-Glass: ${result.averageGlassToGlass.toFixed(2)}ms\n`);
    });
    
    // Throughput Report
    console.log('🚀 THROUGHPUT PERFORMANCE');
    console.log('─────────────────────────');
    this.results.throughput.forEach(result => {
      console.log(`${result.config}:`);
      console.log(`  Samples/sec: ${result.samplesPerSecond.toFixed(0)}`);
      console.log(`  Operations/sec: ${result.operationsPerSecond.toFixed(0)}`);
      console.log(`  Total samples: ${result.totalSamples}\n`);
    });
    
    // Memory Report
    console.log('💾 MEMORY EFFICIENCY');
    console.log('────────────────────');
    this.results.memory.forEach(result => {
      console.log(`${result.config}:`);
      console.log(`  Memory growth: ${result.memoryGrowthMB.toFixed(2)}MB`);
      console.log(`  Allocation efficiency: ${result.efficiency.toFixed(1)}%`);
      console.log(`  Pool efficiency: ${result.poolEfficiency.toFixed(1)}%\n`);
    });
    
    // Buffer Health Report
    console.log('🏥 BUFFER HEALTH');
    console.log('────────────────');
    this.results.bufferHealth.forEach(result => {
      console.log(`${result.config}:`);
      console.log(`  Health score: ${result.healthScore.toFixed(1)}%`);
      console.log(`  Underrun rate: ${(result.underrunRate * 100).toFixed(2)}%`);
      console.log(`  Overrun rate: ${(result.overrunRate * 100).toFixed(2)}%\n`);
    });
    
    // Network Adaptation Report
    console.log('🌐 NETWORK ADAPTATION');
    console.log('─────────────────────');
    this.results.networkAdaptation.forEach(result => {
      console.log(`${result.config}:`);
      console.log(`  Total adaptations: ${result.totalAdaptations}`);
      console.log(`  Adaptation efficiency: ${result.adaptationEfficiency.toFixed(1)}%\n`);
    });
    
    // Overall Assessment
    this.generateOverallAssessment();
  }
  
  /**
   * Generate overall performance assessment
   */
  generateOverallAssessment() {
    console.log('🎯 OVERALL ASSESSMENT');
    console.log('────────────────────');
    
    const avgLatency = this.calculateAverage(this.results.latency.map(r => r.averageLatency));
    const avgThroughput = this.calculateAverage(this.results.throughput.map(r => r.samplesPerSecond));
    const avgHealthScore = this.calculateAverage(this.results.bufferHealth.map(r => r.healthScore));
    const avgMemoryEfficiency = this.calculateAverage(this.results.memory.map(r => r.efficiency));
    
    console.log(`Overall Latency: ${avgLatency.toFixed(2)}ms`);
    console.log(`Overall Throughput: ${avgThroughput.toFixed(0)} samples/sec`);
    console.log(`Overall Health Score: ${avgHealthScore.toFixed(1)}%`);
    console.log(`Overall Memory Efficiency: ${avgMemoryEfficiency.toFixed(1)}%`);
    
    // Performance grade
    const latencyGrade = avgLatency < 20 ? 'A' : avgLatency < 50 ? 'B' : avgLatency < 100 ? 'C' : 'D';
    const healthGrade = avgHealthScore > 95 ? 'A' : avgHealthScore > 85 ? 'B' : avgHealthScore > 70 ? 'C' : 'D';
    const memoryGrade = avgMemoryEfficiency > 90 ? 'A' : avgMemoryEfficiency > 80 ? 'B' : avgMemoryEfficiency > 70 ? 'C' : 'D';
    
    console.log(`\nPerformance Grades:`);
    console.log(`  Latency: ${latencyGrade}`);
    console.log(`  Health: ${healthGrade}`);
    console.log(`  Memory: ${memoryGrade}`);
    
    const overallGrade = [latencyGrade, healthGrade, memoryGrade].sort()[1]; // Median grade
    console.log(`  Overall: ${overallGrade}`);
    
    if (overallGrade === 'A') {
      console.log('\n🏆 EXCELLENT: The enhanced audio buffer management system demonstrates outstanding performance!');
    } else if (overallGrade === 'B') {
      console.log('\n✅ GOOD: The system performs well with room for minor optimizations.');
    } else if (overallGrade === 'C') {
      console.log('\n⚠️  ACCEPTABLE: The system meets basic requirements but could benefit from optimization.');
    } else {
      console.log('\n❌ NEEDS IMPROVEMENT: The system requires optimization to meet performance targets.');
    }
    
    console.log('\n═══════════════════════════════════════\n');
  }
}

/**
 * Standalone benchmark runner
 */
export async function runPerformanceBenchmarks() {
  const benchmark = new AudioPerformanceBenchmark();
  return await benchmark.runBenchmarks();
}

// Export for use in tests and standalone execution
export default AudioPerformanceBenchmark;