# Gamer Art Factory — Project Summary

AI-generated wall art pipeline for the gamer market. End-to-end: prompt engineering → image generation → AI curation → print-on-demand publishing → Etsy listings. Built by a solo developer (Morten Sylvest Nøhr, Copenhagen).

---

## 1. Stack & Tools

### Frontend
| Package | Version | Role |
|---|---|---|
| React | 19.0.0 | UI framework |
| React Router | 7.0.0 | Client-side routing |
| Vite | 6.0.0 | Dev server + bundler |
| Tailwind CSS | 4.0.0 | Styling (`@tailwindcss/vite` plugin) |
| @heroicons/react | 2.2.0 | Icons |
| React Hot Toast | 2.6.0 | Notifications |

### Backend & Infrastructure
| Package | Version | Role |
|---|---|---|
| Firebase | 11.0.0 (client) | Auth, Firestore, Storage |
| Firebase Admin | 13.7.0 (functions) | Cloud Functions server SDK |
| Node.js | 20 | Cloud Functions runtime |
| sharp | 0.34.5 | JPG conversion, print optimization |

### AI & Image Models
| Service / Package | Version | Role |
|---|---|---|
| @fal-ai/client | 1.0.0 | Image generation (Flux, SDXL, nano-banana) |
| fal-ai/seedvr | — | 2×–4× upscaling |
| fal-ai/veo3.1 | — | Video generation |
| @anthropic-ai/sdk | 0.87.0 (root) / 0.39.0 (functions) | Claude Sonnet 4 — vision, marketing, ideation |
| @google/generative-ai | 0.24.1 | Gemini fallback for content generation |
| @google/genai | 1.0.0 | Newer Gemini SDK (nano-banana prompt wrapper) |

### Third-party APIs
- **Gelato** — Print-on-demand; `ecommerce.gelatoapis.com/v1`
- **Etsy** — Marketplace; `api.etsy.com/v3/application`; OAuth 2.0 + PKCE
- **fal.ai** — All image/video model inference

### Other
- `node-fetch` 3.3.0 — HTTP in Cloud Functions (Gelato/Etsy calls)
- `form-data` 4.0.5 — Etsy image uploads
- `uuid` 4.x — Unique IDs
- `dotenv` 17.4.1 — Local env

---

## 2. Firebase Setup

### Project Config
- **Hosting**: serves `dist/` with SPA rewrite to `/index.html`
- **Firestore**: rules + indexes auto-deployed via `firebase.json`
- **Storage**: rules deployed from `storage.rules`
- **Functions**: source at `functions/`, Node 20 runtime

### Auth
Single-user email/password auth. No multi-user model. `AuthProvider` context wraps the entire app; `useAuth()` returns `{ user, loading, signIn, signOut }`.

### Firestore Rules (`firestore.rules`)
All reads/writes require `isAuthenticated()`. No public access.

### Firestore Indexes (`firestore.indexes.json`)
- `concepts`: type + createdAt (desc)
- `images`: rating + createdAt; collection + createdAt; upscaled + createdAt; ideationCollectionId + createdAt; collection + listing.status + createdAt
- `jobs`: status + createdAt
- `conversations`: role + timestamp
- `collectionAnalyses` / `marketingAnalyses`: collectionSlug + createdAt

### Storage Rules (`storage.rules`)
Authenticated users can read/write to: `images/`, `thumbnails/`, `upscaled/`, `edits/`, `videos/`.

### Emulators
When `VITE_USE_EMULATORS=true` is set in `.env`, `src/lib/firebase.js` connects to local emulators:
- Firestore: 8080
- Storage: 9199
- Auth: 9099
- Functions: 5001

### Secrets Management
All sensitive keys are Firebase secrets (set with `firebase functions:secrets:set <NAME>`):
- `FAL_KEY` — fal.ai
- `ANTHROPIC_API_KEY` — Claude
- `GEMINI_API_KEY` — Google Gemini
- `ETSY_API_KEY`, `ETSY_API_SECRET` — Etsy OAuth
- Gelato API key lives in Firestore at `config/gelato` (not a secret)

### Deploy
- **Full deploy**: `firebase deploy` (all services)
- **Functions only**: `firebase deploy --only functions` or `firebase deploy --only functions:<name>`
- **Frontend only**: `npm run build` → `firebase deploy --only hosting`

---

