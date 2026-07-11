from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRoute
import httpx
import os
import pathlib

app = FastAPI(title="SxConnect Painel")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:9000", "http://localhost:9000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

BASE_DIR = pathlib.Path(__file__).parent
HERMES_API_BASE = os.getenv("HERMES_API_BASE", "http://127.0.0.1:9119")
HERMES_API_KEY = os.getenv("HERMES_API_KEY", "")

# Serve arquivos estáticos SEM capturar rotas de API
html_dir = BASE_DIR / "html"
html_dir.mkdir(exist_ok=True)
app.mount("/", StaticFiles(directory=str(html_dir), html=True), name="static")
for route in list(app.routes):
    if isinstance(route, APIRoute):
        app.routes.remove(route)
for route in [
    ("/api/status", "GET", status),
    ("/api/hermes-chat", "POST", hermes_chat),
]:
    path, method, handler = route
    app.add_api_route(path, handler, methods=[method])

@app.get("/api/status")
async def status():
    return JSONResponse({"ok": True, "service": "sxconnect-painel"})

@app.post("/api/hermes-chat")
async def hermes_chat(request: Request):
    body = await request.json()
    user_message = (body or {}).get("message", "")
    session_id = (body or {}).get("session_id", "webapp:user-1:main")

    if not user_message:
        return JSONResponse({"ok": False, "error": "mensagem vazia"}, status_code=400)

    async with httpx.AsyncClient(base_url=HERMES_API_BASE, timeout=60) as client:
        payload = {
            "model": "step-3.7-flash:free",
            "messages": [{"role": "user", "content": user_message}],
            "stream": False,
        }
        headers = {"Content-Type": "application/json"}
        if HERMES_API_KEY:
            headers["Authorization"] = f"Bearer {HERMES_API_KEY}"

        r = await client.post("/v1/chat/completions", json=payload, headers=headers)

    try:
        data = r.json()
    except Exception:
        return JSONResponse({"ok": False, "error": f"hermes_status={r.status_code}", "raw": r.text[:400]}, status_code=502)

    return JSONResponse({"ok": True, "reply": data})
