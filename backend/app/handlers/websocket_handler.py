"""
WebSocket connection handler for Gemini Live API integration.
"""

import asyncio
import uuid
import traceback
import json
from typing import Dict, Any, Optional
from websockets.exceptions import ConnectionClosedOK

from quart import websocket
from google.genai import types

from app.core.config import settings
from app.services.gemini_client import gemini_manager
from app.handlers.client_input_handler import ClientInputHandler
from app.handlers.gemini_response_handler import GeminiResponseHandler
from app.utils.audio import AudioBuffer
from app.tools import (
    take_a_nap, NameCorrectionAgent, SpecialClaimAgent, Enquiry_Tool,
    Eticket_Sender_Agent, ObservabilityAgent, DateChangeAgent,
    Connect_To_Human_Tool, Booking_Cancellation_Agent,
    Flight_Booking_Details_Agent, Webcheckin_And_Boarding_Pass_Agent
)


class WebSocketHandler:
    """Handles WebSocket connections and Gemini Live API integration."""
    
    def __init__(self):
        self.available_functions = {
            "take_a_nap": take_a_nap,
            "NameCorrectionAgent": NameCorrectionAgent,
            "SpecialClaimAgent": SpecialClaimAgent,
            "Enquiry_Tool": Enquiry_Tool,
            "Eticket_Sender_Agent": Eticket_Sender_Agent,
            "ObservabilityAgent": ObservabilityAgent,
            "DateChangeAgent": DateChangeAgent,
            "Connect_To_Human_Tool": Connect_To_Human_Tool,
            "Booking_Cancellation_Agent": Booking_Cancellation_Agent,
            "Flight_Booking_Details_Agent": Flight_Booking_Details_Agent,
            "Webcheckin_And_Boarding_Pass_Agent": Webcheckin_And_Boarding_Pass_Agent
        }
    
    async def handle_connection(self):
        """Main WebSocket connection handler."""
        connection_start_time = asyncio.get_event_loop().time()
        print(f"🌐 New WebSocket connection accepted")
        
        # Initialize connection state and a queue for graceful tool result delivery
        session_state = self._initialize_session_state(connection_start_time)
        tool_results_queue = asyncio.Queue()
        
        try:
            async with self._create_gemini_session() as session:
                print("✅ Successfully connected to Gemini Live API")
                
                # Inform the client that the backend is ready
                await websocket.send(json.dumps({"type": "control", "signal": "server_ready"}))
                print("🚦 Sent 'server_ready' signal to client")
                
                # Create handlers, passing the queue to the response handler
                client_handler = ClientInputHandler(session, session_state)
                gemini_handler = GeminiResponseHandler(
                    session, session_state, self.available_functions, tool_results_queue
                )
                
                # Create and run tasks
                forward_task = asyncio.create_task(
                    client_handler.handle_client_input(),
                    name="ClientInputForwarder"
                )
                receive_task = asyncio.create_task(
                    gemini_handler.handle_gemini_responses(),
                    name="GeminiReceiver"
                )
                
                try:
                    await asyncio.gather(forward_task, receive_task)
                except Exception as e_gather:
                    print(f"WebSocket: Exception during gather: {type(e_gather).__name__}: {e_gather}")
                    traceback.print_exc()
                finally:
                    await self._cleanup_tasks(forward_task, receive_task, session_state)
                    
        except asyncio.CancelledError:
            print("⚠️ WebSocket connection cancelled (client disconnected)")
        except TimeoutError as e_timeout:
            print(f"⏰ Timeout connecting to Gemini Live API: {e_timeout}")
            self._print_timeout_debug_info()
            traceback.print_exc()
        except Exception as e_ws_main:
            print(f"❌ UNHANDLED error in WebSocket connection: {type(e_ws_main).__name__}: {e_ws_main}")
            traceback.print_exc()
        finally:
            print("🔚 WebSocket endpoint processing finished")
    
    def _initialize_session_state(self, connection_start_time: float) -> Dict[str, Any]:
        """Initialize session state for the connection."""
        return {
            'connection_start_time': connection_start_time,
            'current_session_handle': None,
            'client_ready_for_audio': False,
            'mic_audio_buffer': AudioBuffer(),
            'gemini_audio_buffer': AudioBuffer(),
            'audio_sequence_counter': 0,
            'active_processing': True,
            'current_user_utterance_id': None,
            'accumulated_user_speech_text': "",
            'current_model_utterance_id': None,
            'accumulated_model_speech_text': ""
        }
    
    def _create_gemini_session(self):
        """Create and return Gemini Live API session."""
        client = gemini_manager.initialize_client()
        config = gemini_manager.get_live_config()
        
        print(f"🤖 Attempting to connect to Gemini Live API (model: {settings.GEMINI_MODEL_NAME})...")
        print(f"🧳 Travel tool configured with functions")
        
        return client.aio.live.connect(
            model=settings.GEMINI_MODEL_NAME,
            config=config
        )
    
    async def _cleanup_tasks(self, forward_task, receive_task, session_state):
        """Clean up asyncio tasks."""
        session_state['active_processing'] = False
        
        # Cancel tasks if not done
        if not forward_task.done():
            forward_task.cancel()
        if not receive_task.done():
            receive_task.cancel()
        
        # Wait for task cleanup
        for task, task_name in [(forward_task, "forward_task"), (receive_task, "receive_task")]:
            try:
                await task
            except asyncio.CancelledError:
                pass  # Expected during cleanup
            except Exception as e_cleanup:
                print(f"WebSocket: Error during {task_name} cleanup: {e_cleanup}")
                traceback.print_exc()
    
    def _print_timeout_debug_info(self):
        """Print debug information for timeout errors."""
        print("🔍 This could be due to:")
        print("   - Network connectivity issues")
        print("   - API key problems")
        print("   - Google service unavailability")
        print("   - Firewall blocking WebSocket connections")