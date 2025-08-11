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

export const useCommunication = (
  addLogEntry,
  handleStartListening,
  networkResilienceManagerRef,
  isSessionActive,
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

  const playAudioFromQueue = useCallback(async () => {
    if (
      isPlayingRef.current ||
      jitterBufferRef.current.length < adaptiveJitterBufferSize.current
    )
      return;
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
        addLogEntry("audio_playback", "Playback AudioContext resumed");
      }

      // Create WAV file with error handling
      const wavData = createWavFile(audioChunk);
      if (!wavData) {
        addLogEntry("error", "Failed to create WAV file from audio chunk");
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
        addLogEntry("error", `Audio decode failed: ${decodeError.message}`);
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

      addLogEntry(
        "audio_playback",
        `Playing audio chunk: ${audioBuffer.duration.toFixed(3)}s`
      );

      source.onended = () => {
        isPlayingRef.current = false;
        playAudioFromQueue();
      };
      currentAudioSourceRef.current = { source };
    } catch (error) {
      addLogEntry("error", `Audio playback error: ${error.message}`);
      isPlayingRef.current = false;
      setTimeout(playAudioFromQueue, 100);
    }
  }, [addLogEntry, adaptiveJitterBufferSize, currentAudioSourceRef, isPlayingRef, jitterBufferRef, nextStartTimeRef]);


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

  useEffect(() => {
    const interval = setInterval(() => {
      if (pendingAudioChunks.current.length > 0) processPendingAudioChunks();
    }, 100);
    return () => clearInterval(interval);
  }, [processPendingAudioChunks]);

  useEffect(() => {
    if (isWebSocketReady && isAudioContextReady) {
      addLogEntry("debug", "WebSocket and AudioContext are ready, sending CLIENT_AUDIO_READY");
      sendAudioReadySignal(
        playbackAudioContextRef.current,
        socketRef.current,
        addLogEntry,
        connectionSignalTracker,
        "useEffect-readiness"
      );
    }
  }, [isWebSocketReady, isAudioContextReady, addLogEntry]);

  const connectWebSocket = useCallback(
    (lang) => {
      addLogEntry("debug", "connectWebSocket called");
      if (
        socketRef.current &&
        (socketRef.current.readyState === WebSocket.OPEN ||
          socketRef.current.readyState === WebSocket.CONNECTING)
      ) {
        if (socketRef.current.url.includes(`lang=${lang}`)) {
          addLogEntry(
            "ws",
            `WebSocket already open or connecting with ${lang}.`
          );
          if (isSessionActive && !isRecording) handleStartListening(false);
          return;
        }
        addLogEntry(
          "ws",
          `Closing existing WebSocket (url: ${socketRef.current.url}, state: ${socketRef.current.readyState}) before new connection for lang ${lang}.`
        );
        socketRef.current.close(
          1000,
          "New connection with different language initiated by connectWebSocket"
        );
      }
      addLogEntry(
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
        addLogEntry("debug", "WebSocket onopen event fired");
        if (networkResilienceManagerRef.current) {
          networkResilienceManagerRef.current.setWebSocket(socketRef.current);
          addLogEntry(
            "ws",
            "WebSocket assigned to network resilience manager after opening."
          );
        }
        setWebSocketStatus("Open");
        setIsWebSocketConnected(true);
        setIsWebSocketReady(true);
        addLogEntry("ws", `WebSocket Connected (Lang: ${lang}).`);
        if (networkResilienceManagerRef.current?.audioCircuitBreaker) {
          networkResilienceManagerRef.current.resetCircuitBreaker();
          addLogEntry(
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
          addLogEntry(
            "audio",
            `Cleared signal tracking for recovered connection ${connectionId}`
          );
        }
        if (isSessionActive) {
          addLogEntry(
            "session_flow",
            "Session is active. Proceeding to start microphone input via handleStartListening."
          );
          handleStartListening(false);
        } else {
          addLogEntry(
            "ws_warn",
            "WebSocket opened, but session is NOT marked active. Mic not started."
          );
        }
      };
      socketRef.current.onclose = () => {
        addLogEntry("debug", "WebSocket onclose event fired");
        setIsWebSocketReady(false);
        setIsWebSocketConnected(false);
        setWebSocketStatus("Closed");
      };
      socketRef.current.onerror = () => {
        addLogEntry("error", "WebSocket onerror event fired");
        setIsWebSocketReady(false);
        setIsWebSocketConnected(false);
        setWebSocketStatus("Error");
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
              const metadata = receivedData;
              addLogEntry(
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
              addLogEntry(
                "audio_flow_control",
                `Buffer pressure ${receivedData.level}: ${receivedData.buffer_size}/${receivedData.max_size} chunks, action: ${receivedData.recommended_action}`
              );
              if (receivedData.level === "high")
                addLogEntry(
                  "audio_flow_control",
                  `Buffer pressure detected - backend will handle optimization`
                );
            } else if (receivedData.type === "audio_truncation") {
              addLogEntry(
                "error",
                `Audio truncated: ${receivedData.chunks_removed} chunks removed due to ${receivedData.reason}`
              );
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
          jitterBufferRef.current.push(event.data);
          playAudioFromQueue();
        }
      };
    },
    [
      addLogEntry,
      handleStartListening,
      playAudioFromQueue,
      networkResilienceManagerRef,
      isSessionActive,
      isRecording,
      language,
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
  };
};
