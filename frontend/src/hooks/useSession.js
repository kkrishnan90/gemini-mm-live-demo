import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppLogger } from './useAppLogger';
import { useToolLogs } from './useToolLogs';
import { useAudio } from './useAudio';
import { useCommunication } from './useCommunication';
import { LANGUAGES } from '../utils/constants';
import { generateUniqueId } from '../utils/helpers';

export const useSession = () => {
  const { messages, addLogEntry, setMessages } = useAppLogger();
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(LANGUAGES[0].code);
  const [textInputValue, setTextInputValue] = useState("");

  const isSessionActiveRef = useRef(isSessionActive);
  useEffect(() => { isSessionActiveRef.current = isSessionActive; }, [isSessionActive]);

  const { isLoading } = useToolLogs(addLogEntry, setMessages);

  const {
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
  } = useCommunication(addLogEntry, handleStartListeningWrapper, isSessionActive, selectedLanguage);

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
    networkResilienceManagerRef,
  } = useAudio(addLogEntry, isSessionActive, isPlayingRef, stopSystemAudioPlayback, sendAudioChunkWithBackpressure, socketRef, isWebSocketReady);

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
      const currentLangName = LANGUAGES.find((l) => l.code === selectedLanguage)?.name || selectedLanguage;
      addLogEntry("session_flow", `Attempting to connect WebSocket for session start (Language: ${currentLangName}).`);
      setIsSessionActive(true);
      connectWebSocket(selectedLanguage);
      addLogEntry("session_status", "Session PENDING (WebSocket connecting, Mic to start on WS open).");
    }
  }, [selectedLanguage, connectWebSocket, handleStopListeningAndCleanupMic, addLogEntry]);

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
      socketRef.current.send(JSON.stringify(messagePayload));
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