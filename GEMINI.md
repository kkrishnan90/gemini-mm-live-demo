# Project Overview

This project is a real-time, voice-enabled travel assistant that uses the Gemini Live API. It features a WebSocket-based architecture for seamless audio processing and provides comprehensive travel booking capabilities. The application is composed of a Python/Quart backend and a React.js frontend.

The backend has been refactored for modularity and maintainability, with a clear separation of concerns. The frontend is designed for resilience, with a robust system for handling WebSocket connections and a production-ready audio processing pipeline.

**Key Technologies:**

*   **Backend:** Python, Quart, Google Gemini API, WebSockets
*   **Frontend:** React.js, WebSockets, AudioWorklet

**Architecture:**

The application follows a client-server architecture:

*   **Backend (`backend/`):** A Python server built with the Quart web framework. It handles the WebSocket connection, audio streaming to and from the Gemini Live API, and executes tool calls for travel-related queries. The backend is organized into a modular structure with handlers for different concerns like WebSocket communication, audio processing, and tool calls.
*   **Frontend (`frontend/`):** A React.js single-page application that provides the user interface. It captures audio from the microphone, sends it to the backend via WebSockets, and displays the real-time transcription and responses from the Gemini assistant.

# Building and Running

## Backend

To run the backend server, follow these steps:

1.  **Navigate to the backend directory:**
    ```bash
    cd backend
    ```
2.  **Create and activate a virtual environment:**
    ```bash
    python -m venv venv
    source venv/bin/activate
    ```
3.  **Install the required dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
4.  **Set up the environment variables:**
    *   Copy the `.env.example` file to `.env`.
    *   Add your Gemini API key to the `.env` file.
5.  **Start the server:**
    ```bash
    hypercorn main:app --bind 0.0.0.0:8000
    ```

## Frontend

To run the frontend application, follow these steps:

1.  **Navigate to the frontend directory:**
    ```bash
    cd frontend
    ```
2.  **Install the required dependencies:**
    ```bash
    npm install
    ```
3.  **Start the development server:**
    ```bash
    npm start
    ```
4.  **Open your browser and navigate to `http://localhost:3000`.**

# Backend Architecture

The backend follows a modular architecture, with responsibilities separated into different modules:

*   **`main.py`**: The application entry point.
*   **`app/services/gemini_client.py`**: Manages the Gemini client.

## Application Factory

The `app/core/app.py` file is the heart of the backend application's setup. The `create_app` function is responsible for:

*   **Creating the Quart Application:** It creates a new Quart application.
*   **Configuring CORS:** It configures CORS to allow cross-origin requests.
*   **Registering Blueprints:** It registers the API and WebSocket blueprints, which contain the application's routes.

## Configuration Management

The `app/core/config.py` file is responsible for managing all the configuration for the backend application. The `Settings` class:

*   **Loads Environment Variables:** It loads environment variables from a `.env` file.
*   **Provides Default Values:** It provides default values for all configuration options.
*   **Validates Configuration:** It validates that all required configuration options are present.

## API Routes

The `app/routes/api.py` file defines the REST API endpoints for the backend:

*   **/api/logs**: Fetches the captured logs from the backend.
*   **/api/logs/clear**: Clears all the logs on the backend.
*   **/ping**: A simple endpoint to check if the backend is alive.

## WebSocket Route

The `app/routes/websocket.py` file defines the WebSocket endpoint for the backend:

*   **/listen**: The main WebSocket endpoint for real-time communication with the Gemini Live API.

## WebSocket Handler

The `app/handlers/websocket_handler.py` file is the core of the backend's real-time communication. The `WebSocketHandler` class is responsible for:

*   **Handling WebSocket Connections:** It accepts and manages WebSocket connections from clients.
*   **Managing Gemini Live API Sessions:** It creates and manages the Gemini Live API session.
*   **Orchestrating Data Flow:** It orchestrates the flow of data between the client, the Gemini API, and the tool implementations.
*   **Asynchronous Task Management:** It uses `asyncio` to create and manage tasks for handling client input and Gemini API responses, ensuring non-blocking operation.
*   **Tool Result Queue:** It uses a `tool_results_queue` to handle the results of long-running tool calls, maintaining a responsive system.

## Client Input Handler

The `app/handlers/client_input_handler.py` file is responsible for handling all input from the client over the WebSocket connection. The `ClientInputHandler` class:

*   **Receives Client Data:** It continuously receives data from the WebSocket, handling both text and audio.
*   **Forwards Audio to Gemini:** It forwards audio data directly to the Gemini Live API for real-time processing.
*   **Handles Text Messages:** It handles text messages from the client, which can be control signals or text prompts for the Gemini API.
*   **Buffers Audio:** It includes an audio buffering mechanism to prevent data loss if the client is not ready to receive audio.

