from fastapi import APIRouter
from app.services.doctor_data import DOCTORS

router = APIRouter()

@router.get("/doctors")
def get_doctors():
    return {"doctors": DOCTORS}