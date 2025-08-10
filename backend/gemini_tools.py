from google.genai import types
import travel_mock_data
import json
from datetime import datetime, timezone
import logging

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


# Function Declarations from tool_call.json

NameCorrectionAgent_declaration = types.FunctionDeclaration(
    name="NameCorrectionAgent",
    description="This **NameCorrectionAgent** will take care of name corrections  as well as name change also for given bookingID/PNR. This agent handles various types of name corrections including spelling corrections, name swaps, gender corrections, maiden name changes, and title removals.",
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={
            "correction_type": types.Schema(
                type=types.Type.STRING,
                description="Type of name correction required.",
                enum=[
                    "NAME_CORRECTION",
                    "NAME_SWAP",
                    "GENDER_SWAP",
                    "MAIDEN_NAME_CHANGE",
                    "REMOVE_TITLE",
                ],
            ),
            "fn": types.Schema(
                type=types.Type.STRING, description="First Name of the passenger."
            ),
            "ln": types.Schema(
                type=types.Type.STRING, description="Last Name of the passenger."
            ),
        },
        required=["correction_type", "fn", "ln"],
    ),
)

SpecialClaimAgent_declaration = types.FunctionDeclaration(
    name="SpecialClaimAgent",
    description="This **SpecialClaimAgent** handles special claim requests for flight bookings. This agent helps users file claims for various flight-related issues and disruptions.",
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={
            "claim_type": types.Schema(
                type=types.Type.STRING,
                description="Type of special claim being filed by the user",
                enum=[
                    "FLIGHT_NOT_OPERATIONAL",
                    "MEDICAL_EMERGENCY",
                    "TICKET_CANCELLED_WITH_AIRLINE",
                ],
            )
        },
        required=["claim_type"],
    ),
)

Enquiry_Tool_declaration = types.FunctionDeclaration(
    name="Enquiry_Tool",
    description="Helps user to get related documents for user query. Only help to retrieve relevant documentation for a enquiry or support.",
    parameters=types.Schema(type=types.Type.OBJECT, properties={}),
)

Eticket_Sender_Agent_declaration = types.FunctionDeclaration(
    name="Eticket_Sender_Agent",
    description="Sends the e-ticket for the given PNR or Booking ID via supported communication channels whatsapp and email.",
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={
            "booking_id_or_pnr": types.Schema(
                type=types.Type.STRING,
                description="The booking ID or PNR of the user itinerary.",
            )
        },
        required=["booking_id_or_pnr"],
    ),
)

ObservabilityAgent_declaration = types.FunctionDeclaration(
    name="ObservabilityAgent",
    description="This tool tracks or fetches the refund status for a given Booking ID based on a specific user operation.",
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={
            "operation_type": types.Schema(
                type=types.Type.STRING,
                description="Type of operation_type being filed by the user",
                enum=["CANCELLATION", "DATE_CHANGE"],
            )
        },
        required=["operation_type"],
    ),
)

DateChangeAgent_declaration = types.FunctionDeclaration(
    name="DateChangeAgent",
    description="Quotes penalties or executes date change for an existing itinerary.",
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={
            "action": types.Schema(
                type=types.Type.STRING,
                description="Choose QUOTE to fetch penalty/fare difference information, CONFIRM to execute the date change.",
                enum=["QUOTE", "CONFIRM"],
            ),
            "sector_info": types.Schema(
                type=types.Type.ARRAY,
                description="List of sectors/journeys to change with their new dates.",
                items=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "origin": types.Schema(
                            type=types.Type.STRING,
                            description="Airport Code of the origin city (e.g., DEL).",
                        ),
                        "destination": types.Schema(
                            type=types.Type.STRING,
                            description="Airport Code of the destination city (e.g., BOM).",
                        ),
                        "newDate": types.Schema(
                            type=types.Type.STRING,
                            description="New date for the journey in YYYY-MM-DD format (e.g., 2024-01-15).",
                        ),
                    },
                    required=["origin", "destination", "newDate"],
                ),
            ),
        },
        required=["action", "sector_info"],
    ),
)

