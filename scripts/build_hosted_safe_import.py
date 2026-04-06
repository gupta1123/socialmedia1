from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "current_data.sql"
TARGET = ROOT / "current_data_hosted_safe.sql"

KEEP_TABLES = {
    "auth.users",
    "auth.identities",
    "public.profiles",
    "public.workspaces",
    "public.brands",
    "public.brand_personas",
    "public.brand_profile_versions",
    "public.projects",
    "public.campaigns",
    "public.channel_accounts",
    "public.content_pillars",
    "public.creative_templates",
    "public.brand_assets",
    "public.campaign_deliverable_plans",
    "public.campaign_projects",
    "public.posting_windows",
    "public.project_profile_versions",
    "public.workspace_memberships",
    "public.series",
    "public.deliverables",
}


def parse_insert_blocks(text: str) -> list[tuple[str, str]]:
    pattern = re.compile(r'INSERT INTO "([^"]+)"\."([^"]+)" .*?;\n', re.S)
    blocks: list[tuple[str, str]] = []
    for match in pattern.finditer(text):
        schema, table = match.group(1), match.group(2)
        blocks.append((f"{schema}.{table}", match.group(0)))
    return blocks


def extract_ids(insert_sql: str) -> list[str]:
    return re.findall(r"\('([0-9a-f-]{36})'", insert_sql, re.I)


def unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
      if value not in seen:
        seen.add(value)
        ordered.append(value)
    return ordered


def quoted_csv(values: list[str]) -> str:
    return ", ".join(f"'{value}'" for value in values)


def main() -> None:
    source_text = SOURCE.read_text()
    prelude, _, _ = source_text.partition("-- Data for Name:")
    insert_blocks = parse_insert_blocks(source_text)

    kept_blocks = [(table, block) for table, block in insert_blocks if table in KEEP_TABLES]
    kept_map = {table: block for table, block in kept_blocks}

    workspace_ids = extract_ids(kept_map["public.workspaces"])
    user_ids = extract_ids(kept_map["public.profiles"])

    cleanup = f"""-- Hosted-safe import generated from current_data.sql
-- Keeps demo workspace data and demo auth user
-- Skips system/static tables already created by migrations:
--   public.post_types, public.festivals
-- Skips runtime/storage data that should be recreated separately:
--   storage.*, public.creative_requests, public.prompt_packages,
--   public.style_templates, public.creative_jobs, public.creative_outputs,
--   public.post_versions, public.publications

-- Re-runnable cleanup for the demo workspace and demo auth user.
delete from public.campaign_deliverable_plans
where campaign_id in (
  select id from public.campaigns where workspace_id in ({quoted_csv(workspace_ids)})
);

delete from public.campaign_projects
where campaign_id in (
  select id from public.campaigns where workspace_id in ({quoted_csv(workspace_ids)})
)
or project_id in (
  select id from public.projects where workspace_id in ({quoted_csv(workspace_ids)})
);

delete from public.deliverables
where workspace_id in ({quoted_csv(workspace_ids)});

delete from public.series
where workspace_id in ({quoted_csv(workspace_ids)});

delete from public.posting_windows
where workspace_id in ({quoted_csv(workspace_ids)});

delete from public.brand_assets
where workspace_id in ({quoted_csv(workspace_ids)});

delete from public.creative_templates
where workspace_id in ({quoted_csv(workspace_ids)});

delete from public.channel_accounts
where workspace_id in ({quoted_csv(workspace_ids)});

delete from public.campaigns
where workspace_id in ({quoted_csv(workspace_ids)});

delete from public.project_profile_versions
where workspace_id in ({quoted_csv(workspace_ids)});

delete from public.projects
where workspace_id in ({quoted_csv(workspace_ids)});

delete from public.brand_profile_versions
where workspace_id in ({quoted_csv(workspace_ids)});

delete from public.brand_personas
where workspace_id in ({quoted_csv(workspace_ids)});

delete from public.content_pillars
where workspace_id in ({quoted_csv(workspace_ids)});

delete from public.brands
where workspace_id in ({quoted_csv(workspace_ids)});

delete from public.workspace_memberships
where workspace_id in ({quoted_csv(workspace_ids)});

delete from public.workspaces
where id in ({quoted_csv(workspace_ids)});

delete from public.profiles
where id in ({quoted_csv(user_ids)});

delete from auth.identities
where user_id in ({quoted_csv(user_ids)});

delete from auth.users
where id in ({quoted_csv(user_ids)});

"""

    output_parts = [prelude.rstrip(), "", cleanup.rstrip(), ""]
    for _, block in kept_blocks:
        output_parts.append(block.rstrip())
        output_parts.append("")
    output_parts.append("RESET ALL;")
    output_parts.append("")

    TARGET.write_text("\n".join(output_parts))

    print(f"Wrote {TARGET}")
    print("Included tables:")
    for table, _ in kept_blocks:
        print(f"- {table}")


if __name__ == "__main__":
    main()
