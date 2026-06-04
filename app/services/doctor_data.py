DOCTORS = [
    {
        "id": 1,
        "name": "Dr. Shifali Thakur",
        "specialty": "General Physician",
        "experience": "8 years"
    },
    {
        "id": 2,
        "name": "Dr. Raj Mehta",
        "specialty": "Cardiologist",
        "experience": "12 years"
    },
    {
        "id": 3,
        "name": "Dr. Neha Verma",
        "specialty": "Dermatologist",
        "experience": "7 years"
    },
    {
        "id": 4,
        "name": "Dr. Amit Singh",
        "specialty": "Orthopedic",
        "experience": "10 years"
    },
    {
        "id": 5,
        "name": "Dr. Priya Nair",
        "specialty": "Gynecologist",
        "experience": "9 years"
    },
    {
        "id": 6,
        "name": "Dr. Karan Gupta",
        "specialty": "Neurologist",
        "experience": "11 years"
    },
    {
        "id": 7,
        "name": "Dr. Sneha Kapoor",
        "specialty": "Pediatrician",
        "experience": "6 years"
    }
]


def get_doctor_by_id(doctor_id: int):
    """Get doctor information by ID. Returns None if not found."""
    if doctor_id is None:
        return None
    for doctor in DOCTORS:
        if doctor["id"] == doctor_id:
            return doctor
    return None