## Gemini Response Handler

The `app/handlers/gemini_response_handler.py` file is responsible for handling all responses from the Gemini Live API. The `GeminiResponseHandler` class:

*   **Receives Gemini Responses:** It continuously receives responses from the Gemini API, including audio, text, tool calls, and errors.
*   **Processes Responses:** It uses a set of sub-processors to handle different types of responses:
    *   **`AudioProcessor`**: Forwards audio data to the client.
    *   **`TranscriptionProcessor`**: Forwards transcriptions to the client.
    *   **`ToolCallProcessor`**: Executes tool calls and sends the results back to the Gemini API.
*   **Delayed Tool Responses:** It uses a `pending_tool_responses` queue to delay the sending of tool responses until the current turn is complete, ensuring a smoother user experience.

## Audio Processor

The `app/handlers/audio_processor.py` file is responsible for processing audio responses from the Gemini Live API. The `AudioProcessor` class:

*   **Processes Audio Responses:** It handles audio data received from the Gemini API.
*   **Buffers Audio:** It buffers incoming audio chunks if the client is not ready to receive them, preventing data loss.
*   **Handles Buffer Timeouts:** It automatically flushes the audio buffer if the client doesn't become ready within a specified time.
*   **Sends Audio to Client:** It sends audio data to the client, along with metadata such as sequence numbers and timestamps.
*   **Manages Buffer Pressure:** It monitors the audio buffer and sends warnings to the client if the buffer is getting full.

## Transcription Processor

The `app/handlers/transcription_processor.py` file is responsible for processing transcription data from the Gemini Live API. The `TranscriptionProcessor` class:

*   **Processes Transcriptions:** It handles both user and model speech-to-text transcriptions.
*   **Accumulates Text:** It accumulates transcription text for the current utterance.
*   **Sends Updates to Client:** It sends real-time transcription updates to the client.
*   **Handles Completion Events:** It handles completion events from the Gemini API to finalize transcriptions and reset utterance states.

## Tool Call Processor

The `app/handlers/tool_call_processor.py` file is responsible for processing and executing tool calls from the Gemini Live API. The `ToolCallProcessor` class:

*   **Processes Tool Calls:** It receives tool calls from the Gemini API.
*   **Asynchronous Execution:** It uses a `CallbackBasedFunctionRegistry` to execute tool functions asynchronously, preventing long-running tasks from blocking the main thread.
*   **Callback-Based Approach:** It uses a callback-based approach to handle the results of tool calls, allowing the conversation to continue smoothly while the tool is executing in the background.

## Audio Utilities

The `app/utils/audio.py` file provides utility classes for handling audio data:

*   **`AudioBuffer`**: Manages a buffer of audio chunks, with features for adding, flushing, and handling buffer overflow.
*   **`AudioMetadata`**: Creates metadata for audio chunks, including sequence numbers, timestamps, and expected duration.

## Logging Utilities

The `app/utils/logging.py` file provides utility classes for capturing and managing logs:

*   **`StdoutTee`**: A custom stdout handler that captures all output written to `sys.stdout` and stores it in a list, while also forwarding it to the original `sys.stdout`.
*   **`LogCapture`**: Manages the log capturing process, with methods for starting, stopping, getting, and clearing logs.

## Data and Business Logic

The application's data and business logic are primarily located in `app/data/travel_mock_data.py`. This file contains:

*   **Mock Data:** A comprehensive set of mock data for flights, hotels, bookings, destinations, activities, and weather.
*   **Business Logic:** Python functions that implement the core business logic for searching, booking, and managing travel.
*   **Data Store:** An in-memory dictionary (`MOCK_DATA_STORE`) that holds all the mock data.
*   **Logging:** A structured logging system to record all travel API interactions.

## Available Tools

The application provides a set of tools that the Gemini model can use to interact with the travel booking system. These tools are defined in `app/tools/declarations.py` and include:

*   **`take_a_nap`**: A dummy function for testing long-running tool calls.
*   **`NameCorrectionAgent`**: Handles name corrections and changes for a given booking.
*   **`SpecialClaimAgent`**: Manages special claims for flight-related issues.
*   **`Enquiry_Tool`**: Retrieves relevant documentation for user queries.
*   **`Eticket_Sender_Agent`**: Sends e-tickets to users via email or WhatsApp.
*   **`ObservabilityAgent`**: Tracks the refund status for a given booking.
*   **`DateChangeAgent`**: Quotes penalties or executes date changes for an itinerary.
*   **`Connect_To_Human_Tool`**: Allows the user to connect with a human agent.
*   **`Booking_Cancellation_Agent`**: Quotes penalties or executes cancellations for a booking.
*   **`Flight_Booking_Details_Agent`**: Retrieves the full itinerary for a given booking.
*   **`Webcheckin_And_Boarding_Pass_Agent`**: Handles web check-in and sends boarding passes.

