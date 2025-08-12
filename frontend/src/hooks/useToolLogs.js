import { useState, useEffect, useCallback } from 'react';
import { BACKEND_HOST } from '../utils/constants';
import { generateUniqueId } from '../utils/helpers';
import { debugLog, debugError } from '../config/debug';

export const useToolLogs = (addLogEntry, setMessages) => {
  const [isLoading, setIsLoading] = useState(false);
  const [toolCallLogs, setToolCallLogs] = useState([]);

  const fetchToolCallLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`http://${BACKEND_HOST}/api/logs`);
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const toolLogs = data.filter(
        (log) =>
          typeof log === "object" &&
          log !== null &&
          (log.operation || log.tool_function_name)
      );

      const newLogEntries = toolLogs.map((log) => ({
        id: generateUniqueId(),
        type: "toolcall",
        content: JSON.stringify(log),
        timestamp: log.timestamp
          ? new Date(log.timestamp).toLocaleTimeString()
          : new Date().toLocaleTimeString(),
      }));

      newLogEntries.forEach((logEntry) => {
        const logContentString = String(logEntry.content);
        const contentLowerCase = logContentString.toLowerCase();
        const errorKeywords = [
          "error",
          "failed",
          "exception",
          "traceback",
          "critical",
          "err:",
          "warn:",
          "warning",
        ];
        let isError =
          (logEntry.status &&
            String(logEntry.status).toLowerCase().includes("error")) ||
          errorKeywords.some((keyword) => contentLowerCase.includes(keyword));
        debugLog(
          `%c[Tool Call ${isError ? "ERROR" : "Log"}] ${ 
            logEntry.timestamp
          }: ${logContentString}`,
          isError ? "color: #FF3131; font-weight: bold;" : "color: #39FF14;"
        );
      });

      setMessages((prevMessages) => {
        const existingLogContents = new Set(
          prevMessages
            .filter((m) => m.type === "toolcall")
            .map((m) => m.content)
        );
        const uniqueNewEntries = newLogEntries.filter(
          (newLog) => !existingLogContents.has(newLog.content)
        );
        return [...prevMessages, ...uniqueNewEntries].sort(
          (a, b) =>
            new Date("1970/01/01 " + a.timestamp) -
            new Date("1970/01/01 " + b.timestamp)
        );
      });
      setToolCallLogs((prevLogs) => [...prevLogs, ...newLogEntries]);
    } catch (error) {
      debugError("Failed to fetch tool call logs:", error);
      addLogEntry("error", `Failed to fetch tool call logs: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [addLogEntry, setMessages]);

  useEffect(() => {
    fetchToolCallLogs();
    const intervalId = setInterval(fetchToolCallLogs, 15000);
    return () => clearInterval(intervalId);
  }, [fetchToolCallLogs]);

  return { isLoading, toolCallLogs };
};