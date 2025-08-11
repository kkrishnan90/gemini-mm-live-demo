import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faMicrophone,
  faMicrophoneSlash,
  faStop,
  faPlay,
} from '@fortawesome/free-solid-svg-icons';

export const ActionControls = (props) => {
  const { isSessionActive, isRecording, isMuted, handleToggleSession, handleMicMuteToggle } = props;
  return (
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
          isRecording && !isMuted ? "active" : ""
        } ${isMuted ? "muted" : ""}`}
        disabled={!isSessionActive}
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
  );
};