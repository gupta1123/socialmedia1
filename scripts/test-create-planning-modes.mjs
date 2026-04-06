import { SignJWT } from "jose";

const API_BASE = "http://localhost:4000";
const userId = "35e5197a-8536-4d46-89ae-dc04647da7ee";
const email = "demo@imagelab.local";
const secret = new TextEncoder().encode("super-secret-jwt-token-with-at-least-32-characters-long");

async function main() {
  const token = await createToken();
  const bootstrap = await request("/api/session/bootstrap?view=light", token);

  if (!bootstrap.workspace || !bootstrap.brands?.[0]?.id) {
    throw new Error("Bootstrap did not return a workspace and active brand");
  }

  const workspaceId = bootstrap.workspace.id;
  const brandId = bootstrap.brands[0].id;
  const stamp = Date.now();

  const createdCampaign = await request("/api/campaigns", token, {
    workspaceId,
    brandId,
    name: `Codex smoke campaign ${stamp}`,
    objectiveCode: "lead_gen",
    projectIds: [],
    keyMessage: "Smoke-test campaign created from the Create workspace",
    ctaText: "Book a site visit",
    startAt: new Date().toISOString(),
    endAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    status: "draft",
    notesJson: {},
    kpiGoalJson: {}
  });

  const createdSeries = await request("/api/series", token, {
    brandId,
    name: `Codex smoke series ${stamp}`,
    description: "Smoke-test series created from the Create workspace",
    status: "active",
    cadence: {
      frequency: "weekly",
      interval: 1,
      weekdays: [],
      occurrencesAhead: 30
    },
    sourceBriefJson: {}
  });

  const [campaignDetail, seriesDetail, campaignPosts, seriesPosts] = await Promise.all([
    request(`/api/campaigns/${createdCampaign.id}`, token),
    request(`/api/series/${createdSeries.id}`, token),
    request(`/api/deliverables?campaignId=${createdCampaign.id}&limit=5`, token),
    request(`/api/deliverables?seriesId=${createdSeries.id}&limit=5`, token)
  ]);

  console.log(
    JSON.stringify(
      {
        workspaceId,
        brandId,
        campaign: {
          id: createdCampaign.id,
          name: createdCampaign.name,
          detailName: campaignDetail.name,
          postsVisible: Array.isArray(campaignPosts) ? campaignPosts.length : null
        },
        series: {
          id: createdSeries.id,
          name: createdSeries.name,
          detailName: seriesDetail.name,
          postsVisible: Array.isArray(seriesPosts) ? seriesPosts.length : null
        }
      },
      null,
      2
    )
  );
}

async function createToken() {
  return new SignJWT({ email, role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

async function request(route, token, body) {
  const response = await fetch(`${API_BASE}${route}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${route} ${response.status}: ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
