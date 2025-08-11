/**
 * Unified audio readiness signal sender - ensures single CLIENT_AUDIO_READY per connection
 */
export const sendAudioReadySignal = (playbackContext, socket, addLogEntry, connectionSignalTracker, reason = "unified") => {
  // Get current connection ID
  const connectionId = socket?._connectionId;
  
  // Check if signal already sent for this specific connection
  if (connectionId && connectionSignalTracker.current.has(connectionId)) {
    // CRITICAL FIX 1: Allow retry after connection errors/recovery
    if (reason.includes("recovery") || reason.includes("retry")) {
      connectionSignalTracker.current.delete(connectionId);
      addLogEntry("audio", `Cleared signal tracking for connection ${connectionId} - allowing retry`);
    } else {
      addLogEntry("audio", `Audio readiness signal already sent for connection ${connectionId}`);
      return false;
    }
  }
  
  // Only send if both contexts are ready and socket is open
  if (!playbackContext || playbackContext.state !== "running") {
    addLogEntry("audio", `Audio readiness check failed: playback context state=${playbackContext?.state || 'null'}`);
    return false;
  }
  
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    addLogEntry("audio", `Audio readiness check failed: socket state=${socket?.readyState || 'null'}`);
    return false;
  }
  
  try {
    socket.send("CLIENT_AUDIO_READY");
    
    // Track this signal for this specific connection
    if (connectionId) {
      connectionSignalTracker.current.add(connectionId);
    }
    
    addLogEntry("audio", `Sent CLIENT_AUDIO_READY signal to backend for connection ${connectionId} (${reason}) - UNIFIED SIGNAL`);
    return true;
  } catch (error) {
    addLogEntry("error", `Failed to send CLIENT_AUDIO_READY signal: ${error.message}`);
    
    // CRITICAL FIX 1: Clear signal tracking on send error to allow recovery
    if (connectionId && connectionSignalTracker.current.has(connectionId)) {
      connectionSignalTracker.current.delete(connectionId);
      addLogEntry("audio", `Cleared signal tracking for connection ${connectionId} due to send error - allowing recovery`);
    }
    return false;
  }
};

/**
 * BULLETPROOF WEBSOCKET READINESS: Multi-layer validation with automatic recovery
 * This function ensures WebSocket readiness validation NEVER blocks legitimate audio transmission
 */
export const isWebSocketReady = (socketRef, networkResilienceManagerRef, addLogEntry) => {
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
    addLogEntry && addLogEntry("debug", "WebSocket bulletproof readiness: ALL CHECKS PASSED");
    return true;
  }
  
  // Log detailed failure reason for debugging
  addLogEntry && addLogEntry("debug", 
    `WebSocket readiness failed: ${readiness.reason} at layer ${readiness.layer}` +
    (readiness.recovery ? ` (recovery: ${readiness.recovery.reason})` : "")
  );
  
  // ULTIMATE RECOVERY ATTEMPT: If basic checks pass but detailed validation fails
  if (socketRef.readyState === WebSocket.OPEN && readiness.reason === 'circuit_breaker_open') {
    addLogEntry && addLogEntry("recovery", "Attempting ultimate circuit breaker recovery");
    const recovered = networkResilienceManagerRef.forceCircuitBreakerRecovery();
    if (recovered) {
      addLogEntry && addLogEntry("recovery", "Ultimate circuit breaker recovery successful");
      return true;
    }
  }
  
  return false;
};

/**
 * FAILSAFE TRANSMISSION: Guaranteed audio transmission with multiple fallback paths
 */
export const guaranteedAudioTransmission = async (audioData, socketRef, networkResilienceManagerRef, addLogEntry, fallbackMethods) => {
  const attempts = [];
  
  // Method 1: Primary - NetworkResilienceManager
  if (networkResilienceManagerRef) {
    try {
      const readiness = networkResilienceManagerRef.isBulletproofReady();
      if (readiness.ready) {
        await networkResilienceManagerRef.sendData(audioData);
        addLogEntry("audio_send", "SUCCESS: Audio sent via NetworkResilienceManager");
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
        addLogEntry("recovery", "SUCCESS: Audio sent via direct WebSocket fallback");
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
      addLogEntry("recovery", "SUCCESS: Audio sent via emergency raw WebSocket");
      return { success: true, method: 'EmergencyRawWebSocket', attempts };
    } catch (error) {
      attempts.push({ method: 'EmergencyRawWebSocket', failed: true, error: error.message });
    }
  }
  
  // All methods failed
  addLogEntry("error", "CRITICAL FAILURE: All transmission methods failed");
  addLogEntry("debug", `Transmission attempts: ${JSON.stringify(attempts)}`);
  
  return { success: false, method: 'none', attempts };
};