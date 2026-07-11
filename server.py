from fastapi import FastAPI, Request, Form
from fastapi.responses import JSONResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os
import pathlib
import re
import hmac
import hashlib
import base64
from datetime import datetime, timezone
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import RedirectResponse

app = FastAPI(title="SxConnect Painel")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:9000", "http://localhost:9000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

PATCH_RULES = [
    ('http://127.0.0.1:9119/', '/hermes-dashboard/'),
    ('http://127.0.0.1:9119', '/hermes-dashboard'),
    ('href="/', 'href="/hermes-dashboard/'),
    ("src='/", "src='/hermes-dashboard/"),
    ('src="/', 'src="/hermes-dashboard/'),
    ("window.__HERMES_SESSION_TOKEN__", "/*window.__HERMES_SESSION_TOKEN__*/"),
    ("window.__HERMES_AUTH_REQUIRED__=false;", "/*window.__HERMES_AUTH_REQUIRED__=false;*/")
]
HERMES_DASH_ROOT = "http://127.0.0.1:9119"
HERMES_API_BASE = os.getenv("HERMES_API_BASE", "http://127.0.0.1:8642")
HERMES_API_KEY = os.getenv("API_SERVER_KEY", os.getenv("HERMES_API_KEY", ""))
PAINEL_USER = os.getenv("PAINEL_USER", "admin")
PAINEL_PASS = os.getenv("PAINEL_PASS", "123456")
_app_asset_mtime = None
_app_asset_token = "sx-1"


def _get_app_asset_token():
    global _app_asset_mtime, _app_asset_token
    try:
        p = pathlib.Path(__file__).with_name("app.js")
        st = p.stat()
        if _app_asset_mtime != st.st_mtime:
            _app_asset_mtime = st.st_mtime
            _app_asset_token = "sx-" + str(int(st.st_mtime))
    except Exception:
        _app_asset_token = "sx-1"
    return _app_asset_token
_app_etag = None
_app_mtime = None
def _app_asset_version():
    global _app_etag, _app_mtime
    try:
        p = pathlib.Path(__file__).with_name("app.js")
        st = p.stat()
        if _app_mtime != st.st_mtime:
            _app_mtime = st.st_mtime
            _app_etag = '"sx-' + str(int(st.st_mtime)) + '"'
        return _app_etag
    except Exception:
        return '"sx-1"'
_env_loaded = False
try:
    from pathlib import Path
    _env_path = Path.home()/'.hermes'/'.env'
    if _env_path.exists():
        for line in _env_path.read_text().splitlines():
            line = line.strip()
            if '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1)
                k = k.strip(); v = v.strip()
                if k in {"API_SERVER_KEY","HERMES_API_KEY"} and not HERMES_API_KEY:
                    HERMES_API_KEY = v
                if k == "PAINEL_USER": os.environ.setdefault("PAINEL_USER", v)
                if k == "PAINEL_PASS": os.environ.setdefault("PAINEL_PASS", v)
                _env_loaded = True
except Exception:
    pass
_project_env = Path(__file__).resolve().parent.parent / '.env'
if _project_env.exists():
    try:
        for line in _project_env.read_text().splitlines():
            line = line.strip()
            if '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1)
                k = k.strip(); v = v.strip()
                if k in {"API_SERVER_KEY","HERMES_API_KEY"} and not HERMES_API_KEY:
                    HERMES_API_KEY = v
                if k == "PAINEL_USER": os.environ.setdefault("PAINEL_USER", v)
                if k == "PAINEL_PASS": os.environ.setdefault("PAINEL_PASS", v)
                _env_loaded = True
    except Exception:
        pass

def rewrite_links(content):
    for old, new in PATCH_RULES:
        content = content.replace(old, new)
    return content

