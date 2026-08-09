# Deploying ProbeAI

Three pieces, deployed separately:

| Piece | Host | What it is |
|---|---|---|
| API | Render | FastAPI + agents + Chroma vector index (Docker) |
| UI | Vercel | React/Vite static build |
| Source | GitHub | both hosts deploy from it |

---

## 1. Backend → Render

**Deploy:** Render dashboard → **New** → **Blueprint** → pick this repo. It reads
[`render.yaml`](render.yaml) and prompts for the secrets, which are marked
`sync: false` so they are never committed.

Set when prompted:

| Variable | Value |
|---|---|
| `GROQ_API_KEY` | your Groq key |
| `ELEVENLABS_API_KEY` | your ElevenLabs key |
| `ELEVENLABS_VOICE_ID` | a voice id, or leave blank for the stock voice |
| `CORS_ORIGINS` | your Vercel URL — see step 3 |

**Check it worked** by opening the service URL. `GET /` returns the health payload:

```json
{
  "status": "ok",
  "llm_provider": "groq",
  "llm_key_present": true,
  "backend": "chromadb",
  "curriculum_documents": 217,
  "question_documents": 192,
  "voice_configured": true
}
```

Three fields are worth reading every time:

- `llm_key_present: false` → the key did not reach the container; interviews will 503.
- `backend: "keyword …"` → either `RAG_ENABLED=false` (expected on the free plan, see
  below) or Chroma failed unexpectedly and retrieval silently degraded. Check
  which one by reading the startup logs — a deliberate `false` says so plainly;
  a real failure logs `rag.chroma_failed` with the exception.
- `voice_configured: false` → the mic will not appear in the UI.

### Free tier, honestly

Free instances **sleep after ~15 minutes of inactivity** and lose all memory.
Sessions are in-process, so an interview interrupted by a sleep cannot resume —
the next turn returns 404. For a live demo, wake the service first and keep it
warm. Fixing this properly means moving sessions to a shared store
(`SESSION_BACKEND`), not adding workers: with 2+ workers requests round-robin
and a session created on one is invisible to the others.

**512MB is not enough for a live ChromaDB build.** Building the vector index at
startup — onnxruntime, the embedding model, and chromadb's own dependency
weight (a full `kubernetes` client, `grpcio`, the OpenTelemetry SDK/exporter
stack, none of which this app actually uses) — reliably exceeds 512MB before
`uvicorn` ever binds a port. Render OOM-kills the process mid-boot, the logs
show `rag.documents_built` immediately followed by `Out of memory (used over
512Mi)`, and the service crash-loops. `render.yaml` therefore ships
`RAG_ENABLED=false` by default on the free plan — the keyword-search fallback
in `rag/vector_store.py` answers the same queries from a plain dict of token
sets, at a fraction of the memory, and an interview still runs end to end with
slightly weaker topic retrieval. Set it back to `true` only alongside
`plan: standard` (2GB) or higher.

---

## 2. Frontend → Vercel

**Deploy:** Vercel → **Add New Project** → import the repo → set **Root
Directory** to `frontend`. [`frontend/vercel.json`](frontend/vercel.json) supplies
the rest.

Set these environment variables in the Vercel project:

| Variable | Value |
|---|---|
| `VITE_API_URL` | your Render URL, e.g. `https://probeai-api.onrender.com` |
| `VITE_API_MODE` | `live` |

Both matter. Without `VITE_API_MODE=live` the UI runs entirely on bundled mock
data and never calls your backend — it will look like it works while proving
nothing.

**Microphone note:** browsers only allow `getUserMedia` on HTTPS, and only when
the page permits it. `vercel.json` sets `Permissions-Policy: microphone=(self)`
for exactly this reason. Vercel serves HTTPS by default, so voice works there;
it will not work over plain `http://` on a LAN address.

---

## 3. Wire the two together

After both are deployed, set `CORS_ORIGINS` on Render to the Vercel origin:

```
CORS_ORIGINS=https://your-project.vercel.app
```

Leaving it as `*` means any site can call your API and spend your Groq and
ElevenLabs quota. Include every origin you use, comma-separated — a preview
deployment has a different hostname than production.

**Alternative, no CORS at all:** instead of `VITE_API_URL`, add a rewrite to
`vercel.json` so the browser only ever sees one origin:

```json
"rewrites": [
  { "source": "/api/:path*", "destination": "https://probeai-api.onrender.com/api/:path*" }
]
```

Then leave `VITE_API_URL` unset. Simpler security story; costs an extra network
hop through Vercel on every request.

---

## Running locally

```bash
# API
pip install -r requirements.txt
cp .env.example backend/.env        # then fill in GROQ_API_KEY
uvicorn main:app --reload --app-dir backend

# UI, in a second terminal
cd frontend && npm install && npm run dev
```

Vite proxies `/api` to `localhost:8000`, so `VITE_API_URL` stays unset in dev.
Set `VITE_API_MODE=live` in `frontend/.env` to talk to the real backend.

The first backend start downloads the ~79MB embedding model. Set
`RAG_ENABLED=false` to skip it and use keyword retrieval while iterating.

## Docker, locally

```bash
docker build -t probeai-api .
docker run --rm -p 8000:8000 --env-file backend/.env probeai-api
```

## MCP server (optional)

```bash
cd backend && python mcp_server.py
```

Speaks MCP over stdio. Its sessions are separate from the HTTP API's — different
process, different memory.