Connect_To_Human_Tool_declaration = types.FunctionDeclaration(
    name="Connect_To_Human_Tool",
    description="Helps user to connect with human agent.",
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={
            "reason_of_invoke": types.Schema(
                type=types.Type.STRING,
                description="Was the user frustrated or you are not able to help.",
                enum=["FRUSTRATED", "UNABLE_TO_HELP"],
            ),
            "frustration_score": types.Schema(
                type=types.Type.STRING,
                description="How frustrated is the user in the conversation on a scale of 1 to 10.",
            ),
        },
        required=["reason_of_invoke"],
    ),
)

Booking_Cancellation_Agent_declaration = types.FunctionDeclaration(
    name="Booking_Cancellation_Agent",
    description="Quotes penalties or executes cancellations for an existing itinerary.",
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={
            "action": types.Schema(
                type=types.Type.STRING,
                description="Choose QUOTE to fetch refund/penalty information, CONFIRM to execute the cancellation.",
                enum=["QUOTE", "CONFIRM"],
                default="QUOTE",
            ),
            "cancel_scope": types.Schema(
                type=types.Type.STRING,
                description="Defaults to NOT_MENTIONED. Type of cancellation - FULL or PARTIAL. Don't ask this information upfront. ONLY fill when user mentions about it.",
                enum=["NOT_MENTIONED", "FULL", "PARTIAL"],
                default="NOT_MENTIONED",
            ),
            "otp": types.Schema(
                type=types.Type.STRING,
                description="OTP (One Time Password) for confirmation use case. And it's length is **4 digit**. NOT A MANDATORY FIELD.",
                default="",
            ),
            "partial_info": types.Schema(
                type=types.Type.ARRAY,
                description="Required **only** when cancel_scope = PARTIAL. Provide a list of journeys and passengers to cancel.",
                items=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "journey": types.Schema(
                            type=types.Type.OBJECT,
                            properties={
                                "from_city": types.Schema(
                                    type=types.Type.STRING,
                                    description="Airport Code of the origin city (e.g., DEL).",
                                ),
                                "to_city": types.Schema(
                                    type=types.Type.STRING,
                                    description="Airport Code of the destination city (e.g., BOM).",
                                ),
                            },
                        ),
                        "pax_to_cancel": types.Schema(
                            type=types.Type.ARRAY,
                            description="List of passengers to cancel for the specified journey.",
                            items=types.Schema(
                                type=types.Type.OBJECT,
                                properties={
                                    "fn": types.Schema(
                                        type=types.Type.STRING,
                                        description="First Name of the passenger.",
                                    ),
                                    "ln": types.Schema(
                                        type=types.Type.STRING,
                                        description="Last Name of the passenger.",
                                    ),
                                },
                            ),
                        ),
                    },
                ),
            ),
        },
        required=["action"],
    ),
)

Flight_Booking_Details_Agent_declaration = types.FunctionDeclaration(
    name="Flight_Booking_Details_Agent",
    description="Retrieves the full itinerary record for a given PNR / Booking ID—passengers, flight segments, departure & arrival times, airlines, fare classes, and ancillary add-ons.",
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={
            "booking_id_or_pnr": types.Schema(
                type=types.Type.STRING,
                description="The booking ID or PNR of the user itinerary.",
            )
        },
        required=["booking_id_or_pnr"],
    ),
)

