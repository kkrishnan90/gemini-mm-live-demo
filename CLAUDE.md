# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a real-time voice-enabled travel assistant built with Gemini Live API. The application features WebSocket-based audio streaming for seamless voice interactions and comprehensive travel booking functionality including flight search, hotel reservations, booking management, and destination information.

**Technology Stack:**
- **Backend**: Python/Quart WebSocket server with Gemini Live API integration
- **Frontend**: React.js web application with real-time audio processing
- **AI Integration**: Google Gemini 2.5 Live API for conversational AI
- **Deployment**: Docker containerization with Google Cloud Run support

## Development Commands

### Backend Development
```bash
cd backend

# Environment setup (using uv - preferred package manager)
uv venv
source .venv/bin/activate

# Install dependencies
uv pip install -r requirements.txt

# Development server
hypercorn main:app --bind 0.0.0.0:8000 --reload

# Alternative: using quart directly
quart run --host 0.0.0.0 --port 8000 --reload

# Testing
python -m pytest test_all_tools.py
```

### Frontend Development
```bash
cd frontend

# Install dependencies
npm install

# Development server
npm start

# Testing
npm test

# Production build
npm run build
```

## Environment Configuration

### Required Environment Variables
- `GEMINI_API_KEY`: Your Gemini API key (required for API-based authentication)
- `GOOGLE_GENAI_USE_VERTEXAI`: Set to "true" for Vertex AI authentication, "false" for API key
- `GOOGLE_CLOUD_PROJECT_ID`: Required when using Vertex AI (project: "account-pocs")
- `GOOGLE_CLOUD_LOCATION`: Required when using Vertex AI
- `GEMINI_MODEL_NAME`: Model to use (default: "gemini-2.5-flash-live-preview")
- `DISABLE_VAD`: Set to "true" to disable Voice Activity Detection

### Environment Files
- Always update `.env.example` when adding new environment variables
- Backend uses `python-dotenv` for environment variable loading
- Frontend proxy configuration points to backend service

## Architecture & Key Components

### Backend Architecture (`backend/`)
- **`main.py`**: Core WebSocket server handling Gemini Live API connections, audio streaming, and tool function execution
- **`gemini_tools.py`**: Function declarations and implementations for travel booking operations (cancellation, booking details, e-tickets, etc.)
- **`travel_mock_data.py`**: Mock travel data and API responses for development/testing

### Frontend Architecture (`frontend/src/`)
- **`App.js`**: Main React component handling WebSocket connections, audio recording/playback, and real-time transcription
- **`App.css`**: Complete styling for the voice interface
- **`public/audio-processor.js`**: Audio worklet for real-time audio processing at 16kHz input/24kHz output

### Audio Processing
- **Input**: 16kHz PCM audio from microphone
- **Output**: 24kHz audio from Gemini Live API
- **Buffer Management**: Configurable audio queue with overflow protection
- **Voice Activity Detection**: Configurable sensitivity settings

### Tool Functions
The backend implements comprehensive travel booking agents:
- `Flight_Booking_Details_Agent`: Retrieve full itinerary information
- `Booking_Cancellation_Agent`: Handle booking cancellations with quote/confirm flow
- `DateChangeAgent`: Process date changes with penalty calculations
- `Webcheckin_And_Boarding_Pass_Agent`: Handle web check-in and boarding passes
- `Eticket_Sender_Agent`: Send e-tickets via multiple channels
- `NameCorrectionAgent`: Handle various name correction types
- And others for comprehensive customer support

## Development Guidelines

### Python Development
- Use `uv` as the package manager for all Python operations
- Always activate virtual environment before running commands
- Use `google-genai` package for Generative AI integration with project-id "account-pocs"
- Use Gemini 2.5 Flash or Gemini 2.5 Pro models (model ids: `gemini-2.5-flash`, `gemini-2.5-pro`)
- Follow structured logging format for tool events and API interactions

### Frontend Development
- React 19+ with functional components and hooks
- FontAwesome icons for UI elements
- Real-time WebSocket communication with backend
- Audio worklet implementation for performance-critical audio processing

### Testing
- Backend: Use pytest for testing tool functions
- Frontend: Jest/React Testing Library for component testing
- Test audio processing with mock data from `travel_mock_data.py`

## Deployment

### Docker Support
Both backend and frontend include Dockerfile configurations:
- **Backend**: Python container with Quart server
- **Frontend**: Node.js build with nginx serving

### Google Cloud Platform
- Cloud Build configurations (`cloudbuild.yaml`) for automated deployment
- Cloud Run services for scalable WebSocket handling
- Environment variable injection through Cloud Run configuration

## Language Support

The application supports multiple Indian languages:
- English (Hinglish), Hindi, Marathi, Tamil, Bengali, Telugu, Gujarati, Kannada, Malayalam, Punjabi
- Language detection and response matching
- Numbers and booking IDs spoken in English digits regardless of conversation language

## Mock Data & Development

The `travel_mock_data.py` provides comprehensive mock responses for:
- Flight booking details and status
- Hotel reservations
- Booking cancellations and modifications
- Real-time logging of tool interactions

Use these mock responses during development to test the complete conversation flow without external API dependencies.