/**
 * The two Microsoft sources the CSP catalog is built from. Both are public and
 * versioned, so a rebuild on the same pair gives the same catalog.
 *
 * - The DDF zip is detected: `fetch-ddf.mjs` reads the page below, and the
 *   weekly workflow rebuilds the catalog when the first "DDF v2" zip there is
 *   not the one committed under scripts/csp-ddf/.
 * - The ADMX pack is pinned: Microsoft ships a new one per Windows release,
 *   and a change of pack is a change of element schemas a human reviews, so
 *   it is bumped here by hand, never detected.
 */
export const DDF_PAGE =
  "https://learn.microsoft.com/en-us/windows/client-management/mdm/configuration-service-provider-ddf";

export const ADMX_PACK = {
  name: "Administrative Templates (.admx) for Windows 11 2025 Update (25H2) - V3.0",
  // https://www.microsoft.com/en-us/download/details.aspx?id=108542
  url: "https://download.microsoft.com/download/b7ef21a4-2925-4422-a54e-efffe1af1e0e/Administrative%20Templates%20(.admx)%20for%20Windows%2011%20Jan%202026%20Update-V3_signed.msi",
};