## 3. Frontend Patterns

### Routing (`src/App.jsx`)
`BrowserRouter` → `AuthProvider` → `ProtectedRoutes` → `<Layout>` (sidebar + `<Outlet>`)

Routes:
- `/` → ConceptsPage (concept library)
- `/builder-v2`, `/builder-v2/:collectionId` → BuilderV2Page
- `/builder` → BuilderPage (prompt assembly + generation)
- `/mockups` → MockupBuilderPage
- `/queue` → QueuePage (job monitor)
- `/gallery` → GalleryPage (image curation)
- `/collections` → CollectionsPage
- `/mockup-gallery` → MockupGalleryPage
- `/stats` → StatsPage
- `/videos` → VideoGalleryPage
- `/batch-video` → BatchVideoPage
- `/analysis` → CollectionAnalysisPage
- `/settings/etsy` → EtsyConnectPage

### State Management
No Redux or Zustand. All state is either:
1. **Firestore real-time** via custom hooks (`useFirestore.jsx`)
2. **Local `useState`** for ephemeral UI state

### Custom Hooks (`src/hooks/`)
- `useAuth()` — Auth state + signIn/signOut
- `useCollection(name, filters, sortField)` — Real-time Firestore subscription
- `usePaginatedCollection(name, filters, sortField, pageSize=10)` — Pagination + loadMore
- `useDocument(name, docId)` — Single document subscription
- `useFirestoreCrud(name)` — `{ add, update, remove, get }` with `serverTimestamp()`
- `useCollections()` — Collection management with auto-seed from hardcoded defaults

### Data Flow Pattern
1. Hook subscribes to Firestore query → `onSnapshot` listener
2. State updates trigger re-render
3. User actions call CRUD methods → Firestore write → Cloud Function trigger → job doc updates → UI updates via subscription

### Loading / Error States
- Local `useState` for `loading` and `error`
- Subscriptions set `loading = false` after first snapshot
- Errors set error state + log to console
- Cancelled flag prevents state updates after unmount (StrictMode safe)

### Component Structure
- `src/pages/` — Full-page components (one per route)
- `src/components/` — Reusable UI: `PageHeader`, `Button`, `Badge`, `ConceptPicker`, `ImageEditPanel`, `ListingPanel`, `VideoGenerationPanel`
- `src/hooks/` — Data hooks
- `src/lib/` — Pure utilities: `firebase.js`, `promptAssembler.js`, `imageUtils.js`, `sourceParser.js`

### Styling
- Tailwind CSS v4 via Vite plugin (no config file needed)
- CSS custom properties: `--color-bg`, `--color-text`, `--color-border`, `--color-primary`, etc.
- Dark theme via CSS variables (not Tailwind dark mode classes)
- Responsive via Tailwind grid/flex utilities

### UI Conventions
- `PageHeader` component at top of every page
- Tabs for view-switching within a page
- Modals rendered conditionally (not a portal pattern)
- Keyboard shortcuts throughout for speed-curation
- Batch mode for multi-select operations

---

## 4. Workflow & Commands

### Daily Dev
```bash
npm run dev                        # Vite dev server → localhost:5173
cd functions && npm run serve      # Cloud Functions emulator
```

### Build & Deploy
```bash
npm run build                      # Build dist/ for Firebase Hosting
cd functions && npm run deploy     # Deploy all Cloud Functions
firebase deploy --only functions:processJob   # Deploy single function
firebase deploy --only hosting     # Deploy frontend only
```

### Data & Maintenance Scripts
```bash
npm run seed                       # Seed concepts + prompts to Firestore
npm run product-book               # Export published listings → Markdown + CSV

node scripts/etsyAuth.js           # Local OAuth flow (Express :3003) — get Etsy tokens
node scripts/bulkUpdateTags.js     # Bulk Etsy tag update from CSV
node scripts/fixGiftTags.js        # Replace gendered gift tags
node scripts/fixBrokenUrls.js      # Migrate signed URLs → permanent token URLs
node scripts/debugCollections.js   # Inspect collection assignments
node scripts/seedKnowledge.js      # Seed knowledge docs from markdown
```

### Logs & Debugging
```bash
firebase functions:log --only processJob    # Stream Cloud Function logs
firebase functions:secrets:set FAL_KEY      # Set a secret
```

---

## 5. Conventions

