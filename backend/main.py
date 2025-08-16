"""
Main application entry point for Gemini Live Travel Assistant Backend.

This is the refactored main module that uses modular components for
clean separation of concerns and maintainability.
"""

import sys
import signal
import atexit

from app.core.app import create_app
from app.core.config import settings
from app.utils.logging import log_capture
from app.data.travel_mock_data import clear_global_log_store

# Initialize log capturing and clear any existing logs
clear_global_log_store()  # Clear any existing logs from previous session
log_capture.start_capture()


def cleanup_on_exit():
    """Cleanup function to run on application exit."""
    print("🧹 Cleaning up application state...")
    clear_global_log_store()
    log_capture.stop_capture()
    print("✅ Cleanup completed")


def signal_handler(signum, frame):
    """Handle shutdown signals."""
    print(f"\n🛑 Received signal {signum}, shutting down gracefully...")
    cleanup_on_exit()
    sys.exit(0)


# Register cleanup functions
atexit.register(cleanup_on_exit)
signal.signal(signal.SIGINT, signal_handler)  # Ctrl+C
signal.signal(signal.SIGTERM, signal_handler)  # Termination signal

# Create the application
app = create_app()

if __name__ == "__main__":
    # This is mainly for development. In production, use hypercorn or another ASGI server
    import hypercorn.asyncio
    import hypercorn.config
    
    config = hypercorn.config.Config()
    config.bind = ["0.0.0.0:8000"]
    config.reload = True
    
    print("🚀 Starting Gemini Live Travel Assistant Backend...")
    print("🌐 Server will be available at http://0.0.0.0:8000")
    print("📡 WebSocket endpoint: ws://0.0.0.0:8000/listen")
    
    try:
        hypercorn.asyncio.serve(app, config)
    except KeyboardInterrupt:
        print("\n👋 Shutting down gracefully...")
        cleanup_on_exit()
    except Exception as e:
        print(f"❌ Failed to start server: {e}")
        cleanup_on_exit()
        sys.exit(1)