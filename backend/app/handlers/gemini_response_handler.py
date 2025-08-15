"""
Handles responses from Gemini Live API and forwards to client.
"""

import asyncio
import uuid
import traceback
import time
from typing import Dict, Any, Callable

from quart import websocket
from google.genai import types
from websockets.exceptions import ConnectionClosedOK

from app.core.config import settings
from app.utils.audio import AudioBuffer, AudioMetadata
from app.handlers.audio_processor import AudioProcessor
from app.handlers.transcription_processor import TranscriptionProcessor
from app.handlers.tool_call_processor import ToolCallProcessor


class GeminiResponseHandler:
    """Handles responses from Gemini Live API."""
    
    def __init__(self, session, session_state: Dict[str, Any], 
                 available_functions: Dict[str, Callable], tool_results_queue: asyncio.Queue):
        self.session = session
        self.session_state = session_state
        self.available_functions = available_functions
        self.tool_results_queue = tool_results_queue
        
        # Speech state tracking for coordinated tool response delivery
        self.speech_state = {
            'is_gemini_speaking': False,
            'current_turn_id': None,
            'last_audio_timestamp': None,
            'speech_start_time': None,
            'pending_tool_responses': 0
        }
        
        # Initialize processors
        self.audio_processor = AudioProcessor(session_state)
        self.transcription_processor = TranscriptionProcessor(session_state)
        self.tool_processor = ToolCallProcessor(session, available_functions, tool_results_queue)
        self.is_tool_response = False
        self.audio_processing_lock = asyncio.Lock()
        self.processed_tool_calls = set()

    def set_is_tool_response(self, value: bool):
        """Sets the flag to indicate the next response is from a tool call."""
        self.is_tool_response = value
    
    async def handle_gemini_responses(self):
        """Main Gemini response handling loop."""
        try:
            while self.session_state['active_processing']:
                had_activity = False
                
                async for response in self.session.receive():
                    had_activity = True
                    if not self.session_state['active_processing']:
                        break
                    
                    await self._process_response(response)

                    # Enhanced tool response delivery - coordinate with speech state
                    if response.server_content and response.server_content.turn_complete:
                        if self.is_tool_response:
                            print("\033[96m[INFO] Resetting tool response flag on turn completion.\033[0m")
                            self.is_tool_response = False
                        await self._deliver_queued_tool_responses("turn_complete")
                    
                    # Also check for speech completion based on audio gap
                    await self._check_speech_completion_and_deliver_responses()
                    
                    if not self.session_state['active_processing']:
                        break
                
                # Small delay if no activity
                if not had_activity and self.session_state['active_processing']:
                    await asyncio.sleep(0.1)
                    
        except ConnectionClosedOK:
            print("INFO: Connection to client closed.")
            self.session_state['active_processing'] = False
        finally:
            self.session_state['active_processing'] = False
    
    async def _process_response(self, response):
        """Process individual response from Gemini."""
        response_timestamp = time.strftime("%H:%M:%S.%f")[:-3]
        
        try:
            # Handle session updates
            await self._handle_session_updates(response)
            
            # Handle audio data
            if response.data is not None:
                async with self.audio_processing_lock:
                    print(f"\033[95m[{response_timestamp}] 🎵 GEMINI_AUDIO: Received audio data from Gemini\033[0m")
                    
                    # Track speech state - Gemini is speaking when sending audio
                    if not self.speech_state['is_gemini_speaking']:
                        self.speech_state['is_gemini_speaking'] = True
                        self.speech_state['speech_start_time'] = time.time()
                        print(f"\\033[96m[{response_timestamp}] 🗣️ SPEECH_START: Gemini started speaking\033[0m")
                    
                    self.speech_state['last_audio_timestamp'] = time.time()
                    await self.audio_processor.process_audio_response(response.data)
            
            # Handle server content
            elif response.server_content:
                print(f"\\033[95m[{response_timestamp}] 💬 GEMINI_CONTENT: Received server content from Gemini\\033[0m")
                await self._handle_server_content(response.server_content)
            
            # Handle tool calls
            elif response.tool_call:
                tool_timestamp = time.strftime("%H:%M:%S.%f")[:-3]
                print(f"\\033[95m[{tool_timestamp}] 🔧 GEMINI_TOOL_CALL: Received tool call from Gemini - PROCESSING NOW\\033[0m")
                
                # This should be NON-BLOCKING
                start_tool_time = time.time()
                await self.tool_processor.process_tool_call(response.tool_call)
                end_tool_time = time.time()
                tool_duration = (end_tool_time - start_tool_time) * 1000
                
                post_tool_timestamp = time.strftime("%H:%M:%S.%f")[:-3]
                print(f"\\033[95m[{post_tool_timestamp}] ✅ TOOL_PROCESSING_RETURNED: Tool processing returned in {tool_duration:.2f}ms - GEMINI SHOULD CONTINUE NOW\\033[0m")
            
            # Handle errors
            elif hasattr(response, 'error') and response.error:
                print(f"\\033[95m[{response_timestamp}] ❌ GEMINI_ERROR: Received error from Gemini\\033[0m")
                await self._handle_error(response.error)
            else:
                print(f"\\033[95m[{response_timestamp}] ❓ GEMINI_UNKNOWN: Received unknown response type from Gemini\\033[0m")
                
        except Exception as e:
            error_timestamp = time.strftime("%H:%M:%S.%f")[:-3]
            print(f"\\033[91m[{error_timestamp}] ❌ RESPONSE_ERROR: Error processing response: {e}\\033[0m")
            traceback.print_exc()
            self.session_state['active_processing'] = False
    
    async def _handle_session_updates(self, response):
        """Handle session resumption updates."""
        if response.session_resumption_update:
            update = response.session_resumption_update
            if update.resumable and update.new_handle:
                self.session_state['current_session_handle'] = update.new_handle
        
        if hasattr(response, 'session_handle') and response.session_handle:
            new_handle = response.session_handle
            if new_handle != self.session_state['current_session_handle']:
                self.session_state['current_session_handle'] = new_handle
    
    async def _handle_server_content(self, server_content):
        """Handle server content responses."""
        # Handle interruption
        if server_content.interrupted:
            await self._handle_interruption()
        
        # Handle transcriptions
        await self.transcription_processor.process_transcriptions(server_content)
        
        # Handle unhandled content
        await self._handle_unhandled_content(server_content)
    
    async def _handle_interruption(self):
        """Handle Gemini interruption signal."""
        print("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
        print("Backend: Gemini server sent INTERRUPTED signal.")
        print("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
        
        if not self.is_tool_response:
            try:
                await websocket.send_json({"type": "interrupt_playback"})
            except Exception as send_exc:
                print(f"Backend: Error sending interrupt_playback signal: {send_exc}")
                self.session_state['active_processing'] = False
    
    async def _handle_unhandled_content(self, server_content):
        """Handle unhandled server content."""
        is_transcription_related = (
            (hasattr(server_content, 'input_transcription') and server_content.input_transcription) or
            (hasattr(server_content, 'output_transcription') and server_content.output_transcription)
        )
        
        is_control_signal = (
            (hasattr(server_content, 'generation_complete') and server_content.generation_complete) or
            (hasattr(server_content, 'turn_complete') and server_content.turn_complete) or
            (hasattr(server_content, 'interrupted') and server_content.interrupted)
        )
        
        if not is_transcription_related and not is_control_signal:
            unhandled_text = self._extract_unhandled_text(server_content)
            if unhandled_text:
                print(f"Backend: Received unhandled server_content text: {unhandled_text}")
            elif not hasattr(server_content, 'tool_call'):
                print(f"Backend: Received server_content without known parts: {server_content}")
    
    def _extract_unhandled_text(self, server_content) -> str:
        """Extract unhandled text from server content."""
        unhandled_text = None
        
        if hasattr(server_content, 'text') and server_content.text:
            unhandled_text = server_content.text
        elif (hasattr(server_content, 'model_turn') and server_content.model_turn and 
              hasattr(server_content.model_turn, 'parts')):
            for part in server_content.model_turn.parts:
                if part.text:
                    unhandled_text = (unhandled_text + " " if unhandled_text else "") + part.text
        elif hasattr(server_content, 'output_text') and server_content.output_text:
            unhandled_text = server_content.output_text
        
        return unhandled_text
    
    async def _deliver_queued_tool_responses(self, trigger_reason: str):
        """Deliver all queued tool responses with coordination logging."""
        if self.tool_results_queue.empty():
            return
            
        response_count = 0
        while not self.tool_results_queue.empty():
            function_response = await self.tool_results_queue.get()
            
            try:
                # Check if it's a FunctionResponse object or needs to be sent differently
                if hasattr(function_response, 'name') and hasattr(function_response, 'response'):
                    # Create a unique ID for the tool response to prevent reprocessing
                    tool_call_id = f"{function_response.name}-{function_response.response.get('uuid', '')}"

                    if tool_call_id in self.processed_tool_calls:
                        print(f"\033[93m[WARN] Skipping already processed tool call: {tool_call_id}\033[0m")
                        self.tool_results_queue.task_done()
                        continue

                    # It's a FunctionResponse object - send as tool response
                    self.is_tool_response = True
                    await self.session.send_tool_response(function_responses=[function_response])
                    
                    # Log the coordinated sending
                    delivery_timestamp = time.strftime("%H:%M:%S.%f")[:-3]
                    print(f"\033[96m[{delivery_timestamp}] 🎯 COORDINATED_DELIVERY: Sent tool response for {function_response.name} (trigger: {trigger_reason})\033[0m")
                    self.processed_tool_calls.add(tool_call_id)
                else:
                    # It's some other format - use original send_client_content method
                    await self.session.send_client_content(turns=[function_response])
                    
                    # Log the coordinated sending
                    delivery_timestamp = time.strftime("%H:%M:%S.%f")[:-3]
                    print(f"\033[96m[{delivery_timestamp}] 🎯 COORDINATED_DELIVERY: Sent client content (trigger: {trigger_reason})\033[0m")
                
                response_count += 1
            finally:
                self.tool_results_queue.task_done()
        
        # Update speech state
        if response_count > 0:
            self.speech_state['is_gemini_speaking'] = False
            self.speech_state['pending_tool_responses'] = max(0, self.speech_state['pending_tool_responses'] - response_count)
            print(f"\033[96m[{time.strftime('%H:%M:%S.%f')[:-3]}] ✅ DELIVERY_COMPLETE: Delivered {response_count} tool responses, speech state reset\033[0m")
    
    async def _check_speech_completion_and_deliver_responses(self):
        """Check if speech has completed based on audio timing and deliver queued responses."""
        current_time = time.time()
        
        # Only check if we think Gemini is speaking and we have queued responses
        if not self.speech_state['is_gemini_speaking'] or self.tool_results_queue.empty():
            return
            
        # Check if enough time has passed since last audio to consider speech complete
        if self.speech_state['last_audio_timestamp']:
            time_since_audio = current_time - self.speech_state['last_audio_timestamp']
            SPEECH_COMPLETION_THRESHOLD = 1.5  # 1500ms without audio = speech likely complete
            
            if time_since_audio > SPEECH_COMPLETION_THRESHOLD:
                speech_duration = current_time - (self.speech_state['speech_start_time'] or current_time)
                print(f"\\033[96m[{time.strftime('%H:%M:%S.%f')[:-3]}] 🕐 SPEECH_GAP_DETECTED: {time_since_audio:.2f}s since last audio (speech duration: {speech_duration:.2f}s)\\033[0m")
                await self._deliver_queued_tool_responses("speech_gap_detected")
    
    async def _handle_error(self, error):
        """Handle error responses from Gemini."""
        error_details = error
        if hasattr(error, 'message'):
            error_details = error.message
        
        print(f"Backend: Gemini Error in response: {error_details}")
        
        try:
            await websocket.send(f"[ERROR_FROM_GEMINI]: {str(error_details)}")
        except Exception as send_exc:
            print(f"Backend: Error sending Gemini error to client: {send_exc}")
            self.session_state['active_processing'] = False