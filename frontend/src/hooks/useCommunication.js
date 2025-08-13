import { useState, useRef, useCallback, useEffect } from "react";
import {
  BACKEND_HOST,
  OUTPUT_SAMPLE_RATE,
  WEBSOCKET_SEND_BUFFER_LIMIT,
  MAX_RETRY_ATTEMPTS,
  RETRY_DELAY_BASE,
  MAX_AUDIO_QUEUE_SIZE,
  JITTER_BUFFER_MIN_FILL,
} from "../utils/constants";
import { sendAudioReadySignal } from "../utils/webSocketUtils";
import { createWavFile } from "../utils/audioUtils.js";
import { debugLog, debugError } from "../config/debug";

export const useCommunication = (
  addLogEntry,
  handleStartListening,
  networkResilienceManagerRef,
  isSessionActive,
  isSessionActiveRef,
  isRecording,
  language,
  isAudioContextReady,
  isPlayingRef,
  stopSystemAudioPlayback,
  adaptiveJitterBufferSize,
  nextStartTimeRef,
  currentAudioSourceRef,
  gainNodeRef,
  jitterBufferRef,
  isPlaybackStartedRef,
  checkWebSocketBackpressure,
  sendAudioChunkWithBackpressure,
  pendingAudioChunks
) => {
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
  const [webSocketStatus, setWebSocketStatus] = useState("N/A");
  const [transcriptionMessages, setTranscriptionMessages] = useState([]);
  const [isWebSocketReady, setIsWebSocketReady] = useState(false);
  const socketRef = useRef(null);
  const playbackAudioContextRef = useRef(null);
  const connectionSignalTracker = useRef(new Set());
  const pendingMetadataRef = useRef(new Map());
  const addLogEntryRef = useRef(addLogEntry);
  
  // Update ref when addLogEntry changes
  useEffect(() => {
    addLogEntryRef.current = addLogEntry;
  }, [addLogEntry]);
  
  // Enhanced chunk tracking
  const chunkTrackingRef = useRef({
    totalChunksReceived: 0,
    totalChunksPlayed: 0,
    chunksReceivedCurrentTurn: 0,
    chunksPlayedCurrentTurn: 0,
    currentTurnId: null,
    turnChunkData: {},  // turnId -> {received, played, startTime, endSignalReceived}
    lastChunkReceivedTime: null,
    lastChunkPlayedTime: null,
    turnEndSignals: new Set(), // Track when turn end signals are received
    isExpectingMoreChunks: true // Flag to indicate if we're expecting more chunks
  });
  
  // Function to detect potential truncation issues
  const checkForTruncationIssues = useCallback((turnId) => {
    const tracking = chunkTrackingRef.current;
    const turnData = tracking.turnChunkData[turnId];
    
    if (turnData && turnData.received !== turnData.played) {
      const missed = turnData.received - turnData.played;
      addLogEntryRef.current(
        "chunk_analysis",
        `⚠️ POTENTIAL TRUNCATION: Turn ${turnId} - ${missed} chunks not played (${turnData.received} received, ${turnData.played} played)`
      );
      
      // Check if this is the first turn (common truncation pattern)
      const turnIds = Object.keys(tracking.turnChunkData);
      const isFirstTurn = turnIds.length <= 1 || turnId === turnIds[0];
      
      if (isFirstTurn && missed > 0) {
        addLogEntryRef.current(
          "chunk_analysis",
          `🔴 FIRST TURN TRUNCATION DETECTED: This matches the reported issue pattern!`
        );
      }
    }
  }, []);

  // Function to check if we should start playback even with fewer chunks
  const shouldStartPlaybackEarly = useCallback(() => {
    const tracking = chunkTrackingRef.current;
    const bufferLength = jitterBufferRef.current.length;
    const timeSinceLastChunk = tracking.lastChunkReceivedTime ? 
      Date.now() - tracking.lastChunkReceivedTime : 0;
    
    // Start playback early if:
    // 1. We have some chunks and it's been a while since the last chunk (end of turn)
    // 2. We received a turn end signal and have pending chunks
    // 3. We have chunks and aren't expecting more
    const shouldStart = bufferLength > 0 && (
      timeSinceLastChunk > 500 || // 500ms since last chunk
      !tracking.isExpectingMoreChunks ||
      (tracking.currentTurnId && tracking.turnEndSignals.has(tracking.currentTurnId))
    );

    if (shouldStart && bufferLength < adaptiveJitterBufferSize.current) {
      addLogEntryRef.current(
        "audio_playback", 
        `🚀 EARLY PLAYBACK: Starting with ${bufferLength} chunks (threshold: ${adaptiveJitterBufferSize.current}, time since last: ${timeSinceLastChunk}ms)`
      );
    }

    return shouldStart;
  }, []);

  const playAudioFromQueue = useCallback(async () => {
    // Improved jitter buffer logic - check if we should start playback early
    const hasMinimumChunks = jitterBufferRef.current.length >= adaptiveJitterBufferSize.current;
    const shouldStartEarly = shouldStartPlaybackEarly();
    
    if (isPlayingRef.current || (!hasMinimumChunks && !shouldStartEarly)) {
      return;
    }
    isPlayingRef.current = true;
    const audioChunk = jitterBufferRef.current.shift();
    if (!audioChunk) {
      isPlayingRef.current = false;
      return;
    }
    try {
      // Ensure playback context is ready
      if (!playbackAudioContextRef.current) {
        playbackAudioContextRef.current = new (window.AudioContext ||
          window.webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE });
      }

      if (playbackAudioContextRef.current.state === "suspended") {
        await playbackAudioContextRef.current.resume();
        addLogEntryRef.current("audio_playback", "Playback AudioContext resumed");
      }

      // Create WAV file with error handling
      const wavData = createWavFile(audioChunk);
      if (!wavData) {
        addLogEntryRef.current("error", "Failed to create WAV file from audio chunk");
        isPlayingRef.current = false;
        playAudioFromQueue(); // Try next chunk
        return;
      }

      // Decode audio data with error handling
      let audioBuffer;
      try {
        audioBuffer = await playbackAudioContextRef.current.decodeAudioData(
          wavData
        );
      } catch (decodeError) {
        addLogEntryRef.current("error", `Audio decode failed: ${decodeError.message}`);
        isPlayingRef.current = false;
        playAudioFromQueue(); // Try next chunk
        return;
      }

      const source = playbackAudioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(playbackAudioContextRef.current.destination);

      const currentTime = playbackAudioContextRef.current.currentTime;
      const startTime =
        nextStartTimeRef.current > currentTime
          ? nextStartTimeRef.current
          : currentTime;
      source.start(startTime);
      nextStartTimeRef.current = startTime + audioBuffer.duration;
      
      // Enhanced chunk tracking with proper turn management
      const tracking = chunkTrackingRef.current;
      tracking.totalChunksPlayed++;
      tracking.chunksPlayedCurrentTurn++;
      tracking.lastChunkPlayedTime = Date.now();
      
      // Update turn data
      if (tracking.currentTurnId && tracking.turnChunkData[tracking.currentTurnId]) {
        tracking.turnChunkData[tracking.currentTurnId].played++;
        
        addLogEntryRef.current(
          "chunk_playback",
          `📊 Chunk played for turn ${tracking.currentTurnId}: ${tracking.turnChunkData[tracking.currentTurnId].played}/${tracking.turnChunkData[tracking.currentTurnId].received} (queue: ${jitterBufferRef.current.length})`
        );
        
        // Check if turn is complete
        const turnData = tracking.turnChunkData[tracking.currentTurnId];
        const isTurnComplete = turnData.endSignalReceived && 
                             turnData.played >= turnData.received && 
                             jitterBufferRef.current.length === 0;
        
        if (isTurnComplete) {
          addLogEntryRef.current(
            "turn_complete",
            `✅ TURN COMPLETE: Turn ${tracking.currentTurnId} - all ${turnData.played} chunks played successfully`
          );
          
          // Check for any missed chunks before completing
          checkForTruncationIssues(tracking.currentTurnId);
        }
      }

      source.onended = () => {
        isPlayingRef.current = false;
        
        // Continue playing remaining chunks in queue
        if (jitterBufferRef.current.length > 0) {
          playAudioFromQueue();
        } else {
          // No more chunks in queue - check if we should wait or if turn is complete
          const tracking = chunkTrackingRef.current;
          if (tracking.isExpectingMoreChunks) {
            addLogEntryRef.current(
              "audio_queue_empty",
              `🔄 Audio queue empty but expecting more chunks. Waiting for next chunk...`
            );
            
            // Set a timeout to check again in case we miss chunks
            setTimeout(() => {
              if (jitterBufferRef.current.length > 0) {
                addLogEntryRef.current("audio_queue_resumed", "📥 New chunks arrived, resuming playback");
                playAudioFromQueue();
              }
            }, 100);
          } else {
            addLogEntryRef.current(
              "audio_turn_end",
              `🏁 Audio playback complete - no more chunks expected`
            );
          }
        }
      };
      currentAudioSourceRef.current = { source };
    } catch (error) {
      addLogEntryRef.current("error", `Audio playback error: ${error.message}`);
      isPlayingRef.current = false;
      setTimeout(playAudioFromQueue, 100);
    }
  }, [adaptiveJitterBufferSize, currentAudioSourceRef, isPlayingRef, jitterBufferRef, nextStartTimeRef, shouldStartPlaybackEarly, checkForTruncationIssues]);


  const processPendingAudioChunks = useCallback(async () => {
    while (
      pendingAudioChunks.current.length > 0 &&
      !checkWebSocketBackpressure()
    ) {
      const chunkObj = pendingAudioChunks.current.shift();
      const audioData = chunkObj.data || chunkObj;
      const sent = await sendAudioChunkWithBackpressure(audioData);
      if (!sent) {
        pendingAudioChunks.current.unshift(chunkObj);
        break;
      }
    }
  }, [sendAudioChunkWithBackpressure, checkWebSocketBackpressure, pendingAudioChunks]);

  // Function to reset audio tracking state (called during barge-in or session reset)
  const resetAudioTrackingState = useCallback(() => {
    const tracking = chunkTrackingRef.current;
    
    addLogEntryRef.current(
      "audio_reset",
      `🔄 RESET: Clearing audio tracking state (current turn: ${tracking.currentTurnId}, chunks in queue: ${jitterBufferRef.current.length})`
    );
    
    // Check for truncation before reset
    if (tracking.currentTurnId) {
      checkForTruncationIssues(tracking.currentTurnId);
    }
    
    // Reset tracking state
    tracking.isExpectingMoreChunks = false;
    tracking.chunksReceivedCurrentTurn = 0;
    tracking.chunksPlayedCurrentTurn = 0;
    tracking.lastChunkReceivedTime = null;
    tracking.lastChunkPlayedTime = null;
    
    // Don't reset currentTurnId or turnChunkData as they're useful for analysis
    
    addLogEntryRef.current("audio_reset", "✅ Audio tracking state reset completed");
  }, [checkForTruncationIssues]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (pendingAudioChunks.current.length > 0) processPendingAudioChunks();
    }, 100);
    return () => clearInterval(interval);
  }, [processPendingAudioChunks]);

  useEffect(() => {
    if (isWebSocketReady && isAudioContextReady) {
      addLogEntryRef.current("debug", "WebSocket and AudioContext are ready, sending CLIENT_AUDIO_READY");
      sendAudioReadySignal(
        playbackAudioContextRef.current,
        socketRef.current,
        addLogEntryRef.current,
        connectionSignalTracker,
        "useEffect-readiness"
      );
    }
  }, [isWebSocketReady, isAudioContextReady]);

  const connectWebSocket = useCallback(
    (lang) => {
      addLogEntryRef.current("debug", "connectWebSocket called");
      if (
        socketRef.current &&
        (socketRef.current.readyState === WebSocket.OPEN ||
          socketRef.current.readyState === WebSocket.CONNECTING)
      ) {
        if (socketRef.current.url.includes(`lang=${lang}`)) {
          addLogEntryRef.current(
            "ws",
            `WebSocket already open or connecting with ${lang}.`
          );
          if (isSessionActive && !isRecording) handleStartListening(false);
          return;
        }
        addLogEntryRef.current(
          "ws",
          `Closing existing WebSocket (url: ${socketRef.current.url}, state: ${socketRef.current.readyState}) before new connection for lang ${lang}.`
        );
        socketRef.current.close(
          1000,
          "New connection with different language initiated by connectWebSocket"
        );
      }
      addLogEntryRef.current(
        "ws",
        `Attempting to connect to WebSocket with language: ${lang}...`
      );
      setWebSocketStatus("Connecting...");
      socketRef.current = new WebSocket(
        `ws://${BACKEND_HOST}/listen?lang=${lang}`
      );
      if (!playbackAudioContextRef.current)
        playbackAudioContextRef.current = new (window.AudioContext ||
          window.webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE });
      socketRef.current.binaryType = "arraybuffer";
      socketRef.current.onopen = () => {
        debugLog("🌐 WebSocket onopen event fired!");
        addLogEntryRef.current("debug", "WebSocket onopen event fired");
        if (networkResilienceManagerRef.current) {
          networkResilienceManagerRef.current.setWebSocket(socketRef.current);
          addLogEntryRef.current(
            "ws",
            "WebSocket assigned to network resilience manager after opening."
          );
        }
        setWebSocketStatus("Open");
        setIsWebSocketConnected(true);
        setIsWebSocketReady(true);
        addLogEntryRef.current("ws", `WebSocket Connected (Lang: ${lang}).`);
        if (networkResilienceManagerRef.current?.audioCircuitBreaker) {
          networkResilienceManagerRef.current.resetCircuitBreaker();
          addLogEntryRef.current(
            "ws",
            "Circuit breaker reset on successful WebSocket connection"
          );
        }
        const connectionId = `ws-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 9)}`;
        socketRef.current._connectionId = connectionId;
        if (connectionId && connectionSignalTracker.current.has(connectionId)) {
          connectionSignalTracker.current.delete(connectionId);
          addLogEntryRef.current(
            "audio",
            `Cleared signal tracking for recovered connection ${connectionId}`
          );
        }
        debugLog(`🔍 Checking session state: isSessionActive=${isSessionActive}`);
        debugLog(`🔍 Checking session state REF: isSessionActiveRef.current=${isSessionActiveRef?.current}`);
        
        // Use the ref instead of state to avoid race condition
        const sessionIsActive = isSessionActiveRef?.current || isSessionActive;
        debugLog(`🔍 Final decision: sessionIsActive=${sessionIsActive}`);
        
        if (sessionIsActive) {
          debugLog("✅ Session IS active - starting microphone!");
          addLogEntryRef.current(
            "session_flow",
            "Session is active. Proceeding to start microphone input via handleStartListening."
          );
          addLogEntryRef.current("debug", `About to call handleStartListening, isSessionActive=${isSessionActive}`);
          
          debugLog("🎤 About to call handleStartListening...");
          try {
            handleStartListening(false);
            debugLog("🎤 handleStartListening call completed successfully");
            addLogEntryRef.current("debug", "handleStartListening call completed");
          } catch (error) {
            debugError("🎤 ERROR calling handleStartListening:", error);
            addLogEntryRef.current("error", `handleStartListening call failed: ${error.message}`);
          }
        } else {
          debugLog("❌ Session NOT active - microphone not started!");
          addLogEntryRef.current(
            "ws_warn",
            "WebSocket opened, but session is NOT marked active. Mic not started."
          );
        }
      };
      socketRef.current.onclose = () => {
        addLogEntryRef.current("debug", "WebSocket onclose event fired");
        setIsWebSocketReady(false);
        setIsWebSocketConnected(false);
        setWebSocketStatus("Closed");
      };
      socketRef.current.onerror = () => {
        addLogEntryRef.current("error", "WebSocket onerror event fired");
        setIsWebSocketReady(false);
        setIsWebSocketConnected(false);
        setWebSocketStatus("Error");
      };
      socketRef.current.onmessage = (event) => {
        if (typeof event.data === "string") {
          try {
            const receivedData = JSON.parse(event.data);
            if (receivedData.type && receivedData.type.endsWith("_update")) {
              addLogEntryRef.current(
                receivedData.type,
                `${receivedData.sender}: ${receivedData.text} (Final: ${receivedData.is_final})`
              );
              
              // Enhanced turn tracking with better audio management
              const tracking = chunkTrackingRef.current;
              
              // Detect new turns and turn completion
              if (receivedData.id && receivedData.id !== tracking.currentTurnId) {
                // New turn started
                if (tracking.currentTurnId) {
                  // Mark previous turn as ended
                  if (tracking.turnChunkData[tracking.currentTurnId]) {
                    tracking.turnChunkData[tracking.currentTurnId].endSignalReceived = true;
                    tracking.turnEndSignals.add(tracking.currentTurnId);
                  }
                  checkForTruncationIssues(tracking.currentTurnId);
                }
                
                // Initialize new turn
                tracking.currentTurnId = receivedData.id;
                tracking.chunksReceivedCurrentTurn = 0;
                tracking.chunksPlayedCurrentTurn = 0;
                
                if (!tracking.turnChunkData[receivedData.id]) {
                  tracking.turnChunkData[receivedData.id] = {
                    received: 0,
                    played: 0,
                    startTime: Date.now(),
                    endSignalReceived: false
                  };
                }
                
                addLogEntryRef.current(
                  "turn_tracking",
                  `🆕 NEW TURN: ${receivedData.id} started (${receivedData.sender})`
                );
              }
              
              // Handle turn completion
              if (receivedData.is_final) {
                tracking.isExpectingMoreChunks = false;
                if (tracking.turnChunkData[receivedData.id]) {
                  tracking.turnChunkData[receivedData.id].endSignalReceived = true;
                  tracking.turnEndSignals.add(receivedData.id);
                }
                
                addLogEntryRef.current(
                  "turn_final",
                  `🔚 TURN FINAL: ${receivedData.id} completed - no more chunks expected`
                );
                
                // Trigger early playback if we have pending chunks
                if (jitterBufferRef.current.length > 0 && !isPlayingRef.current) {
                  addLogEntryRef.current("turn_final_playback", "▶️ Starting final chunk playback");
                  playAudioFromQueue();
                }
              } else {
                tracking.isExpectingMoreChunks = true;
              }
              
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
              addLogEntryRef.current(
                "error",
                `Server Error via WS: ${receivedData.message}`
              );
            } else if (receivedData.type === "audio_metadata") {
              const metadata = receivedData;
              addLogEntryRef.current(
                "audio_receive",
                `Audio metadata: ${metadata.size_bytes} bytes, ${metadata.expected_duration_ms}ms duration, seq=${metadata.sequence}`
              );
              pendingMetadataRef.current.set(metadata.sequence, metadata);
              if (pendingMetadataRef.current.size > 100) {
                const entries = Array.from(
                  pendingMetadataRef.current.entries()
                );
                entries.sort((a, b) => a[0] - b[0]);
                const toDelete = entries.slice(0, entries.length - 100);
                toDelete.forEach(([seq]) =>
                  pendingMetadataRef.current.delete(seq)
                );
              }
            } else if (receivedData.type === "buffer_pressure") {
              addLogEntryRef.current(
                "audio_flow_control",
                `Buffer pressure ${receivedData.level}: ${receivedData.buffer_size}/${receivedData.max_size} chunks, action: ${receivedData.recommended_action}`
              );
              if (receivedData.level === "high")
                addLogEntryRef.current(
                  "audio_flow_control",
                  `Buffer pressure detected - backend will handle optimization`
                );
            } else if (receivedData.type === "gemini_playback_state") {
              // Handle Gemini playback state for VAD correlation
              const { playing, sequence, correlation_id, vad_should_activate } = receivedData;
              
              addLogEntryRef.current(
                "gemini_playback_correlation",
                `Gemini playback ${playing ? 'STARTED' : 'STOPPED'}: seq=${sequence}, vad_should_activate=${vad_should_activate} [ID: ${correlation_id}]`
              );
              
              // Update global playing state for VAD coordination
              if (playing && isPlayingRef) {
                // Note: We don't directly set isPlayingRef here as that's managed by audio playback
                // This is for correlation logging only
                addLogEntryRef.current(
                  "vad_state_correlation",
                  `Backend signaled Gemini response start - frontend VAD should ${vad_should_activate ? 'REMAIN ACTIVE for barge-in' : 'defer to Gemini VAD'} [ID: ${correlation_id}]`
                );
              }
            } else if (receivedData.type === "audio_truncation") {
              addLogEntryRef.current(
                "error",
                `Audio truncated: ${receivedData.chunks_removed} chunks removed due to ${receivedData.reason}`
              );
            } else {
              addLogEntryRef.current(
                "ws_json_unhandled",
                `Unhandled JSON: ${event.data.substring(0, 150)}...`
              );
            }
          } catch (e) {
            addLogEntryRef.current(
              "error",
              `Failed to parse JSON from WS: ${
                e.message
              }. Raw: ${event.data.substring(0, 150)}...`
            );
          }
        } else if (event.data instanceof ArrayBuffer) {
          // Enhanced audio chunk tracking
          const tracking = chunkTrackingRef.current;
          tracking.totalChunksReceived++;
          tracking.chunksReceivedCurrentTurn++;
          tracking.lastChunkReceivedTime = Date.now();
          
          // Update turn data if we have a current turn
          if (tracking.currentTurnId && tracking.turnChunkData[tracking.currentTurnId]) {
            tracking.turnChunkData[tracking.currentTurnId].received++;
            
            addLogEntryRef.current(
              "chunk_received",
              `📥 Audio chunk received for turn ${tracking.currentTurnId}: ${tracking.turnChunkData[tracking.currentTurnId].received} chunks (${event.data.byteLength} bytes, queue: ${jitterBufferRef.current.length + 1})`
            );
          } else {
            // No current turn ID - this might be the issue!
            addLogEntryRef.current(
              "chunk_received_no_turn",
              `⚠️ Audio chunk received without turn ID: ${event.data.byteLength} bytes (queue: ${jitterBufferRef.current.length + 1})`
            );
          }
          
          jitterBufferRef.current.push(event.data);
          
          // Try to start playback if not already playing
          if (!isPlayingRef.current) {
            playAudioFromQueue();
          }
        }
      };
    },
    [
      handleStartListening,
      playAudioFromQueue,
      networkResilienceManagerRef,
      isSessionActive,
      isRecording,
      language,
      checkForTruncationIssues,
    ]
  );

  return {
    isWebSocketConnected,
    webSocketStatus,
    transcriptionMessages,
    socketRef,
    connectWebSocket,
    setTranscriptionMessages,
    isWebSocketReady,
    resetAudioTrackingState,
  };
};
