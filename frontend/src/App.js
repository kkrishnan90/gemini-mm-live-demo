import React, {useState, useEffect, useRef, useCallback} from "react";
import "./App.css";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {
  faMicrophone,
  faMicrophoneSlash,
  faStop,
  faPaperPlane,
  faPlay,
  faWifi,
  faPowerOff,
} from "@fortawesome/free-solid-svg-icons";

// Enhanced audio components
import AudioBufferManager from "./audioBufferManager.js";
import { createAudioProcessor } from "./scriptProcessorFallback.js";
import { NetworkResilienceManager } from "./networkResilienceManager.js";
import { BrowserCompatibility, performanceMonitor } from "./audioUtils.js";

// Enhanced Constants
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const MIC_BUFFER_SIZE = BrowserCompatibility.getOptimalBufferSize();
const ENHANCED_AUDIO_WORKLET_URL = '/enhanced-audio-processor.js';
const FALLBACK_AUDIO_WORKLET_URL = '/audio-processor.js';
const MAX_AUDIO_QUEUE_SIZE = 50;
const WEBSOCKET_SEND_BUFFER_LIMIT = 65536;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_BASE = 100;
const MAX_AUDIO_CONTEXT_RECOVERY_ATTEMPTS = 5;
const AUDIO_CONTEXT_RECOVERY_DELAY = 1000;
const AUDIO_RECOVERY_DELAY_MS = 10; // Delay for audio queue recovery operations
const LATENCY_TARGET_MS = 20; // Target latency in milliseconds

const LANGUAGES = [
  {code: "en-IN", name: "English (Hinglish)"},
  {code: "hi-IN", name: "हिंदी (Hindi)"},
  {code: "mr-IN", name: "मराठी (Marathi)"},
  {code: "ta-IN", name: "தமிழ் (Tamil)"},
  {code: "bn-IN", name: "বাংলা (Bengali)"},
  {code: "te-IN", name: "తెలుగు (Telugu)"},
  {code: "gu-IN", name: "ગુજરાતી (Gujarati)"},
  {code: "kn-IN", name: "ಕನ್ನಡ (Kannada)"},
  {code: "ml-IN", name: "മലയാളം (Malayalam)"},
  {code: "pa-IN", name: "ਪੰਜਾਬੀ (Punjabi)"},
];

// const BACKEND_HOST =  'gemini-backend-service-1018963165306.us-central1.run.app';
const BACKEND_HOST = "localhost:8000";
const generateUniqueId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;

// Validate audio system health and recovery capability
const validateAudioSystemRecovery = (addLogEntry) => {
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
    addLogEntry("error", `Audio system validation failed: ${issues.join(", ")}`);
    return false;
  }
  
  addLogEntry("audio", "🔍 Audio system recovery validation passed");
  return true;
};

// Unified audio readiness signal sender - ensures single CLIENT_AUDIO_READY per connection
const sendAudioReadySignal = (playbackContext, socket, addLogEntry, connectionSignalTracker, reason = "unified") => {
  // Get current connection ID
  const connectionId = socket?._connectionId;
  
  // Check if signal already sent for this specific connection
  if (connectionId && connectionSignalTracker.current.has(connectionId)) {
    // CRITICAL FIX 1: Allow retry after connection errors/recovery
    if (reason.includes("recovery") || reason.includes("retry")) {
      connectionSignalTracker.current.delete(connectionId);
      addLogEntry("audio", `🔄 Cleared signal tracking for connection ${connectionId} - allowing retry`);
    } else {
      addLogEntry("audio", `⏸️ Audio readiness signal already sent for connection ${connectionId}`);
      return false;
    }
  }
  
  // Only send if both contexts are ready and socket is open
  if (!playbackContext || playbackContext.state !== "running") {
    addLogEntry("audio", `⏸️ Audio readiness check failed: playback context state=${playbackContext?.state || 'null'}`);
    return false;
  }
  
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    addLogEntry("audio", `⏸️ Audio readiness check failed: socket state=${socket?.readyState || 'null'}`);
    return false;
  }
  
  try {
    socket.send("CLIENT_AUDIO_READY");
    
    // Track this signal for this specific connection
    if (connectionId) {
      connectionSignalTracker.current.add(connectionId);
    }
    
    addLogEntry("audio", `📤 Sent CLIENT_AUDIO_READY signal to backend for connection ${connectionId} (${reason}) - UNIFIED SIGNAL`);
    return true;
  } catch (error) {
    addLogEntry("error", `Failed to send CLIENT_AUDIO_READY signal: ${error.message}`);
    
    // CRITICAL FIX 1: Clear signal tracking on send error to allow recovery
    if (connectionId && connectionSignalTracker.current.has(connectionId)) {
      connectionSignalTracker.current.delete(connectionId);
      addLogEntry("audio", `🔄 Cleared signal tracking for connection ${connectionId} due to send error - allowing recovery`);
    }
    return false;
  }
};

/**
 * BULLETPROOF WEBSOCKET READINESS: Multi-layer validation with automatic recovery
 * This function ensures WebSocket readiness validation NEVER blocks legitimate audio transmission
 */
const isWebSocketReady = (socketRef, networkResilienceManagerRef, addLogEntry) => {
  // Primary check: WebSocket must be open
  if (!socketRef || socketRef.readyState !== WebSocket.OPEN) {
    addLogEntry && addLogEntry("debug", "WebSocket readiness failed: WebSocket not open");
    return false;
  }
  
  // Secondary check: Network resilience manager must exist
  if (!networkResilienceManagerRef) {
    addLogEntry && addLogEntry("debug", "WebSocket readiness failed: NetworkResilienceManager not initialized");
    return false;
  }
  
  // BULLETPROOF VALIDATION: Use enhanced readiness check with automatic recovery
  const readiness = networkResilienceManagerRef.isBulletproofReady();
  
  if (readiness.ready) {
    addLogEntry && addLogEntry("debug", "✅ WebSocket bulletproof readiness: ALL CHECKS PASSED");
    return true;
  }
  
  // Log detailed failure reason for debugging
  addLogEntry && addLogEntry("debug", 
    `❌ WebSocket readiness failed: ${readiness.reason} at layer ${readiness.layer}` +
    (readiness.recovery ? ` (recovery: ${readiness.recovery.reason})` : "")
  );
  
  // ULTIMATE RECOVERY ATTEMPT: If basic checks pass but detailed validation fails
  if (socketRef.readyState === WebSocket.OPEN && readiness.reason === 'circuit_breaker_open') {
    addLogEntry && addLogEntry("recovery", "Attempting ultimate circuit breaker recovery");
    const recovered = networkResilienceManagerRef.forceCircuitBreakerRecovery();
    if (recovered) {
      addLogEntry && addLogEntry("recovery", "✅ Ultimate circuit breaker recovery successful");
      return true;
    }
  }
  
  return false;
};

/**
 * FAILSAFE TRANSMISSION: Guaranteed audio transmission with multiple fallback paths
 */
const guaranteedAudioTransmission = async (audioData, socketRef, networkResilienceManagerRef, addLogEntry, fallbackMethods) => {
  const attempts = [];
  
  // Method 1: Primary - NetworkResilienceManager
  if (networkResilienceManagerRef) {
    try {
      const readiness = networkResilienceManagerRef.isBulletproofReady();
      if (readiness.ready) {
        await networkResilienceManagerRef.sendData(audioData);
        addLogEntry("audio_send", "📤 SUCCESS: Audio sent via NetworkResilienceManager");
        return { success: true, method: 'NetworkResilienceManager', attempts };
      } else {
        attempts.push({ method: 'NetworkResilienceManager', failed: true, reason: readiness.reason });
      }
    } catch (error) {
      attempts.push({ method: 'NetworkResilienceManager', failed: true, error: error.message });
    }
  }
  
  // Method 2: Direct WebSocket with backpressure handling
  if (socketRef && socketRef.readyState === WebSocket.OPEN) {
    try {
      const sent = await fallbackMethods.sendAudioChunkWithBackpressure(audioData);
      if (sent) {
        addLogEntry("recovery", "📤 SUCCESS: Audio sent via direct WebSocket fallback");
        return { success: true, method: 'DirectWebSocketWithBackpressure', attempts };
      }
      attempts.push({ method: 'DirectWebSocketWithBackpressure', failed: true, reason: 'backpressure_blocked' });
    } catch (error) {
      attempts.push({ method: 'DirectWebSocketWithBackpressure', failed: true, error: error.message });
    }
  }
  
  // Method 3: Emergency raw WebSocket transmission
  if (socketRef && socketRef.readyState === WebSocket.OPEN) {
    try {
      if (networkResilienceManagerRef) {
        networkResilienceManagerRef.emergencyTransmit(audioData);
      } else {
        socketRef.send(audioData);
      }
      addLogEntry("recovery", "📤 SUCCESS: Audio sent via emergency raw WebSocket");
      return { success: true, method: 'EmergencyRawWebSocket', attempts };
    } catch (error) {
      attempts.push({ method: 'EmergencyRawWebSocket', failed: true, error: error.message });
    }
  }
  
  // All methods failed
  addLogEntry("error", "🚨 CRITICAL FAILURE: All transmission methods failed");
  addLogEntry("debug", `Transmission attempts: ${JSON.stringify(attempts)}`);
  
  return { success: false, method: 'none', attempts };
};

