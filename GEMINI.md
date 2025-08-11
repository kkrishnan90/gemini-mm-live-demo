# Project Overview

This project is a real-time, voice-enabled travel assistant that uses the Gemini Live API. It features a WebSocket-based architecture for seamless audio processing and provides comprehensive travel booking capabilities. The application is composed of a Python/Quart backend and a React.js frontend.

**Key Technologies:**

*   **Backend:** Python, Quart, Google Gemini API, WebSockets
*   **Frontend:** React.js, WebSockets

**Architecture:**

The application follows a client-server architecture:

*   **Backend (`backend/`):** A Python server built with the Quart web framework. It handles the WebSocket connection, audio streaming to and from the Gemini Live API, and executes tool calls for travel-related queries.
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

# Development Conventions

*   **Backend:**
    *   The main application logic is in `main.py`.
    *   Tool functions for the Gemini API are defined in `gemini_tools.py`.
    *   Mock data for travel services is located in `travel_mock_data.py`.
*   **Frontend:**
    *   The main React component is `src/App.js`.
    *   The application uses WebSockets for real-time communication with the backend.
    *   The frontend includes features for network resilience and audio processing management.
*   **General:**
    *   The project includes `cloudbuild.yaml` files for automated deployment to Google Cloud.
    *   Both the frontend and backend have `Dockerfile`s for containerization.