## Tool Implementation

The tools are implemented in `app/tools/implementations.py` using an asynchronous, non-blocking pattern:

*   **Asynchronous Execution:** Each tool is executed as an asynchronous task using `asyncio.create_task`.
*   **Immediate Feedback:** When a tool is called, it immediatelyreturns a `PENDING` status to the user.
*   **Background Processing:** The tool then continues to execute in the background.
*   **Proactive Responses:** Once the tool has finished its work, it puts a message on a queue, which is then sent to the user, providing a proactive update.

## Tool Registry and Execution

The `app/tools/registry.py` file is responsible for managing and executing the tools:

*   **Tool Registry:** It creates a `travel_tool` instance that contains all the function declarations and a mapping of function names to their implementations.
*   **Callback-Based Execution:** The `CallbackBasedFunctionRegistry` class executes tool functions asynchronously using a callback-based approach. This prevents long-running tasks from blocking the main thread and allows for a more responsive system.

## Gemini Client and System Instruction

The `app/services/gemini_client.py` file manages the Gemini client and the system instruction:

*   **Gemini Client:** The `GeminiClientManager` class initializes and configures the Gemini client, which can be backed by either Vertex AI or a Gemini API key.
*   **System Instruction:** The system instruction defines the persona of the AI assistant, "Myra," and provides detailed guidelines on how to interact with users, including when to use specific tools and how to format responses.

# Frontend Conventions

*   The main React component is `src/App.js`.
*   The application uses custom hooks to manage state and side effects.
*   WebSockets are used for real-time communication with the backend.

## Session Hook

The `frontend/src/hooks/useSession.js` file is the master hook that brings together all the other hooks and provides the main application logic for the frontend. The `useSession` hook is responsible for:

*   **Session Management:** It manages the overall session state, including whether the session is active, the selected language, and the text input value.
*   **Logging:** It uses the `useAppLogger` hook to manage the application logs.
*   **Tool Logs:** It uses the `useToolLogs` hook to manage the tool logs.
*   **Audio:** It uses the `useAudio` hook to manage the audio processing pipeline.
*   **Communication:** It uses the `useCommunication` hook to manage the WebSocket communication with the backend.
*   **User Actions:** It provides a set of functions that can be used to handle user actions, such as starting and stopping the session, sending text messages, and so on.

## Audio Hook

The `frontend/src/hooks/useAudio.js` file is the heart of the frontend's audio processing pipeline. The `useAudio` hook is responsible for:

*   **Audio Context Management:** It creates and manages the `AudioContext`, and includes logic for recovering it if it enters a bad state.
*   **Audio Processor Management:** It creates and manages the `AudioWorkletProcessor` (or a `ScriptProcessorNode` fallback) for processing raw audio data.
*   **Audio Buffer Management:** It uses an `AudioBufferManager` to buffer audio data before sending it to the backend.
*   **Network Resilience:** It uses a `NetworkResilienceManager` to handle network issues, such as high latency and packet loss.
*   **VAD (Voice Activity Detection):** It includes a VAD implementation for barge-in.
*   **Event Handling:** It sets up a comprehensive set of event handlers to monitor the state of the audio system.
*   **User Controls:** It provides functions for controlling the audio system, such as starting, stopping, muting, and unmuting the microphone.

## Communication Hook

The `frontend/src/hooks/useCommunication.js` file is the other half of the frontend's real-time communication pipeline. The `useCommunication` hook is responsible for:

*   **WebSocket Connection Management:** It creates and manages the WebSocket connection to the backend, including handling connection errors and reconnecting.
*   **Data Transmission:** It provides a `sendAudioChunkWithBackpressure` function for sending audio data to the backend, with logic for handling backpressure.
*   **Data Reception:** It sets up an `onmessage` handler to process incoming messages from the backend, including audio, transcriptions, and control signals.
*   **Audio Playback:** It uses a `playAudioFromQueue` function with a jitter buffer to ensure smooth audio playback.
*   **Turn Tracking:** It includes a sophisticated turn tracking system to manage the flow of conversation.
*   **Error Handling:** It includes comprehensive error handling for the communication process.

## App Logger Hook

