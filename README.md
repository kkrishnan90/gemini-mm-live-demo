# Cymbol Travels - Multimodal Live Travel Assistant

**Cymbol Travels** is a fictitious travel company showcasing cutting-edge AI-powered customer support. This project demonstrates a real-time voice-enabled travel assistant built with Google's Gemini Live API, featuring WebSocket-based audio streaming and comprehensive travel booking operations.

## 🚀 What This Multimodal Live Workflow Does

This application demonstrates a complete **real-time conversational AI workflow** that:

- **Processes live audio streams** at 16kHz input/24kHz output with intelligent voice activity detection
- **Executes complex travel operations** including booking management, cancellations, web check-in, and e-ticket delivery
- **Handles multi-turn conversations** with context preservation and background task processing
- **Provides structured logging** of all tool interactions and API responses for transparency
- **Supports multiple languages** with intelligent language detection and response matching
- **Manages audio quality** with noise suppression, buffer management, and network resilience

## ✨ Core Features

### 🎤 **Advanced Audio Processing**
- **Real-time Audio Streaming**: WebSocket-based bidirectional audio with Gemini Live API
- **Voice Activity Detection**: Configurable sensitivity settings with smart start/end detection
- **Audio Enhancement**: Noise suppression worklets and audio quality monitoring
- **Buffer Management**: Overflow protection and configurable audio queue management
- **Network Resilience**: Connection stability management during unstable network conditions

### ✈️ **Comprehensive Travel Operations**
- **Booking Management**: Retrieve detailed flight/hotel booking information with full itineraries
- **Cancellation Processing**: Quote-and-confirm cancellation flow with penalty calculations
- **Web Check-in & Boarding**: Automated check-in with boarding pass generation
- **E-ticket Delivery**: Multi-channel e-ticket sending (email, SMS, WhatsApp)
- **Date Modifications**: Change travel dates with dynamic penalty calculations
- **Name Corrections**: Handle various types of name correction requests
- **Special Claims**: Process and track special assistance requests

### 🌍 **Multi-language Support**
- **Supported Languages**: English (Hinglish), Hindi, Marathi, Tamil, Bengali, Telugu, Gujarati, Kannada, Malayalam, Punjabi
- **Smart Language Detection**: Automatic conversation language detection
- **Consistent Numbers**: Booking IDs and numbers always spoken in English digits regardless of conversation language

### 📊 **Advanced Monitoring & Debugging**
- **Structured Logging**: JSON-formatted tool events with timestamps and parameters
- **Real-time Tool Tracking**: Live monitoring of background task execution
- **Audio Diagnostics**: Comprehensive audio system testing utilities
- **Network Quality Assessment**: Built-in connection stability monitoring

## 🏗️ Architecture

```
├── backend/                          # Python/Quart WebSocket Server
│   ├── app/
│   │   ├── core/
│   │   │   ├── app.py               # Main Quart application
│   │   │   └── config.py            # Environment configuration
│   │   ├── handlers/                # WebSocket & Audio Processing
│   │   │   ├── websocket_handler.py # WebSocket connection management
│   │   │   ├── audio_processor.py   # Audio stream processing
│   │   │   ├── gemini_response_handler.py # AI response processing
│   │   │   └── tool_call_processor.py     # Tool execution management
│   │   ├── services/
│   │   │   └── gemini_client.py     # Gemini Live API client
│   │   ├── tools/                   # Travel Booking Agents
│   │   │   ├── declarations.py      # Tool function schemas
│   │   │   ├── implementations.py   # Business logic implementations
│   │   │   └── registry.py          # Tool registration system
│   │   ├── data/
│   │   │   └── travel_mock_data.py  # Mock travel API responses
│   │   └── utils/
│   │       ├── audio.py             # Audio utility functions
│   │       └── logging.py           # Structured logging utilities
│   └── main.py                      # Application entry point
│
├── frontend/                        # React.js Web Application
│   ├── src/
│   │   ├── hooks/                   # Custom React Hooks
│   │   │   ├── useSession.js        # Session management coordination
│   │   │   ├── useAudio.js          # Audio processing & health monitoring
│   │   │   ├── useCommunication.js  # WebSocket management
│   │   │   ├── useToolLogs.js       # Tool event tracking
│   │   │   └── useAppLogger.js      # Application logging
│   │   ├── components/              # Modular UI Components
│   │   │   ├── MainPanel.js         # Primary interface
│   │   │   ├── ConsolePanel.js      # Real-time logs display
│   │   │   ├── ControlBar.js        # Audio controls
│   │   │   ├── StatusIndicators.js  # Connection & audio status
│   │   │   └── ActionControls.js    # Session management
│   │   ├── utils/                   # Utility Functions
│   │   │   ├── audioBufferManager.js        # Audio queue management
│   │   │   ├── networkResilienceManager.js  # Connection stability
│   │   │   ├── webSocketUtils.js            # WebSocket utilities
│   │   │   └── audioUtils.js                # Audio processing helpers
│   │   └── App.js                   # Main React component
│   └── public/
│       ├── audio-processor.js       # Audio worklet implementation
│       ├── enhanced-audio-processor.js # Advanced audio processing
│       ├── denoiser-worklet.js      # Noise suppression worklet
│       └── audio-diagnostic-*.html  # Audio testing utilities
```

