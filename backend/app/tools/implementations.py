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


# Tool Function Implementations

async def NameCorrectionAgent(correction_type: str, fn: str, ln: str) -> dict:
    """Processes name corrections for a booking.

    This agent handles various types of name corrections, including spelling
    corrections, name swaps, gender corrections, maiden name changes, and
    title removals.

    Args:
        correction_type (str): The type of name correction to perform.
            Supported values: "NAME_CORRECTION", "NAME_SWAP", "GENDER_SWAP",
            "MAIDEN_NAME_CHANGE", "REMOVE_TITLE".
        fn (str): The first name of the passenger.
        ln (str): The last name of the passenger.

    Returns:
        dict: A dictionary containing the status of the operation and a
              confirmation message.
    """
    await asyncio.sleep(20)
    tool_name = "NameCorrectionAgent"
    params_sent = {"correction_type": correction_type, "fn": fn, "ln": ln}
    _log_tool_event("INVOCATION_START", tool_name, params_sent)
    # Mock implementation
    response = {
        "status": "SUCCESS",
        "message": f"Name correction of type {correction_type} for {fn} {ln} has been processed.",
    }
    _log_tool_event("INVOCATION_END", tool_name, params_sent, response)
    return response


async def SpecialClaimAgent(claim_type: str) -> dict:
    """Files a special claim for a flight booking.

    This agent helps users file claims for various flight-related issues and
    disruptions.

    Args:
        claim_type (str): The type of special claim to file. Supported
            values: "FLIGHT_NOT_OPERATIONAL", "MEDICAL_EMERGENCY",
            "TICKET_CANCELLED_WITH_AIRLINE".

    Returns:
        dict: A dictionary containing the status of the operation and a
              confirmation message.
    """
    await asyncio.sleep(20)
    tool_name = "SpecialClaimAgent"
    params_sent = {"claim_type": claim_type}
    _log_tool_event("INVOCATION_START", tool_name, params_sent)
    # Mock implementation
    response = {
        "status": "SUCCESS",
        "message": f"Special claim of type {claim_type} has been filed.",
    }
    _log_tool_event("INVOCATION_END", tool_name, params_sent, response)
    return response


async def Enquiry_Tool() -> dict:
    """Retrieves relevant documentation for a user's query.

    This tool is used to fetch helpful documents and information in response
    to a user's enquiry.

    Returns:
        dict: A dictionary containing the status of the operation and a
              mock response message.
    """
    await asyncio.sleep(20)
    tool_name = "Enquiry_Tool"
    params_sent = {}
    _log_tool_event("INVOCATION_START", tool_name, params_sent)
    # Mock implementation
    response = {
        "status": "SUCCESS",
        "message": "This is a mock response to your enquiry.",
    }
    _log_tool_event("INVOCATION_END", tool_name, params_sent, response)
    return response


async def Eticket_Sender_Agent(booking_id_or_pnr: str) -> dict:
    """Sends an e-ticket to the user for a given booking.

    Args:
        booking_id_or_pnr (str): The booking ID or PNR of the user's
            itinerary.

    Returns:
        dict: A dictionary containing the status of the operation and a
              confirmation message.
    """
    await asyncio.sleep(20)
    tool_name = "Eticket_Sender_Agent"
    params_sent = {"booking_id_or_pnr": booking_id_or_pnr}
    _log_tool_event("INVOCATION_START", tool_name, params_sent)
    
    # Use the actual implementation that validates booking existence
    response = send_eticket(booking_id_or_pnr)
    
    _log_tool_event("INVOCATION_END", tool_name, params_sent, response)
    return response


