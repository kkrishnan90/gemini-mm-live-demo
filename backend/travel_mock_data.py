import datetime
import logging
import sys
import json
from typing import Dict, List, Optional, Any
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(
    stream=sys.stdout,
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(name)s - %(funcName)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# Global store for logs (maintaining compatibility with original structure)
GLOBAL_LOG_STORE = []

# User ID (maintaining compatibility)
USER_ID = "shubham"

# Simple booking counter for sequential IDs
BOOKING_COUNTER = 0

# --- Mock Data Structures ---

# In-memory data store for all travel entities
MOCK_DATA_STORE = {
    "flights": {},
    "hotels": {},
    "bookings": {},
    "destinations": {},
    "activities": {},
    "weather": {},
}

# --- Helper Functions ---


def generate_booking_id():
    """Generate simple sequential booking IDs like BK001, BK002, etc."""
    global BOOKING_COUNTER
    BOOKING_COUNTER += 1
    return f"BK{BOOKING_COUNTER:03d}"


# --- Structured Logging Helper ---


def log_travel_interaction(
    func_name: str,
    params: dict,
    status: str = "N/A",
    result_summary: str = None,
    error_message: str = None,
):
    """Helper function for structured logging of travel API interactions."""
    log_entry = {
        "operation": func_name,
        "parameters": params,
        "status": status,
    }
    if result_summary is not None:
        log_entry["result_summary"] = result_summary
    if error_message:
        log_entry["error_message"] = error_message

    # Store the log entry in the global list
    GLOBAL_LOG_STORE.append(log_entry)

    if "ERROR" in status.upper() or "FAIL" in status.upper():
        logger.error(json.dumps(log_entry))
    else:
        logger.info(f"\033[92m{json.dumps(log_entry)}\033[0m")


# --- Mock Data Initialization ---


def initialize_mock_data():
    """Initialize mock data for flights, hotels, destinations, etc."""

    # Sample flights data
    sample_flights = [
        {
            "flight_id": "FL001",
            "airline": "Emirates",
            "flight_number": "EK234",
            "origin": "BOM",
            "origin_city": "Mumbai",
            "destination": "DXB",
            "destination_city": "Dubai",
            "departure_time": "2024-02-15T14:30:00",
            "arrival_time": "2024-02-15T17:45:00",
            "duration": "3h 15m",
            "price": 45000.0,
            "currency": "INR",
            "available_seats": 15,
            "aircraft": "Boeing 777",
        },
        {
            "flight_id": "FL002",
            "airline": "Air India",
            "flight_number": "AI131",
            "origin": "DEL",
            "origin_city": "Delhi",
            "destination": "BOM",
            "destination_city": "Mumbai",
            "departure_time": "2024-02-16T08:15:00",
            "arrival_time": "2024-02-16T10:30:00",
            "duration": "2h 15m",
            "price": 8500.0,
            "currency": "INR",
            "available_seats": 23,
            "aircraft": "Airbus A320",
        },
        {
            "flight_id": "FL003",
            "airline": "IndiGo",
            "flight_number": "6E542",
            "origin": "BLR",
            "origin_city": "Bangalore",
            "destination": "GOI",
            "destination_city": "Goa",
            "departure_time": "2024-02-17T12:00:00",
            "arrival_time": "2024-02-17T13:15:00",
            "duration": "1h 15m",
            "price": 6200.0,
            "currency": "INR",
            "available_seats": 8,
            "aircraft": "Airbus A320neo",
        },
    ]

    # Sample hotels data
    sample_hotels = [
        {
            "hotel_id": "HTL001",
            "name": "Taj Mahal Palace",
            "city": "Mumbai",
            "country": "India",
            "rating": 5,
            "price_per_night": 25000.0,
            "currency": "INR",
            "amenities": ["WiFi", "Pool", "Spa", "Restaurant", "Room Service"],
            "available_rooms": 12,
            "room_type": "Deluxe Ocean View",
            "check_in": "15:00",
            "check_out": "12:00",
        },
        {
            "hotel_id": "HTL002",
            "name": "The Leela Palace",
            "city": "Bangalore",
            "country": "India",
            "rating": 5,
            "price_per_night": 18000.0,
            "currency": "INR",
            "amenities": ["WiFi", "Pool", "Gym", "Restaurant", "Business Center"],
            "available_rooms": 8,
            "room_type": "Executive Suite",
            "check_in": "14:00",
            "check_out": "11:00",
        },
        {
            "hotel_id": "HTL003",
            "name": "Grand Hyatt Goa",
            "city": "Goa",
            "country": "India",
            "rating": 4,
            "price_per_night": 12000.0,
            "currency": "INR",
            "amenities": ["WiFi", "Beach Access", "Pool", "Restaurant", "Bar"],
            "available_rooms": 20,
            "room_type": "Garden View Room",
            "check_in": "15:00",
            "check_out": "12:00",
        },
        {
            "hotel_id": "HTL004",
            "name": "Burj Al Arab",
            "city": "Dubai",
            "country": "UAE",
            "rating": 5,
            "price_per_night": 2500.0,
            "currency": "AED",
            "amenities": [
                "WiFi",
                "Pool",
                "Spa",
                "Restaurant",
                "Butler Service",
                "Beach Access",
            ],
            "available_rooms": 8,
            "room_type": "Deluxe Suite",
            "check_in": "15:00",
            "check_out": "12:00",
        },
    ]

    # Sample destinations data
    sample_destinations = [
        {
            "destination_id": "DEST001",
            "city": "Dubai",
            "country": "UAE",
            "description": "A modern metropolis known for luxury shopping, ultramodern architecture and lively nightlife scene.",
            "popular_attractions": [
                "Burj Khalifa",
                "Dubai Mall",
                "Palm Jumeirah",
                "Dubai Fountain",
            ],
            "best_time_to_visit": "November to March",
            "currency": "AED",
            "language": "Arabic, English",
        },
        {
            "destination_id": "DEST002",
            "city": "Goa",
            "country": "India",
            "description": "Known for its pristine beaches, vibrant nightlife, and Portuguese colonial architecture.",
            "popular_attractions": [
                "Baga Beach",
                "Basilica of Bom Jesus",
                "Dudhsagar Falls",
                "Fort Aguada",
            ],
            "best_time_to_visit": "November to February",
            "currency": "INR",
            "language": "Hindi, English, Konkani",
        },
    ]

    # Sample activities data
    sample_activities = [
        {
            "activity_id": "ACT001",
            "name": "Burj Khalifa Sky Deck",
            "city": "Dubai",
            "type": "Sightseeing",
            "price": 450.0,
            "currency": "AED",
            "duration": "2 hours",
            "description": "Visit the world's tallest building and enjoy panoramic city views.",
        },
        {
            "activity_id": "ACT002",
            "name": "Dolphin Watching",
            "city": "Goa",
            "type": "Adventure",
            "price": 1500.0,
            "currency": "INR",
            "duration": "3 hours",
            "description": "Boat trip to spot dolphins in their natural habitat.",
        },
    ]

    # Initialize data in the store
    for flight in sample_flights:
        MOCK_DATA_STORE["flights"][flight["flight_id"]] = flight

    for hotel in sample_hotels:
        MOCK_DATA_STORE["hotels"][hotel["hotel_id"]] = hotel

    for dest in sample_destinations:
        MOCK_DATA_STORE["destinations"][dest["destination_id"]] = dest

    for activity in sample_activities:
        MOCK_DATA_STORE["activities"][activity["activity_id"]] = activity

    # Sample bookings for immediate testing
    sample_bookings = [
        {
            "booking_id": "BK001",
            "user_id": USER_ID,
            "type": "flight",
            "flight_id": "FL001",
            "flight_details": sample_flights[0].copy(),
            "passenger_name": "Shubham",
            "passenger_email": "shubham@example.com",
            "passengers": 1,
            "total_cost": 45000.0,
            "currency": "INR",
            "booking_date": "2024-02-10T10:30:00",
            "status": "CONFIRMED",
        },
        {
            "booking_id": "BK002",
            "user_id": USER_ID,
            "type": "hotel",
            "hotel_id": "HTL004",
            "hotel_details": sample_hotels[3].copy(),
            "guest_name": "Shubham",
            "guest_email": "shubham@example.com",
            "check_in_date": "2024-02-15",
            "check_out_date": "2024-02-17",
            "rooms": 1,
            "nights": 2,
            "total_cost": 5000.0,
            "currency": "AED",
            "booking_date": "2024-02-10T11:15:00",
            "status": "CONFIRMED",
        },
        {
            "booking_id": "BK003",
            "user_id": USER_ID,
            "type": "flight",
            "flight_id": "FL002",
            "flight_details": sample_flights[1].copy(),
            "passenger_name": "Shubham",
            "passenger_email": "shubham@example.com",
            "passengers": 1,
            "total_cost": 8500.0,
            "currency": "INR",
            "booking_date": "2024-02-11T14:20:00",
            "status": "CONFIRMED",
        },
    ]

    # Store sample bookings
    for booking in sample_bookings:
        MOCK_DATA_STORE["bookings"][booking["booking_id"]] = booking

    # Update booking counter to continue from BK004
    global BOOKING_COUNTER
    BOOKING_COUNTER = 3

    # Sample weather data
    MOCK_DATA_STORE["weather"] = {
        "Dubai": {
            "current_temp": 28,
            "condition": "Sunny",
            "humidity": 65,
            "forecast": [
                {"date": "2024-02-15", "high": 30, "low": 22, "condition": "Sunny"},
                {
                    "date": "2024-02-16",
                    "high": 29,
                    "low": 21,
                    "condition": "Partly Cloudy",
                },
                {"date": "2024-02-17", "high": 31, "low": 23, "condition": "Sunny"},
            ],
        },
        "Goa": {
            "current_temp": 32,
            "condition": "Partly Cloudy",
            "humidity": 78,
            "forecast": [
                {"date": "2024-02-15", "high": 34, "low": 24, "condition": "Sunny"},
                {
                    "date": "2024-02-16",
                    "high": 33,
                    "low": 25,
                    "condition": "Partly Cloudy",
                },
                {
                    "date": "2024-02-17",
                    "high": 32,
                    "low": 24,
                    "condition": "Scattered Showers",
                },
            ],
        },
    }


# --- Travel Function Implementations ---


def search_flights(
    origin: str, destination: str, departure_date: str, passengers: int = 1
) -> dict:
    """Search for available flights based on criteria."""
    func_name = "search_flights"
    params = {
        "origin": origin,
        "destination": destination,
        "departure_date": departure_date,
        "passengers": passengers,
    }

    try:
        # Filter flights based on origin and destination
        matching_flights = []
        for flight_id, flight in MOCK_DATA_STORE["flights"].items():
            if (
                flight["origin"].lower() == origin.lower()
                or flight["origin_city"].lower() == origin.lower()
                or flight["destination"].lower() == destination.lower()
                or flight["destination_city"].lower() == destination.lower()
            ):

                # Check if flight has enough available seats
                if flight["available_seats"] >= passengers:
                    matching_flights.append(flight)

        if not matching_flights:
            log_travel_interaction(
                func_name,
                params,
                status="NO_FLIGHTS_FOUND",
                error_message=f"No flights found from {origin} to {destination}",
            )
            return {
                "status": "NO_FLIGHTS_FOUND",
                "message": f"No flights found from {origin} to {destination}",
                "flights": [],
            }

        log_travel_interaction(
            func_name,
            params,
            status="SUCCESS",
            result_summary=f"Found {len(matching_flights)} flight(s)",
        )
        return {"status": "SUCCESS", "flights": matching_flights}

    except Exception as e:
        log_travel_interaction(func_name, params, status="ERROR", error_message=str(e))
        return {
            "status": "ERROR",
            "message": "An error occurred while searching flights",
        }


def book_flight(
    flight_id: str, passenger_name: str, passenger_email: str, passengers: int = 1
) -> dict:
    """Book a flight for the user."""
    func_name = "book_flight"
    params = {
        "flight_id": flight_id,
        "passenger_name": passenger_name,
        "passenger_email": passenger_email,
        "passengers": passengers,
    }

    try:
        # Check if flight exists
        if flight_id not in MOCK_DATA_STORE["flights"]:
            log_travel_interaction(
                func_name,
                params,
                status="FLIGHT_NOT_FOUND",
                error_message=f"Flight {flight_id} not found",
            )
            return {
                "status": "FLIGHT_NOT_FOUND",
                "message": f"Flight {flight_id} not found",
            }

        flight = MOCK_DATA_STORE["flights"][flight_id]

        # Check availability
        if flight["available_seats"] < passengers:
            log_travel_interaction(
                func_name,
                params,
                status="INSUFFICIENT_SEATS",
                error_message=f"Only {flight['available_seats']} seats available",
            )
            return {
                "status": "INSUFFICIENT_SEATS",
                "message": f"Only {flight['available_seats']} seats available",
            }

        # Create booking
        booking_id = generate_booking_id()
        booking = {
            "booking_id": booking_id,
            "user_id": USER_ID,
            "type": "flight",
            "flight_id": flight_id,
            "flight_details": flight.copy(),
            "passenger_name": passenger_name,
            "passenger_email": passenger_email,
            "passengers": passengers,
            "total_cost": flight["price"] * passengers,
            "currency": flight["currency"],
            "booking_date": datetime.datetime.now().isoformat(),
            "status": "CONFIRMED",
        }

        # Update flight availability
        MOCK_DATA_STORE["flights"][flight_id]["available_seats"] -= passengers

        # Store booking
        MOCK_DATA_STORE["bookings"][booking_id] = booking

        log_travel_interaction(
            func_name,
            params,
            status="SUCCESS",
            result_summary=f"Flight booked successfully. Booking ID: {booking_id}",
        )
        return {
            "status": "SUCCESS",
            "message": f"Flight booked successfully",
            "booking_id": booking_id,
            "total_cost": booking["total_cost"],
            "currency": booking["currency"],
        }

    except Exception as e:
        log_travel_interaction(func_name, params, status="ERROR", error_message=str(e))
        return {
            "status": "ERROR",
            "message": "An error occurred while booking the flight",
        }


def get_flight_status(booking_id: str) -> dict:
    """Get flight status by booking ID."""
    func_name = "get_flight_status"
    params = {"booking_id": booking_id}

    try:
        if booking_id not in MOCK_DATA_STORE["bookings"]:
            log_travel_interaction(
                func_name,
                params,
                status="BOOKING_NOT_FOUND",
                error_message=f"Booking {booking_id} not found",
            )
            return {
                "status": "BOOKING_NOT_FOUND",
                "message": f"Booking {booking_id} not found",
            }

        booking = MOCK_DATA_STORE["bookings"][booking_id]
        if booking["type"] != "flight":
            log_travel_interaction(
                func_name,
                params,
                status="NOT_FLIGHT_BOOKING",
                error_message="This booking is not for a flight",
            )
            return {
                "status": "NOT_FLIGHT_BOOKING",
                "message": "This booking is not for a flight",
            }

        flight_details = booking["flight_details"]

        # Mock flight status (in real system, this would check actual flight status)
        status_info = {
            "booking_id": booking_id,
            "flight_number": flight_details["flight_number"],
            "airline": flight_details["airline"],
            "origin": flight_details["origin_city"],
            "destination": flight_details["destination_city"],
            "scheduled_departure": flight_details["departure_time"],
            "scheduled_arrival": flight_details["arrival_time"],
            "status": "On Time",  # Mock status
            "gate": "A12",  # Mock gate
            "terminal": "3",  # Mock terminal
        }

        log_travel_interaction(
            func_name,
            params,
            status="SUCCESS",
            result_summary=f"Flight status retrieved for {flight_details['flight_number']}",
        )
        return {"status": "SUCCESS", "flight_status": status_info}

    except Exception as e:
        log_travel_interaction(func_name, params, status="ERROR", error_message=str(e))
        return {
            "status": "ERROR",
            "message": "An error occurred while retrieving flight status",
        }


def search_hotels(
    city: str, check_in_date: str, check_out_date: str, guests: int = 1
) -> dict:
    """Search for available hotels."""
    func_name = "search_hotels"
    params = {
        "city": city,
        "check_in_date": check_in_date,
        "check_out_date": check_out_date,
        "guests": guests,
    }

    try:
        # Filter hotels by city
        matching_hotels = []
        for hotel_id, hotel in MOCK_DATA_STORE["hotels"].items():
            if hotel["city"].lower() == city.lower():
                # Check if hotel has enough available rooms
                if hotel["available_rooms"] >= 1:  # Assuming 1 room requested
                    matching_hotels.append(hotel)

        if not matching_hotels:
            log_travel_interaction(
                func_name,
                params,
                status="NO_HOTELS_FOUND",
                error_message=f"No hotels found in {city}",
            )
            return {
                "status": "NO_HOTELS_FOUND",
                "message": f"No hotels found in {city}",
                "hotels": [],
            }

        log_travel_interaction(
            func_name,
            params,
            status="SUCCESS",
            result_summary=f"Found {len(matching_hotels)} hotel(s)",
        )
        return {"status": "SUCCESS", "hotels": matching_hotels}

    except Exception as e:
        log_travel_interaction(func_name, params, status="ERROR", error_message=str(e))
        return {
            "status": "ERROR",
            "message": "An error occurred while searching hotels",
        }


def book_hotel(
    hotel_id: str,
    guest_name: str,
    guest_email: str,
    check_in_date: str,
    check_out_date: str,
    rooms: int = 1,
) -> dict:
    """Book a hotel for the user."""
    func_name = "book_hotel"
    params = {
        "hotel_id": hotel_id,
        "guest_name": guest_name,
        "guest_email": guest_email,
        "check_in_date": check_in_date,
        "check_out_date": check_out_date,
        "rooms": rooms,
    }

    try:
        # Check if hotel exists
        if hotel_id not in MOCK_DATA_STORE["hotels"]:
            log_travel_interaction(
                func_name,
                params,
                status="HOTEL_NOT_FOUND",
                error_message=f"Hotel {hotel_id} not found",
            )
            return {
                "status": "HOTEL_NOT_FOUND",
                "message": f"Hotel {hotel_id} not found",
            }

        hotel = MOCK_DATA_STORE["hotels"][hotel_id]

        # Check availability
        if hotel["available_rooms"] < rooms:
            log_travel_interaction(
                func_name,
                params,
                status="INSUFFICIENT_ROOMS",
                error_message=f"Only {hotel['available_rooms']} rooms available",
            )
            return {
                "status": "INSUFFICIENT_ROOMS",
                "message": f"Only {hotel['available_rooms']} rooms available",
            }

        # Calculate number of nights
        check_in = datetime.datetime.fromisoformat(check_in_date.replace("Z", "+00:00"))
        check_out = datetime.datetime.fromisoformat(
            check_out_date.replace("Z", "+00:00")
        )
        nights = (check_out - check_in).days

        if nights <= 0:
            log_travel_interaction(
                func_name,
                params,
                status="INVALID_DATES",
                error_message="Check-out date must be after check-in date",
            )
            return {
                "status": "INVALID_DATES",
                "message": "Check-out date must be after check-in date",
            }

        # Create booking
        booking_id = generate_booking_id()
        booking = {
            "booking_id": booking_id,
            "user_id": USER_ID,
            "type": "hotel",
            "hotel_id": hotel_id,
            "hotel_details": hotel.copy(),
            "guest_name": guest_name,
            "guest_email": guest_email,
            "check_in_date": check_in_date,
            "check_out_date": check_out_date,
            "rooms": rooms,
            "nights": nights,
            "total_cost": hotel["price_per_night"] * nights * rooms,
            "currency": hotel["currency"],
            "booking_date": datetime.datetime.now().isoformat(),
            "status": "CONFIRMED",
        }

        # Update hotel availability
        MOCK_DATA_STORE["hotels"][hotel_id]["available_rooms"] -= rooms

        # Store booking
        MOCK_DATA_STORE["bookings"][booking_id] = booking

        log_travel_interaction(
            func_name,
            params,
            status="SUCCESS",
            result_summary=f"Hotel booked successfully. Booking ID: {booking_id}",
        )
        return {
            "status": "SUCCESS",
            "message": f"Hotel booked successfully",
            "booking_id": booking_id,
            "total_cost": booking["total_cost"],
            "currency": booking["currency"],
            "nights": nights,
        }

    except Exception as e:
        log_travel_interaction(func_name, params, status="ERROR", error_message=str(e))
        return {
            "status": "ERROR",
            "message": "An error occurred while booking the hotel",
        }


def get_booking_details(booking_id: str) -> dict:
    """Get details of a specific booking."""
    func_name = "get_booking_details"
    params = {"booking_id": booking_id}

    try:
        if booking_id not in MOCK_DATA_STORE["bookings"]:
            log_travel_interaction(
                func_name,
                params,
                status="BOOKING_NOT_FOUND",
                error_message=f"Booking {booking_id} not found",
            )
            return {
                "status": "BOOKING_NOT_FOUND",
                "message": f"Booking {booking_id} not found",
            }

        booking = MOCK_DATA_STORE["bookings"][booking_id]

        log_travel_interaction(
            func_name,
            params,
            status="SUCCESS",
            result_summary=f"Booking details retrieved for {booking_id}",
        )
        return {"status": "SUCCESS", "booking": booking}

    except Exception as e:
        log_travel_interaction(func_name, params, status="ERROR", error_message=str(e))
        return {
            "status": "ERROR",
            "message": "An error occurred while retrieving booking details",
        }


def list_user_bookings(user_id: str = None) -> dict:
    """List all bookings for a user."""
    func_name = "list_user_bookings"
    user_id = user_id or USER_ID
    params = {"user_id": user_id}

    try:
        user_bookings = []
        for booking_id, booking in MOCK_DATA_STORE["bookings"].items():
            if booking["user_id"] == user_id:
                user_bookings.append(booking)

        if not user_bookings:
            log_travel_interaction(
                func_name,
                params,
                status="NO_BOOKINGS_FOUND",
                result_summary=f"No bookings found for user {user_id}",
            )
            return {
                "status": "NO_BOOKINGS_FOUND",
                "message": f"No bookings found",
                "bookings": [],
            }

        log_travel_interaction(
            func_name,
            params,
            status="SUCCESS",
            result_summary=f"Found {len(user_bookings)} booking(s)",
        )
        return {"status": "SUCCESS", "bookings": user_bookings}

    except Exception as e:
        log_travel_interaction(func_name, params, status="ERROR", error_message=str(e))
        return {
            "status": "ERROR",
            "message": "An error occurred while retrieving bookings",
        }


def cancel_booking(booking_id: str) -> dict:
    """Cancel a booking."""
    func_name = "cancel_booking"
    params = {"booking_id": booking_id}

    try:
        if booking_id not in MOCK_DATA_STORE["bookings"]:
            log_travel_interaction(
                func_name,
                params,
                status="BOOKING_NOT_FOUND",
                error_message=f"Booking {booking_id} not found",
            )
            return {
                "status": "BOOKING_NOT_FOUND",
                "message": f"Booking {booking_id} not found",
            }

        booking = MOCK_DATA_STORE["bookings"][booking_id]

        if booking["status"] == "CANCELLED":
            log_travel_interaction(
                func_name,
                params,
                status="ALREADY_CANCELLED",
                error_message="Booking is already cancelled",
            )
            return {
                "status": "ALREADY_CANCELLED",
                "message": "Booking is already cancelled",
            }

        # Update booking status
        MOCK_DATA_STORE["bookings"][booking_id]["status"] = "CANCELLED"

        # Restore availability based on booking type
        if booking["type"] == "flight":
            flight_id = booking["flight_id"]
            if flight_id in MOCK_DATA_STORE["flights"]:
                MOCK_DATA_STORE["flights"][flight_id]["available_seats"] += booking[
                    "passengers"
                ]
        elif booking["type"] == "hotel":
            hotel_id = booking["hotel_id"]
            if hotel_id in MOCK_DATA_STORE["hotels"]:
                MOCK_DATA_STORE["hotels"][hotel_id]["available_rooms"] += booking[
                    "rooms"
                ]

        log_travel_interaction(
            func_name,
            params,
            status="SUCCESS",
            result_summary=f"Booking {booking_id} cancelled successfully",
        )
        return {
            "status": "SUCCESS",
            "message": f"Booking {booking_id} cancelled successfully",
        }

    except Exception as e:
        log_travel_interaction(func_name, params, status="ERROR", error_message=str(e))
        return {
            "status": "ERROR",
            "message": "An error occurred while cancelling the booking",
        }


def get_destination_info(city: str) -> dict:
    """Get information about a travel destination."""
    func_name = "get_destination_info"
    params = {"city": city}

    try:
        # Search for destination by city name
        destination_found = None
        for dest_id, dest in MOCK_DATA_STORE["destinations"].items():
            if dest["city"].lower() == city.lower():
                destination_found = dest
                break

        if not destination_found:
            log_travel_interaction(
                func_name,
                params,
                status="DESTINATION_NOT_FOUND",
                error_message=f"No information found for {city}",
            )
            return {
                "status": "DESTINATION_NOT_FOUND",
                "message": f"No information found for {city}",
            }

        log_travel_interaction(
            func_name,
            params,
            status="SUCCESS",
            result_summary=f"Destination info retrieved for {city}",
        )
        return {"status": "SUCCESS", "destination": destination_found}

    except Exception as e:
        log_travel_interaction(func_name, params, status="ERROR", error_message=str(e))
        return {
            "status": "ERROR",
            "message": "An error occurred while retrieving destination information",
        }


def get_weather_info(city: str) -> dict:
    """Get weather information for a city."""
    func_name = "get_weather_info"
    params = {"city": city}

    try:
        # Search for weather data by city name
        weather_found = None
        for weather_city, weather_data in MOCK_DATA_STORE["weather"].items():
            if weather_city.lower() == city.lower():
                weather_found = weather_data
                break

        if not weather_found:
            log_travel_interaction(
                func_name,
                params,
                status="WEATHER_NOT_FOUND",
                error_message=f"No weather data found for {city}",
            )
            return {
                "status": "WEATHER_NOT_FOUND",
                "message": f"No weather data found for {city}",
            }

        log_travel_interaction(
            func_name,
            params,
            status="SUCCESS",
            result_summary=f"Weather info retrieved for {city}",
        )
        return {"status": "SUCCESS", "weather": weather_found}

    except Exception as e:
        log_travel_interaction(func_name, params, status="ERROR", error_message=str(e))
        return {
            "status": "ERROR",
            "message": "An error occurred while retrieving weather information",
        }


def search_activities(city: str, activity_type: str = None) -> dict:
    """Search for activities in a city."""
    func_name = "search_activities"
    params = {"city": city, "activity_type": activity_type}

    try:
        matching_activities = []
        for activity_id, activity in MOCK_DATA_STORE["activities"].items():
            if activity["city"].lower() == city.lower():
                if (
                    not activity_type
                    or activity["type"].lower() == activity_type.lower()
                ):
                    matching_activities.append(activity)

        if not matching_activities:
            log_travel_interaction(
                func_name,
                params,
                status="NO_ACTIVITIES_FOUND",
                error_message=f"No activities found in {city}",
            )
            return {
                "status": "NO_ACTIVITIES_FOUND",
                "message": f"No activities found in {city}",
                "activities": [],
            }

        log_travel_interaction(
            func_name,
            params,
            status="SUCCESS",
            result_summary=f"Found {len(matching_activities)} activity(ies)",
        )
        return {"status": "SUCCESS", "activities": matching_activities}

    except Exception as e:
        log_travel_interaction(func_name, params, status="ERROR", error_message=str(e))
        return {
            "status": "ERROR",
            "message": "An error occurred while searching activities",
        }


# Initialize mock data when module is imported
initialize_mock_data()

# Test function for connectivity (maintaining compatibility)


def test_travel_system():
    """Test the travel mock system."""
    func_name = "test_travel_system"
    params = {}

    try:
        # Test basic functionality
        flights = search_flights("Mumbai", "Dubai", "2024-02-15")
        hotels = search_hotels("Dubai", "2024-02-15", "2024-02-17")

        result_summary = f"Travel system test successful. Found {len(flights.get('flights', []))} flights and {len(hotels.get('hotels', []))} hotels."
        log_travel_interaction(
            func_name, params, status="SUCCESS", result_summary=result_summary
        )
        return {"status": "SUCCESS", "message": result_summary}

    except Exception as e:
        log_travel_interaction(func_name, params, status="ERROR", error_message=str(e))
        return {"status": "ERROR", "message": f"Travel system test failed: {str(e)}"}


# Example usage (for testing purposes)
if __name__ == "__main__":
    logger.info(f"Travel Mock Data System Initialized")
    logger.info(f"Using User ID: {USER_ID}\n")

    logger.info("--- Test Travel System ---")
    test_result = test_travel_system()
    logger.info(f"Test Result: {test_result}\n")

    logger.info("--- Search Flights (Mumbai to Dubai) ---")
    flights = search_flights("Mumbai", "Dubai", "2024-02-15")
    logger.info(flights)

    logger.info("\n--- Search Hotels (Dubai) ---")
    hotels = search_hotels("Dubai", "2024-02-15", "2024-02-17")
    logger.info(hotels)


def handle_name_correction(correction_type: str, fn: str, ln: str) -> dict:
    """Handles name correction requests."""
    func_name = "handle_name_correction"
    params = {"correction_type": correction_type, "fn": fn, "ln": ln}
    log_travel_interaction(
        func_name,
        params,
        status="SUCCESS",
        result_summary=f"Name correction of type {correction_type} for {fn} {ln} has been processed.",
    )
    return {
        "status": "SUCCESS",
        "message": f"Name correction of type {correction_type} for {fn} {ln} has been processed.",
    }


def handle_special_claim(claim_type: str) -> dict:
    """Handles special claim requests."""
    func_name = "handle_special_claim"
    params = {"claim_type": claim_type}
    log_travel_interaction(
        func_name,
        params,
        status="SUCCESS",
        result_summary=f"Special claim of type {claim_type} has been filed.",
    )
    return {
        "status": "SUCCESS",
        "message": f"Special claim of type {claim_type} has been filed.",
    }


def handle_enquiry() -> dict:
    """Handles user enquiries."""
    func_name = "handle_enquiry"
    params = {}
    log_travel_interaction(
        func_name,
        params,
        status="SUCCESS",
        result_summary="This is a mock response to your enquiry.",
    )
    return {"status": "SUCCESS", "message": "This is a mock response to your enquiry."}


def send_eticket(booking_id_or_pnr: str) -> dict:
    """Sends an e-ticket to the user."""
    func_name = "send_eticket"
    params = {"booking_id_or_pnr": booking_id_or_pnr}
    log_travel_interaction(
        func_name,
        params,
        status="SUCCESS",
        result_summary=f"E-ticket for booking {booking_id_or_pnr} has been sent.",
    )
    return {
        "status": "SUCCESS",
        "message": f"E-ticket for booking {booking_id_or_pnr} has been sent.",
    }


def track_refund_status(operation_type: str) -> dict:
    """Tracks the refund status for a given booking ID."""
    func_name = "track_refund_status"
    params = {"operation_type": operation_type}
    log_travel_interaction(
        func_name,
        params,
        status="SUCCESS",
        result_summary=f"Refund status for {operation_type} is being tracked.",
    )
    return {
        "status": "SUCCESS",
        "message": f"Refund status for {operation_type} is being tracked.",
    }


def handle_date_change(action: str, sector_info: list) -> dict:
    """Handles date change requests."""
    func_name = "handle_date_change"
    params = {"action": action, "sector_info": sector_info}
    log_travel_interaction(
        func_name,
        params,
        status="SUCCESS",
        result_summary=f"Date change action '{action}' has been processed for the provided sectors.",
    )
    return {
        "status": "SUCCESS",
        "message": f"Date change action '{action}' has been processed for the provided sectors.",
    }


def connect_to_human_agent(
    reason_of_invoke: str, frustration_score: str = None
) -> dict:
    """Connects the user to a human agent."""
    func_name = "connect_to_human_agent"
    params = {
        "reason_of_invoke": reason_of_invoke,
        "frustration_score": frustration_score,
    }
    log_travel_interaction(
        func_name,
        params,
        status="SUCCESS",
        result_summary="Connecting you to a human agent...",
    )
    return {"status": "SUCCESS", "message": "Connecting you to a human agent..."}


def handle_booking_cancellation(
    action: str,
    cancel_scope: str = "NOT_MENTIONED",
    otp: str = "",
    partial_info: list = None,
) -> dict:
    """Handles booking cancellation requests."""
    func_name = "handle_booking_cancellation"
    params = {
        "action": action,
        "cancel_scope": cancel_scope,
        "otp": otp,
        "partial_info": partial_info,
    }
    log_travel_interaction(
        func_name,
        params,
        status="SUCCESS",
        result_summary=f"Booking cancellation action '{action}' has been processed.",
    )
    return {
        "status": "SUCCESS",
        "message": f"Booking cancellation action '{action}' has been processed.",
    }


def handle_webcheckin_and_boarding_pass(journeys: list) -> dict:
    """Handles web check-in and boarding pass requests."""
    func_name = "handle_webcheckin_and_boarding_pass"
    params = {"journeys": journeys}
    log_travel_interaction(
        func_name,
        params,
        status="SUCCESS",
        result_summary="Web check-in and boarding pass have been processed for the provided journeys.",
    )
    return {
        "status": "SUCCESS",
        "message": "Web check-in and boarding pass have been processed for the provided journeys.",
    }
