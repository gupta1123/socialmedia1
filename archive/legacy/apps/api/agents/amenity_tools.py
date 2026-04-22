from __future__ import annotations

import os
from typing import Any, Optional

try:
    from agno.tools.function import Function
except ImportError as exc:
    raise SystemExit(f"Agno dependencies are missing: {exc}") from exc

try:
    import supabase
except ImportError:
    supabase = None


class AmenityTools:
    """Tools for fetching amenity and image data for projects."""

    def __init__(self):
        self._client = None

    def _get_client(self):
        if supabase is None:
            raise RuntimeError("Supabase client not available")
        if self._client is None:
            url = os.getenv("SUPABASE_URL")
            key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
            if not url or not key:
                raise RuntimeError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set")
            self._client = supabase.create_client(url, key)
        return self._client

    def get_project_amenities(self, project_id: str) -> list[dict[str, Any]]:
        """Get all amenities and hero amenities for a project from the project profile."""
        client = self._get_client()

        response = (
            client.table("project_profile_versions")
            .select("profile_json")
            .eq("project_id", project_id)
            .eq("is_active", True)
            .single()
            .execute()
        )

        if not response.data:
            return {"amenities": [], "heroAmenities": []}

        profile = response.data.get("profile_json", {})
        amenities = profile.get("amenities", [])
        hero_amenities = profile.get("heroAmenities", [])

        return {
            "amenities": amenities,
            "heroAmenities": hero_amenities,
            "allAmenities": list({*(hero_amenities or []), *(amenities or [])}),
        }

    def get_amenity_images(
        self, project_id: str, amenity_name: str
    ) -> list[dict[str, Any]]:
        """Get all reference images for a specific amenity in a project."""
        client = self._get_client()

        response = (
            client.table("brand_assets")
            .select("id, label, storage_path, metadata_json")
            .eq("project_id", project_id)
            .eq("kind", "reference")
            .execute()
        )

        if not response.data:
            return []

        amenity_lower = amenity_name.lower()
        matching_images = []

        for asset in response.data:
            metadata = asset.get("metadata_json") or {}
            asset_amenity = metadata.get("amenityName", "")
            tags = metadata.get("tags", [])

            if (
                amenity_lower in asset_amenity.lower()
                or amenity_lower in tags
                or any(amenity_lower in str(t).lower() for t in tags)
            ):
                matching_images.append(
                    {
                        "id": asset["id"],
                        "label": asset["label"],
                        "storagePath": asset["storage_path"],
                        "amenityName": asset_amenity,
                        "subjectType": metadata.get("subjectType"),
                        "qualityTier": metadata.get("qualityTier"),
                        "viewType": metadata.get("viewType"),
                    }
                )

        return matching_images

    def get_all_project_reference_images(self, project_id: str) -> list[dict[str, Any]]:
        """Get all reference images for a project."""
        client = self._get_client()

        response = (
            client.table("brand_assets")
            .select("id, label, storage_path, metadata_json")
            .eq("project_id", project_id)
            .eq("kind", "reference")
            .execute()
        )

        if not response.data:
            return []

        return [
            {
                "id": asset["id"],
                "label": asset["label"],
                "storagePath": asset["storage_path"],
                "amenityName": asset.get("metadata_json", {}).get("amenityName"),
                "subjectType": asset.get("metadata_json", {}).get("subjectType"),
                "qualityTier": asset.get("metadata_json", {}).get("qualityTier"),
                "viewType": asset.get("metadata_json", {}).get("viewType"),
            }
            for asset in response.data
        ]


def get_amenity_tools() -> list[Function]:
    """Get the list of amenity tools for the agent."""
    tools_instance = AmenityTools()

    return [
        Function(
            name="get_project_amenities",
            description="Get all available amenities for a project. Returns both the full amenities list and hero amenities.",
            parameters={
                "type": "object",
                "properties": {
                    "project_id": {
                        "type": "string",
                        "description": "The UUID of the project",
                    }
                },
                "required": ["project_id"],
            },
            entrypoint=tools_instance.get_project_amenities,
        ),
        Function(
            name="get_amenity_images",
            description="Get all reference images for a specific amenity in a project. Returns images that match the amenity name in their metadata.",
            parameters={
                "type": "object",
                "properties": {
                    "project_id": {
                        "type": "string",
                        "description": "The UUID of the project",
                    },
                    "amenity_name": {
                        "type": "string",
                        "description": "The name of the amenity to find images for",
                    },
                },
                "required": ["project_id", "amenity_name"],
            },
            entrypoint=tools_instance.get_amenity_images,
        ),
        Function(
            name="get_all_project_reference_images",
            description="Get all reference images for a project. Use this when you need to see all available images to make a decision.",
            parameters={
                "type": "object",
                "properties": {
                    "project_id": {
                        "type": "string",
                        "description": "The UUID of the project",
                    }
                },
                "required": ["project_id"],
            },
            entrypoint=tools_instance.get_all_project_reference_images,
        ),
    ]
