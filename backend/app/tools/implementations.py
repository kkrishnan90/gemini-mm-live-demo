"""
Tool function implementations for travel booking operations.

This module contains the actual implementation of the travel booking tools.
Each function corresponds to a declared tool in declarations.py and provides
the business logic for handling various travel-related operations.
"""

import json
from datetime import datetime, timezone
import logging
import asyncio
from app.data.travel_mock_data import get_booking_details, send_eticket, validate_booking_exists

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(name)s - %(funcName)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


# Helper function for structured logging
def _log_tool_event(
    event_type: str, tool_name: str, parameters: dict, response: dict = None
):
    """Helper function to create and print a structured log entry for tool events."""
    log_payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "log_type": "TOOL_EVENT",
        "event_subtype": event_type,
        "tool_function_name": tool_name,
        "parameters_sent": parameters,
    }
    if response is not None:
        log_payload["response_received"] = response
    print(json.dumps(log_payload))


# --- Asynchronous Task Implementations ---

async def _name_correction_later(queue, correction_type: str, fn: str, ln: str):
    await asyncio.sleep(20)
    tool_name = "NameCorrectionAgent"
    params_sent = {"correction_type": correction_type, "fn": fn, "ln": ln}
    _log_tool_event("BACKGROUND_TASK_START", tool_name, params_sent)
    response = {
        "status": "SUCCESS",
        "message": f"Name correction of type {correction_type} for {fn} {ln} has been processed.",
    }
    system_message = {
        "role": "user",
        "parts": [
            {
                "text": f"[SYSTEM]: The name correction for {fn} {ln} is complete. Details: {json.dumps(response)}. Please inform the user."
            }
        ],
    }
    await queue.put(system_message)
    _log_tool_event("BACKGROUND_TASK_END", tool_name, params_sent, response)

async def _special_claim_later(queue, claim_type: str):
    await asyncio.sleep(20)
    tool_name = "SpecialClaimAgent"
    params_sent = {"claim_type": claim_type}
    _log_tool_event("BACKGROUND_TASK_START", tool_name, params_sent)
    response = {
        "status": "SUCCESS",
        "message": f"Special claim of type {claim_type} has been filed.",
    }
    system_message = {
        "role": "user",
        "parts": [
            {
                "text": f"[SYSTEM]: The special claim of type {claim_type} has been filed. Details: {json.dumps(response)}. Please inform the user."
            }
        ],
    }
    await queue.put(system_message)
    _log_tool_event("BACKGROUND_TASK_END", tool_name, params_sent, response)

async def _enquiry_tool_later(queue):
    await asyncio.sleep(20)
    tool_name = "Enquiry_Tool"
    params_sent = {}
    _log_tool_event("BACKGROUND_TASK_START", tool_name, params_sent)
    response = {
        "status": "SUCCESS",
        "message": "This is a mock response to your enquiry.",
    }
    system_message = {
        "role": "user",
        "parts": [
            {
                "text": f"[SYSTEM]: The enquiry has been resolved. Details: {json.dumps(response)}. Please inform the user."
            }
        ],
    }
    await queue.put(system_message)
    _log_tool_event("BACKGROUND_TASK_END", tool_name, params_sent, response)

async def _eticket_sender_later(queue, booking_id_or_pnr: str):
    await asyncio.sleep(20)
    tool_name = "Eticket_Sender_Agent"
    params_sent = {"booking_id_or_pnr": booking_id_or_pnr}
    _log_tool_event("BACKGROUND_TASK_START", tool_name, params_sent)
    response = send_eticket(booking_id_or_pnr)
    system_message = {
        "role": "user",
        "parts": [
            {
                "text": f"[SYSTEM]: The e-ticket for booking {booking_id_or_pnr} has been sent. Details: {json.dumps(response)}. Please inform the user."
            }
        ],
    }
    await queue.put(system_message)
    _log_tool_event("BACKGROUND_TASK_END", tool_name, params_sent, response)

async def _observability_agent_later(queue, operation_type: str):
    await asyncio.sleep(20)
    tool_name = "ObservabilityAgent"
    params_sent = {"operation_type": operation_type}
    _log_tool_event("BACKGROUND_TASK_START", tool_name, params_sent)
    response = {
        "status": "SUCCESS",
        "message": f"Refund status for {operation_type} is being tracked.",
    }
    system_message = {
        "role": "user",
        "parts": [
            {
                "text": f"[SYSTEM]: The refund status for {operation_type} is now available. Details: {json.dumps(response)}. Please inform the user."
            }
        ],
    }
    await queue.put(system_message)
    _log_tool_event("BACKGROUND_TASK_END", tool_name, params_sent, response)

