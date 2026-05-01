from __future__ import annotations

from typing import Dict

from fastapi import FastAPI

from .generator import compile_prompt
from .schemas import CompileRequest, CompileResponse


app = FastAPI(title="Briefly Social Prompt Engine V3", version="0.1.0")


@app.get("/health")
def health() -> Dict[str, bool]:
    return {"ok": True}


@app.post("/compile", response_model=CompileResponse)
def compile_endpoint(request: CompileRequest) -> CompileResponse:
    return compile_prompt(request)
