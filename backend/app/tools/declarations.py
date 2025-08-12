"""
Tool function declarations for Gemini Live API integration.

This module contains the function declarations that define the interface
for travel booking tools. These declarations are used by the Gemini Live API
to understand what functions are available and how to call them.
"""

from google.genai import types


# Function Declarations

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