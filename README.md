# Doc.ai (TartanHacks)

Doc.ai is a modern AI-powered telehealth web app: a Zoom-like visit flow (Tavus video agent), visit summaries, photo-based observations, OTC medication scanning (camera + OCR), and a care navigation map (nearby places + routing).  
**This project is a prototype and is not a doctor. It does not diagnose or provide definitive treatment.**

## What’s included

- **Video visit flow**: start/join visits, caregiver invite links
- **Visit summary**: structured next steps, warning signs, who to see, timeline
- **Photo upload**: non-diagnostic observations and safety guidance
- **Medication scanner**: scan OTC labels via live camera feed + OCR, generate a label-based plan, optionally attach to a visit
- **Care Map**: OpenStreetMap tiles + nearby care search + routing (drive/walk) + transit assist + rideshare links

## Tech stack

- **Frontend**: Next.js 14 (App Router), React 18, TailwindCSS, MapLibre GL, Daily (Tavus), Tesseract.js + Fuse.js
- **Backend**: Node.js + Express, TypeScript, OpenAI (optional), Tavus (optional), OSRM routing (optional)

## Repo structure

```
TartanHacks/
├── backend/          # Express API (visits, summaries, vision, maps, OTC plan)
├── frontend/         # Next.js web app
├── .env.example      # combined env reference (root)
└── README.md
```

## Getting started

### 1) Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Backend runs on `http://localhost:4000` and exposes a health check at `GET /health`.

### 2) Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`.

## Environment variables

Use the example files:

- **Backend**: copy root `.env.example` → `backend/.env` (or use `backend/.env.example`)
- **Frontend**: copy `frontend/.env.local.example` → `frontend/.env.local`

Key variables (optional unless you want the real integrations):

- **Tavus**: `TAVUS_API_KEY`, `TAVUS_PERSONA_ID`, `TAVUS_REPLICA_ID` (and `TAVUS_REALTIME_API_KEY` if used by your setup)
- **LLM** (summary + image analysis): `OPENAI_API_KEY`, `OPENAI_MODEL`
- **Maps/routing**: `OSRM_BASE_URL` (defaults to the public OSRM server), `MAPBOX_ACCESS_TOKEN` (if enabled)
- **Sharing links**: set `NEXT_PUBLIC_APP_URL` (ngrok/deployed URL) so invite/share links work off-device
- **Demo mode**: set `FORCE_MOCK_MEETING=1` to always use the mock meeting room

Important:

- **Never commit real API keys**. Keep `.env` / `.env.local` local-only.
- Browser geolocation typically requires **HTTPS** (localhost is the exception).

## Quick demo script

1. Go to `/consent` → **Continue to meeting**
2. Talk in the visit; add utterances if using mock mode
3. Open **Summary** (`/visit/:id/summary`)
4. Upload a photo (`/visit/:id/photo`)
5. Open **Care Map** (`/care-map` or `/visit/:id/care-map`)
6. Try **Medication scanner** (`/meds`) and optionally attach to a visit

## Key routes

- `/` home
- `/consent` consent gate + start visit
- `/visit` start/join
- `/visit/[id]` meeting
- `/visit/[id]/summary` summary
- `/visit/[id]/photo` photo upload
- `/care-map` care map (standalone)
- `/visit/[id]/care-map` care map embedded with `visitId`
- `/meds` medication scanner
- `/visit/invite` caregiver invite link generator

## Backend API (high level)

Common endpoints used by the frontend (paths are **unchanged**):

- `POST /api/visit/start`
- `GET /api/visit/:id/summary`
- `POST /api/visit/:id/utterance`
- `POST /api/visit/:id/image`
- `GET /api/geo/geocode`
- `GET /api/geo/nearby`
- `GET /api/geo/recommend`
- `GET /api/geo/route`
- `POST /api/otc/plan`
- `POST /api/visit/:conversationId/otc-plan` (attach OTC plan to a visit)

## Safety notes

- Doc.ai provides **triage and education only**. It should always encourage clinician follow-up when appropriate.
- For emergency symptoms (e.g., chest pain, trouble breathing, stroke symptoms), the UI/agent should advise calling emergency services.

## License

MIT (or your choice).