const App = () => {
  const [isRecording, setIsRecording] = useState(false); // Is microphone actively sending audio
  const [isSessionActive, setIsSessionActive] = useState(false); // Is the overall session (WS + mic) active
  const [isMuted, setIsMuted] = useState(false); // Is microphone muted
  const [messages, setMessages] = useState([]);
  const [textInputValue, setTextInputValue] = useState("");
  const [transcriptionMessages, setTranscriptionMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(LANGUAGES[0].code);
  const [toolCallLogs, setToolCallLogs] = useState([]);
  const [webSocketStatus, setWebSocketStatus] = useState("N/A");
  const [audioHealth, setAudioHealth] = useState({ isHealthy: true, issues: [] });
  const [networkQuality, setNetworkQuality] = useState({ score: 1.0, latency: 0 });
  const [bufferMetrics, setBufferMetrics] = useState({ inputFillLevel: 0, outputFillLevel: 0 });

  // Enhanced refs for new audio system
  const isRecordingRef = useRef(isRecording);
  const isSessionActiveRef = useRef(isSessionActive);
  const isMutedRef = useRef(isMuted);
  const playbackAudioContextRef = useRef(null);
  const localAudioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioProcessorRef = useRef(null); // Replaces audioWorkletNodeRef
  const audioBufferManagerRef = useRef(null);
  const networkResilienceManagerRef = useRef(null);
  const audioChunkSentCountRef = useRef(0);
  const socketRef = useRef(null);
  const pendingAudioChunks = useRef([]);
  const audioMetricsRef = useRef({ dropouts: 0, latency: 0, quality: 1.0, retryCount: 0, failedTransmissions: 0 });
  const lastSendTimeRef = useRef(0);
  const retryQueueRef = useRef([]);
  const audioQueueRef = useRef([]);
  const audioSequenceRef = useRef(0);  // Track sequence numbers for audio synchronization
  const pendingMetadataRef = useRef(new Map());  // Store metadata by sequence for correlation
  const audioContextRecoveryAttempts = useRef(0);
  const audioWorkletSupported = useRef(null);
  const isPlayingRef = useRef(false);
  const currentAudioSourceRef = useRef(null);
  const audioQualityMetricsRef = useRef({
    totalChunks: 0,
    choppyChunks: 0,
    avgDurationDiff: 0,
    lastQualityCheck: 0,
    adaptiveBufferSize: 0.02 // Start with 20ms buffer
  });
  const logsAreaRef = useRef(null);
  const chatAreaRef = useRef(null);
  const glassToGlassLatencyRef = useRef([]);
  const connectionSignalTracker = useRef(new Set());  // Track CLIENT_AUDIO_READY signals per connection

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);
  useEffect(() => {
    isSessionActiveRef.current = isSessionActive;
  }, [isSessionActive]);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Log entry function - defined early to avoid initialization errors
  const addLogEntry = useCallback((type, content) => {
    // Show tool calls, errors, audio-related logs, and recovery messages for debugging
    const allowedTypes = ["toolcall", "error", "audio_receive", "audio_sequence", "gemini_audio", "audio_flow_control", "recovery", "debug"];
    if (!allowedTypes.includes(type)) {
      return;
    }
    const newEntry = {
      id: generateUniqueId(),
      type,
      content,
      timestamp: new Date().toLocaleTimeString(),
    };
    setMessages((prev) => [...prev, newEntry]);
  }, []);

  // Initialize enhanced audio system
  useEffect(() => {
    const initializeAudioSystem = async () => {
      try {
        // Validate audio system recovery capability
        if (!validateAudioSystemRecovery(addLogEntry)) {
          addLogEntry("error", "Audio system validation failed - some features may not work");
        }
        
        // Initialize audio buffer manager
        audioBufferManagerRef.current = new AudioBufferManager({
          inputSampleRate: INPUT_SAMPLE_RATE,
          outputSampleRate: OUTPUT_SAMPLE_RATE,
          initialBufferSize: MIC_BUFFER_SIZE,
          latencyTarget: LATENCY_TARGET_MS,
          enableAdaptiveQuality: true,
          enableMetrics: true
        });

        // Initialize network resilience manager
        networkResilienceManagerRef.current = new NetworkResilienceManager({
          enableBackpressureHandling: true,
          enableQualityMonitoring: true,
          enableAdaptiveSettings: true
        });

        // Setup event handlers
        setupAudioSystemEventHandlers();
        
        // ENHANCED PERMANENT FIX: Comprehensive periodic health monitoring and recovery
        const healthCheckInterval = setInterval(() => {
          if (networkResilienceManagerRef.current) {
            // Perform intelligent recovery check
            const recoveryResult = networkResilienceManagerRef.current.performIntelligentRecovery();
            
            if (recoveryResult.recovered) {
              addLogEntry("recovery", 
                `🔄 Periodic health check: Circuit breaker recovered (${recoveryResult.reason})`);
            } else if (recoveryResult.reason !== 'no_recovery_needed') {
              addLogEntry("debug", 
                `🔍 Periodic health check: No recovery needed (${recoveryResult.reason})`);
            }
            
            // Additional bulletproof readiness validation
            const readiness = networkResilienceManagerRef.current.isBulletproofReady();
            if (!readiness.ready && socketRef.current?.readyState === WebSocket.OPEN) {
              addLogEntry("debug", 
                `⚠️ Health check warning: Readiness issue detected - ${readiness.reason}`);
              
              // Attempt force recovery if it's a circuit breaker issue
              if (readiness.reason === 'circuit_breaker_open') {
                const forceRecovered = networkResilienceManagerRef.current.forceCircuitBreakerRecovery();
                if (forceRecovered) {
                  addLogEntry("recovery", "🔄 Force recovery successful during health check");
                }
              }
            }
          }
        }, 5000); // Check every 5 seconds
        
        // Store interval reference for cleanup
        networkResilienceManagerRef.current._healthCheckInterval = healthCheckInterval;

        addLogEntry("system", "Enhanced audio system initialized successfully");
      } catch (error) {
        addLogEntry("error", `Failed to initialize enhanced audio system: ${error.message}`);
      }
    };

    initializeAudioSystem();

    return () => {
      cleanupAudioSystem();
    };
  }, []);

  // Synchronize audio processor with state changes
  useEffect(() => {
    if (audioProcessorRef.current) {
      audioProcessorRef.current.setMuted(isMuted);
    }
  }, [isMuted]);

  useEffect(() => {
    if (audioProcessorRef.current) {
      audioProcessorRef.current.setRecording(isRecording);
    }
  }, [isRecording]);

  // Setup audio system event handlers
  const setupAudioSystemEventHandlers = useCallback(() => {
    if (!audioBufferManagerRef.current || !networkResilienceManagerRef.current) return;

    // Audio buffer manager events
    audioBufferManagerRef.current.on('bufferWarning', (data) => {
      addLogEntry("warning", `Buffer warning: ${data.type} buffer ${data.level} fill level (${(data.fillLevel * 100).toFixed(1)}%)`);
    });

    audioBufferManagerRef.current.on('latencyWarning', (data) => {
      addLogEntry("warning", `Latency warning: ${data.measured}ms exceeds target ${data.target}ms`);
    });

    audioBufferManagerRef.current.on('metrics', (data) => {
      setBufferMetrics({
        inputFillLevel: data.inputBuffer.fillLevel,
        outputFillLevel: data.outputBuffer.fillLevel
      });
      
      setAudioHealth({
        isHealthy: data.health.isHealthy,
        issues: data.health.issues
      });
    });

    // Network resilience manager events
    networkResilienceManagerRef.current.on('qualityChanged', (data) => {
      setNetworkQuality({
        score: data.quality.score,
        latency: data.quality.latency
      });
    });

    networkResilienceManagerRef.current.on('settingsChanged', (data) => {
      addLogEntry("adaptive", `Audio settings adapted: ${data.reason}`);
      if (audioProcessorRef.current) {
        audioProcessorRef.current.updateConfig(data.newSettings);
      }
    });

    networkResilienceManagerRef.current.on('backpressureChanged', (data) => {
      if (data.active) {
        addLogEntry("warning", `Network backpressure detected`);
      } else {
        addLogEntry("info", `Network backpressure resolved`);
      }
    });

  }, [addLogEntry]);

  // Cleanup audio system
  const cleanupAudioSystem = useCallback(() => {
    if (audioBufferManagerRef.current) {
      audioBufferManagerRef.current.destroy();
      audioBufferManagerRef.current = null;
    }

    if (networkResilienceManagerRef.current) {
      // PERMANENT FIX: Cleanup health check interval
      if (networkResilienceManagerRef.current._healthCheckInterval) {
        clearInterval(networkResilienceManagerRef.current._healthCheckInterval);
      }
      networkResilienceManagerRef.current.destroy();
      networkResilienceManagerRef.current = null;
    }

    if (audioProcessorRef.current) {
      audioProcessorRef.current.destroy();
      audioProcessorRef.current = null;
    }

    performanceMonitor.stopMonitoring();
  }, []);

  // Enhanced audio metrics monitoring
  useEffect(() => {
    const interval = setInterval(() => {
      if (audioBufferManagerRef.current && isRecording) {
        const metrics = audioBufferManagerRef.current.getComprehensiveMetrics();
        audioMetricsRef.current = {
          ...audioMetricsRef.current,
          ...metrics.performance
        };
      }

      if (audioProcessorRef.current && isRecording) {
        audioProcessorRef.current.getMetrics();
      }

      if (networkResilienceManagerRef.current) {
        const networkMetrics = networkResilienceManagerRef.current.getMetrics();
        // Update network quality state if significantly changed
        const newQuality = networkMetrics.quality;
        setNetworkQuality(prev => {
          if (Math.abs(prev.score - newQuality.score) > 0.1 || Math.abs(prev.latency - newQuality.latency) > 50) {
            return { score: newQuality.score, latency: newQuality.latency };
          }
          return prev;
        });
      }
    }, 2000); // Enhanced monitoring every 2 seconds

    return () => clearInterval(interval);
  }, [isRecording]);


  const fetchToolCallLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`http://${BACKEND_HOST}/api/logs`);
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const toolLogs = data.filter(
        (log) =>
          typeof log === "object" &&
          log !== null &&
          (log.operation || log.tool_function_name)
      );

      const newLogEntries = toolLogs.map((log) => ({
        id: generateUniqueId(),
        type: "toolcall",
        content: JSON.stringify(log),
        timestamp: log.timestamp
          ? new Date(log.timestamp).toLocaleTimeString()
          : new Date().toLocaleTimeString(),
      }));
      newLogEntries.forEach((logEntry) => {
        const logContentString = String(logEntry.content);
        const contentLowerCase = logContentString.toLowerCase();
        const errorKeywords = [
          "error",
          "failed",
          "exception",
          "traceback",
          "critical",
          "err:",
          "warn:",
          "warning",
        ];
        let isError =
          (logEntry.status &&
            String(logEntry.status).toLowerCase().includes("error")) ||
          errorKeywords.some((keyword) => contentLowerCase.includes(keyword));
        console.log(
          `%c[Tool Call ${isError ? "ERROR" : "Log"}] ${
            logEntry.timestamp
          }: ${logContentString}`,
          isError ? "color: #FF3131; font-weight: bold;" : "color: #39FF14;"
        );
      });
      setMessages((prevMessages) => {
        const existingLogContents = new Set(
          prevMessages
            .filter((m) => m.type === "toolcall")
            .map((m) => m.content)
        );
        const uniqueNewEntries = newLogEntries.filter(
          (newLog) => !existingLogContents.has(newLog.content)
        );
        return [...prevMessages, ...uniqueNewEntries].sort(
          (a, b) =>
            new Date("1970/01/01 " + a.timestamp) -
            new Date("1970/01/01 " + b.timestamp)
        );
      });
      setToolCallLogs((prevLogs) => [...prevLogs, ...newLogEntries]);
    } catch (error) {
      console.error("Failed to fetch tool call logs:", error);
      addLogEntry("error", `Failed to fetch tool call logs: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [addLogEntry]);

  useEffect(() => {
    fetchToolCallLogs();
    const intervalId = setInterval(fetchToolCallLogs, 15000);
    return () => clearInterval(intervalId);
  }, [fetchToolCallLogs]);

  useEffect(() => {
    if (logsAreaRef.current)
      logsAreaRef.current.scrollTop = logsAreaRef.current.scrollHeight;
  }, [messages]);
  useEffect(() => {
    if (chatAreaRef.current)
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
  }, [transcriptionMessages]);

  // Recover suspended AudioContext (moved up to fix dependency order)
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

    // Schedule another recovery attempt
    if (audioContextRecoveryAttempts.current < MAX_AUDIO_CONTEXT_RECOVERY_ATTEMPTS) {
      const delay = AUDIO_CONTEXT_RECOVERY_DELAY * audioContextRecoveryAttempts.current;
      setTimeout(() => {
        recoverAudioContext(context, contextName);
      }, delay);
    }
    
    return false;
  }, [addLogEntry]);

  // Reinitialize AudioContext when closed (moved up to fix dependency order)
  const reinitializeAudioContext = useCallback(async () => {
    if (!isSessionActiveRef.current) return;

    addLogEntry("info", "Reinitializing AudioContext after closure");
    
    try {
      // Clean up existing context
      if (localAudioContextRef.current) {
        if (audioProcessorRef.current) {
          audioProcessorRef.current.disconnect();
          audioProcessorRef.current.destroy();
          audioProcessorRef.current = null;
        }
        localAudioContextRef.current = null;
      }

      // Restart audio processing
      if (mediaStreamRef.current && isRecordingRef.current) {
        addLogEntry("info", "Restarting audio processing after context recovery");
        // Use setTimeout to avoid dependency issues during recovery
        setTimeout(() => {
          handleStartListening(true); // Resume listening
        }, 100);
      }
    } catch (error) {
      addLogEntry("error", `AudioContext reinitialization failed: ${error.message}`);
      setIsSessionActive(false);
    }
  }, [addLogEntry]);

  // AudioContext state monitoring and recovery (moved up to fix dependency order)
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
        setTimeout(() => {
          recoverAudioContext(context, contextName);
        }, AUDIO_CONTEXT_RECOVERY_DELAY);
      } else if (state === 'closed') {
        addLogEntry("error", `${contextName} closed - reinitializing required`);
        if (contextName === 'LocalAudioContext' && isRecordingRef.current) {
          // Use setTimeout to avoid dependency issues
          setTimeout(() => {
            reinitializeAudioContext();
          }, 100);
        }
        // CRITICAL: If playback context closes during audio playback, defer recovery
        if (contextName === 'PlaybackAudioContext' && isPlayingRef.current) {
          addLogEntry("warning", "⚠️ Playback context closed during audio - deferring recovery until audio completes");
          // Don't reinitialize immediately - let current audio finish
        }
      } else if (state === 'running') {
        addLogEntry("success", `${contextName} successfully running`);
        audioContextRecoveryAttempts.current = 0; // Reset recovery attempts on success
      }
    };

    context.addEventListener('statechange', handleStateChange);
    
    return () => {
      context.removeEventListener('statechange', handleStateChange);
    };
  }, [addLogEntry, isRecording]);

  const getPlaybackAudioContext = useCallback(
    async (triggeredByAction) => {
      if (
        !playbackAudioContextRef.current ||
        playbackAudioContextRef.current.state === "closed"
      ) {
        try {
          addLogEntry("audio", "Attempting to create Playback AudioContext.");
          playbackAudioContextRef.current = new (window.AudioContext ||
            window.webkitAudioContext)({sampleRate: OUTPUT_SAMPLE_RATE});
            
          // Set up enhanced state monitoring for playback context
          monitorAudioContextState(playbackAudioContextRef.current, 'PlaybackAudioContext');
            
          // Enhanced onstatechange handler - logs state changes and sends unified signal
          playbackAudioContextRef.current.onstatechange = () => {
            addLogEntry(
              "audio",
              `PlaybackCTX state changed to: ${playbackAudioContextRef.current?.state}`
            );
            // Send unified audio readiness signal when context becomes running
            if (playbackAudioContextRef.current?.state === "running") {
              sendAudioReadySignal(playbackAudioContextRef.current, socketRef.current, addLogEntry, connectionSignalTracker, "context-state-change");
            }
          };
          
          addLogEntry(
            "audio",
            `Playback AudioContext CREATED. Initial state: ${playbackAudioContextRef.current.state}, SampleRate: ${playbackAudioContextRef.current.sampleRate}`
          );
          
          // Send unified audio readiness signal if already running
          if (playbackAudioContextRef.current.state === "running") {
            sendAudioReadySignal(playbackAudioContextRef.current, socketRef.current, addLogEntry, connectionSignalTracker, "context-creation-immediate");
          }
        } catch (e) {
          console.error(
            "[CTX_PLAYBACK_MGR] FAILED to CREATE Playback AudioContext",
            e
          );
          addLogEntry("error", `FATAL PlaybackCTX ERROR: ${e.message}`);
          playbackAudioContextRef.current = null;
          return null;
        }
      }
      if (playbackAudioContextRef.current.state === "suspended") {
        if (
          triggeredByAction &&
          (triggeredByAction.toLowerCase().includes("user_action") ||
            triggeredByAction.toLowerCase().includes("systemaction"))
        ) {
          addLogEntry(
            "audio",
            `PlaybackCTX State 'suspended'. Attempting RESUME by: ${triggeredByAction}.`
          );
          try {
            await playbackAudioContextRef.current.resume();
            addLogEntry(
              "audio",
              `PlaybackCTX Resume attempt finished. State: ${playbackAudioContextRef.current.state}`
            );
            
            // Send unified audio readiness signal after successful resume
            if (playbackAudioContextRef.current.state === "running") {
              sendAudioReadySignal(playbackAudioContextRef.current, socketRef.current, addLogEntry, connectionSignalTracker, "context-resume");
            }
          } catch (e) {
            console.error(`[CTX_PLAYBACK_MGR] FAILED to RESUME PlaybackCTX`, e);
            addLogEntry("error", `FAILED to RESUME PlaybackCTX: ${e.message}`);
          }
        }
      }
      if (playbackAudioContextRef.current?.state !== "running")
        addLogEntry(
          "warning",
          `PlaybackCTX not 'running'. State: ${playbackAudioContextRef.current?.state}`
        );
      return playbackAudioContextRef.current;
    },
    [addLogEntry, monitorAudioContextState]
  );

  const playNextGeminiChunk = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
    isPlayingRef.current = true;
    
    const arrayBuffer = audioQueueRef.current.shift();
    const audioCtx = await getPlaybackAudioContext(
      "playNextGeminiChunk_SystemAction"
    );
    if (!audioCtx || audioCtx.state !== "running") {
      addLogEntry(
        "error",
        `Playback FAIL: Audio system not ready (${audioCtx?.state})`
      );
      isPlayingRef.current = false;
      return;
    }
    try {
      if (
        !arrayBuffer ||
        arrayBuffer.byteLength === 0 ||
        arrayBuffer.byteLength % 2 !== 0
      ) {
        addLogEntry(
          "warning",
          "Received empty or invalid audio chunk. Skipping."
        );
        isPlayingRef.current = false;
        if (audioQueueRef.current.length > 0) playNextGeminiChunk();
        return;
      }
      const pcm16Data = new Int16Array(arrayBuffer);
      const float32Data = new Float32Array(pcm16Data.length);
      for (let i = 0; i < pcm16Data.length; i++)
        float32Data[i] = pcm16Data[i] / 32768.0;
      if (float32Data.length === 0) {
        addLogEntry(
          "warning",
          "Received empty audio chunk (after conversion). Skipping."
        );
        isPlayingRef.current = false;
        if (audioQueueRef.current.length > 0) playNextGeminiChunk();
        return;
      }
      const audioBuffer = audioCtx.createBuffer(
        1,
        float32Data.length,
        OUTPUT_SAMPLE_RATE
      );
      audioBuffer.copyToChannel(float32Data, 0);
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      const gainNode = audioCtx.createGain();
      gainNode.gain.setValueAtTime(0.8, audioCtx.currentTime);
      source.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      source.onended = () => {
        addLogEntry("gemini_audio", "Audio chunk finished playing.");
        isPlayingRef.current = false;
        currentAudioSourceRef.current = null;
        if (audioQueueRef.current.length > 0) playNextGeminiChunk();
        source.disconnect();
        gainNode.disconnect();
      };
      
      currentAudioSourceRef.current = source;
      addLogEntry("gemini_audio", "Starting playback of Gemini audio chunk...");
      source.start();
      
    } catch (error) {
      currentAudioSourceRef.current = null;
      addLogEntry("error", `Playback Error: ${error.message}`);
      isPlayingRef.current = false;
      if (audioQueueRef.current.length > 0) playNextGeminiChunk();
    }
  }, [getPlaybackAudioContext, addLogEntry]);

  const stopSystemAudioPlayback = useCallback(() => {
    if (currentAudioSourceRef.current) {
      try {
        currentAudioSourceRef.current.stop();
        addLogEntry(
          "gemini_audio",
          "System audio playback stopped by barge-in."
        );
      } catch (e) {
        addLogEntry(
          "warning",
          `Could not stop current audio source for barge-in: ${e.message}`
        );
      }
      currentAudioSourceRef.current = null;
    }
    const clearedCount = audioQueueRef.current.length;
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    
    // Simple restart - no scheduling to reset
    
    if (clearedCount > 0) {
      addLogEntry("audio_sequence", `Cleared ${clearedCount} audio chunks from queue due to barge-in`);
    }
    
    addLogEntry("gemini_audio", "Gemini audio queue cleared due to barge-in.");
  }, [addLogEntry]);

  // WebSocket backpressure handling (moved up to fix dependency order)
  const checkWebSocketBackpressure = useCallback(() => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return true; // Indicate backpressure if the socket is not open
    }

    const sendBufferSize = socketRef.current.bufferedAmount || 0;
    const latency = lastSendTimeRef.current > 0 ? Date.now() - lastSendTimeRef.current : 0;

    if (sendBufferSize > WEBSOCKET_SEND_BUFFER_LIMIT) {
      addLogEntry("backpressure", `High buffer: ${sendBufferSize} bytes`);
      return true;
    }

    if (latency > 500) { // 500ms latency threshold
      addLogEntry("backpressure", `High latency: ${latency}ms`);
      return true;
    }

    return false;
  }, [addLogEntry]);

  // Exponential backoff delay function
  const getRetryDelay = useCallback((attempt) => {
    return RETRY_DELAY_BASE * Math.pow(2, attempt) + Math.random() * 100; // Add jitter
  }, []);

  // Retry mechanism for audio chunks
  const retryAudioChunk = useCallback(async (audioData, attempt = 0) => {
    if (attempt >= MAX_RETRY_ATTEMPTS) {
      audioMetricsRef.current.failedTransmissions++;
      addLogEntry("error", `Audio chunk transmission failed after ${MAX_RETRY_ATTEMPTS} attempts`);
      return false;
    }

    try {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        // WebSocket not available, schedule retry
        const delay = getRetryDelay(attempt);
        addLogEntry("warning", `WebSocket not ready, retrying in ${delay.toFixed(0)}ms (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS})`);
        
        setTimeout(() => {
          retryAudioChunk(audioData, attempt + 1);
        }, delay);
        return false;
      }

      // Check backpressure before retry
      if (checkWebSocketBackpressure()) {
        const delay = getRetryDelay(attempt);
        addLogEntry("warning", `WebSocket backpressure on retry, waiting ${delay.toFixed(0)}ms (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS})`);
        
        setTimeout(() => {
          retryAudioChunk(audioData, attempt + 1);
        }, delay);
        return false;
      }

      socketRef.current.send(audioData);
      addLogEntry("audio_send", `📤 Sent audio to backend: ${audioData.byteLength} bytes`);
      audioChunkSentCountRef.current++;
      lastSendTimeRef.current = Date.now();
      audioMetricsRef.current.retryCount += attempt; // Track total retry attempts
      
      if (attempt > 0) {
        addLogEntry("success", `Audio chunk sent successfully on retry attempt ${attempt + 1}`);
      }
      
      return true;
    } catch (error) {
      const delay = getRetryDelay(attempt);
      addLogEntry("warning", `Audio send error on attempt ${attempt + 1}: ${error.message}, retrying in ${delay.toFixed(0)}ms`);
      
      setTimeout(() => {
        retryAudioChunk(audioData, attempt + 1);
      }, delay);
      return false;
    }
  }, [addLogEntry, getRetryDelay, checkWebSocketBackpressure]);

  // Enhanced audio chunk sender with retry logic
  const sendAudioChunkWithBackpressure = useCallback(async (audioData) => {
    // First try immediate send
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && !checkWebSocketBackpressure()) {
      try {
        socketRef.current.send(audioData);
        addLogEntry("audio_send", `📤 Sent audio to backend (immediate): ${audioData.byteLength} bytes`);
        audioChunkSentCountRef.current++;
        lastSendTimeRef.current = Date.now();
        return true;
      } catch (error) {
        addLogEntry("warning", `Immediate send failed: ${error.message}, starting retry mechanism`);
        // Fall through to retry mechanism
      }
    }

    // If immediate send fails or backpressure detected, use retry mechanism
    if (checkWebSocketBackpressure()) {
      addLogEntry("warning", "WebSocket backpressure detected, adding to retry queue");
      
      // Add to pending queue with intelligent management
      if (pendingAudioChunks.current.length < MAX_AUDIO_QUEUE_SIZE) {
        pendingAudioChunks.current.push({
          data: audioData,
          timestamp: Date.now(),
          sequence: audioChunkSentCountRef.current + 1
        });
      } else {
        // Intelligent queue management: drop middle chunks to preserve recent and older important chunks
        const queueLength = pendingAudioChunks.current.length;
        const middleIndex = Math.floor(queueLength / 2);
        
        // Remove a chunk from the middle third of the queue
        const dropIndex = middleIndex + Math.floor(Math.random() * Math.floor(queueLength / 3));
        pendingAudioChunks.current.splice(dropIndex, 1);
        
        // Add new chunk
        pendingAudioChunks.current.push({
          data: audioData,
          timestamp: Date.now(),
          sequence: audioChunkSentCountRef.current + 1
        });
        
        audioMetricsRef.current.dropouts++;
        addLogEntry("warning", `Audio buffer overflow - intelligently dropped chunk at position ${dropIndex}`);
      }
      return false;
    }

    // Use retry mechanism for failed sends
    return await retryAudioChunk(audioData, 0);
  }, [addLogEntry, checkWebSocketBackpressure, retryAudioChunk]);

  // Handle messages from AudioWorklet (moved up to fix dependency order)
  const handleAudioWorkletMessage = useCallback((event) => {
    const { type, data } = event.data;
    
    switch (type) {
      case 'AUDIO_DATA':
        addLogEntry("audio_capture", `🎤 Captured audio chunk: ${data.audioData.byteLength} bytes`);
        sendAudioChunkWithBackpressure(data.audioData);
        break;
        
      case 'BARGE_IN_DETECTED':
        addLogEntry("vad_activation", `VAD Activated: User speech detected during playback.`);
        if (isPlayingRef.current) {
          addLogEntry(
            "barge_in", 
            `User speech detected during playback (amplitude: ${data.maxAmplitude.toFixed(3)})`
          );
          stopSystemAudioPlayback();
        }
        break;
        
      case 'METRICS':
        audioMetricsRef.current = { ...audioMetricsRef.current, ...data };
        break;
        
      default:
        console.log('Unknown AudioWorklet message:', type, data);
    }
  }, [addLogEntry, stopSystemAudioPlayback, sendAudioChunkWithBackpressure]);

  // Initialize enhanced audio processor (replaces old AudioWorklet initialization)
  const initializeEnhancedAudioProcessor = useCallback(async () => {
    try {
      if (localAudioContextRef.current && localAudioContextRef.current.state === "closed") {
        localAudioContextRef.current = null;
      }
      
      if (!localAudioContextRef.current) {
        localAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: INPUT_SAMPLE_RATE
        });
        
        // Set up state monitoring for the new context
        monitorAudioContextState(localAudioContextRef.current, 'LocalAudioContext');
      }
      
      // Create enhanced audio processor with fallback support
      audioProcessorRef.current = await createAudioProcessor(localAudioContextRef.current, {
        bufferSize: MIC_BUFFER_SIZE,
        sampleRate: INPUT_SAMPLE_RATE,
        channelCount: 1,
        enableAdaptive: true,
        enableMetrics: true
      });
      
      // Set up event handling for the enhanced processor
      setupAudioProcessorEventHandlers();
      
      addLogEntry("mic", "Enhanced audio processor initialized successfully");
      return true;
    } catch (error) {
      addLogEntry("error", `Failed to initialize enhanced audio processor: ${error.message}`);
      console.error("Enhanced audio processor initialization error:", error);
      return false;
    }
  }, [addLogEntry, monitorAudioContextState]);

  // Setup event handlers for enhanced audio processor
  const setupAudioProcessorEventHandlers = useCallback(() => {
    if (!audioProcessorRef.current) return;

    // Handle audio data from processor
    audioProcessorRef.current.on('audioData', async (data) => {
      // Glass-to-glass latency measurement
      const glassToGlassLatency = Date.now() - data.timestamp;
      glassToGlassLatencyRef.current.push(glassToGlassLatency);
      if (glassToGlassLatencyRef.current.length > 100) {
        glassToGlassLatencyRef.current = glassToGlassLatencyRef.current.slice(-100);
      }

      // Update buffer manager with audio data
      if (audioBufferManagerRef.current) {
        audioBufferManagerRef.current.writeInputData(
          new Float32Array(data.audioData),
          data.timestamp
        );
        
        // Measure glass-to-glass latency
        audioBufferManagerRef.current.measureGlassToGlassLatency(data.timestamp);
      }

      // BULLETPROOF TRANSMISSION: Guaranteed audio delivery with comprehensive fallbacks
      try {
        const result = await guaranteedAudioTransmission(
          data.audioData,
          socketRef.current,
          networkResilienceManagerRef.current,
          addLogEntry,
          { sendAudioChunkWithBackpressure }
        );
        
        // Update metrics based on transmission result
        if (result.success) {
          audioChunkSentCountRef.current++;
          lastSendTimeRef.current = Date.now();
          addLogEntry("audio_send", `📤 Audio transmission successful via ${result.method}`);
        } else {
          audioMetricsRef.current.failedTransmissions++;
          addLogEntry("error", "🚨 BULLETPROOF TRANSMISSION FAILED - All methods exhausted");
          addLogEntry("debug", `Failed attempts: ${result.attempts.length}`);
        }
      } catch (error) {
        addLogEntry("error", `CRITICAL: Bulletproof transmission system error: ${error.message}`);
        audioMetricsRef.current.failedTransmissions++;
      }
    });

    // Handle barge-in detection
    audioProcessorRef.current.on('bargeInDetected', (data) => {
      addLogEntry("vad_activation", `VAD Activated: User speech detected during playback.`);
      if (isPlayingRef.current) {
        addLogEntry("barge_in", `User speech detected during playback (energy: ${data.energy.toFixed(3)})`);
        stopSystemAudioPlayback();
      }
    });

    // Handle processor metrics
    audioProcessorRef.current.on('metrics', (data) => {
      // Update audio metrics ref
      audioMetricsRef.current = {
        ...audioMetricsRef.current,
        processingLatency: data.performance.avgProcessingTime,
        glitches: data.performance.glitches,
        isHealthy: data.performance.isHealthy
      };
    });

    // Handle processor errors
    audioProcessorRef.current.on('error', (data) => {
      addLogEntry("error", `Audio processor error (${data.context}): ${data.error}`);
    });

    audioProcessorRef.current.on('fatalError', (data) => {
      addLogEntry("error", `Fatal audio processor error (${data.context}): ${data.error}`);
      // Attempt to recover
      setTimeout(() => {
        if (isSessionActiveRef.current && !audioProcessorRef.current) {
          addLogEntry("info", "Attempting audio processor recovery...");
          initializeEnhancedAudioProcessor();
        }
      }, 2000);
    });

  }, [addLogEntry, stopSystemAudioPlayback, sendAudioChunkWithBackpressure]);

  // Fallback ScriptProcessorNode implementation (moved up to fix dependency order)
  const initializeScriptProcessorFallback = useCallback(() => {
    try {
      addLogEntry("info", "Initializing ScriptProcessorNode fallback");
      // This would implement the old ScriptProcessorNode approach if needed
      // For now, we'll indicate that fallback is not implemented
      addLogEntry("error", "ScriptProcessorNode fallback not implemented - please use a modern browser");
      return false;
    } catch (error) {
      addLogEntry("error", `ScriptProcessorNode fallback failed: ${error.message}`);
      return false;
    }
  }, [addLogEntry]);

  // Check AudioWorklet support with fallback
  const checkAudioWorkletSupport = useCallback(async () => {
    try {
      if (typeof AudioWorkletNode === 'undefined' || !window.AudioContext) {
        throw new Error('AudioWorklet not supported');
      }

      // Test AudioWorklet creation
      const testContext = new AudioContext();
      await testContext.audioWorklet.addModule(ENHANCED_AUDIO_WORKLET_URL);
      testContext.close();
      
      audioWorkletSupported.current = true;
      addLogEntry("success", "AudioWorklet support confirmed");
      return true;
    } catch (error) {
      audioWorkletSupported.current = false;
      addLogEntry("warning", `AudioWorklet not supported: ${error.message}`);
      addLogEntry("info", "Falling back to ScriptProcessorNode (deprecated)");
      return false;
    }
  }, [addLogEntry]);

  // Enhanced audio processor initialization with automatic fallback
  const initializeAudioProcessorWithFallback = useCallback(async () => {
    // Use the new enhanced processor that handles fallback automatically
    return await initializeEnhancedAudioProcessor();
  }, [initializeEnhancedAudioProcessor]);




  // Process pending audio chunks with sequencing support
  const processPendingAudioChunks = useCallback(async () => {
    while (pendingAudioChunks.current.length > 0 && !checkWebSocketBackpressure()) {
      const chunkObj = pendingAudioChunks.current.shift();
      const audioData = chunkObj.data || chunkObj; // Handle both old and new formats
      const sent = await sendAudioChunkWithBackpressure(audioData);
      if (!sent) {
        // Put it back at the front if couldn't send
        pendingAudioChunks.current.unshift(chunkObj);
        break;
      }
    }
  }, [sendAudioChunkWithBackpressure, checkWebSocketBackpressure]);

  // Periodic processing of pending audio chunks
  useEffect(() => {
    const interval = setInterval(() => {
      if (pendingAudioChunks.current.length > 0) {
        processPendingAudioChunks();
      }
    }, 100); // Check every 100ms

    return () => clearInterval(interval);
  }, [processPendingAudioChunks]);



  const handleStartListening = useCallback(
    async (isResuming = false) => {
      if (isRecordingRef.current && !isResuming) {
        addLogEntry(
          "mic_control",
          "Mic already active. Start request ignored."
        );
        return;
      }
      if (!isSessionActiveRef.current) {
        addLogEntry(
          "mic_control",
          "Session not active. Cannot start microphone."
        );
        return;
      }
      addLogEntry(
        "mic_control",
        isResuming
          ? "Resume Microphone Input requested."
          : "Start Microphone Input requested as part of session."
      );

      if (!isResuming) {
        await getPlaybackAudioContext("handleStartListening_UserAction");
      }

      if (
        !mediaStreamRef.current ||
        !localAudioContextRef.current ||
        localAudioContextRef.current.state === "closed" ||
        !audioProcessorRef.current
      ) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          addLogEntry("error", "getUserMedia not supported on your browser!");
          setIsSessionActive(false);
          return;
        }
        try {
          addLogEntry("mic", "🎤 Requesting microphone access for new stream...");
          addLogEntry("debug", `AudioContext state: ${localAudioContextRef.current?.state}, Sample rate: ${localAudioContextRef.current?.sampleRate}`);
          mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
            audio: {sampleRate: INPUT_SAMPLE_RATE, channelCount: 1},
          });
          addLogEntry("mic", "🎤 Microphone access GRANTED.");

          // Initialize AudioWorklet with fallback support
          const audioProcessorInitialized = await initializeAudioProcessorWithFallback();
          if (!audioProcessorInitialized) {
            addLogEntry("error", "Failed to initialize audio processor");
            setIsSessionActive(false);
            return;
          }

          // Create media stream source and connect to enhanced audio processor
          const source = localAudioContextRef.current.createMediaStreamSource(
            mediaStreamRef.current
          );
          
          // Handle different connection methods for different processor types
          if (audioProcessorRef.current.connect) {
            // For ScriptProcessorFallback: pass source to connect method
            if (audioProcessorRef.current.constructor.name === 'ScriptProcessorFallback') {
              audioProcessorRef.current.connect(source);
            } else {
              // For AudioWorkletWrapper: source connects to the processor node
              if (audioProcessorRef.current.workletNode) {
                source.connect(audioProcessorRef.current.workletNode);
              } else {
                source.connect(audioProcessorRef.current);
              }
            }
          } else {
            // Fallback: direct connection
            source.connect(audioProcessorRef.current);
          }
          
          // Send initial configuration to enhanced audio processor
          audioProcessorRef.current.updateConfig({
            bufferSize: MIC_BUFFER_SIZE,
            vadThreshold: 0.04,
            noiseSuppression: true,
            enableAdaptive: true
          });
          
          // Start the audio buffer manager
          if (audioBufferManagerRef.current) {
            audioBufferManagerRef.current.start();
          }
          
          // Start the network resilience manager
          if (networkResilienceManagerRef.current) {
            networkResilienceManagerRef.current.start();
          }
          
          addLogEntry("mic", "Enhanced audio processing chain established.");
        } catch (err) {
          console.error("Failed to start microphone:", err);
          addLogEntry(
            "error",
            `Mic Setup Error: ${err.message}. Please check permissions.`
          );
          setIsSessionActive(false);
          if (
            socketRef.current &&
            socketRef.current.readyState === WebSocket.OPEN
          ) {
            socketRef.current.close(
              1000,
              "Mic setup failed during session start"
            );
          }
          return;
        }
      } else if (localAudioContextRef.current.state === "suspended") {
        try {
          await localAudioContextRef.current.resume();
          addLogEntry("mic", "Local AudioContext for microphone resumed.");
        } catch (e) {
          addLogEntry(
            "error",
            `Could not resume local audio context for mic: ${e.message}`
          );
          return;
        }
      }
      // Notify enhanced audio processor that recording has started
      if (audioProcessorRef.current) {
        audioProcessorRef.current.setRecording(true);
      }
      
      setIsRecording(true);
      addLogEntry("mic_status", "Microphone is NOW actively sending data.");
    },
    [addLogEntry, initializeAudioProcessorWithFallback, getPlaybackAudioContext]
  );

  const handlePauseListening = useCallback(() => {
    if (!isRecordingRef.current) {
      addLogEntry(
        "mic_control",
        "Not currently sending mic data. Pause request ignored."
      );
      return;
    }
    addLogEntry("mic_control", "Pause Microphone Input requested by user.");
    
    // Notify enhanced audio processor to stop recording
    if (audioProcessorRef.current) {
      audioProcessorRef.current.setRecording(false);
    }
    
    setIsRecording(false);
    addLogEntry("mic_status", "Microphone is NOW paused (not sending data).");
  }, [addLogEntry]);

  const handleStopListeningAndCleanupMic = useCallback(() => {
    addLogEntry(
      "mic_control",
      "Full Microphone Stop and Resource Cleanup requested."
    );
    setIsRecording(false);

    // Stop enhanced audio processor
    if (audioProcessorRef.current) {
      audioProcessorRef.current.setRecording(false);
      audioProcessorRef.current.disconnect();
      audioProcessorRef.current.destroy();
      audioProcessorRef.current = null;
      addLogEntry(
        "mic_resource",
        "Enhanced audio processor stopped and cleaned up."
      );
    }
    
    // Stop audio managers
    if (audioBufferManagerRef.current) {
      audioBufferManagerRef.current.stop();
    }
    
    if (networkResilienceManagerRef.current) {
      networkResilienceManagerRef.current.stop();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      addLogEntry("mic_resource", "MediaStream tracks stopped and nullified.");
    }
    if (localAudioContextRef.current) {
      if (localAudioContextRef.current.state !== "closed") {
        localAudioContextRef.current
          .close()
          .then(() => {
            addLogEntry("mic_resource", "Local AudioContext for mic closed.");
          })
          .catch((e) => {
            addLogEntry(
              "error",
              `Error closing Local AudioContext for mic: ${e.message}`
            );
          });
      }
      localAudioContextRef.current = null;
    }
    audioChunkSentCountRef.current = 0;
    addLogEntry("mic_status", "Microphone resources cleaned up.");
  }, [addLogEntry]);

  const connectWebSocket = useCallback(
    (language) => {
      if (
        socketRef.current &&
        (socketRef.current.readyState === WebSocket.OPEN ||
          socketRef.current.readyState === WebSocket.CONNECTING)
      ) {
        if (socketRef.current.url.includes(`lang=${language}`)) {
          addLogEntry(
            "ws",
            `WebSocket already open or connecting with ${language}.`
          );
          if (isSessionActiveRef.current && !isRecordingRef.current) {
            handleStartListening(false);
          }
          return;
        }
        addLogEntry(
          "ws",
          `Closing existing WebSocket (url: ${socketRef.current.url}, state: ${socketRef.current.readyState}) before new connection for lang ${language}.`
        );
        socketRef.current.close(
          1000,
          "New connection with different language initiated by connectWebSocket"
        );
      }

      addLogEntry(
        "ws",
        `Attempting to connect to WebSocket with language: ${language}...`
      );
      setWebSocketStatus("Connecting...");
      socketRef.current = new WebSocket(
        `ws://${BACKEND_HOST}/listen?lang=${language}`
      );
      socketRef.current.binaryType = "arraybuffer";

      // CRITICAL FIX 1: Assign WebSocket to network resilience manager IMMEDIATELY
      // This prevents race conditions between audio processing and WebSocket readiness
      if (networkResilienceManagerRef.current) {
        networkResilienceManagerRef.current.setWebSocket(socketRef.current);
        addLogEntry("ws", "WebSocket assigned to network resilience manager immediately after creation");
      }

      socketRef.current.onopen = () => {
        setWebSocketStatus("Open");
        addLogEntry("ws", `WebSocket Connected (Lang: ${language}).`);
        
        // CRITICAL FIX 2: Reset circuit breaker on successful connection
        if (networkResilienceManagerRef.current?.audioCircuitBreaker) {
          networkResilienceManagerRef.current.resetCircuitBreaker();
          addLogEntry("ws", "Circuit breaker reset on successful WebSocket connection");
        }
        
        // Generate unique connection ID for this WebSocket connection
        const connectionId = `ws-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        socketRef.current._connectionId = connectionId;
        
        // CRITICAL FIX 1: Clear any stale signal tracking for connection recovery
        if (connectionId && connectionSignalTracker.current.has(connectionId)) {
          connectionSignalTracker.current.delete(connectionId);
          addLogEntry("audio", `🔄 Cleared stale signal tracking for recovered connection ${connectionId}`);
        }
        
        // Check if audio chain is ready and send unified signal
        if (playbackAudioContextRef.current && playbackAudioContextRef.current.state === "running") {
          sendAudioReadySignal(playbackAudioContextRef.current, socketRef.current, addLogEntry, connectionSignalTracker, "websocket-onopen");
        }
        
        if (isSessionActiveRef.current) {
          addLogEntry(
            "session_flow",
            "Session is active. Proceeding to start microphone input via handleStartListening."
          );
          handleStartListening(false); // This will set isRecording to true
          setIsMuted(false); // Ensure mic is unmuted when session starts/restarts
        } else {
          addLogEntry(
            "ws_warn",
            "WebSocket opened, but session is NOT marked active. Mic not started."
          );
        }
      };

      socketRef.current.onmessage = (event) => {
        if (typeof event.data === "string") {
          try {
            const receivedData = JSON.parse(event.data);
            if (receivedData.type && receivedData.type.endsWith("_update")) {
              addLogEntry(
                receivedData.type,
                `${receivedData.sender}: ${receivedData.text} (Final: ${receivedData.is_final})`
              );
              setTranscriptionMessages((prevMessages) => {
                const existingMessageIndex = prevMessages.findIndex(
                  (msg) => msg.id === receivedData.id
                );
                if (existingMessageIndex !== -1) {
                  return prevMessages.map((msg) =>
                    msg.id === receivedData.id
                      ? {
                          ...msg,
                          text: receivedData.text,
                          is_final: receivedData.is_final,
                        }
                      : msg
                  );
                } else {
                  return [
                    ...prevMessages,
                    {
                      id: receivedData.id,
                      text: receivedData.text,
                      sender: receivedData.sender,
                      is_final: receivedData.is_final,
                    },
                  ];
                }
              });
            } else if (receivedData.type === "error") {
              addLogEntry(
                "error",
                `Server Error via WS: ${receivedData.message}`
              );
            } else if (receivedData.type === "audio_metadata") {
              // Handle audio metadata separately from binary audio
              const metadata = receivedData;
              const sequence = metadata.sequence;
              
              addLogEntry("audio_receive", `📥 Audio metadata: ${metadata.size_bytes} bytes, ${metadata.expected_duration_ms}ms duration, seq=${sequence}`);
              
              // Store metadata for correlation with binary audio
              pendingMetadataRef.current.set(sequence, metadata);
              
              // Clean up old metadata entries (keep last 100)
              if (pendingMetadataRef.current.size > 100) {
                const entries = Array.from(pendingMetadataRef.current.entries());
                entries.sort((a, b) => a[0] - b[0]); // Sort by sequence
                const toDelete = entries.slice(0, entries.length - 100);
                toDelete.forEach(([seq]) => pendingMetadataRef.current.delete(seq));
              }
            } else if (receivedData.type === "buffer_pressure") {
              // Handle backend buffer pressure warnings
              const level = receivedData.level;
              const bufferSize = receivedData.buffer_size;
              const maxSize = receivedData.max_size;
              const action = receivedData.recommended_action;
              
              addLogEntry("audio_flow_control", 
                `🔥 Buffer pressure ${level}: ${bufferSize}/${maxSize} chunks, action: ${action}`);
              
              // UNIFIED: Log buffer pressure but don't adjust scheduling to avoid conflicts
              if (level === "high") {
                addLogEntry("audio_flow_control", `⚠️ Buffer pressure detected - backend will handle optimization`);
              }
            } else if (receivedData.type === "audio_truncation") {
              // Handle audio truncation warnings
              const chunksRemoved = receivedData.chunks_removed;
              const reason = receivedData.reason;
              
              addLogEntry("error", 
                `🚨 Audio truncated: ${chunksRemoved} chunks removed due to ${reason}`);
            } else {
              addLogEntry(
                "ws_json_unhandled",
                `Unhandled JSON: ${event.data.substring(0, 150)}...`
              );
            }
          } catch (e) {
            addLogEntry(
              "error",
              `Failed to parse JSON from WS: ${
                e.message
              }. Raw: ${event.data.substring(0, 150)}...`
            );
          }
        } else if (event.data instanceof ArrayBuffer) {
          addLogEntry("audio_receive", `📥 Received binary audio from backend: ${event.data.byteLength} bytes`);
          
          // SIMPLE APPROACH: Queue audio chunks directly for immediate playback
          audioQueueRef.current.push(event.data);
          if (!isPlayingRef.current) playNextGeminiChunk();
        } else {
          addLogEntry(
            "ws_unknown_type",
            `Received unknown data type from WS: ${typeof event.data}`
          );
        }
      };

      socketRef.current.onerror = (error) => {
        console.error("WebSocket Error:", error);
        setWebSocketStatus("Error");
        addLogEntry("error", `WebSocket error occurred. Details in console.`);
        
        // ENHANCED ERROR HANDLING: Comprehensive circuit breaker and recovery management
        if (networkResilienceManagerRef.current) {
          const readiness = networkResilienceManagerRef.current.isBulletproofReady();
          addLogEntry("debug", 
            `WebSocket error - System readiness: ${readiness.ready ? 'READY' : readiness.reason}`);
          
          // Log circuit breaker state for debugging
          const circuitState = networkResilienceManagerRef.current.audioCircuitBreaker?.state;
          if (circuitState) {
            addLogEntry("debug", `Circuit breaker state after WebSocket error: ${circuitState}`);
          }
        }
        
        if (isSessionActiveRef.current) {
          addLogEntry("session_flow", "Session active during WebSocket error. Terminating session.");
          setIsSessionActive(false);
          handleStopListeningAndCleanupMic();
        }
      };

      socketRef.current.onclose = (event) => {
        setWebSocketStatus("Closed");
        addLogEntry(
          "ws",
          `WebSocket Disconnected. Code: ${event.code}, Reason: "${
            event.reason || "No reason given"
          }"`
        );
        const intentionalCloseReasons = [
          "User stopped session",
          "Language changed during active session - stopping session",
          "Component unmounting",
          "New connection with different language initiated by connectWebSocket",
          "Mic setup failed during session start",
          "getUserMedia not supported",
        ];
        if (
          !intentionalCloseReasons.includes(event.reason) &&
          event.code !== 1000 &&
          event.code !== 1005
        ) {
          addLogEntry(
            "error",
            `WebSocket closed unexpectedly (Code: ${event.code}, Reason: "${event.reason}"). Session terminated if active.`
          );
          if (isSessionActiveRef.current) {
            setIsSessionActive(false);
            handleStopListeningAndCleanupMic();
          }
        } else {
          addLogEntry(
            "ws_info",
            `WebSocket closed intentionally or expectedly (Reason: "${event.reason}", Code: ${event.code}).`
          );
        }
        if (
          isSessionActiveRef.current &&
          !intentionalCloseReasons.includes(event.reason) &&
          event.code !== 1000
        ) {
          addLogEntry(
            "session_flow_warn",
            "Unexpected WS close during active session. Ensuring session is marked inactive."
          );
          setIsSessionActive(false);
        }
        
        // Clean up connection tracking for this closed connection
        if (event.target && event.target._connectionId) {
          connectionSignalTracker.current.delete(event.target._connectionId);
          addLogEntry("audio", `Cleaned up connection tracking for ${event.target._connectionId}`);
        }
      };
    },
    [
      addLogEntry,
      playNextGeminiChunk,
      handleStartListening,
      handleStopListeningAndCleanupMic,
    ]
  );

  const handleToggleSession = useCallback(async () => {
    if (isSessionActiveRef.current) {
      addLogEntry("session_control", "User requested to STOP session.");
      handleStopListeningAndCleanupMic();
      if (
        socketRef.current &&
        (socketRef.current.readyState === WebSocket.OPEN ||
          socketRef.current.readyState === WebSocket.CONNECTING)
      ) {
        addLogEntry(
          "ws_control",
          "Closing WebSocket due to session stop request."
        );
        socketRef.current.close(1000, "User stopped session");
      }
      setIsSessionActive(false);
      setIsMuted(false); // Reset mute state when session stops
      addLogEntry("session_status", "Session INACTIVE.");
    } else {
      addLogEntry("session_control", "User requested to START session.");
      await getPlaybackAudioContext("handleToggleSession_UserAction_Start");

      const currentLangName =
        LANGUAGES.find((l) => l.code === selectedLanguage)?.name ||
        selectedLanguage;
      addLogEntry(
        "session_flow",
        `Attempting to connect WebSocket for session start (Language: ${currentLangName}).`
      );

      setIsSessionActive(true);
      setIsMuted(false); // Ensure mic is unmuted when starting a new session
      connectWebSocket(selectedLanguage);
      addLogEntry(
        "session_status",
        "Session PENDING (WebSocket connecting, Mic to start on WS open)."
      );
    }
  }, [
    selectedLanguage,
    connectWebSocket,
    handleStopListeningAndCleanupMic,
    addLogEntry,
    getPlaybackAudioContext,
  ]);

  const handleMicMuteToggle = useCallback(() => {
    if (!isSessionActiveRef.current) return;

    if (isRecordingRef.current) {
      setIsMuted((prevMuted) => {
        const newMutedState = !prevMuted;
        addLogEntry(
          "mic_control",
          `Microphone ${newMutedState ? "MUTED" : "UNMUTED"}.`
        );
        return newMutedState;
      });
    } else {
      // If session is active but not recording (e.g., after explicit pause, or initial state)
      addLogEntry(
        "mic_control",
        "Mic button (unmute/start) pressed while not recording in active session. Attempting to start mic."
      );
      setIsMuted(false); // Ensure unmuted
      handleStartListening(); // This will set isRecording to true
    }
  }, [addLogEntry, handleStartListening]);

  useEffect(() => {
    const currentLangName =
      LANGUAGES.find((l) => l.code === selectedLanguage)?.name ||
      selectedLanguage;
    addLogEntry(
      "system_event",
      `Language selection changed to: ${currentLangName} (${selectedLanguage}).`
    );

    if (isSessionActiveRef.current) {
      addLogEntry(
        "session_control",
        `Language changed during an active session. Stopping current session.`
      );
      handleStopListeningAndCleanupMic();
      if (
        socketRef.current &&
        (socketRef.current.readyState === WebSocket.OPEN ||
          socketRef.current.readyState === WebSocket.CONNECTING)
      ) {
        socketRef.current.close(
          1000,
          "Language changed during active session - stopping session"
        );
      }
      setIsSessionActive(false);
      addLogEntry(
        "system_message",
        `Session stopped due to language change. Please click "Start Session" again if you wish to continue with ${currentLangName}.`
      );
    }

    return () => {
      addLogEntry("system_event", "App component unmounting.");
      if (isSessionActiveRef.current) {
        addLogEntry(
          "session_control",
          "Unmounting with active session. Cleaning up resources."
        );
        handleStopListeningAndCleanupMic();
        if (
          socketRef.current &&
          (socketRef.current.readyState === WebSocket.OPEN ||
            socketRef.current.readyState === WebSocket.CONNECTING)
        ) {
          addLogEntry("ws_control", `Component unmounting: Closing WebSocket.`);
          socketRef.current.close(1000, "Component unmounting");
        }
      }
    };
  }, [selectedLanguage, addLogEntry, handleStopListeningAndCleanupMic]);

  const handleSendTextMessage = useCallback(() => {
    if (!textInputValue.trim()) return;
    const currentLangName =
      LANGUAGES.find((l) => l.code === selectedLanguage)?.name ||
      selectedLanguage;
    addLogEntry(
      "user_text",
      `User typed (Lang: ${currentLangName}): "${textInputValue}"`
    );
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const messagePayload = {
        type: "text_message",
        text: textInputValue,
        language: selectedLanguage,
        timestamp: new Date().toISOString(),
        id: generateUniqueId(),
      };
      socketRef.current.send(JSON.stringify(messagePayload));
      setTranscriptionMessages((prev) => [
        ...prev,
        {
          id: messagePayload.id,
          sender: "user",
          text: textInputValue,
          is_final: true,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
      setTextInputValue("");
    } else {
      addLogEntry(
        "error",
        "Cannot send text: WebSocket not connected or not open."
      );
    }
  }, [textInputValue, addLogEntry, selectedLanguage]);

  const handleClearConsole = () => {
    setMessages([]);
    addLogEntry("console", "Console cleared by user.");
  };

  useEffect(() => {
    addLogEntry("status", 'Welcome! Click "Start Session" or type your query.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app-container">
      <div className="console-panel">
        <div className="console-header">
          <h2>Console</h2>
          <div className="console-header-controls">
            <select
              className="console-dropdown"
              defaultValue="conversations">
              <option value="conversations">Conversations</option>
            </select>
            {/* console-paused-button removed as its info is now in control-bar */}
          </div>
        </div>
        <div
          className="logs-area"
          ref={logsAreaRef}>
          {isLoading && <p className="loading-indicator">Loading...</p>}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`log-entry log-entry-${msg.type} ${
                msg.type === "toolcall" ? "log-entry-toolcall" : ""
              }`}>
              <span className="log-timestamp">[{msg.timestamp}] </span>
              <span className="log-prefix">{msg.type.toUpperCase()}: </span>
              <span className="log-message">{msg.content}</span>
            </div>
          ))}
        </div>
        <div className="text-input-area console-text-input-area">
          <input
            type="text"
            className="text-input"
            value={textInputValue}
            onChange={(e) => setTextInputValue(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSendTextMessage()}
            placeholder="Type something..."
            disabled={!isSessionActive}
          />
          <button
            onClick={handleSendTextMessage}
            className="control-button send-button"
            disabled={!textInputValue.trim() || !isSessionActive}>
            <FontAwesomeIcon icon={faPaperPlane} />
          </button>
        </div>
      </div>

      <div className="main-panel">
        <div className="main-panel-header">
          <h2>Transcriptions</h2>
        </div>
        <div
          className="results-content chat-area"
          ref={chatAreaRef}>
          {transcriptionMessages.length === 0 && (
            <div className="results-content-placeholder">
              <p>
                Audio transcriptions will appear here when a session is active.
              </p>
            </div>
          )}
          {transcriptionMessages.map((msg) => (
            <div
              key={msg.id}
              className={`chat-bubble ${
                msg.sender === "user" ? "user-bubble" : "ai-bubble"
              }`}>
              <div className="chat-bubble-text">{msg.text}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="control-bar">
        <div className="control-tray main-controls">
          <button
            onClick={handleToggleSession}
            className="control-button icon-button session-button"
            title={
              isSessionActive ? "Stop Current Session" : "Start a New Session"
            }>
            <div className="icon-button-content">
              <FontAwesomeIcon icon={isSessionActive ? faStop : faPlay} />
              <span className="icon-button-text">
                {isSessionActive ? "Stop" : "Start"}
              </span>
            </div>
          </button>
          <button
            onClick={handleMicMuteToggle}
            className={`control-button icon-button mic-button ${
              isRecording && !isMutedRef.current ? "active" : ""
            } ${isMutedRef.current ? "muted" : ""}`}
            disabled={!isSessionActiveRef.current}
            title={
              isMutedRef.current
                ? "Unmute Microphone"
                : isRecordingRef.current
                ? "Mute Microphone"
                : "Start Microphone"
            }>
            <div className="icon-button-content">
              <FontAwesomeIcon
                icon={isMutedRef.current ? faMicrophoneSlash : faMicrophone}
              />
              <span className="icon-button-text">
                {isMutedRef.current ? "Muted" : "Unmuted"}
              </span>
            </div>
          </button>
          <div className="audio-signal-placeholder">
            {isRecording && !isMuted && (
              <div className="audio-wave">
                <span></span>
                <span></span>
                <span></span>
                <span></span>
                <span></span>
              </div>
            )}
          </div>
        </div>
        <div className="control-tray secondary-controls">
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            disabled={isSessionActiveRef.current}
            className="language-selector-dropdown"
            title="Select Language (Session restarts on change if active)">
            {LANGUAGES.map((lang) => (
              <option
                key={lang.code}
                value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
          <div
            className="status-indicator icon-status-indicator websocket-status"
            title="WebSocket Connection Status">
            <div className="icon-status-content">
              <FontAwesomeIcon icon={faWifi} />
              <span className="icon-status-text">WS: {webSocketStatus}</span>
            </div>
          </div>
          <div
            className="status-indicator icon-status-indicator session-active-status"
            title="Session Status">
            <div className="icon-status-content">
              <FontAwesomeIcon icon={faPowerOff} />
              <span className="icon-status-text">
                {isSessionActiveRef.current
                  ? "Session: Active"
                  : "Session: Inactive"}
              </span>
            </div>
          </div>
          <div
            className={`status-indicator icon-status-indicator audio-health-status ${
              !audioHealth.isHealthy ? "status-warning" : ""
            }`}
            title={`Audio Health: ${audioHealth.isHealthy ? "Good" : "Issues detected"}\n${audioHealth.issues.join("\n")}`}>
            <div className="icon-status-content">
              <span className="icon-status-text">
                Audio: {audioHealth.isHealthy ? "Healthy" : "Issues"}
              </span>
            </div>
          </div>
          <div
            className={`status-indicator icon-status-indicator network-quality-status ${
              networkQuality.score < 0.5 ? "status-warning" : 
              networkQuality.score < 0.8 ? "status-caution" : ""
            }`}
            title={`Network Quality: ${(networkQuality.score * 100).toFixed(0)}%\nLatency: ${networkQuality.latency.toFixed(0)}ms`}>
            <div className="icon-status-content">
              <span className="icon-status-text">
                Net: {(networkQuality.score * 100).toFixed(0)}% ({networkQuality.latency.toFixed(0)}ms)
              </span>
            </div>
          </div>
          <div
            className="status-indicator icon-status-indicator buffer-status"
            title={`Input Buffer: ${(bufferMetrics.inputFillLevel * 100).toFixed(1)}%\nOutput Buffer: ${(bufferMetrics.outputFillLevel * 100).toFixed(1)}%`}>
            <div className="icon-status-content">
              <span className="icon-status-text">
                Buf: {(bufferMetrics.inputFillLevel * 100).toFixed(0)}%/{(bufferMetrics.outputFillLevel * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