The `frontend/src/hooks/useAppLogger.js` file provides a custom hook for managing the application's logs. The `useAppLogger` hook:

*   **Stores Logs:** It uses the `useState` hook to store the application's logs in an array.
*   **Adds Log Entries:** It provides an `addLogEntry` function for adding new log entries to the array.
*   **Clears Logs:** It provides a `clearLogs` function for clearing all the logs from the array.
	
## Tool Logs Hook

The `frontend/src/hooks/useToolLogs.js` file provides a custom hook for fetching and managing the tool call logs from the backend. The `useToolLogs` hook:

*   **Fetches Tool Call Logs:** It uses the `fetch` API to make a GET request to the `/api/logs` endpoint on the backend.
*   **Polling:** It uses `setInterval` to poll the backend for new tool call logs every 15 seconds.
*   **Filtering and Formatting:** It filters the logs to only include tool call logs, and it formats them in a way that's easy to display in the UI.
*   **State Management:** It uses the `useState` hook to store the tool call logs and the loading state.

## Audio Buffer Manager

The `frontend/src/utils/audioBufferManager.js` file provides a sophisticated audio buffer management system. The `AudioBufferManager` class:

*   **Manages Audio Buffers:** It uses an `AdaptiveRingBuffer` to efficiently manage audio data.
*   **Monitors Connection Quality:** It uses a `ConnectionQualityMonitor` to monitor the network connection and adapt the audio streaming accordingly.
*   **Provides Performance Metrics:** It provides a comprehensive set of performance metrics, including buffer health, latency, and adaptive actions.

## Audio Utilities

The `frontend/src/utils/audioUtils.js` file provides a collection of utility classes and functions to support the audio processing pipeline, including:

*   **`AudioMemoryManager`**: Manages memory for the audio processing pipeline.
*   **`AudioCircuitBreaker`**: An implementation of the circuit breaker pattern for error handling.
*   **`AudioConverter`**: Provides functions for converting audio data between different formats.
*   **`BrowserCompatibility`**: Checks the browser's support for various audio-related features.
*   **`AudioPerformanceMonitor`**: Monitors the performance of the audio processing pipeline.
*   **`AudioErrorRecovery`**: Provides functions for recovering from errors in the audio processing pipeline.

## Network Resilience Manager

The `frontend/src/utils/networkResilienceManager.js` file provides a comprehensive network resilience manager. The `NetworkResilienceManager` class:

*   **Manages WebSocket Backpressure:** It uses a `WebSocketBackpressureManager` to handle backpressure on the WebSocket connection.
*   **Monitors Network Quality:** It uses a `NetworkQualityMonitor` to monitor the quality of the network connection.
*   **Adapts to Network Conditions:** It can adapt the audio streaming to the changing network conditions.

## Script Processor Fallback

The `frontend/src/utils/scriptProcessorFallback.js` file provides a fallback for older browsers that don't support the `AudioWorklet` API. The `createAudioProcessor` function:

*   **Detects `AudioWorklet` Support:** It checks if the browser supports the `AudioWorklet` API.
*   **Creates `AudioWorkletProcessor`:** If `AudioWorklet` is supported, it creates an `AudioWorkletWrapper` that provides a consistent interface.
*   **Creates `ScriptProcessorFallback`:** If `AudioWorklet` is not supported, it creates a `ScriptProcessorFallback` that uses the deprecated `ScriptProcessorNode` API.

## WebSocket Utilities

The `frontend/src/utils/webSocketUtils.js` file provides a set of utility functions for managing the WebSocket connection and ensuring reliable audio data transmission. These functions include:

*   **`sendAudioReadySignal`**: Sends a signal to the backend to indicate that the client is ready to receive audio data.
*   **`isWebSocketReady`**: Checks if the WebSocket connection is ready for audio transmission, using a multi-layered validation approach.
*   **`guaranteedAudioTransmission`**: Sends audio data to the backend with a guarantee of delivery, using a multi-layered fallback system.

## Helper Functions

The `frontend/src/utils/helpers.js` file provides a `generateUniqueId` function that is used to generate unique IDs for various purposes, such as identifying log entries and transcription messages.

## Constants

The `frontend/src/utils/constants.js` file defines a set of constants that are used throughout the frontend application, including:

*   **Audio Sample Rates:** The input and output sample rates for the audio processing pipeline.
*   **Buffer Sizes:** The size of the microphone buffer and the jitter buffer.
*   **Network-Related Constants:** The WebSocket send buffer limit, the maximum number of retry attempts, and the base delay for retries.
*   **Audio Context Recovery Constants:** The maximum number of recovery attempts and the delay between attempts.
*   **Languages:** A list of the languages that are supported by the application.
*   **Backend Host:** The hostname of the backend server.

