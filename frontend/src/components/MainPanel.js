import React, { useEffect, useRef } from 'react';

export const MainPanel = ({ transcriptionMessages }) => {
  const chatAreaRef = useRef(null);

  useEffect(() => {
    if (chatAreaRef.current)
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
  }, [transcriptionMessages]);

  return (
    <div className="main-panel">
      <div className="main-panel-header">
        <h2>Transcriptions</h2>
      </div>
      <div
        className="results-content chat-area"
        ref={chatAreaRef}>
        {transcriptionMessages.length === 0 && (
          <div className="results-content-placeholder">
            <p>
              Audio transcriptions will appear here when a session is active.
            </p>
          </div>
        )}
        {transcriptionMessages.map((msg) => (
          <div
            key={msg.id}
            className={`chat-bubble ${ 
              msg.sender === "user" ? "user-bubble" : "ai-bubble"
            }`}>
            <div className="chat-bubble-text">{msg.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
};