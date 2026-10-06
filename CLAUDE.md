# Gamer Art Factory

AI-generated wall art pipeline for the gamer market. Generates, curates, and publishes print-on-demand art to Etsy via Gelato, plus AI-generated product videos and digital listings.

## Stack
- Frontend: React (Vite) + Tailwind CSS v4 + React Router v7
- Backend: Firebase Cloud Functions (Node.js)
- Database: Firestore
- Storage: Firebase Storage
- Auth: Firebase Auth (single user)
- Hosting: Firebase Hosting
- Image models (via fal.ai): Flux, SDXL, nano-banana, seedvr (upscale)
- Video model (via fal.ai): Veo 3.1
- LLMs: Anthropic Claude (`@anthropic-ai/sdk`), Google Gemini (`@google/genai`, `@google/generative-ai`)
- Image processing: `sharp` (JPG conversion, print prep)
- POD: Gelato API
- Marketplace: Etsy API (OAuth 2.0 + PKCE)

## Dev commands
- `npm run dev` — Vite dev server
- `npm run build` — Production build
- `npm run preview` — Preview built app
- `npm run seed` — Seed Firestore concepts + prompts
- `npm run product-book` — Generate product book (Markdown + CSV) from published listings
- `cd functions && npm run serve` — Run Cloud Functions locally (emulators)
- `cd functions && npm run deploy` — Deploy Cloud Functions

## Architecture
End-to-end pipeline:
1. **Prompt Engine** — Concept library + prompt assembler (themes, props, bodyType, chaos, style)
2. **Generation Engine** — Cloud Functions fan out to fal.ai (images, upscale, video)
3. **Curation Dashboard** — Galleries with rating, filtering, tagging, keyboard shortcuts
4. **Image Editing** — In-app adjustments (brightness, contrast, crop) via `processImageEdit`
5. **AI Agents** — Ideation chat, collection analysis, marketing copy generation
6. **Publish Pipeline** — Gelato POD publishing + Etsy listings (physical and digital)

## Key files
- `src/lib/promptAssembler.js` — Concept → prompt composition
- `src/lib/firebase.js` — Firebase client init
- `src/lib/imageUtils.js` — Client-side image helpers
- `src/lib/sourceParser.js` — Parse source/reference data
- `src/hooks/useFirestore.js` — Firestore CRUD + real-time subscriptions
- `src/hooks/useCollections.js` — Collection management
- `src/hooks/useAuth.js` — Auth state
- `functions/index.js` — All Cloud Functions (see below)
- `functions/src/collectionAnalysis.js` — Collection analysis agent
- `functions/src/marketingAgent.js` — Marketing content agent
- `functions/src/aiConversation.js` — Ideation chat handler
- `functions/prompts/` — Private listing prompts (gitignored, still deployed); `functions/prompts.example/` has public stand-ins
- `private/` — Private playbook docs (gitignored): `LISTING-AI.md`, `LISTING-AI-INNER-ANIMAL.md`, `PROJECT_CONTEXT.md`

## Pages (src/pages/)
- Core: `LoginPage`, `QueuePage`, `StatsPage`
- Galleries: `GalleryPage`, `VideoGalleryPage`, `MockupGalleryPage`
- Builders: `BuilderPage`, `BuilderV2Page`, `PromptBuilder`, `MockupBuilderPage`, `BatchVideoPage`
- Collections: `CollectionsPage`, `CollectionDetailPage`, `CollectionAnalysisPage`
- Integrations: `EtsyConnectPage`

## Cloud Functions (functions/index.js)
**Image generation**
- `processJob` — Flux/SDXL/nano-banana via fal.ai (trigger: `jobs/{jobId}`)
- `processUpscale` — seedvr upscaling (trigger: `upscaleJobs/{jobId}`)
- `processImageEdit` — Apply edits (brightness/contrast/crop)

**Video**
- `analyzeImageForVideo` — Claude Vision → Veo prompt (trigger: `videoJobs/{id}`)
- `generateVideo` — Veo 3.1 generation (trigger: `videoJobs/{id}`)
- `generateCustomVideoPrompt` — Custom prompt generation via Claude

**Gelato POD**
- `publishToGelato` (trigger: `publishJobs/{id}`)
- `syncGelatoTemplate`, `fetchGelatoTemplates` (trigger: `gelatoTemplateSync/{id}`)
- `syncGelatoProducts` (trigger: `gelatoProductSync/{id}`)

**Etsy**
- `etsyAuthUrl` — OAuth URL (onRequest, CORS)
- `etsyCallback` — OAuth callback (onRequest)
- `publishDigitalToEtsy` (trigger: `digitalPublishJobs/{id}`)

**AI agents**
- `analyzeListing` — Claude Vision + marketing analysis (trigger: `listingJobs/{id}`)
- `handleAiConversation` — Ideation chat (trigger: `ideationCollections/{c}/conversations/{m}`)
- `analyzeCollection` — Collection analysis
- `runMarketingAnalysis` — Marketing content generation

**Utility**
- `fetchFalUsage` — Poll fal.ai usage stats