_SECRET = (os.getenv("API_SERVER_KEY", "") + "|" + os.getenv("PAINEL_PASS", "")).encode("utf-8")
_VERIFIED = os.getenv("PAINEL_USER", "") != "" and os.getenv("PAINEL_PASS", "") != ""

def _make_cookie():
    raw = (os.getenv("PAINEL_USER", "") + "|" + os.getenv("PAINEL_PASS", "") + "|sxconnect-session").encode("utf-8")
    return hmac.new(_SECRET, raw, hashlib.sha256).hexdigest()[:64]

class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path or "/"
        if path.startswith(( "/login", "/logout", "/style.css", "/favicon.ico", "/app.js" )) or path.startswith("/html/"):
            return await call_next(request)
        cookie = request.cookies.get("sx_auth")
        if _VERIFIED and cookie:
            expected = _make_cookie()
            if hmac.compare_digest(cookie, expected):
                return await call_next(request)
        response = RedirectResponse("/login", status_code=303)
        response.delete_cookie("sx_auth", path="/")
        return response

@app.post('/logout')
async def logout(request: Request):
    response = RedirectResponse("/login", status_code=303)
    response.delete_cookie("sx_auth", path="/")
    return response

@app.get('/login')
async def login_form():
    html = """<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Acesso - SxConnect</title><link rel="stylesheet" href="/style.css?v=login"/></head><body><div class="login-wrap"><main class="main"><div class="card" style="max-width:420px;margin:0 auto"><div class="title">Entrar no painel</div><form id="login-form"><div style="display:grid;gap:10px;margin-top:14px"><label><div class="muted">Usuário</div><input id="login-user" autocomplete="username"/></label><label><div class="muted">Senha</div><input id="login-pass" type="password" autocomplete="current-password"/></label><button class="badge primary" type="submit">Entrar</button></div></form><script>document.getElementById('login-form').addEventListener('submit',function(e){e.preventDefault();var u=document.getElementById('login-user').value||'';var p=document.getElementById('login-pass').value||'';fetch('/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:u,password:p})}).then(function(r){if(r.status>=200&&r.status<300){return r.text()}return r.text().then(function(t){throw new Error(t||'Erro')})}).then(function(){window.location.href='/'}).catch(function(msg){alert('Falha no login: '+msg);});});</script></div></main></body></html>"""
    return HTMLResponse(content=html, status_code=200, headers={
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
    })

@app.post('/login')
async def login_submit(request: Request):
    try:
        try:
            ctype = (request.headers.get('content-type') or '')
            if 'application/json' in ctype:
                body = await request.json()
            else:
                body = {}
                form = await request.body()
                text = form.decode('utf-8', errors='ignore') if isinstance(form, (bytes, bytearray)) else str(form)
                for part in text.split('&'):
                    if '=' in part:
                        k, v = part.split('=', 1)
                        body[k.strip()] = v.strip()
        except Exception:
            body = {}
        username = str(body.get('username', '') or '')
        password = str(body.get('password', '') or '')
        if not _VERIFIED:
            return JSONResponse({"ok": False, "error": "login_desabled"}, status_code=503)
        if hmac.compare_digest(username, PAINEL_USER) and hmac.compare_digest(password, PAINEL_PASS):
            cookie = _make_cookie()
            response = JSONResponse({"ok": True, "redirect": "/"})
            response.set_cookie("sx_auth", cookie, httponly=True, secure=False, samesite="lax", path="/")
            return response
        return JSONResponse({"ok": False, "error": "inválido"}, status_code=401)
    except Exception as exc:
        try:
            Path('/tmp/sx-login-err.log').write_text(str(exc))
        except Exception:
            pass
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=500)

@app.get('/api/status')
async def status():
    _u = "<set>" if os.getenv("PAINEL_USER", "admin") != "admin" else "admin"
    return JSONResponse({"ok": True, "service": "sxconnect-painel", "verified": _VERIFIED, "user": _u})

app.add_middleware(AuthMiddleware)

