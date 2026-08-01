# AetherDocs

The independent, dual-mode unified documentation service for AetherIoT,
covering
[AetherEdge](https://github.com/EvanL1/AetherEdge),
[AetherCloud](https://github.com/EvanL1/AetherCloud), and
[AetherContracts](https://github.com/EvanL1/AetherContracts). It is deployed at the canonical production domain
[`docs.aetheriot.ai`](https://docs.aetheriot.ai/).

- Browsers receive a searchable Astro + Starlight site.
- Agents can append `.md` or request `Accept: text/markdown`.
- English is served from `/`; Simplified Chinese is served from `/zh/`.
- `/llms.txt` provides the English agent index.
- `/zh/llms.txt` provides the Chinese agent index.

The service deliberately does not publish a concatenated full-corpus file.
Agents use the compact index and fetch only the Markdown pages needed for the
current task.

Each product repository owns its authoritative English product documentation.
AetherDocs mirrors the allowlisted public subset, owns the umbrella publication
layer, and maintains the complete Chinese publication under
[`locales/zh-CN`](https://github.com/EvanL1/AetherDocs/tree/main/locales/zh-CN)
with an exact manifest so a new English page
cannot silently appear untranslated. Internal plans, ADRs, and competitive
analysis remain excluded. Mirrored English AetherCloud and AetherContracts
pages carry a direct link to their authoritative repository source. Chinese
contract specifications are reading aids; the tagged English release remains
normative.

Local development resolves AetherEdge, AetherCloud, and AetherContracts from
sibling checkouts by default. Set `AETHER_EDGE_DOCS_ROOT`,
`AETHER_CLOUD_DOCS_ROOT`, or `AETHER_CONTRACTS_DOCS_ROOT` when a repository
lives elsewhere. Continuous integration checks out all three sources and
rebuilds daily so source documentation changes do not leave the unified site
permanently stale.

The production workflow deploys only when the repository variable
`CLOUDFLARE_DEPLOY_ENABLED` is `true`, the `CLOUDFLARE_ACCOUNT_ID` repository
variable is configured, and the `CLOUDFLARE_API_TOKEN` Actions secret is
present. This gate allows a safe handover from an existing deployment owner
without two repositories racing to publish the same Worker.

```bash
npm ci
npm run check
npm run test:coverage
npm run test:worker
npm run build
npm run preview
```