## Scripts (scripts/)
- `seedConcepts.js` — Seed `concepts` + `prompts`
- `seedKnowledge.js` — Seed `knowledge` from `private/LISTING-AI.md` + `private/PROJECT_CONTEXT.md`
- `generateProductBook.js` — Pull published listings, enrich with Etsy + Claude Vision, emit Markdown + CSV
- `etsyAuth.js` — Local OAuth flow (Express on port 3003) to obtain Etsy tokens
- `bulkUpdateTags.js` — Bulk update Etsy tags from CSV audit
- `fixGiftTags.js` — Replace gendered gift tags with "gamer gift"
- `fixBrokenUrls.js` — Migrate signed URLs → permanent token-based URLs
- `debugCollections.js` — Inspect collection values on images

## Firestore collections
**Core data**: `concepts`, `prompts`, `images`, `collections`, `knowledge`
**Job queues**: `jobs`, `upscaleJobs`, `videoJobs`, `videoGenerate`, `editJobs`, `publishJobs`, `digitalPublishJobs`, `listingJobs`, `gelatoProductSync`, `gelatoTemplateSync`
**Config** (`config/*` sub-docs): `etsy` (tokens), `etsyPkce` (OAuth temp), `gelato` (API config), `gelatoTemplates`, `gelatoProducts`, `falUsage`
**Ideation**: `ideationCollections/{collectionId}/conversations/{messageId}`

## Environment & secrets
Copy `.env.example` → `.env` for Firebase client config.

Cloud Functions secrets (set via `firebase functions:secrets:set <NAME>`):
- `FAL_KEY` — fal.ai
- `ANTHROPIC_API_KEY` — Claude
- `GEMINI_API_KEY` — Google Gemini
- `ETSY_API_KEY`, `ETSY_SHARED_SECRET` — Etsy OAuth

Gelato API key lives in Firestore at `config/gelato`.

## Working rules

### Before touching Cloud Functions
- Always check which job queue a function listens to before editing — the trigger path IS the contract.
- All 18+ functions share `functions/index.js`. A syntax error takes down ALL functions on deploy.
- Test locally with `cd functions && npm run serve` before deploying.
- Never change a Firestore trigger path — pending jobs at the old path will silently stop processing.
- Deploy individual functions (`firebase deploy --only functions:<name>`) when possible to limit blast radius.

### Job queues are one-way
- Jobs flow: `queued → processing → completed | failed`.
- Never manually flip a job back to `queued` — create a new job document instead.
- If a job is stuck in `processing`, check Cloud Function logs first (`firebase functions:log --only <name>`).
- Job documents are the source of truth; don't mutate `images/` or `videos/` to fake progress.

### Gelato template IDs are sacred
- The four template IDs in `config/gelatoTemplates` are live production values tied to real Gelato products.
- Do not edit, duplicate, or reassign them without explicit instruction.
- The Gelato API key lives in Firestore (`config/gelato`), not in env or secrets.

### Etsy OAuth is fragile
- Tokens live in Firestore at `config/etsy`; PKCE temp state at `config/etsyPkce`.
- Re-auth requires the local Express server on port 3003 (`node scripts/etsyAuth.js`).
- Do not touch `EtsyConnectPage`, `etsyAuthUrl`, or `etsyCallback` without understanding the full PKCE flow end-to-end.
- `ETSY_API_KEY` / `ETSY_API_SECRET` are Firebase secrets, not `.env` values.

### fal.ai generation
- Each model (Flux, SDXL, nano-banana, Veo, seedvr) has a different parameter shape and endpoint.
- Check the existing `processJob` switch before adding a new model — follow the same pattern.
- `FAL_KEY` must be a Firebase secret, not in `.env`.
- seedvr upscaling is substantially slower than generation — do not add short timeouts to `processUpscale`.

### LLM providers
- Anthropic Claude is the default for vision + marketing + ideation agents.
- Gemini is a fallback for nano-banana generation; keep both SDKs available.
- `ANTHROPIC_API_KEY` and `GEMINI_API_KEY` are Firebase secrets.

### Don't break
- Keyboard shortcuts across `GalleryPage`, `CollectionDetailPage`, `StatsPage`, `MockupGalleryPage`, `CollectionsPage`, `ListingPanel`, `VideoGenerationPanel` — curation speed depends on them.
- The prompt assembler in `src/lib/promptAssembler.js` — downstream jobs assume its output shape.
- The seedvr upscale pipeline — slow by design, no timeouts.
- Permanent token-based image URLs — `fixBrokenUrls.js` already migrated from signed URLs; do not reintroduce signed-URL generation.

### Windows / shell
- Primary dev is on Windows with bash. Paths contain spaces (`C:\VS code projects\Gamer Art Factory`) — quote them.
- Use forward slashes and Unix conventions (`/dev/null`) in bash commands, not `NUL`.

### What's in progress
_(fill in as active work shifts — e.g. "Building the Etsy digital listings flow", "Tuning Veo 3.1 prompt templates")_

## Gelato Templates
Manually managed in Firestore `config/gelatoTemplates`:
- `66042703-bc08-422f-9940-850a973bf988` — Original (all sizes, all frame colors)
- `7c887511-86fa-4548-9fe9-d5a83b11b48d` — A3 & A4 White Frame
- `39a0defa-6b54-4f5a-99a8-e9a6eff1e6a9` — A3 & A4 Black & White Frame
- `909c3af5-6a40-4437-b04f-c3919d86a9a5` — The Hero Within — White A3/A4 with Passepartout
