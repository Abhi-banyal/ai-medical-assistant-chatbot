# AI Medical Assistant – Doctor-Patient Conversation Chatbot

## Overview

AI Medical Assistant is a full-stack doctor-patient conversation chatbot designed to support structured symptom intake, triage assistance, SOAP summary generation, and consultation history management.

The application provides an interactive consultation experience where users can select a doctor persona, enter patient details, describe symptoms, receive AI-guided follow-up questions, view safety signals, and access saved consultation history.

This project is built using React, FastAPI, SQLite, and LLM-based response generation.

> Disclaimer: This application is intended for informational and triage-support purposes only. It is not a medical diagnosis system and does not replace consultation with a licensed healthcare professional.

---

## Key Features

* Doctor persona selection
* Patient profile capture with DOB-based age handling
* AI-powered symptom conversation
* Session-based consultation flow
* Rule-based triage and safety signals
* SOAP summary generation
* Consultation history search using patient name and date of birth
* Nearby hospital lookup using OpenStreetMap Overpass API
* SQLite-based consultation storage
* Readable session IDs such as `MED-0001`

---

## Latest Consultation Flow

The current application flow works as follows:

1. User opens the application.
2. User selects a doctor persona.
3. User may search for nearby hospitals.
4. User fills the patient profile, including name, date of birth, age, sex, allergies, medications, and existing conditions.
5. A session is created only when the user clicks `Start Consultation`.
6. The backend generates a readable session ID, such as `MED-0001`.
7. User chats with the selected doctor persona.
8. The system monitors the conversation for symptom understanding and safety signals.
9. Safety signals are shown when enough symptom context is available.
10. SOAP summary is generated when the conversation reaches an assessment or diagnosis stage.
11. User ends the consultation session.
12. Consultation data is saved in the SQLite `consultation_history` table.
13. User can later view saved consultation history using patient name and date of birth.

Important behavior:

* Opening the app does not create a database session.
* A session is created only after the user clicks `Start Consultation`.
* Consultation history search does not require session ID.

---

## Application Workflow

```text
Open App
   ↓
Select Doctor
   ↓
Find Nearby Hospitals Optional
   ↓
Fill Patient Profile
   ↓
Start Consultation
   ↓
Create Session ID
   ↓
Chat with AI Doctor Persona
   ↓
Safety Signals Generated
   ↓
SOAP Summary Generated
   ↓
End Session
   ↓
Save Consultation History
   ↓
Search History by Name and DOB
```

---

## Technical Architecture

```text
React UI
   ↓
frontend/src/lib/api.js
   ↓
FastAPI Routes
   ↓
Session / Chat / Hospital / Doctor APIs
   ↓
LLM Response Logic
   ↓
Triage and Safety Logic
   ↓
SOAP Summary Generation
   ↓
SQLite Database
   ↓
Updated UI Response
```

### Main Application Files

| Area            | File / Folder             | Purpose                                    |
| --------------- | ------------------------- | ------------------------------------------ |
| Frontend UI     | `frontend/src/App.jsx`    | Main UI, consultation flow, history modal  |
| API Client      | `frontend/src/lib/api.js` | Sends frontend requests to backend         |
| FastAPI App     | `app/main.py`             | Registers routes and initializes backend   |
| Session Routes  | `app/routes/session.py`   | Session start/end, summary, history search |
| Chat Routes     | `app/routes/chat.py`      | Chat response, triage, SOAP summary logic  |
| Hospital Routes | `app/routes/hospitals.py` | Nearby hospital lookup                     |
| Doctor Routes   | `app/routes/doctor.py`    | Doctor persona list                        |
| Database Model  | `app/models/database.py`  | SQLite table definitions                   |
| Services        | `app/services/`           | LLM, triage, memory, summary, doctor data  |

---

## Database Structure

The main database table is:

```text
consultation_history
```

### Columns

| Column         | Description                                      |
| -------------- | ------------------------------------------------ |
| `session_id`   | Readable consultation ID, for example `MED-0001` |
| `patient_name` | Patient name entered in profile                  |
| `dob`          | Patient date of birth                            |
| `age`          | Calculated or entered age                        |
| `sex`          | Patient sex                                      |
| `full_chat`    | Complete consultation chat stored as JSON        |
| `summary`      | SOAP summary / final consultation summary        |
| `date`         | Consultation save timestamp                      |

Notes:

* `full_chat` stores the conversation history as JSON.
* `summary` stores the generated SOAP summary.
* `dob` is normalized before saving and searching.
* `session_id` is stored for reference but is not required for history search.

