"""
Tool registry that combines declarations and implementations.

This module exports the travel tool instance containing all function declarations
and provides a mapping of function names to their implementations.
"""

from google.genai import types
from .declarations import (
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
)
from .implementations import (
    NameCorrectionAgent,
    SpecialClaimAgent,
    Enquiry_Tool,
    Eticket_Sender_Agent,
    ObservabilityAgent,
    DateChangeAgent,
    Connect_To_Human_Tool,
    Booking_Cancellation_Agent,
    Flight_Booking_Details_Agent,
    Webcheckin_And_Boarding_Pass_Agent,
)


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

# Function mapping for easy lookup of implementations
available_functions = {
    "NameCorrectionAgent": NameCorrectionAgent,
    "SpecialClaimAgent": SpecialClaimAgent,
    "Enquiry_Tool": Enquiry_Tool,
    "Eticket_Sender_Agent": Eticket_Sender_Agent,
    "ObservabilityAgent": ObservabilityAgent,
    "DateChangeAgent": DateChangeAgent,
    "Connect_To_Human_Tool": Connect_To_Human_Tool,
    "Booking_Cancellation_Agent": Booking_Cancellation_Agent,
    "Flight_Booking_Details_Agent": Flight_Booking_Details_Agent,
    "Webcheckin_And_Boarding_Pass_Agent": Webcheckin_And_Boarding_Pass_Agent,
}