### Naming
- **React components**: PascalCase (`GalleryPage`, `ImageEditPanel`)
- **Hooks**: camelCase with `use` prefix (`useFirestore`, `useCollections`)
- **Firestore collections**: camelCase plural (`upscaleJobs`, `videoJobs`, `digitalPublishJobs`)
- **Document IDs**: Firestore auto-generated for most; `collections` use the slug as docId; `config` sub-documents use fixed names (`etsy`, `gelato`, etc.)
- **Firestore fields**: camelCase (`createdAt`, `jobId`, `promptText`, `storagePathUpscaled`)
- **Functions**: camelCase (`processJob`, `analyzeListing`, `publishDigitalToEtsy`)

### File Organization
```
src/
  pages/          one file per route
  components/     reusable UI pieces
  hooks/          data + auth hooks
  lib/            pure utility modules
functions/
  index.js        all Cloud Functions (one file)
  src/            agent implementations (collectionAnalysis, marketingAgent, aiConversation)
scripts/          one-off Node scripts for data ops
```

### Job Pattern
- Jobs are documents in a Firestore collection that trigger Cloud Functions
- Status flow: `queued → processing → completed | failed`
- Never flip a job back to `queued` — create a new document
- All job docs have: `status`, `createdAt`, `startedAt`, `completedAt`, `error`
- Cost tracked per job (real or estimated)

### Firestore Query Convention
Filters passed as `{ field, op, value }` objects to custom hooks. Sort always descending by `createdAt` or named field. Queries are memoized by dependencies.

### Image URL Convention
Permanent token-based URLs (not signed URLs):
```
https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedPath}?alt=media&token={token}
```
Token comes from Storage file metadata after upload. Never use `getDownloadURL()` (produces time-limited signed URLs).

---

## 6. External Integrations

### fal.ai (Image & Video Generation)
```js
const { fal } = await import("@fal-ai/client");
fal.config({ credentials: FAL_KEY.value() });
await fal.subscribe(modelId, { input: { ... }, logs: true, onQueueUpdate: () => {} });
```

**Model endpoints & key params:**
| Model | fal.ai ID | Key Params |
|---|---|---|
| Flux Pro/Dev/Schnell | `fal-ai/flux/dev` etc. | width, height, num_inference_steps, guidance_scale, seed, num_images |
| SDXL | `fal-ai/fast-sdxl` | Same as Flux |
| nano-banana Pro | `fal-ai/nano-banana-pro` | prompt, aspect_ratio, resolution ("2K"/"4K"), safety_tolerance |
| nano-banana 2 | `fal-ai/nano-banana-2` | Same as pro variant |
| SeedVR upscaler | `fal-ai/seedvr` | image_url, upscale_mode, upscale_factor (2 or 4), noise_scale |
| Veo 3.1 | `fal-ai/veo3.1/fast/image-to-video` | prompt, image_url, aspect_ratio ("9:16"), duration ("4s"), resolution ("720p") |

### Gelato (Print-on-Demand)
- Base URL: `https://ecommerce.gelatoapis.com/v1`
- Auth: `X-API-KEY: {key}` header (key in Firestore `config/gelato`, not a secret)
- Key endpoints:
  - `GET /templates` — list templates
  - `GET /templates/{id}` — get template + variant imagePlaceholder names
  - `POST /stores/{storeId}/products:create-from-template` — create product
- Payload: `{ templateId, title, description (HTML), isVisibleInTheOnlineStore, tags, variants: [{ id, imagePlaceholders: [{name, fileUrl}] }] }`
- Template IDs are sacred — they're live production Firestore values

### Etsy (OAuth 2.0 + PKCE)
- Client ID (`ETSY_API_KEY`) stored as Firebase secret
- OAuth flow uses local Express server on port 3003 (`scripts/etsyAuth.js`)
- Tokens stored in Firestore `config/etsy`: `accessToken`, `refreshToken`, `expiresAt`, `shopId`
- Refresh logic: if token expires within 5 min, auto-refresh via `grant_type=refresh_token`
- PKCE temp state in `config/etsyPkce` (deleted after auth completes)
- Digital listings: `type=download`, `is_digital=true`, upload file via `/listings/{id}/files`
- Physical listings: created by Gelato (response includes `externalId` = Etsy listing ID)

