# Inheritage media coverage audit

**Audit date:** 12 October 2026 (Asia/Kolkata)  
**Scope:** Published HeritageVerse places whose state contains “Maharashtra”; provider API checks were read-only. No SDK was installed, no application code was changed, and no database writes or approvals were made.

## Coverage snapshot

| Measure | Places |
|---|---:|
| Published Maharashtra records | 205 |
| Covered by a verified, non-illustrative image | 24 |
| Missing a verified image | 181 |
| Missing-image records without an effective Wikidata QID | 181 |

Coverage includes verified images attached to the place and verified images shared through the same effective Wikidata QID, matching the existing acquisition report’s duplicate-record safeguard. Unverified candidates do not count. The full 181-record gap list is in [inheritage-media-coverage-gaps-2026-10-12.csv](./inheritage-media-coverage-gaps-2026-10-12.csv).

The QID result matters: there is no QID-based join key for the 181 uncovered records, so provider matches would need reliable name and location matching. The gap list also contains several legacy ASI records with fragmented or generic names, which increases false-match risk.

## Existing HeritageVerse image workflow

- `heritage_media` stores the image and thumbnail URLs, caption and alt text, creator/credit, source URL, license and license URL, documented date, media role, verification status, illustrative flag, provider, and match confidence.
- The Wikimedia importer first resolves a Wikidata entity when possible, then uses its Commons file or Commons search. It stores acquisition candidates separately from media records and retains source and license metadata when present.
- The admin Image Library has verified, missing, and review views. The review view shows acquisition metadata and stored unverified images; the current UI does not show an image preview for every acquisition-only candidate, and the admin API has no image-approval route. New attachments remain unverified.
- This means an external provider would still need a human review path that exposes the actual candidate image alongside its creator, source, and license before any approval.

## What the provider documents

The [SDK README](https://github.com/Inheritage-Foundation/Inheritage-SDK-v1) names the base URL `https://www.inheritage.foundation/api/v1` and documents **`GET /media/:slug`**. Its examples show `response.data.primary_image` as a URL, `response.data.gallery` as an array, and `response.data.panoramas[0].url`. The README’s Hoysaleswara example claims a gallery of 24 items, but it is an example, not evidence that the live API currently returns those assets. The README does not define the gallery item schema in the accessible text.

The README demonstrates `limit` and `offset` for heritage-list requests, with records at `data.data` and a total at `data.meta.total`. It does not demonstrate pagination for the media bundle itself. Its rate-limit example exposes `response.rateLimit.remaining`, `.limit`, and `.reset`, and says HTTP 429 errors provide `error.retryAfter` in seconds; it gives no numeric quota.

The README says API data is CC BY 4.0 and requires visible attribution, with the display text **“Data © Inheritage Foundation”** and an `InheritageCitation` component. This is data attribution; the accessible documentation does not establish image-by-image creator, source, or reuse rights.

The README links the [media documentation](https://www.inheritage.foundation/docs/media) and [OpenAPI specification](https://www.inheritage.foundation/openapi/v1.yaml). The docs page yielded no readable body in the browser fetch; the OpenAPI URL returned 502 there. Direct read-only GETs from this workspace reset before TLS completed. Therefore the live response schema, exact media-item metadata, media pagination, and numeric rate limits could not be confirmed from the spec.

## Live API sample attempts

Requests included `X-Inheritage-Attribution: visible` and `Accept: application/json`. The workspace first blocked connections with `EACCES`; retrying the documented `www` host and the apex host produced `ECONNRESET` or a TLS disconnect before an HTTP status or response body. The web fetcher also marked API URLs inaccessible. These are network failures before an API response, not 404s and not evidence that the provider has no matching records.

| HeritageVerse ID and name | Inheritage match / identifier | API primary and gallery URLs | Image accessibility | API creator / source / license | Match reliable? | Verified image already in HeritageVerse? |
|---|---|---|---|---|---|---|
| 4 — Ajanta Caves | Not confirmed. Tried documented slug `ajanta-caves-maharashtra` and local slug `ajanta-caves`; no HTTP response. | No response; none observed. | Not testable without a returned URL. | Not returned. | Not assessable. | **Yes.** Existing Commons image by Marcin Białek, CC BY-SA 4.0; [Commons file](https://commons.wikimedia.org/wiki/File:Ajanta_cave_no._9_2010.jpg). |
| 3 — Ellora Caves | Not confirmed. Tried `ellora-caves`; no HTTP response. | No response; none observed. | Not testable without a returned URL. | Not returned. | Not assessable. | **Yes.** Existing Commons image by Vyacheslav Argenberg, CC BY 4.0; [Commons file](https://commons.wikimedia.org/wiki/File:Ellora_Caves,_India,_Kailasanatha_Temple_2.jpg). |
| 1205 — Panhala Fort | Not confirmed. Tried `panhala-fort`; no HTTP response. | No response; none observed. | Not testable without a returned URL. | Not returned. | Not assessable. | **Yes.** Existing Commons image by Ankur P, CC BY-SA 2.0; [Commons file](https://commons.wikimedia.org/wiki/File:Remotest_Rampart_on_Panhala.jpg). |
| 2 — Elephanta Caves | Not confirmed. Tried `elephanta-caves`; no HTTP response. | No response; none observed. | Not testable without a returned URL. | Not returned. | Not assessable. | **No.** No verified non-illustrative image is stored. |
| 1220 — Aga Khan Palace Building | Not confirmed. Tried `aga-khan-palace-pune`; no HTTP response. | No response; none observed. | Not testable without a returned URL. | Not returned. | Not assessable. | **No.** No verified non-illustrative image is stored. |
| 1219 — Bhuleshwar Mahadeo Temple | Not confirmed. Tried `bhuleshwar-mahadeo-temple`; no HTTP response. | No response; none observed. | Not testable without a returned URL. | Not returned. | Not assessable. | **No.** No verified non-illustrative image is stored. |
| 1212 — Fort of Shivneri | Not confirmed. Tried `shivneri-fort`; no HTTP response. | No response; none observed. | Not testable without a returned URL. | Not returned. | Not assessable. | **No.** No verified non-illustrative image is stored. |

The tested slugs for all but the documented Ajanta example are name-based probes, not confirmed Inheritage identifiers. The Maharashtra list request (`GET /heritage?state=Maharashtra&limit=100&offset=0`) also failed before receiving an HTTP response, so it could not be used to discover canonical provider slugs.

## Result and recommendation

**Usable matching Inheritage images confirmed: 0.** The number is zero because no API response or image URL could be retrieved in this environment; it does **not** mean the live service contains zero images.

Integration is **not justified yet**. The endpoint and broad bundle shape are documented, but this audit could not verify that the service returns these places, working image URLs, asset-level attribution, or reusable image licenses. Re-run these same read-only requests from a network that can reach the provider, inspect the live OpenAPI schema, and only reconsider after the sample returns accessible photos with per-image provenance and rights. Keep the Wikimedia pipeline as the source of verified images until then.