async def _date_change_agent_later(queue, action: str, sector_info: list):
    await asyncio.sleep(20)
    tool_name = "DateChangeAgent"
    params_sent = {"action": action, "sector_info": sector_info}
    _log_tool_event("BACKGROUND_TASK_START", tool_name, params_sent)
    response = {
        "status": "SUCCESS",
        "message": f"Date change action '{action}' has been processed for the provided sectors.",
    }
    system_message = {
        "role": "user",
        "parts": [
            {
                "text": f"[SYSTEM]: The date change action '{action}' has been processed. Details: {json.dumps(response)}. Please inform the user."
            }
        ],
    }
    await queue.put(system_message)
    _log_tool_event("BACKGROUND_TASK_END", tool_name, params_sent, response)

async def _connect_to_human_tool_later(queue, reason_of_invoke: str, frustration_score: str = None):
    await asyncio.sleep(20)
    tool_name = "Connect_To_Human_Tool"
    params_sent = {
        "reason_of_invoke": reason_of_invoke,
        "frustration_score": frustration_score,
    }
    _log_tool_event("BACKGROUND_TASK_START", tool_name, params_sent)
    response = {"status": "SUCCESS", "message": "Connecting you to a human agent..."}
    system_message = {
        "role": "user",
        "parts": [
            {
                "text": f"[SYSTEM]: The connection to a human agent has been initiated. Details: {json.dumps(response)}. Please inform the user."
            }
        ],
    }
    await queue.put(system_message)
    _log_tool_event("BACKGROUND_TASK_END", tool_name, params_sent, response)

async def _booking_cancellation_agent_later(queue, booking_id_or_pnr: str, action: str, cancel_scope: str, otp: str, partial_info: list):
    await asyncio.sleep(20)
    tool_name = "Booking_Cancellation_Agent"
    params_sent = {
        "booking_id_or_pnr": booking_id_or_pnr,
        "action": action,
        "cancel_scope": cancel_scope,
        "otp": otp,
        "partial_info": partial_info,
    }
    _log_tool_event("BACKGROUND_TASK_START", tool_name, params_sent)
    validation = validate_booking_exists(booking_id_or_pnr)
    if not validation["is_valid"]:
        response = {
            "status": validation["status"],
            "message": validation["message"],
        }
    else:
        booking = validation["booking"]
        if action == "QUOTE":
            response = {
                "status": "SUCCESS",
                "message": f"Cancellation quote for booking {booking_id_or_pnr}: Refund amount ₹{booking['total_cost'] * 0.8:.0f}, Penalty ₹{booking['total_cost'] * 0.2:.0f}",
                "refund_amount": booking['total_cost'] * 0.8,
                "penalty": booking['total_cost'] * 0.2,
                "currency": booking['currency'],
            }
        else:
            response = {
                "status": "SUCCESS",
                "message": f"Booking {booking_id_or_pnr} has been successfully cancelled. Refund will be processed in 5-7 business days.",
                "booking_cancelled": True,
            }
    system_message = {
        "role": "user",
        "parts": [
            {
                "text": f"[SYSTEM]: The booking cancellation action '{action}' has been processed. Details: {json.dumps(response)}. Please inform the user."
            }
        ],
    }
    await queue.put(system_message)
    _log_tool_event("BACKGROUND_TASK_END", tool_name, params_sent, response)

async def _webcheckin_and_boarding_pass_agent_later(queue, booking_id_or_pnr: str, journeys: list):
    await asyncio.sleep(20)
    tool_name = "Webcheckin_And_Boarding_Pass_Agent"
    params_sent = {"booking_id_or_pnr": booking_id_or_pnr, "journeys": journeys}
    _log_tool_event("BACKGROUND_TASK_START", tool_name, params_sent)
    validation = validate_booking_exists(booking_id_or_pnr)
    if not validation["is_valid"]:
        response = {
            "status": validation["status"],
            "message": validation["message"],
        }
    else:
        booking = validation["booking"]
        if booking["type"] != "flight":
            response = {
                "status": "INVALID_BOOKING_TYPE",
                "message": f"Web check-in is only available for flight bookings. Booking {booking_id_or_pnr} is a {booking['type']} booking.",
            }
        else:
            response = {
                "status": "SUCCESS",
                "message": f"Web check-in completed for booking {booking_id_or_pnr}. Boarding passes have been sent to your registered email and mobile number.",
                "booking_type": booking["type"],
                "journeys_processed": len(journeys),
            }
    system_message = {
        "role": "user",
        "parts": [
            {
                "text": f"[SYSTEM]: The web check-in and boarding pass request has been processed. Details: {json.dumps(response)}. Please inform the user."
            }
        ],
    }
    await queue.put(system_message)
    _log_tool_event("BACKGROUND_TASK_END", tool_name, params_sent, response)