### Anthropic Claude
```js
const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
const response = await client.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 2000,
  messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", ... } }, { type: "text", text: prompt }] }]
});
```
Use cases:
1. **Video analysis** (500 tokens) — image → 3 video prompt suggestions
2. **Listing analysis** (2000 tokens) — image → `{ title, tags[13], description, artStyle, mood, gamerType }`
3. **Custom video prompt** (512 tokens) — user direction + image → refined Veo prompt
4. **Collection/marketing analysis** (4096 tokens) — multi-image + knowledge docs → rich content with citations
5. **Ideation chat** — conversational prompt/concept generation

### Google Gemini
```js
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
```
Used as fallback for collection/marketing analysis when Gemini is selected by user.

---

## 7. What's Unique to This Project

### The Prompt Assembly System (`src/lib/promptAssembler.js`)
The core creative engine. Concepts are building blocks with types (`theme`, `prop`, `bodyType`, `chaosLevel`, `style`, `camera`, `text`). `assemblePrompt()` joins them in a fixed order:

```
SYSTEM_PROMPT → camera → bodyType → theme → chaosLevel → props → text → style → aspect ratio
```

`SYSTEM_PROMPT` is hardcoded: "gamer sitting at desk, left hand on keyboard, right hand on mouse, gaming monitor glowing in front". Every image starts with this anchor.

### Multi-Stage Image Pipeline
1. Generate at 768×1088 (Flux) or 2K/4K (nano-banana)
2. Rate via keyboard shortcuts (1/2/3 = keep/maybe/reject)
3. 4× upscale via SeedVR → A3 at 300 DPI minimum (~4961px long edge)
4. Print-optimize (+12% brightness, +8% contrast, +5% saturation) for wall visibility
5. AI analysis → listing data (title, 13 tags, description)
6. Publish to Gelato POD → Etsy physical listing
7. Optionally publish digital download to Etsy separately

### Collections System
13 named collections with slug (used as Firestore doc ID), name, tagline, mood. Images belong to at most one collection. Collections drive Gelato product grouping, Etsy tag strategy, and marketing analysis.

### Knowledge Base for Marketing Agent
`knowledge` collection stores markdown documents (seeded from `private/LISTING-AI.md` and `private/PROJECT_CONTEXT.md`). Marketing agent loads enabled docs and builds system prompt around them. Claude cites sources with `[source: slug]` notation.

### Rating-Driven Curation
Every image has `rating: unrated | keep | maybe | reject` and `favorite: boolean`. Gallery uses keyboard shortcuts for high-speed curation. Batch operations apply ratings/tags to multiple images at once. This rating data drives what gets upscaled, listed, and published.

### Job Queue as Source of Truth
All heavy operations (generate, upscale, video, publish, analyze) are Firestore documents that trigger Cloud Functions. The UI monitors jobs in real-time. Jobs are never mutated backward — failures create new attempts.

### Firestore `config/` as App Config Store
Gelato API key, Etsy tokens, template definitions, product cache — all live in Firestore `config/*` sub-documents rather than environment variables or local files. This means config changes don't require deploys.

---

## 8. What's Transferable

### Firebase Patterns
- `useFirestore.jsx` hook pattern (useCollection, usePaginatedCollection, useDocument, useFirestoreCrud) is a complete, reusable Firestore data layer. Copy to any Firebase project.
- Permanent token-based Storage URL pattern (avoids signed-URL expiry).
- Emulator toggle via `VITE_USE_EMULATORS` env var in `src/lib/firebase.js`.
- `AuthProvider` + `ProtectedRoutes` + `useAuth` pattern for single-user Firebase apps.

### Job Queue Architecture
Firestore-as-job-queue → Cloud Function trigger → status updates → real-time UI. A solid pattern for any async, long-running work (AI generation, file processing, API calls). The status flow (`queued → processing → completed | failed`) and the "create new job instead of retry" rule are worth keeping.

### Claude Vision + Structured JSON Output
Prompting Claude to return structured JSON from image analysis (title/tags/description for Etsy listings) is a reusable pattern. The tag count constraint (exactly 13), word diversity rules, and persona-driven copy style are project-specific but the extraction pattern is general.

### fal.ai Client Pattern
`fal.subscribe()` with `onQueueUpdate` callback and result extraction is standard across all fal.ai models. Each model needs its own parameter shape — always check the fal.ai model card.

