import { useState, useRef, useCallback, useEffect } from 'react';
import { BACKEND_HOST, OUTPUT_SAMPLE_RATE, WEBSOCKET_SEND_BUFFER_LIMIT, MAX_RETRY_ATTEMPTS, RETRY_DELAY_BASE, MAX_AUDIO_QUEUE_SIZE, JITTER_BUFFER_MIN_FILL } from '../utils/constants';
import { sendAudioReadySignal } from '../utils/webSocketUtils';
import { createWavFile } from '../utils/audioUtils.js';

export const useCommunication = (addLogEntry, handleStartListening, networkResilienceManagerRef, isSessionActive, isRecording, language) => {
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
  const [webSocketStatus, setWebSocketStatus] = useState("N/A");
  const [transcriptionMessages, setTranscriptionMessages] = useState([]);
  const [isWebSocketReady, setIsWebSocketReady] = useState(false);
  const socketRef = useRef(null);
  const playbackAudioContextRef = useRef(null);
  const connectionSignalTracker = useRef(new Set());
  const pendingMetadataRef = useRef(new Map());
  const pendingAudioChunks = useRef([]);
  const lastSendTimeRef = useRef(0);
  const audioChunkSentCountRef = useRef(0);
  const audioMetricsRef = useRef({ retryCount: 0, failedTransmissions: 0, dropouts: 0 });

  const jitterBufferRef = useRef([]);
  const isPlayingRef = useRef(false);
  const isPlaybackStartedRef = useRef(false);
  const nextStartTimeRef = useRef(0);
  const currentAudioSourceRef = useRef(null);
  const gainNodeRef = useRef(null);
  const adaptiveJitterBufferSize = useRef(JITTER_BUFFER_MIN_FILL);

  const stopSystemAudioPlayback = useCallback(() => {
    if (currentAudioSourceRef.current) {
      try {
        currentAudioSourceRef.current.source.stop();
        addLogEntry("gemini_audio", "System audio playback stopped by barge-in.");
      } catch (e) {
        addLogEntry("warning", `Could not stop current audio source for barge-in: ${e.message}`);
      }
      currentAudioSourceRef.current = null;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect();
      gainNodeRef.current = null;
    }
    jitterBufferRef.current = [];
    isPlayingRef.current = false;
    isPlaybackStartedRef.current = false;
    adaptiveJitterBufferSize.current = JITTER_BUFFER_MIN_FILL;
    nextStartTimeRef.current = 0;
  }, [addLogEntry]);

  const playAudioFromQueue = useCallback(async () => {
    if (isPlayingRef.current || jitterBufferRef.current.length < adaptiveJitterBufferSize.current) return;
    isPlayingRef.current = true;
    const audioChunk = jitterBufferRef.current.shift();
    if (!audioChunk) {
      isPlayingRef.current = false;
      return;
    }
    try {
      if (playbackAudioContextRef.current.state === 'suspended') await playbackAudioContextRef.current.resume();
      const wavData = createWavFile(audioChunk);
      const audioBuffer = await playbackAudioContextRef.current.decodeAudioData(wavData);
      const source = playbackAudioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(playbackAudioContextRef.current.destination);
      const currentTime = playbackAudioContextRef.current.currentTime;
      const startTime = nextStartTimeRef.current > currentTime ? nextStartTimeRef.current : currentTime;
      source.start(startTime);
      nextStartTimeRef.current = startTime + audioBuffer.duration;
      source.onended = () => {
        isPlayingRef.current = false;
        playAudioFromQueue();
      };
      currentAudioSourceRef.current = { source };
    } catch (error) {
      addLogEntry('error', `Audio playback error: ${error.message}`);
      isPlayingRef.current = false;
      setTimeout(playAudioFromQueue, 100);
    }
  }, [addLogEntry]);

  const checkWebSocketBackpressure = useCallback(() => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return true;
    const sendBufferSize = socketRef.current.bufferedAmount || 0;
    const latency = lastSendTimeRef.current > 0 ? Date.now() - lastSendTimeRef.current : 0;
    if (sendBufferSize > WEBSOCKET_SEND_BUFFER_LIMIT) {
      addLogEntry("backpressure", `High buffer: ${sendBufferSize} bytes`);
      return true;
    }
    if (latency > 500) {
      addLogEntry("backpressure", `High latency: ${latency}ms`);
      return true;
    }
    return false;
  }, [addLogEntry]);

  const getRetryDelay = useCallback((attempt) => RETRY_DELAY_BASE * Math.pow(2, attempt) + Math.random() * 100, []);

  const retryAudioChunk = useCallback(async (audioData, attempt = 0) => {
    if (attempt >= MAX_RETRY_ATTEMPTS) {
      audioMetricsRef.current.failedTransmissions++;
      addLogEntry("error", `Audio chunk transmission failed after ${MAX_RETRY_ATTEMPTS} attempts`);
      return false;
    }
    try {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        const delay = getRetryDelay(attempt);
        addLogEntry("warning", `WebSocket not ready, retrying in ${delay.toFixed(0)}ms (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS})`);
        setTimeout(() => retryAudioChunk(audioData, attempt + 1), delay);
        return false;
      }
      if (checkWebSocketBackpressure()) {
        const delay = getRetryDelay(attempt);
        addLogEntry("warning", `WebSocket backpressure on retry, waiting ${delay.toFixed(0)}ms (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS})`);
        setTimeout(() => retryAudioChunk(audioData, attempt + 1), delay);
        return false;
      }
      socketRef.current.send(audioData);
      addLogEntry("audio_send", `Sent audio to backend: ${audioData.byteLength} bytes`);
      audioChunkSentCountRef.current++;
      lastSendTimeRef.current = Date.now();
      audioMetricsRef.current.retryCount += attempt;
      if (attempt > 0) addLogEntry("success", `Audio chunk sent successfully on retry attempt ${attempt + 1}`);
      return true;
    } catch (error) {
      const delay = getRetryDelay(attempt);
      addLogEntry("warning", `Audio send error on attempt ${attempt + 1}: ${error.message}, retrying in ${delay.toFixed(0)}ms`);
      setTimeout(() => retryAudioChunk(audioData, attempt + 1), delay);
      return false;
    }
  }, [addLogEntry, getRetryDelay, checkWebSocketBackpressure]);

  const sendAudioChunkWithBackpressure = useCallback(async (audioData) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && !checkWebSocketBackpressure()) {
      try {
        socketRef.current.send(audioData);
        addLogEntry("audio_send", `Sent audio to backend (immediate): ${audioData.byteLength} bytes`);
        audioChunkSentCountRef.current++;
        lastSendTimeRef.current = Date.now();
        return true;
      } catch (error) {
        addLogEntry("warning", `Immediate send failed: ${error.message}, starting retry mechanism`);
      }
    }
    if (checkWebSocketBackpressure()) {
      addLogEntry("warning", "WebSocket backpressure detected, adding to retry queue");
      if (pendingAudioChunks.current.length < MAX_AUDIO_QUEUE_SIZE) {
        pendingAudioChunks.current.push({ data: audioData, timestamp: Date.now(), sequence: audioChunkSentCountRef.current + 1 });
      } else {
        const queueLength = pendingAudioChunks.current.length;
        const middleIndex = Math.floor(queueLength / 2);
        const dropIndex = middleIndex + Math.floor(Math.random() * Math.floor(queueLength / 3));
        pendingAudioChunks.current.splice(dropIndex, 1);
        pendingAudioChunks.current.push({ data: audioData, timestamp: Date.now(), sequence: audioChunkSentCountRef.current + 1 });
        audioMetricsRef.current.dropouts++;
        addLogEntry("warning", `Audio buffer overflow - intelligently dropped chunk at position ${dropIndex}`);
      }
      return false;
    }
    return await retryAudioChunk(audioData, 0);
  }, [addLogEntry, checkWebSocketBackpressure, retryAudioChunk]);

  const processPendingAudioChunks = useCallback(async () => {
    while (pendingAudioChunks.current.length > 0 && !checkWebSocketBackpressure()) {
      const chunkObj = pendingAudioChunks.current.shift();
      const audioData = chunkObj.data || chunkObj;
      const sent = await sendAudioChunkWithBackpressure(audioData);
      if (!sent) {
        pendingAudioChunks.current.unshift(chunkObj);
        break;
      }
    }
  }, [sendAudioChunkWithBackpressure, checkWebSocketBackpressure]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (pendingAudioChunks.current.length > 0) processPendingAudioChunks();
    }, 100);
    return () => clearInterval(interval);
  }, [processPendingAudioChunks]);

  const connectWebSocket = useCallback((lang) => {
    if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
      if (socketRef.current.url.includes(`lang=${lang}`)) {
        addLogEntry("ws", `WebSocket already open or connecting with ${lang}.`);
        if (isSessionActive && !isRecording) handleStartListening(false);
        return;
      }
      addLogEntry("ws", `Closing existing WebSocket (url: ${socketRef.current.url}, state: ${socketRef.current.readyState}) before new connection for lang ${lang}.`);
      socketRef.current.close(1000, "New connection with different language initiated by connectWebSocket");
    }
    addLogEntry("ws", `Attempting to connect to WebSocket with language: ${lang}...`);
    setWebSocketStatus("Connecting...");
    socketRef.current = new WebSocket(`ws://${BACKEND_HOST}/listen?lang=${lang}`);
    if (!playbackAudioContextRef.current) playbackAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE });
    socketRef.current.binaryType = "arraybuffer";
    if (networkResilienceManagerRef.current) {
      networkResilienceManagerRef.current.setWebSocket(socketRef.current);
      addLogEntry("ws", "WebSocket assigned to network resilience manager immediately after creation");
    }
    socketRef.current.onopen = () => {
      setWebSocketStatus("Open");
      setIsWebSocketConnected(true);
      setIsWebSocketReady(true);
      addLogEntry("ws", `WebSocket Connected (Lang: ${lang}).`);
      if (networkResilienceManagerRef.current?.audioCircuitBreaker) {
        networkResilienceManagerRef.current.resetCircuitBreaker();
        addLogEntry("ws", "Circuit breaker reset on successful WebSocket connection");
      }
      const connectionId = `ws-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      socketRef.current._connectionId = connectionId;
      if (connectionId && connectionSignalTracker.current.has(connectionId)) {
        connectionSignalTracker.current.delete(connectionId);
        addLogEntry("audio", `Cleared signal tracking for recovered connection ${connectionId}`);
      }
      if (playbackAudioContextRef.current && playbackAudioContextRef.current.state === "running") {
        sendAudioReadySignal(playbackAudioContextRef.current, socketRef.current, addLogEntry, connectionSignalTracker, "websocket-onopen");
      }
      if (isSessionActive) {
        addLogEntry("session_flow", "Session is active. Proceeding to start microphone input via handleStartListening.");
        handleStartListening(false);
      } else {
        addLogEntry("ws_warn", "WebSocket opened, but session is NOT marked active. Mic not started.");
      }
    };
    socketRef.current.onclose = () => {
      setIsWebSocketReady(false);
      setIsWebSocketConnected(false);
      setWebSocketStatus("Closed");
    };
    socketRef.current.onerror = () => {
      setIsWebSocketReady(false);
      setIsWebSocketConnected(false);
      setWebSocketStatus("Error");
    };
    socketRef.current.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const receivedData = JSON.parse(event.data);
          if (receivedData.type && receivedData.type.endsWith('_update')) {
            addLogEntry(receivedData.type, `${receivedData.sender}: ${receivedData.text} (Final: ${receivedData.is_final})`);
            setTranscriptionMessages((prevMessages) => {
              const existingMessageIndex = prevMessages.findIndex((msg) => msg.id === receivedData.id);
              if (existingMessageIndex !== -1) {
                return prevMessages.map((msg) => msg.id === receivedData.id ? { ...msg, text: receivedData.text, is_final: receivedData.is_final } : msg);
              } else {
                return [...prevMessages, { id: receivedData.id, text: receivedData.text, sender: receivedData.sender, is_final: receivedData.is_final }];
              }
            });
          } else if (receivedData.type === 'error') {
            addLogEntry('error', `Server Error via WS: ${receivedData.message}`);
          } else if (receivedData.type === "audio_metadata") {
            const metadata = receivedData;
            addLogEntry("audio_receive", `Audio metadata: ${metadata.size_bytes} bytes, ${metadata.expected_duration_ms}ms duration, seq=${metadata.sequence}`);
            pendingMetadataRef.current.set(metadata.sequence, metadata);
            if (pendingMetadataRef.current.size > 100) {
              const entries = Array.from(pendingMetadataRef.current.entries());
              entries.sort((a, b) => a[0] - b[0]);
              const toDelete = entries.slice(0, entries.length - 100);
              toDelete.forEach(([seq]) => pendingMetadataRef.current.delete(seq));
            }
          } else if (receivedData.type === "buffer_pressure") {
            addLogEntry("audio_flow_control", `Buffer pressure ${receivedData.level}: ${receivedData.buffer_size}/${receivedData.max_size} chunks, action: ${receivedData.recommended_action}`);
            if (receivedData.level === 'high') addLogEntry("audio_flow_control", `Buffer pressure detected - backend will handle optimization`);
          } else if (receivedData.type === "audio_truncation") {
            addLogEntry("error", `Audio truncated: ${receivedData.chunks_removed} chunks removed due to ${receivedData.reason}`);
          } else {
            addLogEntry("ws_json_unhandled", `Unhandled JSON: ${event.data.substring(0, 150)}...`);
          }
        } catch (e) {
          addLogEntry('error', `Failed to parse JSON from WS: ${e.message}. Raw: ${event.data.substring(0, 150)}...`);
        }
      } else if (event.data instanceof ArrayBuffer) {
        jitterBufferRef.current.push(event.data);
        playAudioFromQueue();
      }
    };
  }, [addLogEntry, handleStartListening, playAudioFromQueue, networkResilienceManagerRef, isSessionActive, isRecording, language]);

  return {
    isWebSocketConnected,
    webSocketStatus,
    transcriptionMessages,
    socketRef,
    connectWebSocket,
    sendAudioChunkWithBackpressure,
    setTranscriptionMessages,
    stopSystemAudioPlayback,
    isPlayingRef,
    isWebSocketReady,
  };
};