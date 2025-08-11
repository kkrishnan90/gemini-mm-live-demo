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

# Development server (with host check disabled for development)
npm start

# Testing
npm test

# Production build
npm run build

# Linting (if configured)
npm run lint
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
- **`App.js`**: Main React component coordinating session management and rendering panels
- **`hooks/useSession.js`**: Central session management hook integrating audio, communication, and logging
- **`hooks/useAudio.js`**: Audio processing hook managing microphone input, playback, and audio health monitoring
- **`hooks/useCommunication.js`**: WebSocket communication management with connection resilience
- **`components/`**: Modular UI components (ConsolePanel, MainPanel, ControlBar, StatusIndicators, ActionControls)
- **`utils/`**: Audio processing utilities including buffer management, network resilience, and WebSocket utilities
- **`public/audio-processor.js`**: Audio worklet for real-time audio processing at 16kHz input/24kHz output
- **`public/enhanced-audio-processor.js`**: Enhanced audio processor with advanced features

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

## Claude Code Development Rules

### Critical Development Constraints
1. **NEVER use any subagents or commands** - Work directly with available tools only
2. **Work and accomplish for ONLY what is asked by the user** - STRICTLY avoid over engineering without users explicit permissions
3. **IMPORTANT**: Explore, plan, debug, code, and review - **YOU MUST FOLLOW THIS PROCESS WITHOUT ANY SUBAGENTS**
4. **STRICTLY DO NOT BREAK ANYTHING WHILE ASKED TO REFACTOR OR BUG FIX** - EXISTING FUNCTIONAL CODE SHOULD BE INTACT

## Development Guidelines

### Python Development
- Use `uv` as the package manager for all Python operations
- Always activate virtual environment before running commands: `source .venv/bin/activate`
- Dependencies are managed via both `requirements.txt` and `pyproject.toml`
- Use `google-genai` package for Generative AI integration with project-id "account-pocs"
- Use Gemini 2.5 Flash or Gemini 2.5 Pro models (model ids: `gemini-2.5-flash`, `gemini-2.5-pro`)
- Follow structured logging format for tool events and API interactions
- Log capture system redirects stdout to frontend for real-time monitoring

### Frontend Development
- React 19+ with functional components and hooks pattern
- FontAwesome icons for UI elements (`@fortawesome/react-fontawesome`)
- Real-time WebSocket communication with backend
- Audio worklet implementation for performance-critical audio processing
- Modular hook-based architecture for session, audio, and communication management
- Development proxy configured to point to Cloud Run backend service
- Network resilience management for unstable connections

### Testing
- **Backend**: Use pytest for testing tool functions (`python -m pytest test_all_tools.py`)
- **Frontend**: Jest/React Testing Library for component testing (`npm test`)
- **Audio Testing**: Dedicated HTML test files in `frontend/public/` for audio diagnostics:
  - `audio-diagnostic-test.html`: Comprehensive audio system testing
  - `audio-input-debug.html`: Microphone input debugging
  - `quick-audio-test.html`: Quick audio functionality verification
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
- Global log store (`GLOBAL_LOG_STORE`) for tracking tool events

Use these mock responses during development to test the complete conversation flow without external API dependencies.

## Key Development Notes

### Audio Architecture
- The frontend implements a sophisticated audio processing pipeline with multiple fallback mechanisms
- Audio buffer management handles overflow protection and configurable queue sizes
- Network resilience manager provides connection stability during audio streaming
- Voice Activity Detection (VAD) can be disabled via environment variable for testing

### Component Architecture
- Frontend follows a modular component structure with separation of concerns
- Custom hooks manage complex state logic (audio, WebSocket communication, session management)
- Real-time logging system provides visibility into tool function execution
- Audio health monitoring and network quality assessment built-in

### Development Workflow
- Backend uses structured logging with JSON format for tool events
- Frontend proxy points to Cloud Run service for seamless development
- Multiple audio test utilities available for debugging audio processing issues
- Mock data integration allows full-stack testing without external API dependencies
- Use playwright MCP for any debugging to do screenshots or checking logs of the frontend
- The backend and frontend are running in --reload mode in their respective tmux windows. DO NOT try to run the application yourself