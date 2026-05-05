from __future__ import annotations

import json
import os
import threading
import time
import traceback
import uuid
from pathlib import Path
from typing import Any, Dict, Literal, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .generator import compile_prompt
from .schemas import CompileRequest, CompileResponse


app = FastAPI(title="Briefly Social Prompt Engine V3", version="0.1.0")
JOB_TTL_SECONDS = int(os.getenv("PROMPT_ENGINE_V3_JOB_TTL_SECONDS", "7200"))
JOB_DIR = Path(os.getenv("PROMPT_ENGINE_V3_JOB_DIR", "/tmp/briefly-social-prompt-engine-v3-jobs"))
_job_cleanup_lock = threading.Lock()


class CompileAsyncStartResponse(BaseModel):
    job_id: str
    status: Literal["queued"] = "queued"


class CompileAsyncStatusResponse(BaseModel):
    job_id: str
    status: Literal["queued", "running", "completed", "failed"]
    result: Optional[CompileResponse] = None
    error: Optional[Dict[str, str]] = None
    created_at: float = Field(exclude=True)
    updated_at: float = Field(exclude=True)


@app.get("/health")
def health() -> Dict[str, bool]:
    return {"ok": True}


@app.post("/compile", response_model=CompileResponse)
def compile_endpoint(request: CompileRequest) -> CompileResponse:
    return compile_prompt(request)


@app.post("/compile-async", response_model=CompileAsyncStartResponse)
def compile_async_start(request: CompileRequest) -> CompileAsyncStartResponse:
    cleanup_old_jobs()
    job_id = uuid.uuid4().hex
    now = time.time()
    write_job(
        job_id,
        {
            "job_id": job_id,
            "status": "queued",
            "created_at": now,
            "updated_at": now,
        },
    )
    thread = threading.Thread(target=run_compile_job, args=(job_id, request), daemon=True)
    thread.start()
    return CompileAsyncStartResponse(job_id=job_id)


@app.get("/compile-async/{job_id}", response_model=CompileAsyncStatusResponse)
def compile_async_status(job_id: str) -> Dict[str, Any]:
    job = read_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Compile job not found")
    return job


def run_compile_job(job_id: str, request: CompileRequest) -> None:
    started_at = time.time()
    write_job(
        job_id,
        {
            "job_id": job_id,
            "status": "running",
            "created_at": started_at,
            "updated_at": started_at,
        },
    )

    try:
        result = compile_prompt(request)
        now = time.time()
        write_job(
            job_id,
            {
                "job_id": job_id,
                "status": "completed",
                "result": result.model_dump(mode="json"),
                "created_at": started_at,
                "updated_at": now,
            },
        )
    except Exception as exc:
        now = time.time()
        write_job(
            job_id,
            {
                "job_id": job_id,
                "status": "failed",
                "error": {
                    "type": type(exc).__name__,
                    "message": str(exc),
                    "traceback": traceback.format_exc(limit=8),
                },
                "created_at": started_at,
                "updated_at": now,
            },
        )


def job_path(job_id: str) -> Path:
    safe_job_id = "".join(char for char in job_id if char.isalnum() or char in {"-", "_"})
    return JOB_DIR / f"{safe_job_id}.json"


def write_job(job_id: str, payload: Dict[str, Any]) -> None:
    JOB_DIR.mkdir(parents=True, exist_ok=True)
    target = job_path(job_id)
    temp = target.with_suffix(".tmp")
    temp.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    temp.replace(target)


def read_job(job_id: str) -> Optional[Dict[str, Any]]:
    path = job_path(job_id)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def cleanup_old_jobs() -> None:
    if not _job_cleanup_lock.acquire(blocking=False):
        return
    try:
        if not JOB_DIR.exists():
            return
        cutoff = time.time() - JOB_TTL_SECONDS
        for path in JOB_DIR.glob("*.json"):
            try:
                if path.stat().st_mtime < cutoff:
                    path.unlink(missing_ok=True)
            except Exception:
                continue
    finally:
        _job_cleanup_lock.release()
