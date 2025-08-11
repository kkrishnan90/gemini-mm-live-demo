import { useState, useEffect, useRef, useCallback } from "react";
import AudioBufferManager from "../utils/audioBufferManager.js";
import { createAudioProcessor } from "../utils/scriptProcessorFallback.js";
import { NetworkResilienceManager } from "../utils/networkResilienceManager.js";
import { validateAudioSystemRecovery } from "../utils/audioUtils.js";
import { guaranteedAudioTransmission } from "../utils/webSocketUtils";
import {
  INPUT_SAMPLE_RATE,
  OUTPUT_SAMPLE_RATE,
  MIC_BUFFER_SIZE,
  LATENCY_TARGET_MS,
  MAX_AUDIO_CONTEXT_RECOVERY_ATTEMPTS,
  AUDIO_CONTEXT_RECOVERY_DELAY,
} from "../utils/constants";

export const useAudio = (
  addLogEntry,
  isSessionActive,
  sendAudioChunkWithBackpressure,
  socketRef,
  isWebSocketReady,
  isPlayingRef,
  stopSystemAudioPlayback
) => {
  const [audioHealth, setAudioHealth] = useState({
    isHealthy: true,
    issues: [],
  });
  const [networkQuality, setNetworkQuality] = useState({
    score: 1.0,
    latency: 0,
  });
  const [bufferMetrics, setBufferMetrics] = useState({
    inputFillLevel: 0,
    outputFillLevel: 0,
  });
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isAudioContextReady, setIsAudioContextReady] = useState(false);

  const localAudioContextRef = useRef(null);
  const audioProcessorRef = useRef(null);
  const audioBufferManagerRef = useRef(null);
  const networkResilienceManagerRef = useRef(null);
  const audioContextRecoveryAttempts = useRef(0);
  const mediaStreamRef = useRef(null);
  const isRecordingRef = useRef(isRecording);
  const isMutedRef = useRef(isMuted);
  const glassToGlassLatencyRef = useRef([]);
  const audioMetricsRef = useRef({
    dropouts: 0,
    latency: 0,
    quality: 1.0,
    retryCount: 0,
    failedTransmissions: 0,
  });
  const audioChunkSentCountRef = useRef(0);
  const lastSendTimeRef = useRef(0);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // This function is designed to be called from a user gesture (e.g., a button click)
  // to deal with browser autoplay policies that require user interaction to start audio.
  const resumeAudioContext = useCallback(async () => {
    if (!localAudioContextRef.current) {
      try {
        // Create the context if it doesn't exist
        localAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: INPUT_SAMPLE_RATE,
          latencyHint: 'interactive',
        });
        addLogEntry('audio_context', `AudioContext created on user gesture. State: ${localAudioContextRef.current.state}`);
      } catch (e) {
        addLogEntry('error', `Fatal: Could not create AudioContext: ${e.message}`);
        return; // Can't proceed
      }
    }
    // Always try to resume, as it might be suspended
    if (localAudioContextRef.current.state === 'suspended') {
      try {
        await localAudioContextRef.current.resume();
        addLogEntry('audio_context', `AudioContext successfully resumed by user gesture. State: ${localAudioContextRef.current.state}`);
      } catch (e) {
        addLogEntry('error', `Could not resume AudioContext: ${e.message}`);
      }
    }
  }, [addLogEntry]);

  const recoverAudioContext = useCallback(
    async (context, contextName) => {
      if (!context || context.state === "closed") return false;
      if (
        audioContextRecoveryAttempts.current >=
        MAX_AUDIO_CONTEXT_RECOVERY_ATTEMPTS
      ) {
        addLogEntry(
          "error",
          `${contextName} recovery failed after ${MAX_AUDIO_CONTEXT_RECOVERY_ATTEMPTS} attempts`
        );
        return false;
      }
      audioContextRecoveryAttempts.current++;
      try {
        if (context.state === "suspended") {
          addLogEntry(
            "info",
            `Attempting to resume ${contextName} (attempt ${audioContextRecoveryAttempts.current})`
          );
          await context.resume();
          if (context.state === "running") {
            addLogEntry("success", `${contextName} successfully resumed`);
            audioContextRecoveryAttempts.current = 0;
            return true;
          }
        }
      } catch (error) {
        addLogEntry(
          "error",
          `Failed to resume ${contextName}: ${error.message}`
        );
      }
      if (
        audioContextRecoveryAttempts.current <
        MAX_AUDIO_CONTEXT_RECOVERY_ATTEMPTS
      ) {
        const delay =
          AUDIO_CONTEXT_RECOVERY_DELAY * audioContextRecoveryAttempts.current;
        setTimeout(() => recoverAudioContext(context, contextName), delay);
      }
      return false;
    },
    [addLogEntry]
  );

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
      addLogEntry(
        "error",
        `AudioContext reinitialization failed: ${error.message}`
      );
    }
  }, [addLogEntry, isSessionActive]);

  const monitorAudioContextState = useCallback(
    (context, contextName) => {
      if (!context) return;
      const handleStateChange = () => {
        const state = context.state;
        addLogEntry(
          "audio_context",
          `${contextName} state changed to: ${state}`
        );
        if (state === "suspended") {
          addLogEntry(
            "warning",
            `${contextName} suspended - attempting recovery`
          );
          recoverAudioContext(context, contextName);
        } else if (state === "interrupted") {
          addLogEntry(
            "warning",
            `${contextName} interrupted - scheduling recovery`
          );
          setTimeout(
            () => recoverAudioContext(context, contextName),
            AUDIO_CONTEXT_RECOVERY_DELAY
          );
        } else if (state === "closed") {
          addLogEntry(
            "error",
            `${contextName} closed - reinitializing required`
          );
          if (contextName === "LocalAudioContext")
            setTimeout(() => reinitializeAudioContext(), 100);
          if (contextName === "PlaybackAudioContext" && isPlayingRef.current)
            addLogEntry(
              "warning",
              "Playback context closed during audio - deferring recovery"
            );
        } else if (state === "running") {
          addLogEntry("success", `${contextName} successfully running`);
          audioContextRecoveryAttempts.current = 0;
          if (state === "running") {
            setIsAudioContextReady(true);
          } else {
            setIsAudioContextReady(false);
          }
        }
      };
      context.addEventListener("statechange", handleStateChange);
      return () =>
        context.removeEventListener("statechange", handleStateChange);
    },
    [addLogEntry, isPlayingRef, reinitializeAudioContext, recoverAudioContext]
  );

  const initializeEnhancedAudioProcessor = useCallback(async () => {
    try {
      // Clean up existing context if closed
      if (
        localAudioContextRef.current &&
        localAudioContextRef.current.state === "closed"
      ) {
        localAudioContextRef.current = null;
      }

      // Create AudioContext if needed
      if (!localAudioContextRef.current) {
        addLogEntry("info", "Creating new AudioContext for audio processing");
        localAudioContextRef.current = new (window.AudioContext ||
          window.webkitAudioContext)({
          sampleRate: INPUT_SAMPLE_RATE,
          latencyHint: "interactive",
        });
        monitorAudioContextState(
          localAudioContextRef.current,
          "LocalAudioContext"
        );
      }

      // Resume context if suspended
      if (localAudioContextRef.current.state === "suspended") {
        addLogEntry("info", "Resuming suspended AudioContext");
        await localAudioContextRef.current.resume();
      }

      // Check if context is ready
      if (localAudioContextRef.current.state !== "running") {
        addLogEntry(
          "warning",
          `AudioContext state is ${localAudioContextRef.current.state}, cannot initialize processor`
        );
        return false;
      }

      // Initialize Audio Buffer Manager
      if (!audioBufferManagerRef.current) {
        audioBufferManagerRef.current = new AudioBufferManager(
          INPUT_SAMPLE_RATE,
          OUTPUT_SAMPLE_RATE,
          MIC_BUFFER_SIZE,
          addLogEntry
        );
        addLogEntry("info", "AudioBufferManager initialized successfully");
      }

      // Initialize Network Resilience Manager
      if (!networkResilienceManagerRef.current) {
        networkResilienceManagerRef.current = new NetworkResilienceManager({
          latencyTarget: LATENCY_TARGET_MS,
          maxRetries: 3,
          bufferHealthThreshold: 0.7,
          logger: addLogEntry,
        });
        addLogEntry("info", "NetworkResilienceManager initialized successfully");
      }

      // Create Enhanced Audio Processor
      if (!audioProcessorRef.current) {
        audioProcessorRef.current = await createAudioProcessor(
          localAudioContextRef.current,
          {
            sampleRate: INPUT_SAMPLE_RATE,
            bufferSize: MIC_BUFFER_SIZE,
            enableVAD: true,
            vadSensitivity: 0.3,
            enableEchoCancellation: true,
            enableNoiseSuppression: true,
            enableAutoGainControl: true,
          },
          addLogEntry
        );

        if (audioProcessorRef.current) {
          setupAudioProcessorEventHandlers();
          addLogEntry("success", "Enhanced audio processor initialized and configured");
          setIsAudioContextReady(true);
          return true;
        } else {
          addLogEntry("error", "Failed to create enhanced audio processor");
          setIsAudioContextReady(false);
          return false;
        }
      }

      return true;
    } catch (error) {
      addLogEntry("error", `Enhanced audio processor initialization failed: ${error.message}`);
      setIsAudioContextReady(false);
      return false;
    }
  }, [addLogEntry, isSessionActive, monitorAudioContextState]);

  const setupAudioProcessorEventHandlers = useCallback(() => {
    if (!audioProcessorRef.current) return;
    audioProcessorRef.current.on("audioData", async (data) => {
      if (!isWebSocketReady) return;
      const glassToGlassLatency = Date.now() - data.timestamp;
      glassToGlassLatencyRef.current.push(glassToGlassLatency);
      if (glassToGlassLatencyRef.current.length > 100)
        glassToGlassLatencyRef.current.slice(-100);
      if (audioBufferManagerRef.current) {
        audioBufferManagerRef.current.writeInputData(
          new Float32Array(data.audioData),
          data.timestamp
        );
        audioBufferManagerRef.current.measureGlassToGlassLatency(
          data.timestamp
        );
      }
      try {
        const result = await guaranteedAudioTransmission(
          data.audioData,
          socketRef.current,
          networkResilienceManagerRef.current,
          addLogEntry,
          { sendAudioChunkWithBackpressure }
        );
        if (result.success) {
          audioChunkSentCountRef.current++;
          lastSendTimeRef.current = Date.now();
          addLogEntry(
            "audio_send",
            `SUCCESS: Audio transmission successful via ${result.method}`
          );
        } else {
          audioMetricsRef.current.failedTransmissions++;
          addLogEntry(
            "error",
            "CRITICAL FAILURE: All transmission methods exhausted"
          );
          addLogEntry("debug", `Failed attempts: ${result.attempts.length}`);
        }
      } catch (error) {
        addLogEntry(
          "error",
          `CRITICAL: Bulletproof transmission system error: ${error.message}`
        );
        audioMetricsRef.current.failedTransmissions++;
      }
    });
    audioProcessorRef.current.on("bargeInDetected", (data) => {
      addLogEntry(
        "vad_activation",
        `VAD Activated: User speech detected during playback.`
      );
      if (isPlayingRef.current) {
        addLogEntry(
          "barge_in",
          `User speech detected during playback (energy: ${data.energy.toFixed(
            3
          )})`
        );
        stopSystemAudioPlayback();
      }
    });
    audioProcessorRef.current.on("metrics", (data) => {
      audioMetricsRef.current = {
        ...audioMetricsRef.current,
        ...data.performance,
      };
    });
    audioProcessorRef.current.on("error", (data) =>
      addLogEntry(
        "error",
        `Audio processor error (${data.context}): ${data.error}`
      )
    );
    audioProcessorRef.current.on("fatalError", (data) => {
      addLogEntry(
        "error",
        `Fatal audio processor error (${data.context}): ${data.error}`
      );
      setTimeout(() => {
        if (isSessionActive && !audioProcessorRef.current) {
          addLogEntry("info", "Attempting audio processor recovery...");
          initializeEnhancedAudioProcessor();
        }
      }, 2000);
    });
  }, [
    addLogEntry,
    stopSystemAudioPlayback,
    sendAudioChunkWithBackpressure,
    isPlayingRef,
    socketRef,
    isSessionActive,
    isWebSocketReady,
    initializeEnhancedAudioProcessor
  ]);


  const setupAudioSystemEventHandlers = useCallback(() => {
    if (!audioBufferManagerRef.current || !networkResilienceManagerRef.current)
      return;
    audioBufferManagerRef.current.on("bufferWarning", (data) =>
      addLogEntry(
        "warning",
        `Buffer warning: ${data.type} buffer ${data.level} fill level (${(
          data.fillLevel * 100
        ).toFixed(1)}%)`
      )
    );
    audioBufferManagerRef.current.on("latencyWarning", (data) =>
      addLogEntry(
        "warning",
        `Latency warning: ${data.measured}ms exceeds target ${data.target}ms`
      )
    );
    audioBufferManagerRef.current.on("metrics", (data) => {
      setBufferMetrics({
        inputFillLevel: data.inputBuffer.fillLevel,
        outputFillLevel: data.outputBuffer.fillLevel,
      });
      setAudioHealth({
        isHealthy: data.health.isHealthy,
        issues: data.health.issues,
      });
    });
    networkResilienceManagerRef.current.on("qualityChanged", (data) =>
      setNetworkQuality({
        score: data.quality.score,
        latency: data.quality.latency,
      })
    );
    networkResilienceManagerRef.current.on("settingsChanged", (data) => {
      addLogEntry("adaptive", `Audio settings adapted: ${data.reason}`);
      if (audioProcessorRef.current)
        audioProcessorRef.current.updateConfig(data.newSettings);
    });
    networkResilienceManagerRef.current.on("backpressureChanged", (data) => {
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
      if (networkResilienceManagerRef.current._healthCheckInterval)
        clearInterval(networkResilienceManagerRef.current._healthCheckInterval);
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
        if (!validateAudioSystemRecovery(addLogEntry))
          addLogEntry("error", "Audio system validation failed");
        audioBufferManagerRef.current = new AudioBufferManager({
          inputSampleRate: INPUT_SAMPLE_RATE,
          outputSampleRate: OUTPUT_SAMPLE_RATE,
          initialBufferSize: MIC_BUFFER_SIZE,
          latencyTarget: LATENCY_TARGET_MS,
          enableAdaptiveQuality: true,
          enableMetrics: true,
        });
        networkResilienceManagerRef.current = new NetworkResilienceManager({
          enableBackpressureHandling: true,
          enableQualityMonitoring: true,
          enableAdaptiveSettings: true,
        });
        setupAudioSystemEventHandlers();
        const healthCheckInterval = setInterval(() => {
          if (networkResilienceManagerRef.current) {
            const recoveryResult =
              networkResilienceManagerRef.current.performIntelligentRecovery();
            if (recoveryResult.recovered)
              addLogEntry(
                "recovery",
                `Periodic health check: Circuit breaker recovered (${recoveryResult.reason})`
              );
            else if (recoveryResult.reason !== "no_recovery_needed")
              addLogEntry(
                "debug",
                `Periodic health check: No recovery needed (${recoveryResult.reason})`
              );
            const readiness =
              networkResilienceManagerRef.current.isBulletproofReady();
            if (
              !readiness.ready &&
              socketRef.current?.readyState === WebSocket.OPEN
            ) {
              addLogEntry(
                "debug",
                `Health check warning: Readiness issue detected - ${readiness.reason}`
              );
              if (readiness.reason === "circuit_breaker_open") {
                const forceRecovered =
                  networkResilienceManagerRef.current.forceCircuitBreakerRecovery();
                if (forceRecovered)
                  addLogEntry(
                    "recovery",
                    "Force recovery successful during health check"
                  );
              }
            }
          }
        }, 5000);
        networkResilienceManagerRef.current._healthCheckInterval =
          healthCheckInterval;
        addLogEntry("system", "Enhanced audio system initialized successfully");
      } catch (error) {
        addLogEntry("error", "CRITICAL: Audio system initialization failed");
        console.error("Audio system initialization error:", error);
      }
    };
    initializeAudioSystem();
    return () => {
      cleanupAudioSystem();
    };
  }, [addLogEntry, cleanupAudioSystem, setupAudioSystemEventHandlers, socketRef]);

  const handleStartListening = useCallback(
    async (isResuming = false) => {
      if (!isSessionActive) {
        addLogEntry("warning", "Start listening called but session not active.");
        return;
      }
      if (isRecordingRef.current) {
        addLogEntry("info", "Already listening.");
        return;
      }
      try {
        if (!isResuming) {
          if (!audioProcessorRef.current) {
            const processorInitialized = await initializeEnhancedAudioProcessor();
            if (!processorInitialized) {
              addLogEntry("error", "Cannot start listening: audio processor failed to initialize.");
              return;
            }
          }
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              sampleRate: INPUT_SAMPLE_RATE,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1,
            },
          });
          mediaStreamRef.current = stream;
          await audioProcessorRef.current.start(stream);
          addLogEntry("mic", "Microphone access granted and processor started.");
        } else {
          await audioProcessorRef.current.unpause();
          addLogEntry("mic", "Microphone listening resumed.");
        }
        setIsRecording(true);
        if (networkResilienceManagerRef.current) {
          networkResilienceManagerRef.current.notifyMicActive(true);
        }
      } catch (error) {
        addLogEntry("error", `Could not start microphone: ${error.message}`);
        console.error("Error starting microphone:", error);
      }
    },
    [addLogEntry, isSessionActive, initializeEnhancedAudioProcessor]
  );

  const handlePauseListening = useCallback(() => {
    if (isRecordingRef.current && audioProcessorRef.current) {
      audioProcessorRef.current.pause();
      setIsRecording(false);
      if (networkResilienceManagerRef.current) {
        networkResilienceManagerRef.current.notifyMicActive(false);
      }
      addLogEntry("mic", "Microphone listening paused.");
    }
  }, [addLogEntry]);

  const handleStopListeningAndCleanupMic = useCallback(() => {
    if (audioProcessorRef.current) {
      audioProcessorRef.current.stop();
      audioProcessorRef.current.destroy();
      audioProcessorRef.current = null;
      addLogEntry("mic", "Audio processor stopped and destroyed.");
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      addLogEntry("mic", "Microphone stream stopped.");
    }
    if (localAudioContextRef.current && localAudioContextRef.current.state !== "closed") {
      localAudioContextRef.current.close().then(() => {
        addLogEntry("audio_context", "Local AudioContext closed.");
        localAudioContextRef.current = null;
      });
    }
    setIsRecording(false);
    if (networkResilienceManagerRef.current) {
      networkResilienceManagerRef.current.notifyMicActive(false);
    }
  }, [addLogEntry]);

  const handleMicMuteToggle = useCallback(async () => {
    const newMuteState = !isMutedRef.current;
    
    if (newMuteState) {
      // Muting - just update the config if processor exists
      if (audioProcessorRef.current) {
        audioProcessorRef.current.updateConfig({ isMuted: newMuteState });
      }
      setIsMuted(newMuteState);
      addLogEntry("mic", "Microphone MUTED.");
    } else {
      // Unmuting - start listening if not already recording
      if (!isRecordingRef.current) {
        addLogEntry("mic", "Unmuting and starting microphone input...");
        await handleStartListening();
      } else {
        // Already recording, just unmute
        if (audioProcessorRef.current) {
          audioProcessorRef.current.updateConfig({ isMuted: newMuteState });
        }
      }
      setIsMuted(newMuteState);
      addLogEntry("mic", "Microphone UNMUTED.");
    }
  }, [addLogEntry, handleStartListening]);

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
    resumeAudioContext,
    networkResilienceManagerRef,
    isAudioContextReady,
  };
};
