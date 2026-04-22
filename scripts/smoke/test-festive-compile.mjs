import { SignJWT } from "jose";

const userId = "35e5197a-8536-4d46-89ae-dc04647da7ee";
const email = "demo@imagelab.local";
const secret = new TextEncoder().encode("super-secret-jwt-token-with-at-least-32-characters-long");

const payload = {
  brandId: "e9afb6df-b957-4d94-b48f-447cb67140b0",
  createMode: "post",
  postTypeId: "9336e31d-f00e-4ea3-af3a-d9da06016222",
  festivalId: "7a8682a3-4742-45ec-8a33-364afc475627",
  channel: "instagram-feed",
  format: "portrait",
  goal: "Diwali greeting",
  prompt: "Create a warm premium Diwali greeting for a real-estate brand with refined festive cues and restrained elegance.",
  audience: "Homebuyers and investors",
  offer: "",
  exactText: "Warm wishes on Diwali",
  referenceAssetIds: []
};

async function main() {
  const token = await new SignJWT({ email, role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);

  const response = await fetch("http://127.0.0.1:4000/api/creative/compile", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  console.log(JSON.stringify({ status: response.status, body: text }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
