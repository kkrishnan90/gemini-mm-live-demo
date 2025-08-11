import asyncio
import os
import traceback
import uuid  # Added for generating unique IDs
import sys  # Added for stdout redirection
import io  # Added for stdout redirection
import json  # Added for parsing log strings
from quart import Quart, websocket, jsonify
from quart_cors import cors
from websockets.exceptions import ConnectionClosedOK
import google.genai as genai
from google.genai import types  # Crucial for Content, Part, Blob
from dotenv import load_dotenv
from datetime import datetime, timezone  # For timestamping raw stdout logs

from gemini_tools import (
    travel_tool,
    NameCorrectionAgent,
    SpecialClaimAgent,
    Enquiry_Tool,
    Eticket_Sender_Agent,
    ObservabilityAgent,
    DateChangeAgent,
    Connect_To_Human_Tool,
    Booking_Cancellation_Agent,
    Flight_Booking_Details_Agent,
    Webcheckin_And_Boarding_Pass_Agent
)
from travel_mock_data import GLOBAL_LOG_STORE  # Import the global log store

load_dotenv()

# --- Log Capturing Setup ---
CAPTURED_STDOUT_LOGS = []
_original_stdout = sys.stdout


class StdoutTee(io.TextIOBase):
    def __init__(self, original_stdout, log_list):
        self._original_stdout = original_stdout
        self._log_list = log_list

    def write(self, s):
        self._original_stdout.write(s)  # Write to original stdout (console)
        s_stripped = s.strip()
        if s_stripped:  # Avoid empty lines
            try:
                # Attempt to parse as JSON, assuming logs from gemini_tools are JSON strings
                log_entry = json.loads(s_stripped)
                # Ensure it has the expected structure for frontend if it's a TOOL_EVENT
                if isinstance(log_entry, dict) and log_entry.get("log_type") == "TOOL_EVENT":
                    self._log_list.append(log_entry)
                else:  # Not a TOOL_EVENT or not a dict, store as raw with context
                    self._log_list.append({
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "log_type": "RAW_STDOUT",
                        "message": s_stripped,
                        "parsed_json": log_entry if isinstance(log_entry, dict) else None
                    })
            except json.JSONDecodeError:
                # If it's not JSON, store it as a raw string entry
                self._log_list.append({
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "log_type": "RAW_STDOUT",
                    "message": s_stripped
                })
        return len(s)

    def flush(self):
        self._original_stdout.flush()


sys.stdout = StdoutTee(_original_stdout, CAPTURED_STDOUT_LOGS)
# --- End Log Capturing Setup ---

try:
    use_vertex_ai = os.getenv(
        "GOOGLE_GENAI_USE_VERTEXAI", "false").lower() == "true"
    if use_vertex_ai:
        project_id = os.getenv("GOOGLE_CLOUD_PROJECT_ID")
        location = os.getenv("GOOGLE_CLOUD_LOCATION")
        if not project_id or not location:
            raise ValueError(
                "GOOGLE_CLOUD_PROJECT_ID and LOCATION must be set in .env when using Vertex AI"
            )
        gemini_client = genai.Client(
            vertexai=True, project=project_id, location=location
        )
        print(
            f"✅ Gemini client initialized successfully using Vertex AI (Project: {project_id}, Location: {location})"
        )
    else:
        gemini_client = genai.Client()
        print("✅ Gemini client initialized successfully using API Key")
except Exception as e:
    print(f"❌ Failed to initialize Gemini client: {e}")
    raise

GEMINI_MODEL_NAME = os.getenv(
    "GEMINI_MODEL_NAME", "gemini-2.5-flash-live-preview")  # Load from environment
INPUT_SAMPLE_RATE = 16000

print(f"🤖 Using Gemini model: {GEMINI_MODEL_NAME}")

app = Quart(__name__)
app = cors(app, allow_origin="*")