@app.get('/app.js')
async def app_js():
    import os as _os
    asset_path = _os.path.join(_os.path.dirname(__file__), 'app.js')
    etag = _get_app_asset_token()
    inm = _os.path.getmtime(asset_path) if _os.path.exists(asset_path) else 0
    last_modified = _os.path.join(_os.path.dirname(__file__), 'app.js')

    data = open(asset_path, 'rb').read()

    def parse_rfc1123(ts):
        import email.utils
        return email.utils.formatdate(ts, usegmt=True)

    headers = {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
        'ETag': etag,
        'Last-Modified': parse_rfc1123(inm),
    }
    return Response(content=data, status_code=200, headers=headers)

@app.post('/api/hermes-chat')
async def hermes_chat(request: Request):
    body = await request.json()
    user_message = (body or {}).get('message', '')
    agent = (body or {}).get('agent', '')

    if not user_message:
        return JSONResponse({"ok": False, "error": "mensagem vazia"}, status_code=400)

    messages = []
    if agent:
        messages.append({
            "role": "system",
            "content": "Você agora está respondendo como o agente " + str(agent) + " do pacote SxConnect Founders. Responda com a persona desse agente e mantenha o foco no assunto dele."
        })
    messages.append({"role": "user", "content": user_message})

    payload = {
        "model": "stepfun/step-3.7-flash:free",
        "messages": messages,
        "stream": False,
    }
    upstream_url = HERMES_API_BASE.rstrip('/') + '/v1/chat/completions'
    upstream_headers = {"content-type": "application/json"}
    if HERMES_API_KEY and HERMES_API_KEY.strip():
        upstream_headers["authorization"] = "Bearer " + HERMES_API_KEY.strip()

    try:
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            r = await client.post(upstream_url, json=payload, headers=upstream_headers)
    except Exception as exc:
        return JSONResponse({"ok": False, "error": f"upstream_error={exc}"}, status_code=502)

    try:
        data = r.json()
    except Exception:
        return JSONResponse({"ok": False, "error": f"hermes_status={r.status_code}", "raw": r.text[:400]}, status_code=502)

    return JSONResponse({"ok": True, "reply": data, "hermes_status": r.status_code})

@app.get("/hermes-dashboard/{full_path:path}")
async def dashboard_proxy(request: Request, full_path: str):
    target = f"{HERMES_DASH_ROOT}/{full_path}" if full_path else HERMES_DASH_ROOT + '/'
    query = request.url.query
    if query:
        target = f"{target}?{query}"

    up_headers = {}
    fwd = request.headers.get('x-forwarded-proto')
    if fwd:
        up_headers['x-forwarded-proto'] = fwd

    async with httpx.AsyncClient(base_url=HERMES_DASH_ROOT, timeout=60, follow_redirects=True) as client:
        try:
            upstream = await client.request(request.method, '/' + full_path if full_path else '/', headers=up_headers, params=dict(request.query_params))
        except Exception as exc:
            return JSONResponse({"ok": False, "error": f"upstream_error={exc}"}, status_code=502)

    ctype = upstream.headers.get('content-type', '')
    if 'text/html' in ctype or full_path.endswith('.html') or not full_path:
        patched = rewrite_links(upstream.text or '')
        final = re.sub(r'(<base[^>]*>)', r'\1<base href="/hermes-dashboard/">', patched, flags=re.IGNORECASE)
        return HTMLResponse(content=final, status_code=upstream.status_code, media_type='text/html')

    return Response(content=upstream.content, status_code=upstream.status_code, media_type=ctype or 'application/octet-stream',
                    headers={k: v for k, v in upstream.headers.items() if k.lower() in {'content-length', 'cache-control', 'content-disposition'}})

html_dir = pathlib.Path(__file__).parent / "html"
html_dir.mkdir(exist_ok=True)
app.mount("/", StaticFiles(directory=str(html_dir), html=True), name="static")
