import { useState, useCallback } from 'react';
import { generateUniqueId } from '../utils/helpers';

export const useAppLogger = () => {
  const [messages, setMessages] = useState([]);

  const addLogEntry = useCallback((type, content) => {
    const allowedTypes = ["toolcall", "error", "system_message", "status"];
    if (!allowedTypes.includes(type)) {
      return;
    }
    const newEntry = {
      id: generateUniqueId(),
      type,
      content,
      timestamp: new Date().toLocaleTimeString(),
    };
    setMessages((prev) => [...prev, newEntry]);
  }, []);

  return { messages, addLogEntry, setMessages };
};