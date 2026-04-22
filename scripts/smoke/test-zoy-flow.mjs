import { SignJWT } from "jose";
import fs from "node:fs/promises";
import path from "node:path";

const userId = "35e5197a-8536-4d46-89ae-dc04647da7ee";
const email = "demo@imagelab.local";
const secret = new TextEncoder().encode("super-secret-jwt-token-with-at-least-32-characters-long");

const compilePayload = {
  brandId: "e9afb6df-b957-4d94-b48f-447cb67140b0",
  createMode: "series_episode",
  seriesId: "20a67453-3626-4101-8a4c-0dbae70412cb",
  postTypeId: "846ee17c-c1af-494c-8792-245663b08b9d",
  creativeTemplateId: "aac48628-f601-4d51-85da-06fd4c7635c1",
  channel: "instagram-feed",
  format: "portrait",
  seriesOutputKind: "carousel",
  slideCount: 5,
  goal: "Pune city facts",
  prompt:
    "Create slide 1 of a premium city-facts carousel about Pune, using the Zoy tower aerial as the subject anchor. Emphasize greenery, connected urban setting, and premium high-rise living in a clean editorial tone.",
  audience: "Premium homebuyers and investors",
  offer: "",
  exactText: "",
  templateType: "announcement",
  referenceAssetIds: ["f81a56bf-81d2-42c1-b9ba-6491cb6992b9"]
};

async function main() {
  const token = await createToken();
  const outputDir = path.resolve(process.cwd(), ".local/root/generated/zoy-flow");
  await fs.mkdir(outputDir, { recursive: true });
  const compiled = await request("/api/creative/compile", token, compilePayload);

  console.log("COMPILED");
  console.log(JSON.stringify({
    promptPackageId: compiled.id,
    deliverableId: compiled.deliverableId,
    aspectRatio: compiled.aspectRatio,
    referenceAssetIds: compiled.referenceAssetIds,
    finalPrompt: compiled.finalPrompt
  }, null, 2));

  const seedJob = await request("/api/creative/style-seeds", token, {
    promptPackageId: compiled.id,
    count: 1
  });

  console.log("SEED_JOB");
  console.log(JSON.stringify({ seedJob }, null, 2));

  const seedRun = await pollRun(compiled.id, token);
  const selectedSeed = seedRun.seedTemplates[0];

  if (!selectedSeed) {
    throw new Error("No style seed was produced");
  }

  const finalJob = await request("/api/creative/finals", token, {
    promptPackageId: compiled.id,
    selectedTemplateId: selectedSeed.id,
    count: 1
  });

  console.log("FINAL_JOB");
  console.log(JSON.stringify({ selectedSeedId: selectedSeed.id, finalJob }, null, 2));

  const run = await pollRun(compiled.id, token);
  console.log("RUN_RESULT");
  console.log(JSON.stringify({
    statuses: run.jobs.map((job) => ({ id: job.id, type: job.jobType, status: job.status, error: job.error })),
    finalOutputs: run.finalOutputs.map((output) => ({
      id: output.id,
      previewUrl: output.previewUrl,
      reviewState: output.reviewState
    })),
    seedTemplates: run.seedTemplates.map((seed) => ({
      id: seed.id,
      previewUrl: seed.previewUrl
    }))
  }, null, 2));

  if (run.finalOutputs[0]?.previewUrl) {
    const response = await fetch(run.finalOutputs[0].previewUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    const outputPath = path.resolve(outputDir, "tmp-zoy-output.jpg");
    await fs.writeFile(outputPath, buffer);
    console.log(`DOWNLOADED_OUTPUT ${outputPath}`);
  }

  if (run.seedTemplates[0]?.previewUrl) {
    const response = await fetch(run.seedTemplates[0].previewUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    const outputPath = path.resolve(outputDir, "tmp-zoy-seed.jpg");
    await fs.writeFile(outputPath, buffer);
    console.log(`DOWNLOADED_SEED ${outputPath}`);
  }
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
  const response = await fetch(`http://localhost:4000${route}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${route} ${response.status}: ${text}`);
  }

  return JSON.parse(text);
}

async function pollRun(runId, token) {
  for (let attempt = 0; attempt < 18; attempt += 1) {
    const response = await fetch(`http://localhost:4000/api/creative/runs/${runId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const json = await response.json();
    const settled = json.jobs.every((job) => ["completed", "failed", "cancelled"].includes(job.status));
    if (settled) {
      return json;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error(`Run ${runId} did not settle in time`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
