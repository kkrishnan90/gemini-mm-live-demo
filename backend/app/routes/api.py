"""
API route definitions.
"""

from quart import Blueprint, jsonify
from datetime import datetime, timezone

from app.utils.logging import log_capture
from app.data.travel_mock_data import GLOBAL_LOG_STORE

api_bp = Blueprint('api', __name__)


@api_bp.route("/api/logs", methods=["GET"])
async def get_logs():
    """API endpoint to fetch captured logs."""
    # Combine logs from global store and captured stdout logs
    captured_logs = log_capture.get_logs()
    combined_logs = list(GLOBAL_LOG_STORE) + captured_logs
    
    return jsonify(combined_logs)


@api_bp.route("/ping", methods=["GET", "HEAD"])
async def ping():
    """Simple ping endpoint for connection quality testing."""
    return jsonify({
        "status": "ok", 
        "timestamp": datetime.now(timezone.utc).isoformat()
    })