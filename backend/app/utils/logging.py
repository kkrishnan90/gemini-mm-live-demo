"""
Logging utilities and setup.
"""

import sys
import io
import json
from datetime import datetime, timezone
from typing import List, Dict, Any


class StdoutTee(io.TextIOBase):
    """
    Custom stdout handler that captures logs and forwards to original stdout.
    """
    
    def __init__(self, original_stdout, log_list: List[Dict[str, Any]]):
        self._original_stdout = original_stdout
        self._log_list = log_list

    def write(self, s: str) -> int:
        """Write to both original stdout and capture logs."""
        self._original_stdout.write(s)
        s_stripped = s.strip()
        
        if s_stripped:
            try:
                # Attempt to parse as JSON for structured logs
                log_entry = json.loads(s_stripped)
                
                if isinstance(log_entry, dict) and log_entry.get("log_type") == "TOOL_EVENT":
                    self._log_list.append(log_entry)
                else:
                    # Store as raw log with context
                    self._log_list.append({
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "log_type": "RAW_STDOUT",
                        "message": s_stripped,
                        "parsed_json": log_entry if isinstance(log_entry, dict) else None
                    })
            except json.JSONDecodeError:
                # Store raw string entry
                self._log_list.append({
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "log_type": "RAW_STDOUT",
                    "message": s_stripped
                })
        
        return len(s)

    def flush(self):
        """Flush the original stdout."""
        self._original_stdout.flush()


class LogCapture:
    """
    Manages log capturing and provides access to captured logs.
    """
    
    def __init__(self):
        self.captured_logs: List[Dict[str, Any]] = []
        self._original_stdout = sys.stdout
        self._tee = None
        
    def start_capture(self):
        """Start capturing stdout logs."""
        if self._tee is None:
            self._tee = StdoutTee(self._original_stdout, self.captured_logs)
            sys.stdout = self._tee
    
    def stop_capture(self):
        """Stop capturing stdout logs."""
        if self._tee is not None:
            sys.stdout = self._original_stdout
            self._tee = None
    
    def get_logs(self) -> List[Dict[str, Any]]:
        """Get a copy of captured logs."""
        return list(self.captured_logs)
    
    def clear_logs(self):
        """Clear captured logs."""
        self.captured_logs.clear()


# Global log capture instance
log_capture = LogCapture()