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
} from "../utils/constants";
import { generateUniqueId } from '../utils/helpers';

export const useSession = () => {
  const { messages, addLogEntry, setMessages } = useAppLogger();
  addLogEntry("debug", "useSession hook executed");
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

  const stopSystemAudioPlayback = useCallback(() => {
    if (currentAudioSourceRef.current) {
      try {
        currentAudioSourceRef.current.source.stop();
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

  const checkWebSocketBackpressure = useCallback(() => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN)
      return true;
    const sendBufferSize = socketRef.current.bufferedAmount || 0;
    const latency =
      lastSendTimeRef.current > 0 ? Date.now() - lastSendTimeRef.current : 0;
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

  const getRetryDelay = useCallback(
    (attempt) => RETRY_DELAY_BASE * Math.pow(2, attempt) + Math.random() * 100,
    []
  );

  const retryAudioChunk = useCallback(
    async (audioData, attempt = 0) => {
      if (attempt >= MAX_RETRY_ATTEMPTS) {
        audioMetricsRef.current.failedTransmissions++;
        addLogEntry(
          "error",
          `Audio chunk transmission failed after ${MAX_RETRY_ATTEMPTS} attempts`
        );
        return false;
      }
      try {
        if (
          !socketRef.current ||
          socketRef.current.readyState !== WebSocket.OPEN
        ) {
          const delay = getRetryDelay(attempt);
          addLogEntry(
            "warning",
            `WebSocket not ready, retrying in ${delay.toFixed(0)}ms (attempt ${
              attempt + 1
            }/${MAX_RETRY_ATTEMPTS})`
          );
          setTimeout(() => retryAudioChunk(audioData, attempt + 1), delay);
          return false;
        }
        if (checkWebSocketBackpressure()) {
          const delay = getRetryDelay(attempt);
          addLogEntry(
            "warning",
            `WebSocket backpressure on retry, waiting ${delay.toFixed(
              0
            )}ms (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS})`
          );
          setTimeout(() => retryAudioChunk(audioData, attempt + 1), delay);
          return false;
        }
        socketRef.current.send(audioData);
        addLogEntry(
          "audio_send",
          `Sent audio to backend: ${audioData.byteLength} bytes`
        );
        audioChunkSentCountRef.current++;
        lastSendTimeRef.current = Date.now();
        audioMetricsRef.current.retryCount += attempt;
        if (attempt > 0)
          addLogEntry(
            "success",
            `Audio chunk sent successfully on retry attempt ${attempt + 1}`
          );
        return true;
      } catch (error) {
        const delay = getRetryDelay(attempt);
        addLogEntry(
          "warning",
          `Audio send error on attempt ${attempt + 1}: ${
            error.message
          }, retrying in ${delay.toFixed(0)}ms`
        );
        setTimeout(() => retryAudioChunk(audioData, attempt + 1), delay);
        return false;
      }
    },
    [addLogEntry, getRetryDelay, checkWebSocketBackpressure]
  );

  const sendAudioChunkWithBackpressure = useCallback(
    async (audioData) => {
      if (
        socketRef.current &&
        socketRef.current.readyState === WebSocket.OPEN &&
        !checkWebSocketBackpressure()
      ) {
        try {
          socketRef.current.send(audioData);
          addLogEntry(
            "audio_send",
            `Sent audio to backend (immediate): ${audioData.byteLength} bytes`
          );
          audioChunkSentCountRef.current++;
          lastSendTimeRef.current = Date.now();
          return true;
        } catch (error) {
          addLogEntry(
            "warning",
            `Immediate send failed: ${error.message}, starting retry mechanism`
          );
        }
      }
      if (checkWebSocketBackpressure()) {
        addLogEntry(
          "warning",
          "WebSocket backpressure detected, adding to retry queue"
        );
        if (pendingAudioChunks.current.length < MAX_AUDIO_QUEUE_SIZE) {
          pendingAudioChunks.current.push({
            data: audioData,
            timestamp: Date.now(),
            sequence: audioChunkSentCountRef.current + 1,
          });
        } else {
          const queueLength = pendingAudioChunks.current.length;
          const middleIndex = Math.floor(queueLength / 2);
          const dropIndex =
            middleIndex +
            Math.floor(Math.random() * Math.floor(queueLength / 3));
          pendingAudioChunks.current.splice(dropIndex, 1);
          pendingAudioChunks.current.push({
            data: audioData,
            timestamp: Date.now(),
            sequence: audioChunkSentCountRef.current + 1,
          });
          audioMetricsRef.current.dropouts++;
          addLogEntry(
            "warning",
            `Audio buffer overflow - intelligently dropped chunk at position ${dropIndex}`
          );
        }
        return false;
      }
      return await retryAudioChunk(audioData, 0);
    },
    [addLogEntry, checkWebSocketBackpressure, retryAudioChunk, pendingAudioChunks]
  );

  // Create a local socketRef that will be populated by useCommunication
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
    sendAudioChunkWithBackpressure,
    socketRef,
    true, // Force isWebSocketReady to true to avoid blocking
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
  } = useCommunication(
    addLogEntry,
    handleStartListeningWrapper,
    networkResilienceManagerRef,
    isSessionActive,
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

  // Sync the socketRef from useCommunication
  useEffect(() => {
    socketRef.current = communicationSocketRef.current;
  }, [communicationSocketRef]);

  // This wrapper is needed to break the circular dependency between hooks.
  function handleStartListeningWrapper(isResuming) {
    handleStartListening(isResuming);
  }

  const handleToggleSession = useCallback(async () => {
    if (isSessionActiveRef.current) {
      addLogEntry("session_control", "User requested to STOP session.");
      handleStopListeningAndCleanupMic();
      if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
        addLogEntry("ws_control", "Closing WebSocket due to session stop request.");
        socketRef.current.close(1000, "User stopped session");
      }
      setIsSessionActive(false);
    } else {
      addLogEntry("session_control", "User requested to START session.");
      // --- AUDIO CONTEXT FIX ---
      // This is a user gesture, so we can resume the audio context here.
      // This is critical for browsers that block audio from starting without interaction.
      await resumeAudioContext();
      const currentLangName = LANGUAGES.find((l) => l.code === selectedLanguage)?.name || selectedLanguage;
      addLogEntry("session_flow", `Attempting to connect WebSocket for session start (Language: ${currentLangName}).`);
      setIsSessionActive(true);
      connectWebSocket(selectedLanguage);
      addLogEntry("session_status", "Session PENDING (WebSocket connecting, Mic to start on WS open).");
    }
  }, [selectedLanguage, connectWebSocket, handleStopListeningAndCleanupMic, addLogEntry, resumeAudioContext]);
  
  const handleSendTextMessage = useCallback(() => {
    if (!textInputValue.trim()) return;
    const currentLangName = LANGUAGES.find((l) => l.code === selectedLanguage)?.name || selectedLanguage;
    addLogEntry("user_text", `User typed (Lang: ${currentLangName}): "${textInputValue}"`);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const messagePayload = {
        type: "text_message",
        text: textInputValue,
        language: selectedLanguage,
        timestamp: new Date().toISOString(),
        id: generateUniqueId(),
      };
      // The backend expects a plain text string, not a JSON object for text prompts.
      // Sending the raw text value aligns with the backend implementation in main.py.
      socketRef.current.send(textInputValue);
      setTranscriptionMessages((prev) => [
        ...prev,
        { id: messagePayload.id, sender: "user", text: textInputValue, is_final: true, timestamp: new Date().toLocaleTimeString() },
      ]);
      setTextInputValue("");
    } else {
      addLogEntry("error", "Cannot send text: WebSocket not connected or not open.");
    }
  }, [textInputValue, addLogEntry, selectedLanguage, socketRef, setTranscriptionMessages]);

  useEffect(() => {
    const currentLangName = LANGUAGES.find((l) => l.code === selectedLanguage)?.name || selectedLanguage;
    addLogEntry("system_event", `Language selection changed to: ${currentLangName} (${selectedLanguage}).`);
    if (isSessionActiveRef.current) {
      addLogEntry("session_control", `Language changed during an active session. Stopping current session.`);
      handleStopListeningAndCleanupMic();
      if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
        socketRef.current.close(1000, "Language changed during active session - stopping session");
      }
      setIsSessionActive(false);
      addLogEntry("system_message", `Session stopped due to language change. Please click "Start Session" again if you wish to continue with ${currentLangName}.`);
    }
  }, [selectedLanguage, addLogEntry, handleStopListeningAndCleanupMic, socketRef]);

  useEffect(() => {
    addLogEntry("status", 'Welcome! Click "Start Session" or type your query.');
  }, [addLogEntry]);

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
  };
};