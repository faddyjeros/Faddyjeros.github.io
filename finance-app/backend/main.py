import base64
import os
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from database import create_tables
from routers import analyst, wealth
from services.market_data import start_background_refresh, stop_background_refresh


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    await start_background_refresh()
    yield
    await stop_background_refresh()


app = FastAPI(title="Finance Tracker", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(wealth.router, prefix="/api/wealth", tags=["wealth"])
app.include_router(analyst.router, prefix="/api/analyst", tags=["analyst"])


@app.get("/api/health")
def health():
    return {"status": "ok"}


# --- Basic auth middleware (when AUTH_USER/AUTH_PASS are set) ---
_AUTH_USER = os.environ.get("AUTH_USER", "")
_AUTH_PASS = os.environ.get("AUTH_PASS", "")


_AUTH_EXEMPT = {"/api/health"}
_STATIC_EXTS = {".js", ".css", ".png", ".jpg", ".svg", ".ico", ".woff", ".woff2", ".map"}


@app.middleware("http")
async def basic_auth_middleware(request: Request, call_next):
    if not _AUTH_USER or not _AUTH_PASS:
        return await call_next(request)
    path = request.url.path
    if path in _AUTH_EXEMPT:
        return await call_next(request)
    if any(path.endswith(ext) for ext in _STATIC_EXTS):
        return await call_next(request)
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Basic "):
        try:
            decoded = base64.b64decode(auth[6:]).decode()
            user, pwd = decoded.split(":", 1)
            if secrets.compare_digest(user, _AUTH_USER) and secrets.compare_digest(pwd, _AUTH_PASS):
                return await call_next(request)
        except Exception:
            pass
    return Response(
        status_code=401,
        headers={"WWW-Authenticate": 'Basic realm="Finance"'},
        content="Unauthorized",
    )


# --- Serve frontend static files (combined deploy on Render) ---
_STATIC_DIR = Path(__file__).parent / "static"
if _STATIC_DIR.is_dir():
    from fastapi.responses import FileResponse
    import mimetypes

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            return Response(status_code=404, content="Not Found")
        file_path = _STATIC_DIR / full_path
        if full_path and file_path.is_file() and _STATIC_DIR in file_path.resolve().parents:
            content_type = mimetypes.guess_type(str(file_path))[0]
            return FileResponse(file_path, media_type=content_type)
        return FileResponse(_STATIC_DIR / "index.html")
