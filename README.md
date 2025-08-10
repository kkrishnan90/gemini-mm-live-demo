# Travel Assistant with Gemini Live API

A real-time voice-enabled travel assistant built with Gemini Live API, featuring WebSocket connections for seamless audio processing and comprehensive travel booking capabilities.

## Features

- 🎤 **Real-time Voice Processing**: WebSocket-based audio streaming with Gemini Live API
- ✈️ **Flight Search & Booking**: Search flights, check availability, and make bookings
- 🏨 **Hotel Reservations**: Find and book hotels with detailed information
- 📋 **Booking Management**: View, cancel, and manage all travel bookings
- 🌍 **Destination Information**: Get detailed information about travel destinations
- 🌤️ **Weather Updates**: Real-time weather information for cities
- 🎯 **Activity Recommendations**: Find and book activities at destinations
- 📊 **Structured Logging**: Real-time tool call logs and responses
- 🌐 **Multi-language Support**: English, Thai, and Indonesian language support

## Architecture

```
├── backend/          # Python/Quart WebSocket server
│   ├── main.py       # Main application server
│   ├── gemini_tools.py     # Gemini function declarations
│   ├── travel_mock_data.py # Mock travel API endpoints
│   └── requirements.txt    # Python dependencies
│
├── frontend/         # React.js web application
│   ├── src/
│   │   ├── App.js    # Main React component
│   │   └── App.css   # Styling
│   └── public/       # Static files
│
└── README.md         # This file
```

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Gemini API Key ([Get one here](https://makersuite.google.com/app/apikey))

### Backend Setup

1. **Navigate to backend directory**:
   ```bash
   cd backend
   ```

2. **Create and activate virtual environment**:
   ```bash
   python -m venv venv
   
   # On Windows
   venv\Scripts\activate
   
   # On macOS/Linux
   source venv/bin/activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env and add your GEMINI_API_KEY
   ```

5. **Start the server**:
   ```bash
   hypercorn main:app --bind 0.0.0.0:8000
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

3. **Start the development server**:
   ```bash
   npm start
   ```

4. **Open your browser**: Navigate to `http://localhost:3000`

## Usage

1. **Start a Session**: Click the "Start" button to begin a voice session
2. **Speak Naturally**: Use voice commands like:
   - "Search for flights from Mumbai to Dubai on February 15th"
   - "Find hotels in Dubai for February 15th to 17th"
   - "What's the weather like in Dubai?"
   - "Show me activities in Dubai"
   - "Book flight FL001 for John Doe"

3. **View Logs**: Monitor real-time tool calls and responses in the console panel
4. **Manage Audio**: Use mute/unmute controls and see audio wave indicators

## API Endpoints

### Travel Functions

- **searchFlights**: Find available flights
- **bookFlight**: Book a specific flight
- **getFlightStatus**: Check flight status by booking ID
- **searchHotels**: Find available hotels
- **bookHotel**: Book hotel rooms
- **getBookingDetails**: Get specific booking information
- **listUserBookings**: List all user bookings
- **cancelBooking**: Cancel existing bookings
- **getDestinationInfo**: Get destination information
- **getWeatherInfo**: Get weather data for cities
- **searchActivities**: Find activities in destinations

### WebSocket Endpoints

- `ws://localhost:8000/listen?lang=en-US`: Main WebSocket connection for audio streaming

### REST Endpoints

- `GET /api/logs`: Retrieve tool call logs and responses

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GEMINI_API_KEY` | Your Gemini API key | Required |
| `GOOGLE_GENAI_USE_VERTEXAI` | Use Vertex AI authentication | `false` |

### Language Support

Supported language codes:
- `en-US`: English (United States)
- `th-TH`: Thai (Thailand)  
- `id-ID`: Indonesian (Indonesia)

## Development

### Mock Data

The system uses comprehensive mock data for travel services:

- **Sample Flights**: Emirates, Air India, IndiGo flights
- **Sample Hotels**: Taj Mahal Palace, The Leela Palace, Grand Hyatt, Burj Al Arab
- **Sample Destinations**: Dubai, Goa with attractions and information
- **Sample Activities**: Sightseeing, adventure activities
- **Weather Data**: Current conditions and forecasts

### Logging

Structured logging captures:
- Tool function invocations with parameters
- API responses and status codes
- Real-time audio processing events
- WebSocket connection status
- Error handling and debugging information

### Audio Processing

- **Input Sample Rate**: 16kHz PCM audio
- **Output Sample Rate**: 24kHz audio
- **Buffer Size**: 4096 samples
- **Real-time Processing**: Continuous audio streaming with barge-in support

## Deployment

### Docker Support

Both backend and frontend include Dockerfile configurations for containerized deployment.

### Google Cloud Platform

Includes Cloud Build configurations (`cloudbuild.yaml`) for automated deployment to Google Cloud Run.

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make changes and test thoroughly
4. Commit with descriptive messages
5. Push and create a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues and questions:
- Check existing [GitHub Issues](https://github.com/kkrishnan90/mmt-live-api/issues)
- Create a new issue with detailed description
- Include logs and error messages when reporting bugs

## Acknowledgments

- Built with [Gemini Live API](https://ai.google.dev/gemini-api/docs/live)
- Frontend powered by [React.js](https://reactjs.org/)
- Backend powered by [Quart](https://quart.palletsprojects.com/)
- WebSocket handling via [websockets](https://websockets.readthedocs.io/)