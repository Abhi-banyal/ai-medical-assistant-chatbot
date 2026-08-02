from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.models.database import init_db
from app.routes import chat, session
from app.routes import doctor
from app.routes import hospitals
from app.routes import speech



app = FastAPI(
    title="Doctor–Patient Conversation Chatbot API",
    description=(
        "A safe, structured doctor-patient conversation backend using FastAPI, "
        "SQLite memory, emergency triage, and OpenAI."
    ),
    version="1.0.0",
)


@app.on_event("startup")
def on_startup():
    init_db()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict this in production.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(session.router)
app.include_router(chat.router)
app.include_router(doctor.router)
app.include_router(hospitals.router)
app.include_router(speech.router)

@app.get("/")
async def root():
    return {
        "message": "Doctor–Patient Conversation Chatbot API is running.",
        "docs": "/docs",
    }


@app.get("/health")
async def health_check():
    return {"status": "ok"}