---

## API Endpoints

### Root and Health

| Method | Endpoint  | Description                   |
| ------ | --------- | ----------------------------- |
| `GET`  | `/`       | Confirms the API is running   |
| `GET`  | `/health` | Returns backend health status |

Example health response:

```json
{
  "status": "ok"
}
```

---

### Session APIs

| Method | Endpoint                | Description                              |
| ------ | ----------------------- | ---------------------------------------- |
| `POST` | `/session/start`        | Creates a new consultation session       |
| `POST` | `/session/end`          | Ends the session and saves final summary |
| `GET`  | `/summary/{session_id}` | Returns saved session summary            |

Example session start response:

```json
{
  "session_id": "MED-0001",
  "summary": null
}
```

---

### Chat API

| Method | Endpoint | Description                                           |
| ------ | -------- | ----------------------------------------------------- |
| `POST` | `/chat`  | Sends patient message and receives assistant response |

Chat request may include:

* `session_id`
* `message`
* `doctor_id`
* `patient_profile`

---

### History API

| Method | Endpoint          | Description                                           |
| ------ | ----------------- | ----------------------------------------------------- |
| `GET`  | `/history/search` | Searches consultation history by patient name and DOB |

Search parameters:

* `patient_name`
* `dob`

---

### Doctor and Hospital APIs

| Method | Endpoint            | Description                                              |
| ------ | ------------------- | -------------------------------------------------------- |
| `GET`  | `/doctors`          | Returns available doctor personas                        |
| `GET`  | `/hospitals/nearby` | Returns nearby hospitals based on latitude and longitude |

Hospital query example:

```text
/hospitals/nearby?lat=31.53&lng=76.46&radius=5000
```

---

## Tech Stack

### Frontend

* React
* Vite
* Tailwind CSS
* JavaScript

### Backend

* Python
* FastAPI
* SQLAlchemy
* Pydantic
* SQLite

### AI and External Services

* Azure OpenAI / OpenAI-compatible LLM client
* OpenStreetMap Overpass API

---

## Installation and Setup

### Backend Setup

Create and activate virtual environment:

```bash
python -m venv venv
venv\Scripts\activate
```

Install backend dependencies:

```bash
pip install -r requirements.txt
```

Run FastAPI backend:

```bash
uvicorn app.main:app --reload
```

Backend API documentation:

```text
http://127.0.0.1:8000/docs
```

---

### Frontend Setup

Go to the frontend folder:

```bash
cd frontend
```

Install frontend dependencies:

```bash
npm install
```

Run frontend development server:

```bash
npm run dev
```

Frontend URL:

```text
http://127.0.0.1:5173
```

---

## Environment Variables

Create a `.env` file in the project root.

Example:

```env
AZURE_OPENAI_API_KEY=your_key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT=your_deployment_name
AZURE_OPENAI_API_VERSION=2024-xx-xx

DATABASE_URL=sqlite:///./doctor_chatbot.db
```

Optional frontend environment file:

```env
VITE_BACKEND_URL=http://127.0.0.1:8000
```

Do not commit real API keys or secret values to GitHub.

---

## Project Structure

```text
Doctor_patient_chatbot_fullstack/
|-- app/
|   |-- main.py
|   |-- models/
|   |-- routes/
|   |   |-- chat.py
|   |   |-- doctor.py
|   |   |-- hospitals.py
|   |   `-- session.py
|   `-- services/
|       |-- doctor_data.py
|       |-- llm_client.py
|       |-- memory.py
|       |-- summarizer.py
|       `-- triage.py
|
|-- frontend/
|   |-- src/
|   |   |-- App.jsx
|   |   |-- main.jsx
|   |   |-- index.css
|   |   |-- assets/
|   |   `-- lib/
|   |-- package.json
|   `-- vite.config.js
|
|-- requirements.txt
|-- README.md
|-- doctor_chatbot.db
`-- .env
```

---

## Important Notes

* The app does not create a session when the page is only opened.
* A database row is created only after `Start Consultation`.
* Consultation history can be searched using patient name and date of birth.
* Nearby hospital lookup depends on public Overpass API servers and may occasionally be slow or unavailable.
* This application is for informational and triage-support use only.
* It should not be used as a replacement for professional medical advice, diagnosis, or treatment.

---

## Future Improvements

Possible future enhancements include:

* User authentication
* Phone number or email-based history lookup
* Admin dashboard for consultation records
* Export consultation summary as PDF
* RAG-based medical document support
* Appointment booking integration
* Better hospital ranking and map integration
