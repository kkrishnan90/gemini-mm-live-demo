import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faWifi,
  faPowerOff,
  faServer, // Import server icon
} from '@fortawesome/free-solid-svg-icons';
import { LANGUAGES } from '../utils/constants';

export const StatusIndicators = ({ 
  selectedLanguage, 
  setSelectedLanguage, 
  isSessionActive, 
  webSocketStatus, 
  audioHealth, 
  networkQuality, 
  bufferMetrics,
  isServerReady, // New prop
}) => {
  return (
    <div className="control-tray secondary-controls">
      <select
        value={selectedLanguage}
        onChange={(e) => setSelectedLanguage(e.target.value)}
        disabled={isSessionActive}
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
        className="status-indicator icon-status-indicator server-ready-status"
        title={`Server Ready: ${isServerReady ? 'Yes' : 'No'}`}>
        <div className="icon-status-content">
          <FontAwesomeIcon icon={faServer} />
          <span className="icon-status-text">
            Server: {isServerReady ? "Ready" : "Wait"}
          </span>
        </div>
      </div>
      <div
        className="status-indicator icon-status-indicator session-active-status"
        title="Session Status">
        <div className="icon-status-content">
          <FontAwesomeIcon icon={faPowerOff} />
          <span className="icon-status-text">
            {isSessionActive
              ? "Session: Active"
              : "Session: Inactive"}
          </span>
        </div>
      </div>
      <div
        className={`status-indicator icon-status-indicator audio-health-status ${ 
          !audioHealth.isHealthy ? "status-warning" : "" 
        }`}
        title={`Audio Health: ${audioHealth.isHealthy ? "Good" : "Issues detected"}
${audioHealth.issues.join("\n")}`}>
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
        title={`Network Quality: ${(networkQuality.score * 100).toFixed(0)}%
Latency: ${networkQuality.latency.toFixed(0)}ms`}>
        <div className="icon-status-content">
          <span className="icon-status-text">
            Net: {(networkQuality.score * 100).toFixed(0)}% ({networkQuality.latency.toFixed(0)}ms)
          </span>
        </div>
      </div>
      <div
        className="status-indicator icon-status-indicator buffer-status"
        title={`Input Buffer: ${(bufferMetrics.inputFillLevel * 100).toFixed(1)}%
Output Buffer: ${(bufferMetrics.outputFillLevel * 100).toFixed(1)}%`}>
        <div className="icon-status-content">
          <span className="icon-status-text">
            Buf: {(bufferMetrics.inputFillLevel * 100).toFixed(0)}%/{(bufferMetrics.outputFillLevel * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
};