## Debug Configuration

The `frontend/src/config/debug.js` file provides a set of debug logging functions. It allows the developers to enable or disable debug logging at runtime, which is a very useful feature for debugging the application.

## Action Controls

The `frontend/src/components/ActionControls.js` file is a React component that renders the main action controls in the UI. It allows the user to:

*   **Start and Stop the Session:** The user can start and stop the voice session.
*   **Mute and Unmute the Microphone:** The user can mute and unmute the microphone.
*   **Visualize Audio Levels:** The component also includes an `AudioWave` component that visualizes the audio levels.

## Audio Wave

The `frontend/src/components/AudioWave.js` file is a React component that visualizes the audio levels. It takes an array of audio levels as a prop and renders a set of spans that are scaled to represent the audio levels.

## Console Panel

The `frontend/src/components/ConsolePanel.js` file is a React component that renders the console panel in the UI. It allows the user to:

*   **View Logs:** The user can view the application's logs.
*   **Send Text Messages:** The user can send text messages to the backend.

## Control Bar

The `frontend/src/components/ControlBar.js` file is a container component that renders the `ActionControls` and `StatusIndicators` components.

## Main Panel

The `frontend/src/components/MainPanel.js` file is a React component that displays the transcriptions of the conversation between the user and the AI.

## Status Indicators

The `frontend/src/components/StatusIndicators.js` file is a React component that displays the status of the application, including:

*   **Language Selector:** A dropdown that allows the user to select the language for the session.
*   **WebSocket Status:** The current status of the WebSocket connection.
*   **Session Status:** Whether the session is active or inactive.
*   **Audio Health:** The health of the audio system.
*   **Network Quality:** The quality of the network connection.
*   **Buffer Metrics:** The fill levels of the input and output buffers.

## Audio Visualization Hook

The `frontend/src/hooks/useAudioVisualization.js` file provides a custom hook for generating the audio visualization that's displayed in the UI. The `useAudioVisualization` hook:

*   **Generates Audio Levels:** It uses a `requestAnimationFrame` loop to generate a new set of audio levels for each frame.
*   **Starts and Stops the Visualization:** It provides `startVisualization` and `stopVisualization` functions to control the audio visualization.
*   **State Management:** It uses the `useState` hook to store the current audio levels.

## Frontend Resilience

The frontend includes a robust system to ensure reliable WebSocket communication and audio transmission. This system includes:

*   **Multi-Layered WebSocket Validation:** A comprehensive validation system to ensure the WebSocket is ready for data transmission.
*   **Circuit Breaker with Auto-Recovery:** A circuit breaker pattern to prevent repeated failures, with an auto-recovery mechanism.
*   **Fallback Transmission System:** A multi-layered fallback system for sending audio data to the backend.
*   **Periodic Health Monitoring:** A system that periodically checks the health of the WebSocket connection and attempts to recover from any issues.

## Enhanced Audio Processing

The frontend features a production-ready audio processing pipeline with the following capabilities:

*   **Adaptive Buffering:** The system uses adaptive ring buffers that dynamically resize based on usage patterns to optimize latency.
*   **Network Resilience:** A network resilience manager handles WebSocket backpressure, with adaptive thresholds, priority-based queuing, and a circuit breaker for automatic failure detection and recovery.
*   **Memory Management:** An audio memory manager with object pooling is used to reduce garbage collection and track memory usage.
*   **Browser Compatibility:** The system automatically falls back to a `ScriptProcessorNode` in older browsers that do not support `AudioWorklet`.
*   **Performance Monitoring:** The system provides real-time metrics for buffer fill levels, latency, network quality, and overall audio health.

## Voice Activity Detection (VAD)

The application uses a dual VAD system for accurate barge-in detection:

*   **Frontend VAD:** The frontend uses its own VAD to detect user speech during Gemini's playback, allowing for immediate interruption (barge-in).
*   **Backend VAD:** The backend also has a VAD system.
*   **Configuration:** The VAD system can be configured via environment variables in both the frontend (`.env` file with `REACT_APP_DISABLE_VAD`) and backend (`.env` file with `DISABLE_VAD`).
*   **Debugging:** The project includes a detailed VAD debugging guide (`VAD_DEBUG_GUIDE.md`) with enhanced logging to monitor VAD state and troubleshoot issues.

# General

*   The project includes `cloudbuild.yaml` files for automated deployment to Google Cloud.
*   Both the frontend and backend have `Dockerfile`s for containerization.