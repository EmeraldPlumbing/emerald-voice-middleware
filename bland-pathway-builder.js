// ──────────────────────────────────────────────────────────────────────────
//  bland-pathway-builder.js
//  Pushes bland-pathway.json to your Bland.ai account and attaches it to your
//  inbound number, so RingCentral-forwarded calls are answered by the script.
//
//  Run:  npm run deploy-pathway
//
//  Bland's pathway API shape evolves; if a field is rejected, check the schema
//  in the Bland dashboard (Conversational Pathways) or docs.bland.ai. You can
//  also just import bland-pathway.json by hand in the dashboard instead of
//  running this script — both reach the same result.
// ──────────────────────────────────────────────────────────────────────────

import "dotenv/config";
import { readFile } from "node:fs/promises";

const BASE = "https://api.bland.ai";

function headers() {
  return {
    Authorization: process.env.BLAND_API_KEY,
    "Content-Type": "application/json",
  };
}

async function createPathway(pathway) {
  const res = await fetch(`${BASE}/v1/pathway/create`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      name: pathway.name,
      description: pathway.description,
      nodes: pathway.nodes,
      edges: pathway.edges,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Pathway create failed: ${JSON.stringify(data)}`);
  return data.pathway_id || data.data?.pathway_id || data.id;
}

async function attachToInboundNumber(pathwayId) {
  const number = process.env.BLAND_INBOUND_NUMBER;
  if (!number) {
    console.log("No BLAND_INBOUND_NUMBER set — skipping number attach.");
    console.log(`Attach pathway ${pathwayId} to your number in the dashboard.`);
    return;
  }
  const res = await fetch(`${BASE}/v1/inbound/${encodeURIComponent(number)}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ pathway_id: pathwayId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Number attach failed: ${JSON.stringify(data)}`);
  console.log(`Pathway ${pathwayId} attached to ${number}.`);
}

async function main() {
  const raw = await readFile(new URL("./bland-pathway.json", import.meta.url));
  const pathway = JSON.parse(raw);
  const pathwayId = await createPathway(pathway);
  console.log(`Created pathway: ${pathwayId}`);
  await attachToInboundNumber(pathwayId);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
