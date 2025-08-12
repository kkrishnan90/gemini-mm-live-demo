import asyncio
import json
from app.tools import (
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


# A helper function to print results nicely
def print_result(tool_name, result):
    print(f"--- Testing {tool_name} ---")
    # A simple check for a success-like message
    if result.get("status", "").upper() == "SUCCESS":
        print(f"✅ SUCCESS")
    else:
        # Fallback for tools that might not have a status, or have a different one
        print(f"🔵 STATUS: {result.get('status', 'N/A')}")

    print(json.dumps(result, indent=2))
    print("-" * (len(tool_name) + 12))
    print()


async def main():
    """Runs test calls for all available tool functions."""
    print("🚀 Starting Tool Call Verification Script 🚀\n")

    # 1. Test Flight_Booking_Details_Agent
    booking_details = await Flight_Booking_Details_Agent(booking_id_or_pnr="BK001")
    print_result("Flight_Booking_Details_Agent", booking_details)

    # 2. Test Booking_Cancellation_Agent
    cancel_quote = await Booking_Cancellation_Agent(action="QUOTE")
    print_result("Booking_Cancellation_Agent (QUOTE)", cancel_quote)

    # 3. Test Eticket_Sender_Agent
    eticket = await Eticket_Sender_Agent(booking_id_or_pnr="BK002")
    print_result("Eticket_Sender_Agent", eticket)

    # 4. Test Webcheckin_And_Boarding_Pass_Agent
    webcheckin = await Webcheckin_And_Boarding_Pass_Agent(
        journeys=[{"origin": "BOM", "destination": "DXB", "isAllPax": "true"}]
    )
    print_result("Webcheckin_And_Boarding_Pass_Agent", webcheckin)

    # 5. Test NameCorrectionAgent
    name_correction = await NameCorrectionAgent(
        correction_type="NAME_CORRECTION", fn="Shubham", ln="Kumar"
    )
    print_result("NameCorrectionAgent", name_correction)

    # 6. Test DateChangeAgent
    date_change = await DateChangeAgent(
        action="QUOTE",
        sector_info=[{"origin": "BOM", "destination": "DXB", "newDate": "2025-08-20"}],
    )
    print_result("DateChangeAgent", date_change)

    # 7. Test SpecialClaimAgent
    special_claim = await SpecialClaimAgent(claim_type="MEDICAL_EMERGENCY")
    print_result("SpecialClaimAgent", special_claim)

    # 8. Test ObservabilityAgent
    observability = await ObservabilityAgent(operation_type="CANCELLATION")
    print_result("ObservabilityAgent", observability)

    # 9. Test Enquiry_Tool
    enquiry = await Enquiry_Tool()
    print_result("Enquiry_Tool", enquiry)

    # 10. Test Connect_To_Human_Tool
    human_connect = await Connect_To_Human_Tool(
        reason_of_invoke="FRUSTRATED", frustration_score="8"
    )
    print_result("Connect_To_Human_Tool", human_connect)

    print("🏁 Tool Call Verification Script Finished 🏁")


if __name__ == "__main__":
    asyncio.run(main())
