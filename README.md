# Cymbol Travels - Multimodal Live Travel Assistant

**Cymbol Travels** is a fictitious travel company showcasing cutting-edge AI-powered customer support. This project demonstrates a real-time voice-enabled travel assistant built with Google's Gemini Live API, featuring WebSocket-based audio streaming and comprehensive travel booking operations.

## Core features of the application

- **Real-time Audio Streaming**: WebSocket-based bidirectional audio with Gemini Live API.
- **Voice Activity Detection**: Configurable sensitivity settings with smart start/end detection.
- **Audio Enhancement**: Noise suppression worklets and audio quality monitoring.
- **Buffer Management**: Overflow protection and configurable audio queue management.
- **Network Resilience**: Connection stability management during unstable network conditions.
- **Booking Management**: Retrieve detailed flight/hotel booking information with full itineraries.
- **Cancellation Processing**: Quote-and-confirm cancellation flow with penalty calculations.
- **Web Check-in & Boarding**: Automated check-in with boarding pass generation.
- **E-ticket Delivery**: Multi-channel e-ticket sending (email, SMS, WhatsApp).
- **Date Modifications**: Change travel dates with dynamic penalty calculations.
- **Name Corrections**: Handle various types of name correction requests.
- **Special Claims**: Process and track special assistance requests.
- **Multi-language Support**: Supports 10+ languages including English, Hindi, and Spanish.
- **Advanced Monitoring & Debugging**: Structured logging, real-time tool tracking, and audio diagnostics.

## Project Structure

The application is composed of a Python/Quart backend and a React.js frontend.

### Backend (`backend/`)

A Python server built with the Quart web framework. It handles the WebSocket connection, audio streaming to and from the Gemini Live API, and executes tool calls for travel-related queries.

- `main.py`: Application entry point.
- `app/core/app.py`: Main Quart application factory.
- `app/core/config.py`: Environment configuration.
- `app/handlers/`: WebSocket and audio processing handlers.
- `app/services/gemini_client.py`: Gemini Live API client.
- `app/tools/`: Travel booking agents (declarations, implementations, registry).
- `app/data/travel_mock_data.py`: Mock travel API responses.

### Frontend (`frontend/`)

A React.js single-page application that provides the user interface. It captures audio from the microphone, sends it to the backend via WebSockets, and displays the real-time transcription and responses from the Gemini assistant.

- `src/App.js`: Main React component.
- `src/hooks/`: Custom React Hooks for session, audio, and communication management.
- `src/components/`: Modular UI components.
- `src/utils/`: Utility functions for audio processing, network resilience, and WebSocket management.
- `public/audio-processor.js`: Audio worklet implementation.

## Installation of backend

1.  **Navigate to the backend directory**:
    ```bash
    cd backend
    ```
2.  **Create and activate a virtual environment**:
    ```bash
    python -m venv venv
    source venv/bin/activate
    ```
3.  **Install the required dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

## Running the backend locally - on Vertex AI

1.  **Set up the environment variables**:
    - Copy the `.env.example` file to `.env`.
    - Set `GOOGLE_GENAI_USE_VERTEXAI` to `true`.
    - Set `GOOGLE_CLOUD_PROJECT_ID` to your Google Cloud project ID.
    - Set `GOOGLE_CLOUD_LOCATION` to your Google Cloud location (e.g., `us-central1`).
2.  **Start the server**:
    ```bash
    hypercorn main:app --bind 0.0.0.0:8000
    ```

## Installation of frontend

1.  **Navigate to the frontend directory**:
    ```bash
    cd frontend
    ```
2.  **Install the required dependencies**:
    ```bash
    npm install
    ```

## Running the frontend locally

1.  **Start the development server**:
    ```bash
    npm start
    ```
2.  **Open your browser and navigate to `http://localhost:3000`.**

## Function calls in the backend

The backend exposes a set of tools for the Gemini model to use for travel-related queries:

- `take_a_nap`: A dummy function for testing long-running tool calls.
- `NameCorrectionAgent`: Handles name corrections and changes for a given booking.
- `SpecialClaimAgent`: Manages special claims for flight-related issues.
- `Enquiry_Tool`: Retrieves relevant documentation for user queries.
- `Eticket_Sender_Agent`: Sends e-tickets to users via email or WhatsApp.
- `ObservabilityAgent`: Tracks the refund status for a given booking.
- `DateChangeAgent`: Quotes penalties or executes date changes for an itinerary.
- `Connect_To_Human_Tool`: Allows the user to connect with a human agent.
- `Booking_Cancellation_Agent`: Quotes penalties or executes cancellations for a booking.
- `Flight_Booking_Details_Agent`: Retrieves the full itinerary for a given booking.
- `Webcheckin_And_Boarding_Pass_Agent`: Handles web check-in and sends boarding passes.

## Critical configurations (ignore GEMINI_API_KEY - focus on Vertex AI)

The following environment variables are critical for running the backend with Vertex AI:

- `GOOGLE_GENAI_USE_VERTEXAI`: Must be set to `true`.
- `GOOGLE_CLOUD_PROJECT_ID`: Your Google Cloud project ID.
- `GOOGLE_CLOUD_LOCATION`: The Google Cloud location for your project (e.g., `us-central1`).
- `GEMINI_MODEL_NAME`: The Gemini model to use (e.g., `gemini-live-2.5-flash`).
- `LANGUAGE_CODE`: The default language for the conversation (e.g., `en-US`).
- `VOICE_NAME`: The voice for the AI assistant (e.g., `Puck`).
- `DISABLE_VAD`: Whether to disable Voice Activity Detection.

## Architecture best practices

This project follows the best practices outlined in the [ARCHITECTURE_BEST_PRACTICES.md](https://github.com/kkrishnan90/gemini-mm-live-demo/blob/main/ARCHITECTURE_BEST_PRACTICES.md) document. This includes a modular architecture, asynchronous processing, and a resilient audio pipeline.

## Disclaimer

This is a demo application and is not 100% production ready which requires further tuning and adapting to the platforms of deployment.
