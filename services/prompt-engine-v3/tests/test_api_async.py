from __future__ import annotations

import time

from fastapi.testclient import TestClient

from src import api
from src.schemas import CompileResponse, ValidationResult


def minimal_payload():
    return {
        "capability": "image_prompt_generation",
        "brand_id": "test-brand-id",
        "brief": "Create a premium launch post.",
        "format": "4:5",
        "variant_count": 1,
        "options": {"disable_dspy": True},
        "context": {
            "brand": {"id": "test-brand-id", "name": "Test Brand"},
            "project": None,
            "post_type": None,
            "festival": None,
            "assets": [],
        },
    }


def test_compile_async_completes_with_result(monkeypatch):
    def fake_compile_prompt(_request):
        return CompileResponse(
            status="ready",
            capability="image_prompt_generation",
            format="4:5",
            variant_count=0,
            variation_strategy="auto",
            variants=[],
            validation=ValidationResult(passed=True),
            debug={"test": True},
        )

    monkeypatch.setattr(api, "compile_prompt", fake_compile_prompt)
    client = TestClient(api.app)

    start_response = client.post("/compile-async", json=minimal_payload())
    assert start_response.status_code == 200
    job_id = start_response.json()["job_id"]

    status = None
    for _ in range(20):
        status_response = client.get(f"/compile-async/{job_id}")
        assert status_response.status_code == 200
        status = status_response.json()
        if status["status"] == "completed":
            break
        time.sleep(0.05)

    assert status is not None
    assert status["status"] == "completed"
    assert status["result"]["status"] == "ready"
    assert status["result"]["debug"] == {"test": True}
