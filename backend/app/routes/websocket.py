"""
WebSocket route definitions.
"""

from quart import Blueprint

from app.handlers.websocket_handler import WebSocketHandler

websocket_bp = Blueprint('websocket', __name__)


@websocket_bp.websocket("/listen")
async def websocket_endpoint():
    """WebSocket endpoint for Gemini Live API communication."""
    handler = WebSocketHandler()
    await handler.handle_connection()