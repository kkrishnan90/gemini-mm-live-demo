"""
Audio processing utilities and buffer management.
"""

import asyncio
from typing import Dict, Any, List
from datetime import datetime, timezone

from app.core.config import settings


class AudioBuffer:
    """Manages audio buffering with overflow protection."""
    
    def __init__(self, max_size: int = None):
        self.max_size = max_size or settings.MAX_BUFFER_SIZE
        self.buffer: List[Dict[str, Any]] = []
        self._sequence_counter = 0
    
    def add_audio_chunk(self, audio_data: bytes, metadata: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Add audio chunk to buffer with metadata.
        
        Args:
            audio_data: Raw audio bytes
            metadata: Optional additional metadata
            
        Returns:
            Dict containing the audio chunk data and metadata
        """
        self._sequence_counter += 1
        current_time = asyncio.get_event_loop().time()
        
        chunk_size = len(audio_data)
        samples_per_chunk = chunk_size // 2  # PCM16 = 2 bytes per sample
        expected_duration_ms = (samples_per_chunk / settings.OUTPUT_SAMPLE_RATE) * 1000
        
        audio_chunk_data = {
            "type": "buffered_audio",
            "audio_data": audio_data,
            "metadata": {
                "sequence": self._sequence_counter,
                "size_bytes": chunk_size,
                "expected_duration_ms": round(expected_duration_ms, 2),
                "sample_rate": settings.OUTPUT_SAMPLE_RATE,
                "timestamp": current_time,
                "buffered": True,
                **(metadata or {})
            }
        }
        
        self.buffer.append(audio_chunk_data)
        
        # Handle buffer overflow
        if len(self.buffer) > self.max_size:
            removed_chunks = self._remove_overflow_chunks()
            return audio_chunk_data, removed_chunks
        
        return audio_chunk_data, []
    
    def _remove_overflow_chunks(self) -> List[Dict[str, Any]]:
        """Remove oldest chunks when buffer overflows."""
        removed_chunks = []
        while len(self.buffer) > self.max_size:
            removed_chunk = self.buffer.pop(0)
            removed_chunks.append(removed_chunk)
        return removed_chunks
    
    def flush_all(self) -> List[Dict[str, Any]]:
        """Flush all buffered chunks and return them."""
        chunks = list(self.buffer)
        self.buffer.clear()
        return chunks
    
    def is_empty(self) -> bool:
        """Check if buffer is empty."""
        return len(self.buffer) == 0
    
    def size(self) -> int:
        """Get current buffer size."""
        return len(self.buffer)
    
    def get_pressure_level(self) -> str:
        """Get buffer pressure level."""
        fill_ratio = len(self.buffer) / self.max_size
        if fill_ratio > 0.9:
            return "high"
        elif fill_ratio > 0.8:
            return "medium"
        else:
            return "low"


class AudioMetadata:
    """Utilities for audio metadata generation."""
    
    @staticmethod
    def create_metadata(sequence: int, chunk_size: int, 
                       sample_rate: int = None, **kwargs) -> Dict[str, Any]:
        """
        Create audio metadata for a chunk.
        
        Args:
            sequence: Sequence number
            chunk_size: Size of audio chunk in bytes
            sample_rate: Sample rate (defaults to OUTPUT_SAMPLE_RATE)
            **kwargs: Additional metadata fields
            
        Returns:
            Dictionary containing metadata
        """
        sample_rate = sample_rate or settings.OUTPUT_SAMPLE_RATE
        samples_per_chunk = chunk_size // 2  # PCM16
        expected_duration_ms = (samples_per_chunk / sample_rate) * 1000
        
        return {
            "type": "audio_metadata",
            "sequence": sequence,
            "size_bytes": chunk_size,
            "expected_duration_ms": round(expected_duration_ms, 2),
            "sample_rate": sample_rate,
            "timestamp": asyncio.get_event_loop().time(),
            **kwargs
        }
    
    @staticmethod
    def create_buffer_pressure_warning(buffer_size: int, max_size: int, 
                                     level: str) -> Dict[str, Any]:
        """Create buffer pressure warning message."""
        return {
            "type": "buffer_pressure",
            "level": level,
            "buffer_size": buffer_size,
            "max_size": max_size,
            "recommended_action": "increase_playback_speed" if level == "high" else "monitor"
        }
    
    @staticmethod
    def create_truncation_warning(chunks_removed: int, 
                                buffer_size: int) -> Dict[str, Any]:
        """Create audio truncation warning message."""
        return {
            "type": "audio_truncation",
            "chunks_removed": chunks_removed,
            "buffer_size": buffer_size,
            "reason": "buffer_overflow"
        }