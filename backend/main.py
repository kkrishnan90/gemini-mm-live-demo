"""
Main application entry point for Gemini Live Travel Assistant Backend.

This is the refactored main module that uses modular components for
clean separation of concerns and maintainability.
"""

import sys

from app.core.app import create_app
from app.core.config import settings
from app.utils.logging import log_capture

# Initialize log capturing
log_capture.start_capture()

# Print configuration info
print(f"🤖 Using Gemini model: {settings.GEMINI_MODEL_NAME}")
print(f"🎙️ Voice Activity Detection: {'DISABLED' if settings.DISABLE_VAD else 'ENABLED'}")

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
        log_capture.stop_capture()
    except Exception as e:
        print(f"❌ Failed to start server: {e}")
        log_capture.stop_capture()
        sys.exit(1)