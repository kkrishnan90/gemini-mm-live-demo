"""
API route definitions.
"""

from quart import Blueprint, jsonify
from datetime import datetime, timezone

from app.utils.logging import log_capture
from app.data.travel_mock_data import GLOBAL_LOG_STORE, clear_global_log_store

api_bp = Blueprint('api', __name__)


@api_bp.route("/api/logs", methods=["GET"])
async def get_logs():
    """API endpoint to fetch captured logs."""
    # Combine logs from global store and captured stdout logs
    captured_logs = log_capture.get_logs()
    combined_logs = list(GLOBAL_LOG_STORE) + captured_logs
    
    return jsonify(combined_logs)


@api_bp.route("/api/logs/clear", methods=["POST"])
async def clear_logs():
    """API endpoint to clear all logs."""
    try:
        clear_global_log_store()
        log_capture.clear_logs()  # Also clear captured logs
        return jsonify({
            "status": "success",
            "message": "All logs cleared successfully",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Failed to clear logs: {str(e)}",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }), 500


@api_bp.route("/ping", methods=["GET", "HEAD"])
async def ping():
    """Simple ping endpoint for connection quality testing."""
    return jsonify({
        "status": "ok", 
        "timestamp": datetime.now(timezone.utc).isoformat()
    })