async def ObservabilityAgent(operation_type: str) -> dict:
    """Tracks the refund status for a given booking ID.

    Args:
        operation_type (str): The type of operation for which to track the
            refund status. Supported values: "CANCELLATION", "DATE_CHANGE".

    Returns:
        dict: A dictionary containing the status of the operation and a
              confirmation message.
    """
    await asyncio.sleep(20)
    tool_name = "ObservabilityAgent"
    params_sent = {"operation_type": operation_type}
    _log_tool_event("INVOCATION_START", tool_name, params_sent)
    # Mock implementation
    response = {
        "status": "SUCCESS",
        "message": f"Refund status for {operation_type} is being tracked.",
    }
    _log_tool_event("INVOCATION_END", tool_name, params_sent, response)
    return response


async def DateChangeAgent(action: str, sector_info: list) -> dict:
    """Quotes penalties or executes date change for an existing itinerary.

    Args:
        action (str): The action to perform. Supported values: "QUOTE",
            "CONFIRM".
        sector_info (list): A list of sectors/journeys to change, with their
            new dates.

    Returns:
        dict: A dictionary containing the status of the operation and a
              confirmation message.
    """
    await asyncio.sleep(20)
    tool_name = "DateChangeAgent"
    params_sent = {"action": action, "sector_info": sector_info}
    _log_tool_event("INVOCATION_START", tool_name, params_sent)
    # Mock implementation
    response = {
        "status": "SUCCESS",
        "message": f"Date change action '{action}' has been processed for the provided sectors.",
    }
    _log_tool_event("INVOCATION_END", tool_name, params_sent, response)
    return response


async def Connect_To_Human_Tool(
    reason_of_invoke: str, frustration_score: str = None
) -> dict:
    """Connects the user to a human agent.

    Args:
        reason_of_invoke (str): The reason for invoking the tool. Supported
            values: "FRUSTRATED", "UNABLE_TO_HELP".
        frustration_score (str, optional): The user's frustration score on a
            scale of 1 to 10. Defaults to None.

    Returns:
        dict: A dictionary containing the status of the operation and a
              confirmation message.
    """
    await asyncio.sleep(20)
    tool_name = "Connect_To_Human_Tool"
    params_sent = {
        "reason_of_invoke": reason_of_invoke,
        "frustration_score": frustration_score,
    }
    _log_tool_event("INVOCATION_START", tool_name, params_sent)
    # Mock implementation
    response = {"status": "SUCCESS", "message": "Connecting you to a human agent..."}
    _log_tool_event("INVOCATION_END", tool_name, params_sent, response)
    return response


async def Booking_Cancellation_Agent(
    booking_id_or_pnr: str,
    action: str,
    cancel_scope: str = "NOT_MENTIONED",
    otp: str = "",
    partial_info: list = None,
) -> dict:
    """Quotes penalties or executes cancellations for an existing itinerary.

    Args:
        booking_id_or_pnr (str): The booking ID or PNR of the itinerary to cancel.
        action (str): The action to perform. Supported values: "QUOTE",
            "CONFIRM".
        cancel_scope (str, optional): The scope of the cancellation.
            Supported values: "NOT_MENTIONED", "FULL", "PARTIAL". Defaults to
            "NOT_MENTIONED".
        otp (str, optional): The One Time Password for confirmation. Defaults
            to "".
        partial_info (list, optional): A list of journeys and passengers to
            cancel. Required only when `cancel_scope` is "PARTIAL". Defaults
            to None.

    Returns:
        dict: A dictionary containing the status of the operation and a
              confirmation message.
    """
    await asyncio.sleep(20)
    tool_name = "Booking_Cancellation_Agent"
    params_sent = {
        "booking_id_or_pnr": booking_id_or_pnr,
        "action": action,
        "cancel_scope": cancel_scope,
        "otp": otp,
        "partial_info": partial_info,
    }
    _log_tool_event("INVOCATION_START", tool_name, params_sent)
    
    # Validate booking exists before proceeding
    validation = validate_booking_exists(booking_id_or_pnr)
    if not validation["is_valid"]:
        response = {
            "status": validation["status"],
            "message": validation["message"],
        }
        _log_tool_event("INVOCATION_END", tool_name, params_sent, response)
        return response
    
    # Booking exists, proceed with cancellation logic
    booking = validation["booking"]
    if action == "QUOTE":
        response = {
            "status": "SUCCESS",
            "message": f"Cancellation quote for booking {booking_id_or_pnr}: Refund amount ₹{booking['total_cost'] * 0.8:.0f}, Penalty ₹{booking['total_cost'] * 0.2:.0f}",
            "refund_amount": booking['total_cost'] * 0.8,
            "penalty": booking['total_cost'] * 0.2,
            "currency": booking['currency'],
        }
    else:  # CONFIRM
        response = {
            "status": "SUCCESS",
            "message": f"Booking {booking_id_or_pnr} has been successfully cancelled. Refund will be processed in 5-7 business days.",
            "booking_cancelled": True,
        }
    
    _log_tool_event("INVOCATION_END", tool_name, params_sent, response)
    return response