### sharp Image Processing
- `toOptimizedJpg(buffer)`: `sharp(buf).jpeg({ quality: 93, mozjpeg: true })`
- `toPrintOptimizedJpg(buffer)`: `.modulate({ brightness: 1.12, saturation: 1.05 }).linear(1.08, 0)` then JPEG
- Resizing for API size limits: try 1600px at q75, then 1200px at q65

### Etsy PKCE OAuth
The full PKCE flow (local Express server → auth URL → callback → token exchange → Firestore storage + refresh logic) is a complete, solved pattern for Etsy OAuth in a Firebase project.

### Tailwind CSS v4 + Vite Setup
`@tailwindcss/vite` plugin with CSS custom properties for theming is a clean, minimal setup that avoids a config file.

---

## Appendix: Data Models

### Image Document (`images/{id}`)
```
storagePath, storagePathUpscaled, storagePathPrint
url, urlOriginal, urlPrint          (permanent token URLs)
thumbnailPath
width, height, upscaledWidth, upscaledHeight
upscaled: boolean, upscaleScale: 2|4, upscaleJobId
jobId, promptId, ideationCollectionId
promptText, category: "art"|"mockup"
rating: "unrated"|"keep"|"maybe"|"reject"
favorite: boolean
tags: string[]
collection: slug | null, collectionDisplayName
videoJobId, videoStatus, videoPrompt, videoPath, videoUrl
metadata: { seed, model, inferenceSteps, guidanceScale }
listing: {
  status: "draft"|"published"
  collection, collectionDisplayName
  title, tags[13], description, artStyle, mood, gamerType
  gelatoProductId, etsyListingId, etsyListingUrl
  etsyDigitalListingId, etsyDigitalListingUrl
  generatedAt, editedAt, publishedAt, digitalPublishedAt
}
publishedAt, createdAt, updatedAt, exportedAt
```

### Job Document (`jobs/{id}`)
```
promptId, promptText, ideationCollectionId
category, model, variants
modelParams: { width, height, num_inference_steps, guidance_scale, seed, aspectRatio, resolution }
status: "queued"|"processing"|"completed"|"failed"
imageIds: [id, ...]
cost: number, error: string|null
startedAt, completedAt, createdAt
```

### Concept Document (`concepts/{id}`)
```
type: "theme"|"prop"|"text"|"bodyType"|"chaosLevel"|"style"|"camera"
name, value (the prompt text)
tier: 1|2|3, tags: string[]
category (props only: "food_drink"|"gear"|"room"|"body")
notes, createdAt, updatedAt
```

### Prompt Document (`prompts/{id}`)
```
name (human-readable combo name)
nanoPrompt (assembled final prompt text)
conceptRefs: { camera, theme, props[], text, bodyType, chaosLevel, style }
formatParams: { aspectRatio, orientation, size }
model, negativePrompt
generationCount, bestImageId
status: "active"
createdAt, updatedAt
```

### Collection Document (`collections/{slug}`)
```
slug (= doc ID), name, tagline, mood, order
createdAt, updatedAt
```

### Config Sub-documents (`config/{name}`)
- `etsy`: `{ accessToken, refreshToken, expiresAt, shopId, scope, whoMade, whenMade, taxonomyId, defaultPrice, connectedAt }`
- `gelato`: `{ storeId, templateId, templateTitle, imagePlaceholders, variants[{ id, title, productUid, imagePlaceholders[{ name, fileUrl }] }], lastSynced }`
- `gelatoTemplates`: `{ templates[{ id, title, description, variantCount, variants, imagePlaceholders }], totalCount, lastSynced }`
- `gelatoProducts`: `{ products[{ id, title, status, storeProductId, previewUrl, createdAt }], totalCount, lastSynced, storeId }`
- `falUsage`: `{ totalCost: number }`

---

## Cloud Function Resource Configuration
| Function | Timeout | Memory |
|---|---|---|
| processJob (image gen) | 300s | 1GiB |
| processUpscale (seedvr) | 540s | 1GiB |
| processImageEdit | 120s | 512MiB |
| analyzeImageForVideo | 120s | 512MiB |
| generateVideo | 540s | 512MiB |
| analyzeListing | 300s | 1GiB |
| analyzeCollection | 300s | 1GiB |
| runMarketingAnalysis | 300s | 1GiB |
| publishToGelato | 120s | 512MiB |
| publishDigitalToEtsy | 300s | 512MiB |
