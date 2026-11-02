// Exact, project-scoped CORS allowlist; no credentials or Supabase calls.
// JWT validation in travel-delete is separate from these browser CORS rules.
const STAGING = "coigbvhxywbmqgacmhzf.supabase.co";
const PROD = "aojxeujjluhmnkwscndc.supabase.co";
const STAGING_PREVIEW = /^https:\/\/deploy-preview-[0-9]+--inquisitive-boba-e06b58\.netlify\.app$/;
const EXPLICIT = new Map([
  [PROD, new Set(["https://beamguinee.com"])],
  [STAGING, new Set([
    "https://beamguinee.com",
    "https://www.beamguinee.com",
    "https://deploy-preview-3--inquisitive-boba-e06b58.netlify.app",
  ])],
]);
export function isAllowedTravelOrigin(projectHost, origin) {
  const exact = EXPLICIT.get(projectHost);
  if (!exact || typeof origin !== "string") return false;
  return exact.has(origin) ||
    (projectHost === STAGING && STAGING_PREVIEW.test(origin));
}
