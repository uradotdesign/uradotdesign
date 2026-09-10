/** Read-only upstream review. Never modifies the checksum-guarded Studio patch. */
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || "")) {
  throw new Error("Usage: npm run directus:review-upgrade -- <version>");
}
const url = `https://raw.githubusercontent.com/directus/directus/v${version}/app/src/interfaces/list-m2a/list-m2a.vue`;
const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`Upstream source review failed: HTTP ${response.status}`);
const source = await response.text();
const createMenu = source.match(/<VMenu\b[^>]*v-if="enableCreate[^]*?<\/VMenu>/)?.[0];
if (/v-for="\w+ (?:in|of) createCollections"/.test(createMenu || "")) {
  console.log(`Directus ${version}: Create New uses creatable collections. Review removal of the local patch, then test Editor and Trusted Designer creation and Add Existing.`);
} else if (/v-for="\w+ (?:in|of) allowedCollections"/.test(createMenu || "") && source.includes("createCollections")) {
  console.log(`Directus ${version}: the known unfiltered collection loop remains. Inspect its context and review the patch against the new bundle; do not carry checksums forward blindly.`);
} else {
  throw new Error("Picker structure changed. Manual source review is required before any patch or upgrade.");
}
console.log(url);
