import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faMicrophone,
  faMicrophoneSlash,
  faStop,
  faPlay,
  faSpinner, // Import spinner icon
} from '@fortawesome/free-solid-svg-icons';
import { AudioWave } from './AudioWave';
import { useAudioVisualization } from '../hooks/useAudioVisualization';

export const ActionControls = (props) => {
  const { isSessionActive, isRecording, isMuted, handleToggleSession, handleMicMuteToggle, isServerReady } = props;
  
  const audioLevels = useAudioVisualization(isSessionActive, isMuted);

  const isConnecting = isSessionActive && !isServerReady;

  return (
    <div className="control-tray main-controls">
      <button
        onClick={handleToggleSession}
        className="control-button icon-button session-button"
        disabled={isConnecting} // Disable button while connecting
        title={
          isSessionActive ? "Stop Current Session" : "Start a New Session"
        }>
        <div className="icon-button-content">
          <FontAwesomeIcon icon={isConnecting ? faSpinner : (isSessionActive ? faStop : faPlay)} spin={isConnecting} />
          <span className="icon-button-text">
            {isConnecting ? "Connecting..." : (isSessionActive ? "Stop" : "Start")}
          </span>
        </div>
      </button>
      <button
        onClick={handleMicMuteToggle}
        className={`control-button icon-button mic-button ${ 
          isSessionActive && !isMuted ? "unmuted" : ""
        } ${isMuted ? "muted" : ""}`}
        disabled={!isSessionActive || isConnecting} // Disable while connecting
        title={
          isMuted
            ? "Unmute Microphone"
            : isRecording
            ? "Mute Microphone"
            : "Start Microphone"
        }>
        <div className="icon-button-content">
          <FontAwesomeIcon
            icon={isMuted ? faMicrophoneSlash : faMicrophone}
          />
          <span className="icon-button-text">
            {isMuted ? "Muted" : "Unmuted"}
          </span>
        </div>
      </button>
      <div className="audio-signal-placeholder">
        <AudioWave 
          audioLevels={audioLevels} 
          isActive={isSessionActive && !isMuted} 
        />
      </div>
    </div>
  );
};