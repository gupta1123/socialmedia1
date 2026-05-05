from fastapi.testclient import TestClient

from src.api import app


def test_compile():
    client = TestClient(app)
    payload = {
        "capability": "image_prompt_generation",
        "brand_id": "test-brand-id",
        "brief": "Create a premium real-estate launch post with strong architectural visual",
        "format": "4:5",
        "variant_count": 2,
        "variation_strategy": "auto",
        "asset_variation": True,
        "copy_mode": "auto",
        "copy": {"headline": None, "subheadline": None, "cta": None},
        "selected_asset_ids": [],
        "include_logo": False,
        "include_rera_qr": False,
        "contact_items": [],
        "options": {"strict_grounding": True, "disable_dspy": True},
        "context": {
            "brand": {
                "id": "test-brand-id",
                "name": "Test Brand",
                "slug": "test-brand",
                "profile": {
                    "identity": {"positioning": "Premium real-estate developer", "promise": "Design-led living spaces"},
                    "voice": {"summary": "Confident and refined", "adjectives": ["premium", "refined", "sophisticated"]},
                    "palette": {"primary": "#1a1a1a", "secondary": "#f5f0e8", "accent": "#c9a962"},
                    "styleDescriptors": ["architectural", "minimal", "premium"],
                },
            },
            "project": None,
            "post_type": None,
            "festival": None,
            "assets": [],
        },
    }
    response = client.post("/compile", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in {"ready", "ready_with_warnings", "blocked", "needs_input"}
    assert data["capability"] == "image_prompt_generation"


if __name__ == "__main__":
    test_compile()
