"""
Core application factory and setup.
"""
from dotenv import load_dotenv
from quart import Quart
from quart_cors import cors

from app.core.config import settings
from app.routes.api import api_bp
from app.routes.websocket import websocket_bp


def create_app() -> Quart:
    """
    Create and configure the Quart application.
    
    Returns:
        Quart: Configured application instance
    """
    load_dotenv()
    
    # Print configuration info
    print(f"🤖 Using Gemini model: {settings.GEMINI_MODEL_NAME}")
    print(f"🎙️ Voice Activity Detection: {'DISABLED' if settings.DISABLE_VAD else 'ENABLED'}")

    app = Quart(__name__)
    
    # Configure CORS
    app = cors(app, allow_origin="*")
    
    # Register blueprints
    app.register_blueprint(api_bp)
    app.register_blueprint(websocket_bp)
    
    return app