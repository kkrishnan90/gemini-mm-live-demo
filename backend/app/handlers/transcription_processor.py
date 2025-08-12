"""
Handles transcription processing for user input and model output.
"""

import uuid
from typing import Dict, Any

from quart import websocket


class TranscriptionProcessor:
    """Processes transcription data from Gemini Live API."""
    
    def __init__(self, session_state: Dict[str, Any]):
        self.session_state = session_state
    
    async def process_transcriptions(self, server_content):
        """Process input and output transcriptions."""
        # Process user input transcription
        await self._process_user_transcription(server_content)
        
        # Process model output transcription
        await self._process_model_transcription(server_content)
        
        # Handle completion events
        await self._handle_completion_events(server_content)
    
    async def _process_user_transcription(self, server_content):
        """Process user input transcription."""
        if not (hasattr(server_content, 'input_transcription') and 
                server_content.input_transcription and
                hasattr(server_content.input_transcription, 'text') and
                server_content.input_transcription.text):
            return
        
        user_speech_chunk = server_content.input_transcription.text
        
        # Initialize utterance if needed
        if self.session_state['current_user_utterance_id'] is None:
            self.session_state['current_user_utterance_id'] = str(uuid.uuid4())
            self.session_state['accumulated_user_speech_text'] = ""
        
        # Accumulate text
        self.session_state['accumulated_user_speech_text'] += user_speech_chunk
        
        if self.session_state['accumulated_user_speech_text']:
            payload = {
                'id': self.session_state['current_user_utterance_id'],
                'text': self.session_state['accumulated_user_speech_text'],
                'sender': 'user',
                'type': 'user_transcription_update',
                'is_final': False
            }
            
            try:
                await websocket.send_json(payload)
            except Exception as send_exc:
                print(f"Backend: Error sending user transcription: {send_exc}")
                self.session_state['active_processing'] = False
    
    async def _process_model_transcription(self, server_content):
        """Process model output transcription."""
        if not (hasattr(server_content, 'output_transcription') and 
                server_content.output_transcription and
                hasattr(server_content.output_transcription, 'text') and
                server_content.output_transcription.text):
            return
        
        # Initialize utterance if needed
        if self.session_state['current_model_utterance_id'] is None:
            self.session_state['current_model_utterance_id'] = str(uuid.uuid4())
            self.session_state['accumulated_model_speech_text'] = ""
        
        chunk = server_content.output_transcription.text
        if chunk:
            self.session_state['accumulated_model_speech_text'] += chunk
            payload = {
                'id': self.session_state['current_model_utterance_id'],
                'text': self.session_state['accumulated_model_speech_text'],
                'sender': 'model',
                'type': 'model_response_update',
                'is_final': False
            }
            
            try:
                await websocket.send_json(payload)
            except Exception as send_exc:
                print(f"Backend: Error sending model response: {send_exc}")
                self.session_state['active_processing'] = False
    
    async def _handle_completion_events(self, server_content):
        """Handle generation and turn completion events."""
        # Handle model generation completion
        if (hasattr(server_content, 'generation_complete') and 
            server_content.generation_complete):
            await self._handle_model_generation_complete()
        
        # Handle turn completion (user speech finalization)
        if (hasattr(server_content, 'turn_complete') and 
            server_content.turn_complete):
            await self._handle_turn_complete()
    
    async def _handle_model_generation_complete(self):
        """Handle model generation completion."""
        if (self.session_state['current_model_utterance_id'] and 
            self.session_state['accumulated_model_speech_text']):
            
            payload = {
                'id': self.session_state['current_model_utterance_id'],
                'text': self.session_state['accumulated_model_speech_text'],
                'sender': 'model',
                'type': 'model_response_update',
                'is_final': True
            }
            
            try:
                await websocket.send_json(payload)
            except Exception as send_exc:
                print(f"Backend: Error sending final model response: {send_exc}")
                self.session_state['active_processing'] = False
        
        # Reset model utterance state
        self.session_state['current_model_utterance_id'] = None
        self.session_state['accumulated_model_speech_text'] = ""
    
    async def _handle_turn_complete(self):
        """Handle turn completion (finalize user speech)."""
        if (self.session_state['current_user_utterance_id'] and 
            self.session_state['accumulated_user_speech_text']):
            
            payload = {
                'id': self.session_state['current_user_utterance_id'],
                'text': self.session_state['accumulated_user_speech_text'],
                'sender': 'user',
                'type': 'user_transcription_update',
                'is_final': True
            }
            
            try:
                await websocket.send_json(payload)
                print(f"🎤 User said: {self.session_state['accumulated_user_speech_text']}")
            except Exception as send_exc:
                print(f"Backend: Error sending final user transcription: {send_exc}")
                self.session_state['active_processing'] = False
        
        # Reset all utterance states
        self.session_state['current_user_utterance_id'] = None
        self.session_state['accumulated_user_speech_text'] = ""
        self.session_state['current_model_utterance_id'] = None
        self.session_state['accumulated_model_speech_text'] = ""