async def _take_a_nap_later(queue):
    await asyncio.sleep(30)
    tool_name = "take_a_nap"
    params_sent = {}
    _log_tool_event("BACKGROUND_TASK_START", tool_name, params_sent)
    response = {
        "status": "SUCCESS",
        "message": "I have slept really good, thanks for waking me up! 😴💤",
        "sleep_duration": "30 seconds",
        "wake_up_time": datetime.now(timezone.utc).isoformat()
    }
    system_message = {
        "role": "user",
        "parts": [
            {
                "text": f"[SYSTEM]: The nap is over. Details: {json.dumps(response)}. Please inform the user."
            }
        ],
    }
    await queue.put(system_message)
    _log_tool_event("BACKGROUND_TASK_END", tool_name, params_sent, response)

async def _fetch_and_send_details_later(queue, booking_id_or_pnr: str):
    """Simulates a long-running task to fetch booking details and sends them back to the session."""
    await asyncio.sleep(20)
    tool_name = "Flight_Booking_Details_Agent"
    params_sent = {"booking_id_or_pnr": booking_id_or_pnr}
    _log_tool_event("BACKGROUND_TASK_START", tool_name, params_sent)

    response = get_booking_details(booking_id_or_pnr)

    # Create a system message to send back to the model
    system_message = {
        "role": "user",
        "parts": [
            {
                "text": f"[SYSTEM]: The booking details for {booking_id_or_pnr} are now available. Here they are: {json.dumps(response)}. Please present this to the user."
            }
        ],
    }

    await queue.put(system_message)
    _log_tool_event("BACKGROUND_TASK_END", tool_name, params_sent, response)


# --- Tool Function Implementations (Synchronous Wrappers) ---

def NameCorrectionAgent(session, queue, correction_type: str, fn: str, ln: str) -> dict:
    asyncio.create_task(_name_correction_later(queue, correction_type, fn, ln))
    return {"status": "PENDING", "message": "Processing name correction..."}

def SpecialClaimAgent(session, queue, claim_type: str) -> dict:
    asyncio.create_task(_special_claim_later(queue, claim_type))
    return {"status": "PENDING", "message": "Filing special claim..."}

def Enquiry_Tool(session, queue) -> dict:
    asyncio.create_task(_enquiry_tool_later(queue))
    return {"status": "PENDING", "message": "Looking up information for your enquiry..."}

def Eticket_Sender_Agent(session, queue, booking_id_or_pnr: str) -> dict:
    asyncio.create_task(_eticket_sender_later(queue, booking_id_or_pnr))
    return {"status": "PENDING", "message": f"Sending e-ticket for booking {booking_id_or_pnr}..."}

def ObservabilityAgent(session, queue, operation_type: str) -> dict:
    asyncio.create_task(_observability_agent_later(queue, operation_type))
    return {"status": "PENDING", "message": f"Tracking refund status for {operation_type}..."}

def DateChangeAgent(session, queue, action: str, sector_info: list) -> dict:
    asyncio.create_task(_date_change_agent_later(queue, action, sector_info))
    return {"status": "PENDING", "message": f"Processing date change action '{action}'..."}

def Connect_To_Human_Tool(session, queue, reason_of_invoke: str, frustration_score: str = None) -> dict:
    asyncio.create_task(_connect_to_human_tool_later(queue, reason_of_invoke, frustration_score))
    return {"status": "PENDING", "message": "Connecting you to a human agent..."}

def Booking_Cancellation_Agent(session, queue, booking_id_or_pnr: str, action: str, cancel_scope: str = "NOT_MENTIONED", otp: str = "", partial_info: list = None) -> dict:
    asyncio.create_task(_booking_cancellation_agent_later(queue, booking_id_or_pnr, action, cancel_scope, otp, partial_info))
    return {"status": "PENDING", "message": f"Processing cancellation action '{action}' for booking {booking_id_or_pnr}..."}

def Flight_Booking_Details_Agent(session, queue, booking_id_or_pnr: str) -> dict:
    """
    Starts a background task to fetch booking details and immediately returns a pending message.
    """
    tool_name = "Flight_Booking_Details_Agent"
    params_sent = {"booking_id_or_pnr": booking_id_or_pnr}
    _log_tool_event("INVOCATION_START", tool_name, params_sent)

    # Start the background task
    asyncio.create_task(_fetch_and_send_details_later(queue, booking_id_or_pnr))

    # Immediately return a pending response
    response = {
        "status": "PENDING",
        "message": f"I'm fetching the details for booking {booking_id_or_pnr}. It might take a moment. You can continue our conversation in the meantime.",
    }
    _log_tool_event("INVOCATION_PENDING", tool_name, params_sent, response)
    return response

def Webcheckin_And_Boarding_Pass_Agent(session, queue, booking_id_or_pnr: str, journeys: list) -> dict:
    asyncio.create_task(_webcheckin_and_boarding_pass_agent_later(queue, booking_id_or_pnr, journeys))
    return {"status": "PENDING", "message": f"Processing web check-in for booking {booking_id_or_pnr}..."}

def take_a_nap(session, queue) -> dict:
    asyncio.create_task(_take_a_nap_later(queue))
    return {"status": "PENDING", "message": "I'm going to take a short nap... I'll be back in 30 seconds."}