@app.websocket("/listen")
async def websocket_endpoint():
    connection_start_time = asyncio.get_event_loop().time()  # Track connection start
    print(f"🌐 🐛 DEBUG: NEW WebSocket connection accepted at {connection_start_time}")
    current_session_handle = None  # Initialize session handle
    client_ready_for_audio = False  # Track client audio readiness
    initial_audio_buffer = []  # Buffer for initial audio chunks
    audio_sequence_counter = 0  # UNIFIED TIMING: Reliable sequence counter for audio correlation
    print(f"🐛 DEBUG: Initialized - client_ready_for_audio={client_ready_for_audio}, buffer_size={len(initial_audio_buffer)}")

    # Force Hindi language for all transcription
    language_code_to_use = "en-US"
    print(f"🗣️ Forcing Hindi transcription: en-US")

    # Check if VAD should be disabled to prevent audio feedback
    disable_vad = os.getenv("DISABLE_VAD", "false").lower() == "true"
    print(
        f"🎙️ Voice Activity Detection: {'DISABLED' if disable_vad else 'ENABLED'}")

    gemini_live_config = types.LiveConnectConfig(
        response_modalities=["AUDIO"],  # Matched to reference
        # system_instruction="""***CRITICAL: TOOL USAGE INSTRUCTIONS***

        # - If the user mentions a booking ID, call `Flight_Booking_Details_Agent`.
        # - If the user asks to cancel, call `Booking_Cancellation_Agent`.
        # - If the user asks for web check-in, call `Webcheckin_And_Boarding_Pass_Agent`.
        # - If the user asks for an e-ticket, call `Eticket_Sender_Agent`.
        # - If the user wants to correct a name on their booking, call `NameCorrectionAgent`.
        # - If the user has a special claim, call `SpecialClaimAgent`.
        # - If the user has a general question, call `Enquiry_Tool`.
        # - If the user wants to check the status of a refund, call `ObservabilityAgent`.
        # - If the user wants to change the date of their booking, call `DateChangeAgent`.
        # - If the user is frustrated and wants to speak to a human, call `Connect_To_Human_Tool`.
        # - You may invoke multiple tools in the same turn.

        # NEVER REVEAL YOUR CONTEXT / INTERNAL COT / THINKING / BRAIN etc. THIS IS ONLY FOR YOU. IF REVEALED, YOU WILL BE CONSIDERED A WORST AGENT.

        # ***IMPORTANT***: Never ask for permission to use a tool. Silently invoke the tool and provide only the results to the user.

        # ***Role & Persona:***
        # - You are **Myra**, a female Indian customer support agent for **Make My Trip** in India
        # - Warm, polite, outcome-driven personality representing MakeMyTrip's brand
        # - Speak in Hinglish (mix of Hindi and English), maintain Indian accent
        # - Always use feminine form in Hindi ("बोल रही हूँ" not "बोल रहा हूँ")


        # Greet and introduce yourself once every call in Indian tone

        # ### CONVERSATION LOOP (apply every turn)
        # 1. **Detect intent** → figure out what the user wants.
        # 2. **Decide tools** → list all tools needed right now.
        # 3. **Call tools** → execute them immediately.
        # 4. **Interpret results** → see if more tools needed.
        # 5. **Respond** → empathetic, match user language, follow number rules.
        # 6. **Repeat** until user confirms resolution.
        # 7. **Closing** (only when user is done):
        #    Hindi example: "Aapke keemti samay ke liye dhanyavaad. Aapka din shubh ho."

        # ### LANGUAGE & NUMBER RULES
        # 1. **Detect the user's language (Hindi or English) and respond ONLY in that language.**
        # 2. **Numbers** (booking IDs, fares, times, flight nos., phone nos.) spoken in English digits.
        # 2. **Prices < ₹10,000** → “Thirty seven hundred”, etc.
        # 3. **Prices ≥ ₹10,000** → “Twelve thousand five hundred”, use lakh/crore when large.
        # 4. **Flight numbers** → airline + digits individually (“Indigo Three Seven Two”).
        # 5. **Phone numbers** → digit‑by‑digit.
        # 6. **Booking IDs** → mention only last three characters (“booking ending with 841”).
        # 7. Never re‑ask for a booking ID already known.

        # ### SCOPE & BEHAVIOR
        # - Handle only **post‑booking queries** for flights and hotels.
        # - No competitor pricing; no policy overrides.
        # - If platform errors, apologize briefly, retry sensibly, or ask for needed info once.
        # - Multiple speakers: focus on the clearest voice.

        # ***Restrictions:***
        # - Only handle post-booking travel queries
        # - No comparisons with competitors
        # - No arguments or policy overrides
        # - Focus on the loudest/clearest voice if multiple speakers


        # """,
        system_instruction="""***Role and Persona***
- You are **Myra**, a female customer support agent for **Make My Trip**.
- Your tone should be warm, polite, and outcome-driven, always representing the MakeMyTrip brand.
- You must speak in clear, professional English throughout the conversation.
- Maintain a friendly and helpful demeanor at all times.

***Core Conversation Flow***

1.  **Greet and Understand:**
    *   Start every new conversation with a warm, professional greeting in English. Example: "Hello! This is Myra from MakeMyTrip. How can I assist you today?"
    *   Your primary goal is to understand the user's needs. Listen carefully to their request.

2.  **Proactive Tool Usage and Disambiguation:**
    *   If a user provides a booking ID (e.g., "BK001", "PNR123"), your immediate first step is to **silently and automatically call the `Flight_Booking_Details_Agent` tool**.
    *   **Do not ask for permission.** Do not ask the user what they want to do.
    *   Once the tool returns the booking details, check the `type` field in the response.
        *   If the `type` is 'flight', proactively ask a relevant follow-up question. Example: "I can see your booking details. This is for a flight to Delhi. What specific information would you like to know about this booking?"
        *   If the `type` is 'hotel', do the same. Example: "I can see your booking details. This is for the Taj Mahal Palace. What specific information would you like to know about this booking?"

3.  **Handling Vague Queries:**
    *   If a user is vague (e.g., "I have a problem with my booking"), gently guide them. Example: "I'm here to help you with your booking. Could you please provide me with your booking ID?". Once they provide the ID, immediately use the `Flight_Booking_Details_Agent` tool as described above.

4.  **Explicit Tool Triggers:**
    *   If the user explicitly asks to **cancel**, call `Booking_Cancellation_Agent`.
    *   If the user explicitly asks for **web check-in**, call `Webcheckin_And_Boarding_Pass_Agent`.
    *   If the user explicitly asks for an **e-ticket**, call `Eticket_Sender_Agent`.
    *   If the user explicitly asks to **correct a name**, call `NameCorrectionAgent`.
    *   If the user explicitly mentions a **special claim**, call `SpecialClaimAgent`.
    *   If the user explicitly asks to **check a refund status**, call `ObservabilityAgent`.
    *   If the user explicitly asks to **change a date**, call `DateChangeAgent`.
    *   If the user is **frustrated**, call `Connect_To_Human_Tool`.

***Language and Number Rules***

*   **Language:** Respond only in clear, professional English.
*   **Numbers:** All numbers (booking IDs, fares, times, flight numbers, phone numbers) must be spoken in English digits.
*   **Prices:**
    *   < ₹10,000: "Thirty-seven hundred rupees"
    *   ≥ ₹10,000: "Twelve thousand five hundred rupees"
*   **Flight Numbers:** "Indigo Three Seven Two"
*   **Phone Numbers:** Digit-by-digit
*   **Booking IDs:** Only mention the last three characters (e.g., "booking ending with 841"). Never re‑ask for a booking ID if the user has already provided it.

***Critical Restrictions***

*   **NEVER** reveal your internal thoughts, context, or the fact that you are using tools.
*   **NEVER** ask for permission to use a tool.
*   Handle **only** post-booking queries for flights and hotels.
*   Do not compare prices with competitors.
*   Do not argue with the user or override policies.
*   If multiple people are speaking, focus on the clearest voice.
*   If you encounter a platform error, apologize briefly and retry. If the error persists, offer to connect the user to a human agent.
*   If the user is abusive, politely end the conversation.

""",
        speech_config=types.SpeechConfig(
            language_code=language_code_to_use,
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                    voice_name="Zephyr"
                )
            )
        ),

        input_audio_transcription={},
        output_audio_transcription={},
        session_resumption=types.SessionResumptionConfig(
            handle=current_session_handle),  # Added from reference
        context_window_compression=types.ContextWindowCompressionConfig(  # Added from reference
            sliding_window=types.SlidingWindow(),
        ),
        realtime_input_config=types.RealtimeInputConfig(
            automatic_activity_detection=types.AutomaticActivityDetection(
                disabled=disable_vad,
                start_of_speech_sensitivity=types.StartSensitivity.START_SENSITIVITY_LOW,
                end_of_speech_sensitivity=types.EndSensitivity.END_SENSITIVITY_LOW,
                prefix_padding_ms=50,  # Reduced from 200ms to minimize false triggers
                silence_duration_ms=2000,  # Increased from 800ms to 2000ms for better stability
            )
        ),

        generationConfig=types.GenerationConfig(
            thinkingConfig=types.GenerationConfigThinkingConfig(
                includeThoughts=False
            )
        ),
        tools=[travel_tool]  # Added travel_tool here
    )

    print(
        f"🧳 Travel tool configured with {len(travel_tool.function_declarations)} functions:")
    for func in travel_tool.function_declarations:
        print(f"   - {func.name}")

    print(
        f"🤖 Attempting to connect to Gemini Live API (model: {GEMINI_MODEL_NAME})...")

    try:
        async with gemini_client.aio.live.connect(
            model=GEMINI_MODEL_NAME,
            config=gemini_live_config
        ) as session:
            print("✅ Successfully connected to Gemini Live API")
            # print(f"Quart Backend: Gemini session connected for model {GEMINI_MODEL_NAME} with tools.")
            active_processing = True

            async def handle_client_input_and_forward():
                nonlocal active_processing, client_ready_for_audio, initial_audio_buffer
                # print("Quart Backend: Starting handle_client_input_and_forward task.")
                try:
                    while active_processing:
                        try:
                            client_data = await asyncio.wait_for(websocket.receive(), timeout=0.2)

                            if isinstance(client_data, str):
                                message_text = client_data
                                # print(f"Quart Backend: Received text from client: '{message_text}'")

                                # Handle client readiness signal
                                if message_text == "CLIENT_AUDIO_READY":
                                    client_ready_for_audio = True
                                    print(
                                        f"🔊 🐛 DEBUG: Client audio ready signal received! Buffered chunks: {len(initial_audio_buffer)}")
                                    print(f"🐛 DEBUG: Connection time: {asyncio.get_event_loop().time() - connection_start_time:.2f}s")
                                    # Flush any buffered audio chunks
                                    flushed_count = 0
                                    for buffered_chunk in initial_audio_buffer:
                                        try:
                                            if isinstance(buffered_chunk, dict) and buffered_chunk.get("type") == "buffered_audio":
                                                # UNIFIED TIMING: Send metadata BEFORE binary audio for correlation
                                                metadata_msg = {
                                                    "type": "audio_metadata",
                                                    **buffered_chunk["metadata"],
                                                    "flushed_by_timeout": True  # Mark as buffered flush
                                                }
                                                await websocket.send_json(metadata_msg)
                                                
                                                # Send binary audio data immediately after metadata
                                                await websocket.send(buffered_chunk["audio_data"])
                                                
                                                chunk_size = buffered_chunk["metadata"]["size_bytes"]
                                                flushed_count += 1
                                                print(f"🐛 UNIFIED DEBUG: Flushed buffered chunk #{flushed_count} seq={buffered_chunk['metadata']['sequence']} ({chunk_size} bytes) - metadata BEFORE binary")
                                            else:
                                                # Fallback for old format
                                                await websocket.send(buffered_chunk)
                                                flushed_count += 1
                                                print(f"🐛 DEBUG: Flushed legacy chunk #{flushed_count} ({len(buffered_chunk)} bytes)")
                                        except Exception as send_exc:
                                            print(
                                                f"🐛 DEBUG: Error sending buffered audio chunk #{flushed_count}: {send_exc}")
                                    initial_audio_buffer.clear()
                                    print(f"🐛 DEBUG: Flushed {flushed_count} buffered audio chunks, buffer cleared")
                                    continue

                                prompt_for_gemini = message_text
                                if message_text == "SEND_TEST_AUDIO_PLEASE":
                                    prompt_for_gemini = "Hello Gemini, please say 'testing one two three'."

                                # print(f"Quart Backend: Sending text prompt to Gemini: '{prompt_for_gemini}'")
                                user_content_for_text = types.Content(
                                    role="user",
                                    parts=[types.Part(
                                        text=prompt_for_gemini)]
                                )
                                await session.send_client_content(turns=user_content_for_text)
                                # print(f"Quart Backend: Prompt '{prompt_for_gemini}' sent to Gemini.")

                            elif isinstance(client_data, bytes):
                                audio_chunk = client_data
                                if audio_chunk:
                                    print(f"🎤 Backend: Received audio from frontend: {len(audio_chunk)} bytes")
                                    print(f"📤 Backend: Sending audio to Gemini Live API: {len(audio_chunk)} bytes")
                                    await session.send_realtime_input(
                                        audio=types.Blob(
                                            mime_type=f"audio/pcm;rate={INPUT_SAMPLE_RATE}",
                                            data=audio_chunk
                                        )
                                    )
                                    # print(f"Quart Backend: Successfully sent mic audio to Gemini via send_realtime_input.")
                            else:
                                print(
                                    f"Quart Backend: Received unexpected data type from client: {type(client_data)}, content: {client_data[:100] if isinstance(client_data, bytes) else client_data}")

                        except asyncio.TimeoutError:
                            if not active_processing:
                                break
                            continue  # Normal timeout, continue listening
                        except ConnectionClosedOK:
                            print("INFO: Client closed the connection.")
                            active_processing = False
                            break
                        except Exception as e_fwd_outer:
                            print(
                                f"Quart Backend: Outer error in handle_client_input_and_forward: {type(e_fwd_outer).__name__}: {e_fwd_outer}")
                            traceback.print_exc()
                            active_processing = False  # Ensure outer errors also stop processing
                finally:
                    # print("Quart Backend: Stopped handling client input.")
                    active_processing = False  # Ensure graceful shutdown of the other task

            async def receive_from_gemini_and_forward_to_client():
                nonlocal active_processing, current_session_handle, client_ready_for_audio, initial_audio_buffer, connection_start_time
                # print("Quart Backend: Starting receive_from_gemini_and_forward_to_client task.")

                available_functions = {
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
                current_user_utterance_id = None
                # Renamed from latest_user_speech_text and initialized
                accumulated_user_speech_text = ""
                current_model_utterance_id = None
                accumulated_model_speech_text = ""

                try:
                    while active_processing:
                        had_gemini_activity_in_this_iteration = False
                        async for response in session.receive():
                            had_gemini_activity_in_this_iteration = True
                            if not active_processing:
                                break

                            if response.session_resumption_update:
                                update = response.session_resumption_update
                                if update.resumable and update.new_handle:
                                    current_session_handle = update.new_handle
                                    # print(f"Quart Backend: Received session resumption update. New handle: {current_session_handle}")

                            if hasattr(response, 'session_handle') and response.session_handle:
                                new_handle = response.session_handle
                                if new_handle != current_session_handle:
                                    current_session_handle = new_handle
                                    # print(f"Quart Backend: Updated session handle from direct response.session_handle: {current_session_handle}")

                            if response.data is not None:
                                print(f"📥 Backend: Received audio from Gemini Live API: {len(response.data)} bytes")
                                try:
                                    current_time = asyncio.get_event_loop().time()
                                    time_since_connection = current_time - connection_start_time

                                    # Auto-flush buffer after 3 seconds if client hasn't signaled readiness
                                    if not client_ready_for_audio and time_since_connection > 3.0:
                                        print(
                                            f"⏰ 🐛 DEBUG: Client readiness TIMEOUT after {time_since_connection:.2f}s - auto-flushing {len(initial_audio_buffer)} buffered chunks")
                                        print(f"🐛 DEBUG: This indicates CLIENT_AUDIO_READY signal was NOT received - investigating frontend")
                                        client_ready_for_audio = True
                                        # Flush buffered audio with binary format
                                        timeout_flushed_count = 0
                                        for buffered_chunk in initial_audio_buffer:
                                            try:
                                                if isinstance(buffered_chunk, dict) and buffered_chunk.get("type") == "buffered_audio":
                                                    # Send binary audio data first
                                                    await websocket.send(buffered_chunk["audio_data"])
                                                    
                                                    # Send metadata separately
                                                    metadata = buffered_chunk["metadata"]
                                                    metadata["flushed_by_timeout"] = True
                                                    metadata_msg = {
                                                        "type": "audio_metadata",
                                                        **metadata
                                                    }
                                                    await websocket.send_json(metadata_msg)
                                                    
                                                    chunk_size = metadata["size_bytes"]
                                                    duration = metadata["expected_duration_ms"]
                                                    timeout_flushed_count += 1
                                                    print(f"🐛 DEBUG: Timeout-flushed binary chunk #{timeout_flushed_count} ({chunk_size} bytes, {duration:.1f}ms)")
                                                else:
                                                    # Fallback for old format
                                                    await websocket.send(buffered_chunk)
                                                    timeout_flushed_count += 1
                                                    print(f"🐛 DEBUG: Timeout-flushed legacy chunk #{timeout_flushed_count} ({len(buffered_chunk)} bytes)")
                                            except Exception as send_exc:
                                                print(
                                                    f"🐛 DEBUG: Error sending timeout-flushed audio chunk #{timeout_flushed_count}: {send_exc}")
                                        initial_audio_buffer.clear()
                                        print(f"🐛 DEBUG: Timeout flushed {timeout_flushed_count} binary chunks - investigating truncation cause")

                                    if client_ready_for_audio:
                                        # Client is ready, send audio as binary with separate metadata
                                        chunk_size = len(response.data)
                                        # Calculate expected playback duration (24kHz PCM16, mono)
                                        samples_per_chunk = chunk_size // 2  # 2 bytes per sample (PCM16)
                                        expected_duration_ms = (samples_per_chunk / 24000) * 1000  # 24kHz sample rate
                                        
                                        # UNIFIED TIMING: Generate reliable sequence number for correlation
                                        audio_sequence_counter += 1
                                        sequence_num = audio_sequence_counter
                                        
                                        # UNIFIED TIMING: Send metadata BEFORE binary audio for proper correlation
                                        audio_metadata = {
                                            "type": "audio_metadata",
                                            "sequence": sequence_num,
                                            "size_bytes": chunk_size,
                                            "expected_duration_ms": round(expected_duration_ms, 2),
                                            "sample_rate": 24000,
                                            "timestamp": current_time
                                        }
                                        
                                        await websocket.send_json(audio_metadata)
                                        
                                        # Send audio as efficient binary data immediately after metadata
                                        await websocket.send(response.data)
                                        print(
                                            f"🔊 UNIFIED Backend: Sent audio seq={sequence_num} ({chunk_size} bytes, {expected_duration_ms:.1f}ms) - metadata BEFORE binary")
                                    else:
                                        # Client not ready, buffer the audio chunk with metadata
                                        chunk_size = len(response.data)
                                        samples_per_chunk = chunk_size // 2
                                        expected_duration_ms = (samples_per_chunk / 24000) * 1000
                                        
                                        # UNIFIED TIMING: Generate reliable sequence number for correlation
                                        audio_sequence_counter += 1
                                        sequence_num = audio_sequence_counter
                                        
                                        # Buffer both audio data and metadata
                                        audio_chunk_data = {
                                            "type": "buffered_audio",
                                            "audio_data": response.data,  # Keep as binary
                                            "metadata": {
                                                "sequence": sequence_num,
                                                "size_bytes": chunk_size,
                                                "expected_duration_ms": round(expected_duration_ms, 2),
                                                "sample_rate": 24000,
                                                "timestamp": current_time,
                                                "buffered": True
                                            }
                                        }
                                        
                                        initial_audio_buffer.append(audio_chunk_data)
                                        print(
                                            f"📦 UNIFIED Buffered audio seq={sequence_num} ({chunk_size} bytes, {expected_duration_ms:.1f}ms) - client not ready (t+{time_since_connection:.1f}s)")

                                        # Enhanced buffer pressure management with flow control
                                        buffer_size = len(initial_audio_buffer)
                                        max_buffer_size = 500
                                        
                                        # Send buffer pressure warnings to frontend
                                        if buffer_size > max_buffer_size * 0.8:  # 80% threshold
                                            pressure_warning = {
                                                "type": "buffer_pressure",
                                                "level": "high" if buffer_size > max_buffer_size * 0.9 else "medium",
                                                "buffer_size": buffer_size,
                                                "max_size": max_buffer_size,
                                                "recommended_action": "increase_playback_speed" if buffer_size > max_buffer_size * 0.9 else "monitor"
                                            }
                                            try:
                                                await websocket.send_json(pressure_warning)
                                                print(f"⚠️ Buffer pressure warning sent: {pressure_warning['level']} ({buffer_size}/{max_buffer_size})")
                                            except Exception as e:
                                                print(f"Failed to send buffer pressure warning: {e}")
                                        
                                        # Remove oldest chunks when buffer is full
                                        if buffer_size > max_buffer_size:
                                            removed_chunks = []
                                            while len(initial_audio_buffer) > max_buffer_size:
                                                removed_chunk = initial_audio_buffer.pop(0)
                                                removed_chunks.append(removed_chunk)
                                            
                                            # Send truncation warning to frontend
                                            truncation_warning = {
                                                "type": "audio_truncation",
                                                "chunks_removed": len(removed_chunks),
                                                "buffer_size": len(initial_audio_buffer),
                                                "reason": "buffer_overflow"
                                            }
                                            try:
                                                await websocket.send_json(truncation_warning)
                                                print(f"🗑️ Buffer overflow: removed {len(removed_chunks)} chunks, sent truncation warning")
                                            except Exception as e:
                                                print(f"Failed to send truncation warning: {e}")

                                except Exception as send_exc:
                                    print(
                                        f"Quart Backend: Error sending audio data to client WebSocket: {type(send_exc).__name__}: {send_exc}")
                                    active_processing = False
                                    break

                            elif response.server_content:
                                if response.server_content.interrupted:
                                    print(
                                        "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
                                    print(
                                        "Quart Backend: Gemini server sent INTERRUPTED signal.")
                                    print(
                                        "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
                                    try:
                                        await websocket.send_json({"type": "interrupt_playback"})
                                        # print("Quart Backend: Sent interrupt_playback signal to client.")
                                    except Exception as send_exc:
                                        print(
                                            f"Quart Backend: Error sending interrupt_playback signal to client: {type(send_exc).__name__}: {send_exc}")
                                        active_processing = False
                                        break

                                # User Input Processing
                                if response.server_content and hasattr(response.server_content, 'input_transcription') and \
                                        response.server_content.input_transcription and \
                                        hasattr(response.server_content.input_transcription, 'text') and \
                                        response.server_content.input_transcription.text:  # Ensure text is not empty

                                    user_speech_chunk = response.server_content.input_transcription.text

                                    if current_user_utterance_id is None:  # Start of a new user utterance
                                        current_user_utterance_id = str(
                                            uuid.uuid4())
                                        accumulated_user_speech_text = ""  # Reset accumulator for new utterance

                                    accumulated_user_speech_text += user_speech_chunk

                                    if accumulated_user_speech_text:  # Only send if there's actual accumulated text
                                        payload = {
                                            'id': current_user_utterance_id,
                                            'text': accumulated_user_speech_text,  # Send accumulated text
                                            'sender': 'user',
                                            'type': 'user_transcription_update',
                                            'is_final': False
                                        }
                                        try:
                                            await websocket.send_json(payload)
                                            # Removed excessive user input logging
                                        except Exception as send_exc:
                                            print(
                                                f"Quart Backend: Error sending user transcription update to client: {type(send_exc).__name__}: {send_exc}")
                                            active_processing = False
                                            break

                                # Model Output Processing
                                if response.server_content and hasattr(response.server_content, 'output_transcription') and \
                                        response.server_content.output_transcription and \
                                        hasattr(response.server_content.output_transcription, 'text') and \
                                        response.server_content.output_transcription.text:

                                    if current_model_utterance_id is None:
                                        current_model_utterance_id = str(
                                            uuid.uuid4())
                                        accumulated_model_speech_text = ""  # Ensure accumulator is clear

                                    chunk = response.server_content.output_transcription.text
                                    if chunk:  # Only process if chunk has content
                                        accumulated_model_speech_text += chunk
                                        payload = {
                                            'id': current_model_utterance_id,
                                            'text': accumulated_model_speech_text,  # Send accumulated text
                                            'sender': 'model',
                                            'type': 'model_response_update',
                                            'is_final': False
                                        }
                                        try:
                                            await websocket.send_json(payload)
                                            # Removed excessive model output logging
                                        except Exception as send_exc:
                                            print(
                                                f"Quart Backend: Error sending model response update to client: {type(send_exc).__name__}: {send_exc}")
                                            active_processing = False
                                            break

                                # Handling Model Generation Completion
                                if response.server_content and hasattr(response.server_content, 'generation_complete') and \
                                        response.server_content.generation_complete == True:
                                    if current_model_utterance_id and accumulated_model_speech_text:  # Ensure there was a model utterance
                                        payload = {
                                            'id': current_model_utterance_id,
                                            'text': accumulated_model_speech_text,
                                            'sender': 'model',
                                            'type': 'model_response_update',
                                            'is_final': True
                                        }
                                        try:
                                            await websocket.send_json(payload)
                                            # Removed excessive final model output logging
                                        except Exception as send_exc:
                                            print(
                                                f"Quart Backend: Error sending final model response to client: {type(send_exc).__name__}: {send_exc}")
                                            active_processing = False
                                            break
                                    current_model_utterance_id = None  # Reset for next model utterance
                                    accumulated_model_speech_text = ""

                                # Handling Turn Completion (Finalizing User Speech)
                                if response.server_content and hasattr(response.server_content, 'turn_complete') and \
                                        response.server_content.turn_complete == True:
                                    if current_user_utterance_id and accumulated_user_speech_text:  # Ensure there was a user utterance
                                        payload = {
                                            'id': current_user_utterance_id,
                                            'text': accumulated_user_speech_text,  # Send final accumulated text
                                            'sender': 'user',
                                            'type': 'user_transcription_update',
                                            'is_final': True
                                        }
                                        try:
                                            await websocket.send_json(payload)
                                            print(
                                                f"🎤 User said: {accumulated_user_speech_text}")
                                        except Exception as send_exc:
                                            print(
                                                f"Quart Backend: Error sending final user transcription to client: {type(send_exc).__name__}: {send_exc}")
                                            active_processing = False
                                            break
                                    current_user_utterance_id = None  # Reset for next user utterance
                                    accumulated_user_speech_text = ""  # Reset accumulator
                                    # Also reset model states
                                    current_model_utterance_id = None
                                    accumulated_model_speech_text = ""
                                    # Removed excessive turn complete logging

                                # Fallback for other potential text or error structures (simplified)
                                is_transcription_related = (hasattr(response.server_content, 'input_transcription') and response.server_content.input_transcription) or \
                                                           (hasattr(response.server_content, 'output_transcription')
                                                            and response.server_content.output_transcription)
                                is_control_signal = (hasattr(response.server_content, 'generation_complete') and response.server_content.generation_complete) or \
                                    (hasattr(response.server_content, 'turn_complete') and response.server_content.turn_complete) or\
                                    (hasattr(
                                        response.server_content, 'interrupted') and response.server_content.interrupted)

                                if not response.data and not is_transcription_related and not is_control_signal:
                                    unhandled_text = None
                                    if response.text:
                                        unhandled_text = response.text
                                    elif hasattr(response.server_content, 'model_turn') and response.server_content.model_turn and \
                                            hasattr(response.server_content.model_turn, 'parts'):
                                        for part in response.server_content.model_turn.parts:
                                            if part.text:
                                                unhandled_text = (
                                                    unhandled_text + " " if unhandled_text else "") + part.text
                                    elif hasattr(response.server_content, 'output_text') and response.server_content.output_text:
                                        unhandled_text = response.server_content.output_text

                                    if unhandled_text:
                                        print(
                                            f"Quart Backend: Received unhandled server_content text: {unhandled_text}")
                                    elif not response.tool_call:
                                        print(
                                            f"Quart Backend: Received server_content without primary data or known text parts: {response.server_content}")

                            elif response.tool_call:
                                print(
                                    f"\033[92mQuart Backend: Received tool_call from Gemini: {response.tool_call}\033[0m")
                                function_responses = []
                                for fc in response.tool_call.function_calls:
                                    print(
                                        f"\033[92mQuart Backend: Gemini requests function call: {fc.name} with args: {dict(fc.args)}\033[0m")

                                    function_to_call = available_functions.get(
                                        fc.name)
                                    function_response_content = None

                                    if function_to_call:
                                        try:
                                            # Execute the actual local function
                                            function_args = dict(fc.args)
                                            print(
                                                f"\033[92mQuart Backend: Calling function {fc.name} with args: {function_args}\033[0m")
                                            # Await the async function call
                                            result = await function_to_call(**function_args)
                                            if isinstance(result, str):
                                                function_response_content = {
                                                    "content": result}
                                            else:
                                                # Assumes result is already a dict if not a string
                                                function_response_content = result
                                            print(
                                                f"\033[92mQuart Backend: Function {fc.name} executed. Result: {result}\033[0m")
                                        except Exception as e:
                                            print(
                                                f"Quart Backend: Error executing function {fc.name}: {e}")
                                            traceback.print_exc()  # Add if not already there
                                            function_response_content = {
                                                "status": "error", "message": str(e)}
                                    else:
                                        print(
                                            f"Quart Backend: Function {fc.name} not found.")
                                        function_response_content = {
                                            "status": "error", "message": f"Function {fc.name} not implemented or available."}

                                    function_response = types.FunctionResponse(
                                        id=fc.id,
                                        name=fc.name,
                                        response=function_response_content
                                    )
                                    function_responses.append(
                                        function_response)

                                if function_responses:
                                    print(
                                        f"\033[92mQuart Backend: Sending {len(function_responses)} function response(s) to Gemini.\033[0m")
                                    await session.send_tool_response(function_responses=function_responses)
                                else:
                                    print(
                                        "Quart Backend: No function responses generated for tool_call.")

                            elif hasattr(response, 'error') and response.error:
                                error_details = response.error
                                if hasattr(response.error, 'message'):
                                    error_details = response.error.message
                                print(
                                    f"Quart Backend: Gemini Error in response: {error_details}")
                                try:
                                    await websocket.send(f"[ERROR_FROM_GEMINI]: {str(error_details)}")
                                except Exception as send_exc:
                                    print(
                                        f"Quart Backend: Error sending Gemini error to client WebSocket: {type(send_exc).__name__}: {send_exc}")
                                    active_processing = False
                                    break

                            # Removed the separate turn_complete log here as it's handled above with user speech sending.

                            if not active_processing:
                                break

                        if not had_gemini_activity_in_this_iteration and active_processing:
                            await asyncio.sleep(0.1)
                        elif had_gemini_activity_in_this_iteration and active_processing:
                            pass

                except ConnectionClosedOK:
                    print("INFO: Connection to client closed.")
                    active_processing = False
                finally:
                    # print("Quart Backend: Stopped receiving from Gemini.")
                    active_processing = False  # Ensure graceful shutdown of the other task

            forward_task = asyncio.create_task(
                handle_client_input_and_forward(), name="ClientInputForwarder")
            receive_task = asyncio.create_task(
                receive_from_gemini_and_forward_to_client(), name="GeminiReceiver")

            try:
                await asyncio.gather(forward_task, receive_task)
            except Exception as e_gather:
                print(
                    f"Quart Backend: Exception during asyncio.gather: {type(e_gather).__name__}: {e_gather}")
                traceback.print_exc()  # Added traceback
            finally:
                active_processing = False
                if not forward_task.done():
                    forward_task.cancel()
                if not receive_task.done():
                    receive_task.cancel()
                try:
                    await forward_task
                except asyncio.CancelledError:
                    # print(f"Quart Backend: Task {forward_task.get_name()} was cancelled during cleanup.")
                    pass  # Task cancellation is an expected part of shutdown
                except Exception as e_fwd_cleanup:
                    print(
                        f"Quart Backend: Error during forward_task cleanup: {e_fwd_cleanup}")
                    traceback.print_exc()  # Added traceback
                try:
                    await receive_task
                except asyncio.CancelledError:
                    # print(f"Quart Backend: Task {receive_task.get_name()} was cancelled during cleanup.")
                    pass  # Task cancellation is an expected part of shutdown
                except Exception as e_rcv_cleanup:
                    print(
                        f"Quart Backend: Error during receive_task cleanup: {e_rcv_cleanup}")
                    traceback.print_exc()  # Added traceback

            # print("Quart Backend: Gemini interaction tasks finished.")
    except asyncio.CancelledError:
        print("⚠️ WebSocket connection cancelled (client disconnected)")
        pass  # Expected on client disconnect
    except TimeoutError as e_timeout:
        print(f"⏰ Timeout connecting to Gemini Live API: {e_timeout}")
        print("🔍 This could be due to:")
        print("   - Network connectivity issues")
        print("   - API key problems")
        print("   - Google service unavailability")
        print("   - Firewall blocking WebSocket connections")
        traceback.print_exc()
    except Exception as e_ws_main:
        print(
            f"❌ UNHANDLED error in WebSocket connection: {type(e_ws_main).__name__}: {e_ws_main}")
        traceback.print_exc()
    finally:
        print("🔚 WebSocket endpoint processing finished")


@app.route("/api/logs", methods=["GET"])
async def get_logs():
    """API endpoint to fetch captured logs."""
    # Combine logs from BQ's global store and our captured stdout logs
    # Return copies to avoid issues if the lists are modified during serialization
    combined_logs = list(GLOBAL_LOG_STORE) + list(CAPTURED_STDOUT_LOGS)

    # Optional: Sort by timestamp if all logs have a compatible timestamp field
    # For now, just concatenating. Assuming GLOBAL_LOG_STORE entries also have a timestamp
    # or can be ordered meaningfully with the new TOOL_EVENT logs.
    # If sorting is needed:
    # combined_logs.sort(key=lambda x: x.get("timestamp", ""), reverse=True) # Example sort

    return jsonify(combined_logs)


@app.route("/ping", methods=["GET", "HEAD"])
async def ping():
    """Simple ping endpoint for connection quality testing."""
    return jsonify({"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()})

# To run this Quart application:
# 1. Install dependencies: pip install quart quart-cors google-generativeai python-dotenv hypercorn
# 2. Set your GEMINI_API_KEY environment variable in a .env file or your system environment.
# 3. Run using Hypercorn:
#    hypercorn main:app --bind 0.0.0.0:8000
#    Or, for development with auto-reload:
#    quart run --host 0.0.0.0 --port 8000 --reload
