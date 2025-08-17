import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppLogger } from './useAppLogger';
import { useToolLogs } from './useToolLogs';
import { useAudio } from './useAudio';
import { useCommunication } from './useCommunication';
import {
  LANGUAGES,
  JITTER_BUFFER_MIN_FILL,
  WEBSOCKET_SEND_BUFFER_LIMIT,
  RETRY_DELAY_BASE,
  MAX_RETRY_ATTEMPTS,
  MAX_AUDIO_QUEUE_SIZE,
  BACKEND_HOST,
} from "../utils/constants";
import { generateUniqueId } from '../utils/helpers';
import { debugLog } from '../config/debug';

export const useSession = () => {
  const { messages, addLogEntry, setMessages, clearLogs } = useAppLogger();
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(LANGUAGES[0].code);
  const [textInputValue, setTextInputValue] = useState("");

  const isSessionActiveRef = useRef(isSessionActive);
  useEffect(() => { isSessionActiveRef.current = isSessionActive; }, [isSessionActive]);

  const { isLoading } = useToolLogs(addLogEntry, setMessages);

  const isPlayingRef = useRef(false);
  const isPlaybackStartedRef = useRef(false);
  const nextStartTimeRef = useRef(0);
  const currentAudioSourceRef = useRef(null);
  const gainNodeRef = useRef(null);
  const adaptiveJitterBufferSize = useRef(JITTER_BUFFER_MIN_FILL);
  const jitterBufferRef = useRef([]);
  const pendingAudioChunks = useRef([]);
  const lastSendTimeRef = useRef(0);
  const audioChunkSentCountRef = useRef(0);
  const audioMetricsRef = useRef({
    retryCount: 0,
    failedTransmissions: 0,
    dropouts: 0,
  });

  const resetAudioTrackingStateRef = useRef(null);

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
    
    if (resetAudioTrackingStateRef.current) {
      resetAudioTrackingStateRef.current();
    }
  }, [addLogEntry]);

  const checkWebSocketBackpressure = useCallback(() => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return true;
    const sendBufferSize = socketRef.current.bufferedAmount || 0;
    if (sendBufferSize > WEBSOCKET_SEND_BUFFER_LIMIT) {
      addLogEntry("backpressure", `High buffer: ${sendBufferSize} bytes`);
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
        setTimeout(() => retryAudioChunk(audioData, attempt + 1), delay);
        return false;
      }
      if (checkWebSocketBackpressure()) {
        const delay = getRetryDelay(attempt);
        setTimeout(() => retryAudioChunk(audioData, attempt + 1), delay);
        return false;
      }
      socketRef.current.send(audioData);
      audioChunkSentCountRef.current++;
      lastSendTimeRef.current = Date.now();
      return true;
    } catch (error) {
      const delay = getRetryDelay(attempt);
      setTimeout(() => retryAudioChunk(audioData, attempt + 1), delay);
      return false;
    }
  }, [addLogEntry, getRetryDelay, checkWebSocketBackpressure]);

  const sendAudioChunkWithBackpressure = useCallback(async (audioData) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && !checkWebSocketBackpressure()) {
      try {
        socketRef.current.send(audioData);
        audioChunkSentCountRef.current++;
        lastSendTimeRef.current = Date.now();
        return true;
      } catch (error) {
        // Fallback to retry
      }
    }
    if (pendingAudioChunks.current.length < MAX_AUDIO_QUEUE_SIZE) {
      pendingAudioChunks.current.push({ data: audioData });
    } else {
      audioMetricsRef.current.dropouts++;
    }
    return false;
  }, [checkWebSocketBackpressure]);

  const socketRef = useRef(null);
  
  const {
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
  } = useAudio(
    addLogEntry,
    isSessionActive,
    isSessionActiveRef,
    sendAudioChunkWithBackpressure,
    socketRef,
    true,
    isPlayingRef,
    stopSystemAudioPlayback
  );

  const {
    isWebSocketConnected,
    webSocketStatus,
    transcriptionMessages,
    socketRef: communicationSocketRef,
    connectWebSocket,
    setTranscriptionMessages,
    isWebSocketReady,
    isServerReady,
    resetAudioTrackingState,
  } = useCommunication(
    addLogEntry,
    handleStartListening, // Pass the original function
    networkResilienceManagerRef,
    isSessionActive,
    isSessionActiveRef,
    isRecording,
    selectedLanguage,
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
  );

  useEffect(() => {
    socketRef.current = communicationSocketRef.current;
  }, [communicationSocketRef]);

  useEffect(() => {
    resetAudioTrackingStateRef.current = resetAudioTrackingState;
  }, [resetAudioTrackingState]);

  // **NEW LOGIC**: Start listening only when the server is ready.
  useEffect(() => {
    if (isServerReady && isSessionActiveRef.current) {
      addLogEntry("session_flow", "✅ Server is ready. Activating microphone.");
      handleStartListening(false);
    }
  }, [isServerReady, handleStartListening]);

  const handleToggleSession = useCallback(async () => {
    if (isSessionActiveRef.current) {
      addLogEntry("session_control", "User requested to STOP session.");
      handleStopListeningAndCleanupMic();
      if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
        socketRef.current.close(1000, "User stopped session");
      }
      setIsSessionActive(false);
      setTimeout(() => {
        clearLogs();
        setTranscriptionMessages([]);
      }, 500);
    } else {
      clearLogs();
      setTranscriptionMessages([]);
      addLogEntry("session_control", "User requested to START session.");
      await resumeAudioContext();
      setIsSessionActive(true);
      addLogEntry("session_status", "Session PENDING (Connecting to server...).");
      connectWebSocket(selectedLanguage);
    }
  }, [selectedLanguage, connectWebSocket, handleStopListeningAndCleanupMic, addLogEntry, resumeAudioContext, clearLogs, setTranscriptionMessages]);
  
  const handleSendTextMessage = useCallback(() => {
    if (!textInputValue.trim()) return;
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const messagePayload = { id: generateUniqueId(), sender: "user", text: textInputValue, is_final: true };
      socketRef.current.send(textInputValue);
      setTranscriptionMessages((prev) => [...prev, messagePayload]);
      setTextInputValue("");
    } else {
      addLogEntry("error", "Cannot send text: WebSocket not connected.");
    }
  }, [textInputValue, addLogEntry, selectedLanguage, socketRef, setTranscriptionMessages]);

  useEffect(() => {
    if (isSessionActiveRef.current) {
      handleStopListeningAndCleanupMic();
      if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
        socketRef.current.close(1000, "Language changed");
      }
      setIsSessionActive(false);
    }
  }, [selectedLanguage, handleStopListeningAndCleanupMic]);

  useEffect(() => {
    addLogEntry("status", 'Welcome! Click "Start Session" or type your query.');
  }, [addLogEntry]);

  const onClearLogs = useCallback(async () => {
    try {
      const response = await fetch(`http://${BACKEND_HOST}/api/logs/clear`, { method: 'POST' });
      if (response.ok) {
        clearLogs();
        addLogEntry("system", "All logs cleared successfully");
      }
    } catch (error) {
      addLogEntry("error", `Error clearing logs: ${error.message}`);
    }
  }, [addLogEntry, clearLogs]);

  return {
    messages,
    isLoading,
    textInputValue,
    setTextInputValue,
    handleSendTextMessage,
    transcriptionMessages,
    isSessionActive,
    isRecording,
    isMuted,
    isMutedRef,
    isRecordingRef,
    isSessionActiveRef,
    handleToggleSession,
    handleMicMuteToggle,
    selectedLanguage,
    setSelectedLanguage,
    webSocketStatus,
    audioHealth,
    networkQuality,
    bufferMetrics,
    onClearLogs,
    isServerReady,
  };
};