async def Flight_Booking_Details_Agent(booking_id_or_pnr: str) -> dict:
    """Retrieves the full itinerary record for a given PNR or Booking ID.

    This includes passenger details, flight segments, departure and arrival
    times, airlines, fare classes, and ancillary add-ons.

    Args:
        booking_id_or_pnr (str): The booking ID or PNR of the user's
            itinerary.

    Returns:
        dict: A dictionary containing the booking details.
    """
    await asyncio.sleep(20)
    tool_name = "Flight_Booking_Details_Agent"
    params_sent = {"booking_id_or_pnr": booking_id_or_pnr}
    _log_tool_event("INVOCATION_START", tool_name, params_sent)
    # Use the travel data service to get booking details
    response = get_booking_details(booking_id_or_pnr)
    _log_tool_event("INVOCATION_END", tool_name, params_sent, response)
    return response


async def Webcheckin_And_Boarding_Pass_Agent(booking_id_or_pnr: str, journeys: list) -> dict:
    """Handles web check-in and boarding pass requests.

    If the user is already checked in, this agent will send the boarding pass
    for the given PNR or Booking ID via supported communication channels such
    as WhatsApp, email, or SMS.

    Args:
        booking_id_or_pnr (str): The booking ID or PNR of the itinerary.
        journeys (list): A list of journeys for which the user wants to do
            web check-in. Each journey can have different passengers.

    Returns:
        dict: A dictionary containing the status of the operation and a
              confirmation message.
    """
    await asyncio.sleep(20)
    tool_name = "Webcheckin_And_Boarding_Pass_Agent"
    params_sent = {"booking_id_or_pnr": booking_id_or_pnr, "journeys": journeys}
    _log_tool_event("INVOCATION_START", tool_name, params_sent)
    
    # Validate booking exists before proceeding
    validation = validate_booking_exists(booking_id_or_pnr)
    if not validation["is_valid"]:
        response = {
            "status": validation["status"],
            "message": validation["message"],
        }
        _log_tool_event("INVOCATION_END", tool_name, params_sent, response)
        return response
    
    # Booking exists, proceed with web check-in
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
    
    _log_tool_event("INVOCATION_END", tool_name, params_sent, response)
    return response


async def take_a_nap() -> dict:
    """A dummy function that takes a nap for 30 seconds and then returns a friendly wake-up message.
    
    This function is designed to test long-running function calls and non-blocking execution.
    It will take a nap for exactly 30 seconds before returning a response.
    
    Returns:
        dict: A dictionary containing the wake-up message.
    """
    await asyncio.sleep(30)
    tool_name = "take_a_nap"
    params_sent = {}
    _log_tool_event("INVOCATION_START", tool_name, params_sent)
    
    response = {
        "status": "SUCCESS",
        "message": "I have slept really good, thanks for waking me up! 😴💤",
        "sleep_duration": "30 seconds",
        "wake_up_time": datetime.now(timezone.utc).isoformat()
    }
    
    _log_tool_event("INVOCATION_END", tool_name, params_sent, response)
    return response