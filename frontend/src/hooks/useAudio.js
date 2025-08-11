import { useState, useEffect, useRef, useCallback } from 'react';
import AudioBufferManager from '../utils/audioBufferManager.js';
import { createAudioProcessor } from '../utils/scriptProcessorFallback.js';
import { NetworkResilienceManager } from '../utils/networkResilienceManager.js';
import { validateAudioSystemRecovery } from '../utils/audioUtils.js';
import { guaranteedAudioTransmission } from '../utils/webSocketUtils';
import {
  INPUT_SAMPLE_RATE,
  OUTPUT_SAMPLE_RATE,
  MIC_BUFFER_SIZE,
  LATENCY_TARGET_MS,
  MAX_AUDIO_CONTEXT_RECOVERY_ATTEMPTS,
  AUDIO_CONTEXT_RECOVERY_DELAY,
} from '../utils/constants';

export const useAudio = (addLogEntry, isSessionActive, isPlayingRef, stopSystemAudioPlayback, sendAudioChunkWithBackpressure, socketRef, isWebSocketReady) => {
  const [audioHealth, setAudioHealth] = useState({ isHealthy: true, issues: [] });
  const [networkQuality, setNetworkQuality] = useState({ score: 1.0, latency: 0 });
  const [bufferMetrics, setBufferMetrics] = useState({ inputFillLevel: 0, outputFillLevel: 0 });
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const localAudioContextRef = useRef(null);
  const audioProcessorRef = useRef(null);
  const audioBufferManagerRef = useRef(null);
  const networkResilienceManagerRef = useRef(null);
  const audioContextRecoveryAttempts = useRef(0);
  const mediaStreamRef = useRef(null);
  const isRecordingRef = useRef(isRecording);
  const isMutedRef = useRef(isMuted);
  const glassToGlassLatencyRef = useRef([]);
  const audioMetricsRef = useRef({ dropouts: 0, latency: 0, quality: 1.0, retryCount: 0, failedTransmissions: 0 });
  const audioChunkSentCountRef = useRef(0);
  const lastSendTimeRef = useRef(0);

  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  const monitorAudioContextState = useCallback((context, contextName) => {
    if (!context) return;
    const handleStateChange = () => {
      const state = context.state;
      addLogEntry("audio_context", `${contextName} state changed to: ${state}`);
      if (state === 'suspended') {
        addLogEntry("warning", `${contextName} suspended - attempting recovery`);
        recoverAudioContext(context, contextName);
      } else if (state === 'interrupted') {
        addLogEntry("warning", `${contextName} interrupted - scheduling recovery`);
        setTimeout(() => recoverAudioContext(context, contextName), AUDIO_CONTEXT_RECOVERY_DELAY);
      } else if (state === 'closed') {
        addLogEntry("error", `${contextName} closed - reinitializing required`);
        if (contextName === 'LocalAudioContext') setTimeout(() => reinitializeAudioContext(), 100);
        if (contextName === 'PlaybackAudioContext' && isPlayingRef.current) addLogEntry("warning", "Playback context closed during audio - deferring recovery");
      } else if (state === 'running') {
        addLogEntry("success", `${contextName} successfully running`);
        audioContextRecoveryAttempts.current = 0;
      }
    };
    context.addEventListener('statechange', handleStateChange);
    return () => context.removeEventListener('statechange', handleStateChange);
  }, [addLogEntry, isPlayingRef]);

  const recoverAudioContext = useCallback(async (context, contextName) => {
    if (!context || context.state === 'closed') return false;
    if (audioContextRecoveryAttempts.current >= MAX_AUDIO_CONTEXT_RECOVERY_ATTEMPTS) {
      addLogEntry("error", `${contextName} recovery failed after ${MAX_AUDIO_CONTEXT_RECOVERY_ATTEMPTS} attempts`);
      return false;
    }
    audioContextRecoveryAttempts.current++;
    try {
      if (context.state === 'suspended') {
        addLogEntry("info", `Attempting to resume ${contextName} (attempt ${audioContextRecoveryAttempts.current})`);
        await context.resume();
        if (context.state === 'running') {
          addLogEntry("success", `${contextName} successfully resumed`);
          audioContextRecoveryAttempts.current = 0;
          return true;
        }
      }
    } catch (error) {
      addLogEntry("error", `Failed to resume ${contextName}: ${error.message}`);
    }
    if (audioContextRecoveryAttempts.current < MAX_AUDIO_CONTEXT_RECOVERY_ATTEMPTS) {
      const delay = AUDIO_CONTEXT_RECOVERY_DELAY * audioContextRecoveryAttempts.current;
      setTimeout(() => recoverAudioContext(context, contextName), delay);
    }
    return false;
  }, [addLogEntry]);

  const reinitializeAudioContext = useCallback(async () => {
    if (!isSessionActive) return;
    addLogEntry("info", "Reinitializing AudioContext after closure");
    try {
      if (localAudioContextRef.current) {
        if (audioProcessorRef.current) {
          audioProcessorRef.current.disconnect();
          audioProcessorRef.current.destroy();
          audioProcessorRef.current = null;
        }
        localAudioContextRef.current = null;
      }
    } catch (error) {
      addLogEntry("error", `AudioContext reinitialization failed: ${error.message}`);
    }
  }, [addLogEntry, isSessionActive]);

  const setupAudioProcessorEventHandlers = useCallback(() => {
    if (!audioProcessorRef.current) return;
    audioProcessorRef.current.on('audioData', async (data) => {
      if (!isWebSocketReady) return;
      const glassToGlassLatency = Date.now() - data.timestamp;
      glassToGlassLatencyRef.current.push(glassToGlassLatency);
      if (glassToGlassLatencyRef.current.length > 100) glassToGlassLatencyRef.current.slice(-100);
      if (audioBufferManagerRef.current) {
        audioBufferManagerRef.current.writeInputData(new Float32Array(data.audioData), data.timestamp);
        audioBufferManagerRef.current.measureGlassToGlassLatency(data.timestamp);
      }
      try {
        const result = await guaranteedAudioTransmission(data.audioData, socketRef.current, networkResilienceManagerRef.current, addLogEntry, { sendAudioChunkWithBackpressure });
        if (result.success) {
          audioChunkSentCountRef.current++;
          lastSendTimeRef.current = Date.now();
          addLogEntry("audio_send", `SUCCESS: Audio transmission successful via ${result.method}`);
        } else {
          audioMetricsRef.current.failedTransmissions++;
          addLogEntry("error", "CRITICAL FAILURE: All transmission methods exhausted");
          addLogEntry("debug", `Failed attempts: ${result.attempts.length}`);
        }
      } catch (error) {
        addLogEntry("error", `CRITICAL: Bulletproof transmission system error: ${error.message}`);
        audioMetricsRef.current.failedTransmissions++;
      }
    });
    audioProcessorRef.current.on('bargeInDetected', (data) => {
      addLogEntry("vad_activation", `VAD Activated: User speech detected during playback.`);
      if (isPlayingRef.current) {
        addLogEntry("barge_in", `User speech detected during playback (energy: ${data.energy.toFixed(3)})`);
        stopSystemAudioPlayback();
      }
    });
    audioProcessorRef.current.on('metrics', (data) => {
      audioMetricsRef.current = { ...audioMetricsRef.current, ...data.performance };
    });
    audioProcessorRef.current.on('error', (data) => addLogEntry("error", `Audio processor error (${data.context}): ${data.error}`));
    audioProcessorRef.current.on('fatalError', (data) => {
      addLogEntry("error", `Fatal audio processor error (${data.context}): ${data.error}`);
      setTimeout(() => {
        if (isSessionActive && !audioProcessorRef.current) {
          addLogEntry("info", "Attempting audio processor recovery...");
          initializeEnhancedAudioProcessor();
        }
      }, 2000);
    });
  }, [addLogEntry, stopSystemAudioPlayback, sendAudioChunkWithBackpressure, isPlayingRef, socketRef, isSessionActive, isWebSocketReady]);

  const initializeEnhancedAudioProcessor = useCallback(async () => {
    try {
      if (localAudioContextRef.current && localAudioContextRef.current.state === "closed") localAudioContextRef.current = null;
      if (!localAudioContextRef.current) {
        localAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: INPUT_SAMPLE_RATE });
        monitorAudioContextState(localAudioContextRef.current, 'LocalAudioContext');
      }
      audioProcessorRef.current = await createAudioProcessor(localAudioContextRef.current, { bufferSize: MIC_BUFFER_SIZE, sampleRate: INPUT_SAMPLE_RATE, channelCount: 1, enableAdaptive: true, enableMetrics: true });
      setupAudioProcessorEventHandlers();
      addLogEntry("mic", "Enhanced audio processor initialized successfully");
      return true;
    } catch (error) {
      addLogEntry("error", `Failed to initialize enhanced audio processor: ${error.message}`);
      console.error("Enhanced audio processor initialization error:", error);
      return false;
    }
  }, [addLogEntry, monitorAudioContextState, setupAudioProcessorEventHandlers]);

  const setupAudioSystemEventHandlers = useCallback(() => {
    if (!audioBufferManagerRef.current || !networkResilienceManagerRef.current) return;
    audioBufferManagerRef.current.on('bufferWarning', (data) => addLogEntry("warning", `Buffer warning: ${data.type} buffer ${data.level} fill level (${(data.fillLevel * 100).toFixed(1)}%)`));
    audioBufferManagerRef.current.on('latencyWarning', (data) => addLogEntry("warning", `Latency warning: ${data.measured}ms exceeds target ${data.target}ms`));
    audioBufferManagerRef.current.on('metrics', (data) => {
      setBufferMetrics({ inputFillLevel: data.inputBuffer.fillLevel, outputFillLevel: data.outputBuffer.fillLevel });
      setAudioHealth({ isHealthy: data.health.isHealthy, issues: data.health.issues });
    });
    networkResilienceManagerRef.current.on('qualityChanged', (data) => setNetworkQuality({ score: data.quality.score, latency: data.quality.latency }));
    networkResilienceManagerRef.current.on('settingsChanged', (data) => {
      addLogEntry("adaptive", `Audio settings adapted: ${data.reason}`);
      if (audioProcessorRef.current) audioProcessorRef.current.updateConfig(data.newSettings);
    });
    networkResilienceManagerRef.current.on('backpressureChanged', (data) => {
      if (data.active) addLogEntry("warning", `Network backpressure detected`);
      else addLogEntry("info", `Network backpressure resolved`);
    });
  }, [addLogEntry]);

  const cleanupAudioSystem = useCallback(() => {
    if (audioBufferManagerRef.current) {
      audioBufferManagerRef.current.destroy();
      audioBufferManagerRef.current = null;
    }
    if (networkResilienceManagerRef.current) {
      if (networkResilienceManagerRef.current._healthCheckInterval) clearInterval(networkResilienceManagerRef.current._healthCheckInterval);
      networkResilienceManagerRef.current.destroy();
      networkResilienceManagerRef.current = null;
    }
    if (audioProcessorRef.current) {
      audioProcessorRef.current.destroy();
      audioProcessorRef.current = null;
    }
  }, []);

  useEffect(() => {
    const initializeAudioSystem = async () => {
      try {
        if (!validateAudioSystemRecovery(addLogEntry)) addLogEntry("error", "Audio system validation failed");
        audioBufferManagerRef.current = new AudioBufferManager({ inputSampleRate: INPUT_SAMPLE_RATE, outputSampleRate: OUTPUT_SAMPLE_RATE, initialBufferSize: MIC_BUFFER_SIZE, latencyTarget: LATENCY_TARGET_MS, enableAdaptiveQuality: true, enableMetrics: true });
        networkResilienceManagerRef.current = new NetworkResilienceManager({ enableBackpressureHandling: true, enableQualityMonitoring: true, enableAdaptiveSettings: true });
        setupAudioSystemEventHandlers();
        const healthCheckInterval = setInterval(() => {
          if (networkResilienceManagerRef.current) {
            const recoveryResult = networkResilienceManagerRef.current.performIntelligentRecovery();
            if (recoveryResult.recovered) addLogEntry("recovery", `Periodic health check: Circuit breaker recovered (${recoveryResult.reason})`);
            else if (recoveryResult.reason !== 'no_recovery_needed') addLogEntry("debug", `Periodic health check: No recovery needed (${recoveryResult.reason})`);
            const readiness = networkResilienceManagerRef.current.isBulletproofReady();
            if (!readiness.ready && socketRef.current?.readyState === WebSocket.OPEN) {
              addLogEntry("debug", `Health check warning: Readiness issue detected - ${readiness.reason}`);
              if (readiness.reason === 'circuit_breaker_open') {
                const forceRecovered = networkResilienceManagerRef.current.forceCircuitBreakerRecovery();
                if (forceRecovered) addLogEntry("recovery", "Force recovery successful during health check");
              }
            }
          }
        }, 5000);
        networkResilienceManagerRef.current._healthCheckInterval = healthCheckInterval;
        addLogEntry("system", "Enhanced audio system initialized successfully");
      } catch (error) {
        addLogEntry("error", `Failed to initialize enhanced audio system: ${error.message}`);
      }
    };
    initializeAudioSystem();
    return () => cleanupAudioSystem();
  }, [addLogEntry, cleanupAudioSystem, setupAudioSystemEventHandlers, socketRef]);

  const handleStartListening = useCallback(async (isResuming = false) => {
    if (isRecordingRef.current && !isResuming) {
      addLogEntry("mic_control", "Mic already active. Start request ignored.");
      return;
    }
    if (!isSessionActive) {
      addLogEntry("mic_control", "Session not active. Cannot start microphone.");
      return;
    }
    addLogEntry("mic_control", isResuming ? "Resume Microphone Input requested." : "Start Microphone Input requested as part of session.");
    if (!mediaStreamRef.current || !localAudioContextRef.current || localAudioContextRef.current.state === "closed" || !audioProcessorRef.current) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        addLogEntry("error", "getUserMedia not supported on your browser!");
        return;
      }
      try {
        addLogEntry("mic", "Requesting microphone access for new stream...");
        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: INPUT_SAMPLE_RATE, channelCount: 1 } });
        addLogEntry("mic", "Microphone access GRANTED.");
        const audioProcessorInitialized = await initializeEnhancedAudioProcessor();
        if (!audioProcessorInitialized) {
          addLogEntry("error", "Failed to initialize audio processor");
          return;
        }
        const source = localAudioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
        if (audioProcessorRef.current.connect) {
          if (audioProcessorRef.current.constructor.name === 'ScriptProcessorFallback') audioProcessorRef.current.connect(source);
          else if (audioProcessorRef.current.workletNode) source.connect(audioProcessorRef.current.workletNode);
          else source.connect(audioProcessorRef.current);
        } else source.connect(audioProcessorRef.current);
        audioProcessorRef.current.updateConfig({ bufferSize: MIC_BUFFER_SIZE, vadThreshold: 0.04, noiseSuppression: true, enableAdaptive: true });
        if (audioBufferManagerRef.current) audioBufferManagerRef.current.start();
        if (networkResilienceManagerRef.current) networkResilienceManagerRef.current.start();
        addLogEntry("mic", "Enhanced audio processing chain established.");
      } catch (err) {
        console.error("Failed to start microphone:", err);
        addLogEntry("error", `Mic Setup Error: ${err.message}. Please check permissions.`);
        return;
      }
    } else if (localAudioContextRef.current.state === "suspended") {
      try {
        await localAudioContextRef.current.resume();
        addLogEntry("mic", "Local AudioContext for microphone resumed.");
      } catch (e) {
        addLogEntry("error", `Could not resume local audio context for mic: ${e.message}`);
        return;
      }
    }
    if (audioProcessorRef.current) audioProcessorRef.current.setRecording(true);
    setIsRecording(true);
    addLogEntry("mic_status", "Microphone is NOW actively sending data.");
  }, [addLogEntry, isSessionActive, initializeEnhancedAudioProcessor]);

  const handlePauseListening = useCallback(() => {
    if (!isRecordingRef.current) {
      addLogEntry("mic_control", "Not currently sending mic data. Pause request ignored.");
      return;
    }
    addLogEntry("mic_control", "Pause Microphone Input requested by user.");
    if (audioProcessorRef.current) audioProcessorRef.current.setRecording(false);
    setIsRecording(false);
    addLogEntry("mic_status", "Microphone is NOW paused (not sending data).");
  }, [addLogEntry]);

  const handleStopListeningAndCleanupMic = useCallback(() => {
    addLogEntry("mic_control", "Full Microphone Stop and Resource Cleanup requested.");
    setIsRecording(false);
    if (audioProcessorRef.current) {
      audioProcessorRef.current.setRecording(false);
      audioProcessorRef.current.disconnect();
      audioProcessorRef.current.destroy();
      audioProcessorRef.current = null;
      addLogEntry("mic_resource", "Enhanced audio processor stopped and cleaned up.");
    }
    if (audioBufferManagerRef.current) audioBufferManagerRef.current.stop();
    if (networkResilienceManagerRef.current) networkResilienceManagerRef.current.stop();
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      addLogEntry("mic_resource", "MediaStream tracks stopped and nullified.");
    }
    if (localAudioContextRef.current) {
      if (localAudioContextRef.current.state !== "closed") {
        localAudioContextRef.current.close().then(() => addLogEntry("mic_resource", "Local AudioContext for mic closed.")).catch((e) => addLogEntry("error", `Error closing Local AudioContext for mic: ${e.message}`));
      }
      localAudioContextRef.current = null;
    }
    addLogEntry("mic_status", "Microphone resources cleaned up.");
  }, [addLogEntry]);

  const handleMicMuteToggle = useCallback(() => {
    if (!isSessionActive) return;
    if (isRecordingRef.current) {
      setIsMuted((prevMuted) => {
        const newMutedState = !prevMuted;
        addLogEntry("mic_control", `Microphone ${newMutedState ? "MUTED" : "UNMUTED"}.`);
        return newMutedState;
      });
    } else {
      addLogEntry("mic_control", "Mic button (unmute/start) pressed while not recording in active session. Attempting to start mic.");
      setIsMuted(false);
      handleStartListening();
    }
  }, [addLogEntry, isSessionActive, handleStartListening]);

  useEffect(() => {
    if (audioProcessorRef.current) audioProcessorRef.current.setMuted(isMuted);
  }, [isMuted]);

  return {
    audioHealth,
    networkQuality,
    bufferMetrics,
    isRecording,
    isMuted,
    isRecordingRef,
    isMutedRef,
    handleStartListening,
    handlePauseListening,
    handleStopListeningAndCleanupMic,
    handleMicMuteToggle,
    networkResilienceManagerRef,
  };
};