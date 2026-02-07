# Doc.ai
A Zoom-like video visit experience for senior citizens: AI clinician avatar (Tavus), image upload (injuries/skin/medications/exercises), and local care navigation (maps + OSRM routing). **This system does not diagnose or provide definitive treatment.** It offers triage guidance, education, next-step recommendations, and escalates to real clinicians when needed.

## Product Goals

- **One-click start**: "Start Visit" with minimal steps, optional caregiver invite
- **Speech-first**: natural language symptoms + live captions
- **Image inputs**: upload or camera for injury/skin/medication/exercise
- **Safe guidance**: possible causes, red flags, what to do now, who to see, questions to ask
- **Care navigation**: nearest urgent care/ER/specialists + OSRM routing (walk/drive)

## Safety & Compliance

- **No diagnosis claims**: Language is "possible causes," "I can't diagnose—only a clinician can."
- **Medication**: General guidance only; no dosing or contraindication guessing; always "check with pharmacist/doctor."
- **Red-flag triage**: Chest pain, difficulty breathing, stroke symptoms, severe bleeding, head injury with confusion, suicidal ideation, severe allergic reaction → advise call emergency services and stop routine advice.
- **Privacy**: Treat as sensitive health data; encrypt at rest and in transit; short retention; explicit consent for sharing.
- **Consent**: Clear screens: "This tool is not a doctor. It offers information and triage support."

## Repo Structure

```
TartanHacks/
├── backend/          # Express API: visit, triage, vision, maps, audit
├── frontend/         # Next.js app: senior-first UX, video visit, maps
├── .env.example
└── README.md
```

## Quick Start

### Backend

```bash
cd backend
cp .env.example .env   # Add TAVUS_*, OPENAI_*, etc. or use mocks
npm install
npm run dev
```

Runs at `http://localhost:4000`. If `tsx watch` fails in your environment, use `npm run build && node dist/index.js` instead.

### Frontend

```bash
cd frontend
cp .env.local.example .env.local   # Set NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
npm run dev
```

Runs at `http://localhost:3000`.

## Tavus “Zoom meeting” mode

- **Backend** creates a real Tavus CVI room via `POST /api/visit/start` using `TAVUS_PERSONA_ID` and `TAVUS_REPLICA_ID`.
- **Frontend** loads a Zoom-like join screen at `/visit/[conversationId]` and joins the Tavus room using Daily’s embedded call frame.
- **Safety**: the replica is instructed (via conversational context + greeting) to provide *triage guidance and next steps*, not diagnoses.

### Caregiver join (public link)

- The caregiver link is **`/visit/{conversationId}`**.
- In local development, to share a link that works on other devices, use a public tunnel:

```bash
ngrok http 3000
```

Then set `NEXT_PUBLIC_APP_URL` in `frontend/.env.local` to your ngrok URL so the “Invite caregiver” button copies a public URL.

### Without API Keys

- **Tavus**: Uses mock avatar (static video/audio or text-only mode).
- **Maps/OSRM**: Uses mock nearby results and mock routes when keys missing or OSRM not configured.
- **Vision**: Uses mock image classification when OpenAI/vision API key missing.

## MVP Demo Script

1. Senior clicks **Start Visit**
2. Accepts consent: "This tool is not a doctor…"
3. Describes rash/skin concern in plain language
4. Uploads photo of concern
5. Receives safe triage: possible causes, warning signs, what to do now
6. Clicks "Find help near me" → sees nearby dermatologist + route
7. Ends visit → printable 1-page summary (symptoms, advice, warnings, next steps, nearby options)

## APIs (Backend)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/visit/start` | Start session → session id |
| POST | `/visit/:id/message` | Send message → assistant response |
| POST | `/visit/:id/image` | Upload image → analysis response |
| GET | `/care/nearby?type=...&lat=...&lng=...` | Nearby providers |
| GET | `/route?from=...&to=...` | OSRM route (walk/drive) |

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, Tailwind, senior-friendly UI (large text, high contrast, captions)
- **Backend**: Node.js, Express, TypeScript
- **Services**: Tavus (avatar), triage (rules + LLM), vision (classification + OCR), maps (geocode + POI + OSRM), audit (consent + logs)

## License

MIT (or your choice).
