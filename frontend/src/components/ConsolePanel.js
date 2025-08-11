import React, { useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane } from '@fortawesome/free-solid-svg-icons';

export const ConsolePanel = ({ 
  messages, 
  isLoading, 
  textInputValue, 
  setTextInputValue, 
  handleSendTextMessage, 
  isSessionActive 
}) => {
  const logsAreaRef = useRef(null);

  useEffect(() => {
    if (logsAreaRef.current)
      logsAreaRef.current.scrollTop = logsAreaRef.current.scrollHeight;
  }, [messages]);

  return (
    <div className="console-panel">
      <div className="console-header">
        <h2>Console</h2>
        <div className="console-header-controls">
          <select
            className="console-dropdown"
            defaultValue="conversations">
            <option value="conversations">Conversations</option>
          </select>
        </div>
      </div>
      <div
        className="logs-area"
        ref={logsAreaRef}>
        {isLoading && <p className="loading-indicator">Loading...</p>}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`log-entry log-entry-${msg.type} ${ 
              msg.type === "toolcall" ? "log-entry-toolcall" : ""
            }`}>
            <span className="log-timestamp">[{msg.timestamp}] </span>
            <span className="log-prefix">{msg.type.toUpperCase()}: </span>
            <span className="log-message">{msg.content}</span>
          </div>
        ))}
      </div>
      <div className="text-input-area console-text-input-area">
        <input
          type="text"
          className="text-input"
          value={textInputValue}
          onChange={(e) => setTextInputValue(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && handleSendTextMessage()}
          placeholder="Type something..."
          disabled={!isSessionActive}
        />
        <button
          onClick={handleSendTextMessage}
          className="control-button send-button"
          disabled={!textInputValue.trim() || !isSessionActive}>
          <FontAwesomeIcon icon={faPaperPlane} />
        </button>
      </div>
    </div>
  );
};