## 🛠️ Setup Instructions

### Prerequisites

- **Python 3.11+** with `uv` package manager
- **Node.js 18+** with npm
- **Google Gemini API Key** ([Get one here](https://makersuite.google.com/app/apikey))

### Backend Setup

1. **Navigate to backend directory**:
   ```bash
   cd backend
   ```

2. **Create and activate virtual environment**:
   ```bash
   uv venv
   source .venv/bin/activate
   ```

3. **Install dependencies**:
   ```bash
   uv pip install -r requirements.txt
   ```

4. **Configure environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env and configure your settings (see Configuration section)
   ```

5. **Start the development server**:
   ```bash
   hypercorn main:app --bind 0.0.0.0:8000 --reload
   ```

### Frontend Setup

1. **Navigate to frontend directory**:
   ```bash
   cd frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start development server**:
   ```bash
   npm start
   ```

4. **Access the application**: Open `http://localhost:3000` in your browser

## ⚙️ Critical Configuration

### Required Environment Variables

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `GEMINI_API_KEY` | Your Gemini API key | ✅ | `AIza...` |
| `GOOGLE_GENAI_USE_VERTEXAI` | Use Vertex AI vs API key auth | ✅ | `false` |
| `GOOGLE_CLOUD_PROJECT_ID` | GCP Project ID (Vertex AI only) | 📝 | `account-pocs` |
| `GOOGLE_CLOUD_LOCATION` | GCP Region (Vertex AI only) | 📝 | `us-central1` |
| `GEMINI_MODEL_NAME` | Model variant to use | ✅ | `gemini-2.5-flash-live-preview` |
| `LANGUAGE_CODE` | Default conversation language | ✅ | `en-US` |
| `VOICE_NAME` | AI voice selection | ✅ | `Puck` |
| `DISABLE_VAD` | Disable Voice Activity Detection | ⚠️ | `false` |

**📝** = Required only when `GOOGLE_GENAI_USE_VERTEXAI=true`  
**⚠️** = Debugging/development only

### Audio Configuration

#### ✅ **Safe to Tweak**
- **Voice Activity Detection Sensitivity**: Adjust start/end sensitivity in `gemini_client.py`
- **Audio Buffer Sizes**: Modify buffer management in `audioBufferManager.js`
- **Language and Voice**: Change `LANGUAGE_CODE` and `VOICE_NAME` environment variables
- **Network Timeout Settings**: Adjust connection retry logic in `networkResilienceManager.js`

#### 🚫 **Do NOT Modify**
- **Audio Sample Rates**: 16kHz input/24kHz output (hardcoded for Gemini Live API compatibility)
- **WebSocket Message Formats**: Binary audio frame structure required by Gemini Live
- **Tool Function Schemas**: Breaking changes will cause tool execution failures
- **Core Audio Worklet Logic**: May cause audio processing instability

### Development vs Production

#### Development Mode
- **Backend**: Uses `--reload` flag for auto-restart on code changes
- **Frontend**: Development proxy points to Cloud Run service for seamless testing
- **Audio Testing**: Multiple HTML test utilities available in `frontend/public/`
- **Mock Data**: Comprehensive travel scenarios in `travel_mock_data.py`

#### Production Deployment
- **Docker Support**: Containerized deployment with optimized builds
- **Cloud Run Integration**: Automated deployment via Cloud Build
- **Environment Injection**: Secure environment variable management
- **Audio Optimization**: Production-optimized audio processing pipelines

## 🧪 Testing & Development

### Audio System Testing
```bash
# Open audio diagnostic tools
open frontend/public/audio-diagnostic-test.html    # Comprehensive testing
open frontend/public/audio-input-debug.html        # Microphone debugging  
open frontend/public/quick-audio-test.html         # Quick functionality check
```

### Backend Testing
```bash
cd backend
source .venv/bin/activate
python -m pytest tests/test_tools.py
```

### Frontend Testing
```bash
cd frontend
npm test
```

## 🏃‍♂️ Running Locally

### Development Workflow

1. **Start Backend** (Terminal 1):
   ```bash
   cd backend
   source .venv/bin/activate
   hypercorn main:app --bind 0.0.0.0:8000 --reload
   ```

2. **Start Frontend** (Terminal 2):
   ```bash
   cd frontend
   npm start
   ```

3. **Test Audio System**:
   - Ensure microphone permissions are granted
   - Check browser console for audio worklet loading
   - Use diagnostic tools for troubleshooting

4. **Monitor Real-time Logs**:
   - Backend logs: Terminal 1 shows structured JSON logs
   - Frontend logs: Browser DevTools console
   - Tool execution: ConsolePanel in the web interface

### Common Development Issues

- **Audio Worklet Loading Failures**: Check browser compatibility and HTTPS requirements
- **WebSocket Connection Issues**: Verify backend is running and ports are accessible
- **Tool Execution Failures**: Check backend logs for schema validation errors
- **Audio Quality Issues**: Use diagnostic tools to test microphone and network stability

## 🔧 Available Travel Operations

The system implements **12 specialized travel agents**:

| Agent | Purpose | Key Features |
|-------|---------|--------------|
| `Flight_Booking_Details_Agent` | Retrieve booking information | Full itinerary, passenger details, status |
| `Booking_Cancellation_Agent` | Handle cancellations | Quote/confirm flow, penalty calculation |
| `Webcheckin_And_Boarding_Pass_Agent` | Web check-in processing | Boarding pass generation, seat selection |
| `Eticket_Sender_Agent` | E-ticket delivery | Multi-channel sending (email/SMS/WhatsApp) |
| `NameCorrectionAgent` | Name corrections | Spelling fixes, legal name changes |
| `DateChangeAgent` | Travel date modifications | Date change penalties, availability check |
| `SpecialClaimAgent` | Special assistance | Wheelchair, dietary, medical requests |
| `ObservabilityAgent` | Refund tracking | Status updates, processing timelines |
| `Connect_To_Human_Tool` | Human escalation | Frustration detection, agent handoff |
| `Enquiry_Tool` | General inquiries | FAQ handling, information lookup |

## 🎯 Key Differentiators

### 🔄 **Asynchronous Tool Processing**
- Background task execution with real-time status updates
- Non-blocking conversation flow during long-running operations
- Automatic completion notifications via system messages

### 🎨 **Modular Frontend Architecture**
- Hook-based state management for complex audio and communication logic
- Separation of concerns with dedicated components for each UI function
- Reusable utility functions for audio processing and network management

### 🛡️ **Production-Ready Audio Pipeline**
- Multiple fallback mechanisms for audio processing failures
- Network resilience management for unstable connections
- Audio health monitoring with automatic quality adjustments

### 📈 **Comprehensive Observability**
- Structured JSON logging for all tool interactions
- Real-time monitoring of background task execution
- Audio diagnostic capabilities for troubleshooting

## 🚀 Deployment

### Local Development
Both backend and frontend include hot-reload capabilities for rapid development iteration.

### Cloud Deployment
- **Backend**: Google Cloud Run with auto-scaling WebSocket support
- **Frontend**: Static hosting with CDN distribution
- **Environment Management**: Secure secret injection via Cloud Run configuration

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For issues and questions:
- Check existing [GitHub Issues](https://github.com/your-repo/issues)
- Create a new issue with detailed logs and error messages
- Include audio diagnostic results when reporting audio-related issues

## 🙏 Acknowledgments

- **Google Gemini Live API**: Real-time conversational AI capabilities
- **React.js**: Frontend framework with advanced hooks architecture
- **Quart**: High-performance async Python web framework
- **WebSocket Technology**: Real-time bidirectional communication