Webcheckin_And_Boarding_Pass_Agent_declaration = types.FunctionDeclaration(
    name="Webcheckin_And_Boarding_Pass_Agent",
    description="This **Webcheckin_And_Boarding_Pass_Agent** agents will take care of web checkin and boarding pass for given bookingID/PNR. If user is already checked-in this agent will send boarding pass given PNR / Booking ID  via supported communication channels such as WhatsApp, email, or SMS.",
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={
            "journeys": types.Schema(
                type=types.Type.ARRAY,
                description="List of journeys for which user wants to do web check-in. Each journey can have different passengers.",
                items=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "origin": types.Schema(
                            type=types.Type.STRING,
                            description="Airport Code of the origin city (e.g., DEL).",
                        ),
                        "destination": types.Schema(
                            type=types.Type.STRING,
                            description="Airport Code of the destination city (e.g., BOM).",
                        ),
                        "isAllPax": types.Schema(
                            type=types.Type.STRING,
                            description="Set to true if user wants web check-in for all passengers on this journey, false if for specific passengers only.",
                            default="true",
                        ),
                        "pax_info": types.Schema(
                            type=types.Type.ARRAY,
                            description="Required **only** when isAllPax = false. Provide list of specific passengers for web check-in on this journey.",
                            items=types.Schema(
                                type=types.Type.OBJECT,
                                properties={
                                    "fn": types.Schema(
                                        type=types.Type.STRING,
                                        description="First Name of the passenger.",
                                    ),
                                    "ln": types.Schema(
                                        type=types.Type.STRING,
                                        description="Last Name of the passenger.",
                                    ),
                                },
                                required=["fn", "ln"],
                            ),
                        ),
                    },
                    required=["origin", "destination", "isAllPax"],
                ),
            )
        },
        required=["journeys"],
    ),
)

# Python function implementations


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
    tool_name = "Eticket_Sender_Agent"
    params_sent = {"booking_id_or_pnr": booking_id_or_pnr}
    _log_tool_event("INVOCATION_START", tool_name, params_sent)
    # Mock implementation
    response = {
        "status": "SUCCESS",
        "message": f"E-ticket for booking {booking_id_or_pnr} has been sent.",
    }
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
    action: str,
    cancel_scope: str = "NOT_MENTIONED",
    otp: str = "",
    partial_info: list = None,
) -> dict:
    """Quotes penalties or executes cancellations for an existing itinerary.

    Args:
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
    tool_name = "Booking_Cancellation_Agent"
    params_sent = {
        "action": action,
        "cancel_scope": cancel_scope,
        "otp": otp,
        "partial_info": partial_info,
    }
    _log_tool_event("INVOCATION_START", tool_name, params_sent)
    # Mock implementation
    response = {
        "status": "SUCCESS",
        "message": f"Booking cancellation action '{action}' has been processed.",
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
    tool_name = "Flight_Booking_Details_Agent"
    params_sent = {"booking_id_or_pnr": booking_id_or_pnr}
    _log_tool_event("INVOCATION_START", tool_name, params_sent)
    # Mock implementation
    response = travel_mock_data.get_booking_details(booking_id_or_pnr)
    _log_tool_event("INVOCATION_END", tool_name, params_sent, response)
    return response


async def Webcheckin_And_Boarding_Pass_Agent(journeys: list) -> dict:
    """Handles web check-in and boarding pass requests.

    If the user is already checked in, this agent will send the boarding pass
    for the given PNR or Booking ID via supported communication channels such
    as WhatsApp, email, or SMS.

    Args:
        journeys (list): A list of journeys for which the user wants to do
            web check-in. Each journey can have different passengers.

    Returns:
        dict: A dictionary containing the status of the operation and a
              confirmation message.
    """
    tool_name = "Webcheckin_And_Boarding_Pass_Agent"
    params_sent = {"journeys": journeys}
    _log_tool_event("INVOCATION_START", tool_name, params_sent)
    # Mock implementation
    response = {
        "status": "SUCCESS",
        "message": "Web check-in and boarding pass have been processed for the provided journeys.",
    }
    _log_tool_event("INVOCATION_END", tool_name, params_sent, response)
    return response


# Tool instance containing all function declarations
travel_tool = types.Tool(
    function_declarations=[
        NameCorrectionAgent_declaration,
        SpecialClaimAgent_declaration,
        Enquiry_Tool_declaration,
        Eticket_Sender_Agent_declaration,
        ObservabilityAgent_declaration,
        DateChangeAgent_declaration,
        Connect_To_Human_Tool_declaration,
        Booking_Cancellation_Agent_declaration,
        Flight_Booking_Details_Agent_declaration,
        Webcheckin_And_Boarding_Pass_Agent_declaration,
    ]
)
