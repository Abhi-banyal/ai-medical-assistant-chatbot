import logging
import math
import time
from functools import lru_cache
from typing import Any, Dict, List, Optional

import requests
from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Hospitals"])


def calculate_distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius_km = 6371.0

    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)

    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )

    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius_km * c


OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
]


def build_overpass_query(lat: float, lng: float, radius: int) -> str:
    return f"""
[out:json][timeout:35];
(
  node["amenity"="hospital"](around:{radius},{lat},{lng});
  way["amenity"="hospital"](around:{radius},{lat},{lng});
  relation["amenity"="hospital"](around:{radius},{lat},{lng});
);
out tags center;
"""


def fetch_from_overpass(endpoint: str, query: str) -> Dict[str, Any]:
    headers = {
        # IMPORTANT:
        # Replace the contact value with your real project/contact info if possible.
        "User-Agent": "DoctorPatientChatbot/1.0 (student project; contact: abhishek-banyal)",
        "Accept": "application/json,*/*",
    }

    response = requests.post(
        endpoint,
        data=query.encode("utf-8"),
        headers=headers,
        timeout=(10, 45),  # connect timeout, read timeout
    )

    if response.status_code == 429:
        retry_after = response.headers.get("Retry-After")
        logger.warning(
            "Overpass rate limit from %s. Retry-After=%s",
            endpoint,
            retry_after,
        )

    if response.status_code != 200:
        logger.warning(
            "Overpass returned non-200 from %s. Status=%s Body=%s",
            endpoint,
            response.status_code,
            response.text[:500],
        )

    response.raise_for_status()
    return response.json()


@lru_cache(maxsize=128)
def fetch_hospitals_cached(
    rounded_lat: float,
    rounded_lng: float,
    radius: int,
) -> Dict[str, Any]:
    query = build_overpass_query(rounded_lat, rounded_lng, radius)

    last_exception: Optional[Exception] = None

    for index, endpoint in enumerate(OVERPASS_ENDPOINTS):
        try:
            if index > 0:
                time.sleep(1.5 * index)

            return fetch_from_overpass(endpoint, query)

        except (requests.RequestException, ValueError) as exc:
            logger.warning(
                "Nearby hospitals request failed for %s: %s",
                endpoint,
                exc,
            )
            last_exception = exc
            continue

    raise HTTPException(
        status_code=502,
        detail=(
            "Unable to fetch nearby hospitals from OpenStreetMap right now. "
            "The public Overpass servers may be busy, blocked, or rate-limited."
        ),
    ) from last_exception


def extract_hospital_coordinates(item: Dict[str, Any]) -> tuple[Optional[float], Optional[float]]:
    hospital_lat = item.get("lat")
    hospital_lng = item.get("lon")

    if hospital_lat is None or hospital_lng is None:
        center = item.get("center", {})
        hospital_lat = center.get("lat")
        hospital_lng = center.get("lon")

    return hospital_lat, hospital_lng


def format_hospital(
    item: Dict[str, Any],
    user_lat: float,
    user_lng: float,
) -> Optional[Dict[str, Any]]:
    tags = item.get("tags", {})

    hospital_lat, hospital_lng = extract_hospital_coordinates(item)

    if hospital_lat is None or hospital_lng is None:
        return None

    name = tags.get("name")
    if not name:
        return None

    distance_km = calculate_distance_km(
        user_lat,
        user_lng,
        float(hospital_lat),
        float(hospital_lng),
    )

    street = tags.get("addr:street", "")
    city = tags.get("addr:city", "")
    state = tags.get("addr:state", "")
    postcode = tags.get("addr:postcode", "")

    address = (
        tags.get("addr:full")
        or ", ".join(part for part in [street, city, state, postcode] if part)
        or "Address not available"
    )

    return {
        "id": f'{item.get("type", "osm")}-{item.get("id")}',
        "name": name,
        "address": address,
        "phone": tags.get("phone") or tags.get("contact:phone"),
        "website": tags.get("website") or tags.get("contact:website"),
        "lat": float(hospital_lat),
        "lng": float(hospital_lng),
        "distance_km": round(distance_km, 1),
    }


@router.get("/hospitals/nearby")
def nearby_hospitals(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius: int = Query(5000, ge=1000, le=25000),
):
    rounded_lat = round(lat, 5)
    rounded_lng = round(lng, 5)

    response_data = fetch_hospitals_cached(
        rounded_lat=rounded_lat,
        rounded_lng=rounded_lng,
        radius=radius,
    )

    hospitals: List[Dict[str, Any]] = []

    for item in response_data.get("elements", []):
        hospital = format_hospital(item, lat, lng)

        if hospital is not None:
            hospitals.append(hospital)

    hospitals.sort(key=lambda hospital: hospital["distance_km"])

    return {
        "hospitals": hospitals[:8],
        "source": "OpenStreetMap Overpass API",
        "count": len(hospitals[:8]),
    }