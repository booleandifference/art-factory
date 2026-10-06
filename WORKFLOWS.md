# Gamer Art Factory -- Workflows

Complete documentation of all pipelines and workflows in the app.

## Architecture Overview

The app implements a **four-layer pipeline**:

1. **Prompt Engine** -- Concept library + prompt assembly
2. **Generation Engine** -- fal.ai image generation + optimization
3. **Curation Dashboard** -- Rating, upscaling, video generation, listing creation
4. **Publish Pipeline** -- Gelato (POD framed posters) + Etsy (digital downloads)

**Tech stack**: React (Vite) + Tailwind CSS v4 --> Firebase (Firestore, Storage, Functions) --> fal.ai, Claude API, Gelato API, Etsy API

**Pattern**: All async workflows use **Firestore job documents + Cloud Function triggers**. The frontend creates a job doc --> the Cloud Function picks it up --> processes --> writes results back. The UI subscribes in real-time via `onSnapshot`.

---

## Workflow 1: Concept Library

**Files**: `src/pages/ConceptsPage.jsx`, `src/lib/seedData.js`, `scripts/seedConcepts.js`

Concepts are the building blocks for prompt assembly. Each concept has a `type`, `label`, and `promptFragment`.

### Concept Types

| Type | Purpose | Examples |
|------|---------|---------|
| `camera` | Composition angles | centered behind, low angle, wide shot, elevated, close |
| `theme` | Art/scene styles | cyberpunk, anime, lo-fi, cloud dream, skeleton gamer |
| `prop` | Scene details | energy cans, RGB keyboard, headphones, monitors, cat |
| `text` | Floating text overlays | GG, one more game, Respawn, Press F |
| `bodyType` | Character appearance | hood up, girl long dark hair, boy short blonde |
| `chaosLevel` | Room vibe | messy desk, clean minimal setup |
| `style` | Art rendering style | watercolor, anime, pixel art, charcoal, ink sketch |

### Seed Flow

User clicks **"Seed Database"** on the Concepts page --> batch writes ~150 concepts to Firestore `concepts` collection. Existing concepts are preserved (seed only adds missing ones).

---

## Workflow 2: Prompt Building

**Files**: `src/pages/BuilderPage.jsx`, `src/lib/promptAssembler.js`

### Flow

1. User selects one concept per type (multiple allowed for props)
2. `assemblePrompt()` combines fragments in order:
   - System prompt: *"gamer sitting at desk, left hand on keyboard, right hand on mouse..."*
   - Camera composition
   - Body type + theme
   - Chaos level (desk vibe)
   - Props (comma-separated)
   - Text expression
   - Art style
   - Format params (aspect ratio)
3. Preview shows assembled prompt in a resizable textarea
4. User can manually edit the prompt (override mode)
5. Save prompt or generate images directly

### Configuration

- **Models**: Nano Banana 2 (fast/$0.02), Flux Pro, Flux Dev, Flux Schnell, SDXL
- **Aspect Ratios**: 2:3 (A4 portrait), 3:4, 16:9, 1:1
- **Resolution**: Up to 4K (Nano Banana only)
- **Negative Prompt**: Optional things to avoid
- **System Prompt**: Toggle on/off

### Storage

Saves to `prompts` collection with concept references (IDs, not copies) for reusability.

---

## Workflow 3: Image Generation

**Files**: `functions/index.js` --> `processJob()`

### Trigger

Document created in `jobs/{jobId}` with `status: "queued"`

### Steps (per variant, 1-4 images)

1. Call **fal.ai** with model-specific parameters
2. Download generated image buffer
3. Convert to optimized JPG (quality 93, mozjpeg) -- ~50% file size reduction
4. Upload to Firebase Storage: `images/{jobId}/{i}.jpg`
5. Generate 7-day signed URL
6. Create `images` document with metadata (dimensions, model, seed, cost, etc.)
7. Update job with `imageIds[]`, increment `prompts.generationCount`

### Model-Specific Input

- **Nano Banana 2** (Gemini): uses `aspect_ratio` enum + `resolution` string (2K/4K), `safety_tolerance: "4"`
- **Flux / SDXL**: uses `image_size` (width/height pixels), `num_inference_steps`, `guidance_scale`

### Cost Tracking

| Model | Cost per image |
|-------|---------------|
| Nano Banana 2 | $0.02 |
| Flux Pro | $0.05 |
| Flux Schnell | $0.01 |
| Others | $0.03 |

### Error Handling

Job status set to `failed` with error message. User can retry from Queue page.

---

## Workflow 4: Image Curation & Rating

**Files**: `src/pages/GalleryPage.jsx`

### Features

- **Rating system**: keep (green), maybe (yellow), reject (red), unrated
- **Filters**: by rating, upscale status, collection
- **Favorites**: toggle per image
- **Batch mode**: select multiple images, rate all at once
- **Pagination**: 10 images at a time, "Load More" for infinite scroll
- **Mockup exclusion**: images with `category: 'mockup'` are filtered out of the art gallery

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` / `2` / `3` | Rate keep / maybe / reject |
| `F` | Toggle favorite |
| `U` | Upscale for print |
| `Space` / Right Arrow | Next image |
| Left Arrow | Previous image |
| `Esc` | Deselect |

### Detail Panel

When an image is selected, the right panel shows:
- Full image preview
- Rating buttons (keep / maybe / reject)
- Collection assignment dropdown
- Action buttons: Favorite, Upscale for Print, Download Original/Upscaled/Print, Generate Video, Prepare Listing
- Video preview (if generated)
- Prompt text
- Metadata: model, seed, steps, guidance, dimensions, print readiness, upscale status

### Print Readiness Indicator

| Long edge | Print size |
|-----------|-----------|
| >= 4961px | A3+ at 300 DPI |
| >= 3508px | A4 at 300 DPI |
| >= 2480px | A4 at 200 DPI |
| < 2480px | Needs upscale |

---

## Workflow 5: Image Upscaling

**Files**: `src/pages/GalleryPage.jsx` (trigger), `functions/index.js` --> `processUpscale()`

### Trigger

User clicks **"Upscale for Print"** or presses `U` in gallery. Frontend creates an `upscaleJobs` document with `status: "queued"` and `imageId`.

### Steps

1. Download original image from signed URL
2. Upload to fal.ai storage (signed URLs can be unreliable for external services)
3. Call **SeedVR upscaler** (`fal-ai/seedvr/upscale/image`) at 2x factor with `noise_scale: 0.1`
4. Create **two versions**:
   - **Standard**: Faithful upscale (JPG q93) -- `toOptimizedJpg()`
   - **Print-optimized**: Enhanced for wall viewing (JPG q93) -- `toPrintOptimizedJpg()`:
     - +12% brightness (helps dark images read on walls)
     - +8% contrast (details pop at distance)
     - +5% saturation (neon/glow enhancement)
5. Upload both to Storage: `upscaled/{imageId}.jpg` and `upscaled/{imageId}_print.jpg`
6. Update image doc:
   - `upscaled: true`, `upscaleScale: 2`
   - `urlOriginal` preserves the pre-upscale URL
   - `url` replaced with upscaled version
   - `urlPrint` points to print-optimized version
   - `storagePathUpscaled`, `storagePathPrint` set

### Important Notes

- `urlOriginal` is preserved so Claude analysis (video/listing) uses the smaller image, staying under the 5MB API limit
- Print-optimized version is used for Gelato publishing
- Gallery shows "2x" badge on upscaled images
- Frontend tracks upscale progress via real-time Firestore subscription (watches for `upscaled` flag)

---

## Workflow 6: Video Generation

**Files**: `src/components/VideoGenerationPanel.jsx`, `functions/index.js` (3 functions)

### Phase A: Image Analysis --> `analyzeImageForVideo()`

**Trigger**: Document created in `videoJobs/{jobId}` with `status: "queued"`

1. User clicks **"Analyze Image for Video"** in the VideoGenerationPanel modal
2. Cloud Function downloads image (uses `urlOriginal` for smaller size; resizes if >3.7MB for Claude's base64 limit)
3. Claude (claude-sonnet-4-20250514) analyzes artwork and suggests **3 video prompts**:
   - **Subtle / Atmospheric** -- gentle movement (screen flicker, dust particles)
   - **Medium / Animated** -- moderate effects (typing hands, swaying cables, shifting light)
   - **Dramatic / Effects** -- intense animation (shattering glass, room warping, dimensional glitch)
4. Rule: gamer stays still/unflinching, environment moves around them
5. Each prompt ends with "4 seconds, smooth loop"
6. Job status --> `awaiting_selection`, image gets `videoJobId` and `videoStatus: "awaiting_selection"`

### Phase B: Prompt Selection --> `generateVideo()`

**Trigger**: Document created in `videoGenerate/{triggerId}`

1. User clicks a suggested prompt card
2. Frontend writes to `videoGenerate` collection with `videoJobId` and chosen `prompt`
3. Cloud Function uploads source image to fal.ai storage
4. Calls **Veo 3.1** (`fal-ai/veo3.1/fast/image-to-video`):
   - Aspect ratio: 9:16 (portrait)
   - Duration: 4 seconds
   - Resolution: 720p
   - Audio: disabled
   - Safety tolerance: 4
5. Downloads MP4, uploads to Storage: `videos/{imageId}.mp4`
6. Updates image: `videoUrl`, `videoPrompt`, `videoStatus: "completed"`, `videoPath`

### Phase C: Custom Prompt --> `generateCustomVideoPrompt()`

**Trigger**: Document created in `videoCustomPrompt/{triggerId}`

1. User types creative direction (e.g. "glass shattering, room bending like the matrix")
2. Frontend writes to `videoCustomPrompt` collection with `videoJobId` and `userDirection`
3. Claude receives the image + user direction and generates a specific Veo 3.1 prompt
4. Auto-creates a `videoGenerate` document to trigger Phase B

### Re-generation

"Generate Another" button creates a fresh analysis job, allowing unlimited video iterations per image.

---

## Workflow 7: AI Listing Generation

**Files**: `src/components/ListingPanel.jsx`, `functions/index.js` --> `analyzeListing()`, `functions/prompts/*.md`

### Trigger

User clicks **"Generate Listing with AI"** in the Listing Panel. Frontend creates a `listingJobs` document with `status: "queued"` and `imageId`.

### Claude Analysis

**Trigger**: Document created in `listingJobs/{jobId}`

Claude (claude-sonnet-4-20250514) receives the image plus the listing prompt for that shop or collection, loaded from `functions/prompts/` (private, gitignored; see `functions/prompts.example/` for the shape). The prompt defines the target buyer, title formula, 13-tag strategy and description structure.

**Claude returns JSON:**
- `collection` (slug), `collectionDisplayName`
- `title`, `tags` (array of 13), `description`
- `artStyle`, `mood`, `gamerType`

### Result Storage

Updates the `images` document with a `listing` object containing all generated data plus `status: "draft"`.

### Editing

User can edit title, tags (add/remove, max 13), description, and collection in the ListingPanel. Saving changes updates `listing.status` to `ready`.

### Publish Checklist

All must pass before publishing:
- Print-ready version created (`urlPrint` exists)
- Title set (max 140 chars)
- 13 tags set
- Description set
- Collection assigned

---

## Workflow 8: Publish to Gelato (Print-on-Demand)

**Files**: `src/components/ListingPanel.jsx`, `src/pages/CollectionsPage.jsx`, `functions/index.js` --> `publishToGelato()`, `syncGelatoTemplate()`

### Prerequisites

1. Gelato store created with framed poster template
2. Store ID + Template ID configured in Collections page --> Gelato Setup
3. Template synced via `syncGelatoTemplate()` (caches variant IDs and placeholder names in `config/gelato`)

### Template Sync Flow

**Trigger**: Document created in `gelatoSync/{triggerId}`

1. User enters Store ID and Template ID on Collections page
2. Frontend creates a `gelatoSync` document with `status: "queued"`
3. Cloud Function fetches template from Gelato API: `GET /v1/templates/{templateId}`
4. Extracts: template title, image placeholders, variant details (IDs, titles, productUids, per-variant placeholders)
5. Caches in `config/gelato` with `lastSynced` timestamp

### Publish Flow

**Trigger**: Document created in `publishJobs/{jobId}`

1. User clicks **"Publish to Etsy via Gelato"** (all checklist items must pass)
2. Cloud Function:
   - Loads image + listing data
   - Gets Gelato config from `config/gelato`
   - Generates fresh signed URL for the print image (priority: `storagePathPrint` --> `storagePathUpscaled` --> `storagePath`)
   - Fetches fresh template data from Gelato (falls back to cache if fetch fails)
   - Builds variant array: maps each variant's image placeholders to the print image URL
   - Converts description to HTML format
   - POSTs to Gelato: `/v1/stores/{storeId}/products:create-from-template` with title, description, tags, variants
   - Gelato creates product and auto-publishes to connected Etsy shop
3. Updates image: `listing.status: "published"`, `listing.gelatoProductId`, `listing.etsyListingId`

### Gelato Product Specs

- Frame: Durable pine wood (black, white, natural wood, dark brown)
- Paper: 170 gsm semi-glossy finish
- Protection: Shatterproof plexiglass
- Sustainable: FSC-certified materials
- Ready-to-hang: includes hanging kit
- Printed and shipped on demand

### Republish

"Republish to Gelato" button available on published listings. "Reset to Draft" clears Gelato/Etsy IDs and reverts status.

---

## Workflow 9: Etsy OAuth Connection

**Files**: `src/pages/EtsyConnectPage.jsx`, `functions/index.js` --> `etsyAuthUrl()`, `etsyCallback()`

### Connect Flow

1. User clicks **"Connect Etsy"** on Settings --> Etsy page
2. `etsyAuthUrl()` (HTTPS endpoint, public):
   - Generates PKCE code verifier (32 random bytes, base64url) and SHA-256 challenge
   - Generates random state parameter
   - Stores verifier + state in `config/etsyPkce` (temporary)
   - Returns Etsy OAuth URL with scopes: `listings_w listings_r shops_r`
3. Frontend redirects user to Etsy login
4. User authorizes the app on Etsy
5. Etsy redirects to `etsyCallback()` (HTTPS endpoint) with authorization code:
   - Validates state parameter against stored PKCE data
   - Exchanges authorization code for access + refresh tokens via `POST /v3/public/oauth/token`
   - Auto-detects user's shop ID from Etsy API
   - Stores in `config/etsy`: access token, refresh token, expiry, shop ID, scopes, connected timestamp, defaults (price $6.99, taxonomy 2078, whoMade, whenMade)
   - Deletes temporary `config/etsyPkce` document
   - Redirects back to app: `/settings/etsy?connected=true`

### Token Auto-Refresh

`getEtsyAccessToken()` helper checks token expiry before each API call. If expiring within 5 minutes, refreshes using the stored refresh token.

### Settings (EtsyConnectPage)

- Connection status with green/red indicator
- Shop ID (auto-detected, editable)
- Default price for digital downloads ($6.99 recommended)
- Token expiry display ("auto-refreshes")
- Disconnect option (clears tokens)

---

## Workflow 10: Publish Digital Download to Etsy

**Files**: `src/components/ListingPanel.jsx`, `functions/index.js` --> `publishDigitalToEtsy()`

### Prerequisites

Etsy connected (Workflow 9), listing data generated and ready, all checklist items passed.

### Trigger

Document created in `digitalPublishJobs/{jobId}` with `status: "queued"`

### Four-Step Process

1. **Create draft listing**: `POST /v3/application/shops/{shopId}/listings`
   - `type: "download"`, `is_digital: "true"`, `quantity: "999"`
   - Title, description, price, tags, taxonomy_id (2078 = Art Prints)
   - `who_made: "i_did"`, `when_made: "2020_2025"`

2. **Upload preview image**: `POST .../listings/{listingId}/images`
   - Uses print-optimized image (preferred) or upscaled/original
   - Downloaded from Firebase Storage, uploaded as multipart form
   - Non-critical: listing still works if image upload fails

3. **Upload digital file**: `POST .../listings/{listingId}/files`
   - Uses upscaled image (preferred) or print/original
   - Filename sanitized from title (lowercase, no special chars, max 50 chars + "-high-res.jpg")

4. **Activate listing**: `PATCH .../listings/{listingId}` with `state: "active"`
   - Some listings may need manual Etsy review

### Result

Updates image document:
- `listing.digitalStatus: "published"`
- `listing.etsyDigitalListingId`
- `listing.etsyDigitalListingUrl` (direct link to Etsy listing)

### Two Revenue Streams

Same artwork publishes as:
- **Physical** (via Gelato): Framed poster, $55-85 range, print-on-demand fulfillment
- **Digital** (direct to Etsy): Downloadable high-res file, $6-8 range, no fulfillment needed

---

## Workflow 11: Collections

**Files**: `src/pages/CollectionsPage.jsx`, `src/lib/imageUtils.js`

### 13 Thematic Collections

| Slug | Name | Vibe |
|------|------|------|
| `in-the-clouds` | In the Clouds | Dreamy, floating desk, clouds, pastel |
| `flow-state` | Flow State | Yoga, zen, meditation, floating |
| `beautiful-bubbles` | Beautiful Bubbles | Soap bubbles, floating, connected |
| `the-multitasker` | The Multitasker | Multiple arms, octopus energy |
| `in-this-life-or-the-next` | In This Life or the Next | Skeleton gamer, undead, dark, eternal |
| `another-dimension` | Another Dimension | Mirror rooms, recursive reflections, infinite |
| `boss-level` | Boss Level | Throne, epic, dramatic, power fantasy |
| `sleep-is-overrated` | Sleep is Overrated | 3AM, dark room, energy cans, dedication |
| `neon-district` | Neon District | Cyberpunk, rain, neon signs, dark |
| `pixel-nostalgia` | Pixel Nostalgia | CRT monitors, 8-bit, pixel art, retro |
| `till-the-sun-comes-up` | Till the Sun Comes Up | Golden sunrise, dust beams, all-night session |
| `laser-focus` | Laser Focus | Clean, minimal, professional, aspirational |
| `respawn` | Respawn | Dark metal, gothic, intense, aggressive |

### Features

- Collection cards with 4-image preview grids
- Image count per collection
- Click to view all images in a collection (4-column grid)
- Click an image to navigate to Gallery with that image selected
- Uncollected images card (links to Gallery for assignment)
- Gelato Setup panel for template configuration and sync

### Assignment Methods

1. **Manual**: Gallery detail panel collection dropdown
2. **AI-assigned**: During listing generation (Claude identifies collection from image content)
3. **Manual override**: ListingPanel edit mode collection selector

---

## Workflow 12: Mockup Building

**Files**: `src/pages/MockupBuilderPage.jsx`, `src/pages/MockupGalleryPage.jsx`

Secondary pipeline for photorealistic room scene mockups:

- Uses mockup-specific concept types: `cameraMockup`, `mockupRoom`, `mockupSize`, `mockupLighting`, `etsyTags`
- Generates 1:1 square images showing framed posters in room settings
- Same generation pipeline as art (uses `jobs` + `images` collections)
- Tagged with `category: "mockup"` to separate from art gallery
- Purpose: Etsy listing photos showing the poster in context

---

## Workflow 13: Queue Management

**Files**: `src/pages/QueuePage.jsx`

Real-time monitoring dashboard for all job types:

- **Job types**: generation, upscale, video, listing analysis, Gelato publish, Etsy digital publish
- **Status indicators**: queued (blue), processing (yellow), completed (green), failed (red)
- **Actions**: Retry failed jobs (reset to queued), cancel queued jobs

---

## External API Integrations

| Service | Purpose | Secret | Usage |
|---------|---------|--------|-------|
| **fal.ai** | Image gen (Flux, Nano Banana), upscale (SeedVR), video (Veo 3.1) | `FAL_KEY` | `fal.subscribe()` |
| **Claude** (Anthropic) | Image analysis, listing gen, video prompt gen | `ANTHROPIC_API_KEY` | `messages.create` with vision (claude-sonnet-4-20250514) |
| **Gelato** | Print-on-demand product creation | `GELATO_API_KEY` | REST API |
| **Etsy** | E-commerce listings, digital downloads | `ETSY_API_KEY` | OAuth 2.0 PKCE + REST API |
| **Firebase** | Database, storage, auth, hosting, functions | Built-in | Firestore, Storage, Functions |
| **Gemini** | (Defined as secret, used indirectly via Nano Banana model) | `GEMINI_API_KEY` | Via fal.ai |

---

## Firestore Collections

### Core Data

| Collection | Purpose | Created By |
|------------|---------|-----------|
| `concepts` | Building blocks for prompts (type, label, promptFragment) | Seed script / ConceptsPage |
| `prompts` | Assembled/saved prompts with concept refs, model, format params | BuilderPage |
| `images` | Generated images with URLs, metadata, ratings, collection, listing, video data | processJob Cloud Function |

### Job Queues (Firestore-triggered Cloud Functions)

| Collection | Triggers Function | Status Flow |
|------------|------------------|-------------|
| `jobs` | `processJob` | queued --> processing --> completed/failed |
| `upscaleJobs` | `processUpscale` | queued --> processing --> completed/failed |
| `videoJobs` | `analyzeImageForVideo` | queued --> analyzing --> awaiting_selection |
| `videoGenerate` | `generateVideo` | (trigger doc, updates videoJobs --> generating --> completed/failed) |
| `videoCustomPrompt` | `generateCustomVideoPrompt` | (trigger doc, creates videoGenerate) |
| `listingJobs` | `analyzeListing` | queued --> analyzing --> completed/failed |
| `publishJobs` | `publishToGelato` | queued --> publishing --> completed/failed |
| `digitalPublishJobs` | `publishDigitalToEtsy` | queued --> publishing --> completed/failed |
| `gelatoSync` | `syncGelatoTemplate` | queued --> completed/failed |

### Configuration Documents

| Document Path | Purpose |
|---------------|---------|
| `config/gelato` | Gelato store ID, template ID, cached variants, image placeholders, lastSynced |
| `config/etsy` | OAuth tokens, shop ID, default price ($6.99), taxonomy ID (2078), scopes, expiry |
| `config/etsyPkce` | Temporary PKCE verifier during OAuth flow (deleted after use) |

---

## Firebase Storage Structure

```
images/{jobId}/{variantIndex}.jpg       -- Generated images (optimized JPG q93)
upscaled/{imageId}.jpg                  -- Standard faithful upscale (2x SeedVR)
upscaled/{imageId}_print.jpg            -- Print-optimized (brightness+12%, contrast+8%, saturation+5%)
videos/{imageId}.mp4                    -- Generated videos (Veo 3.1, 720p, 4s)
```

All URLs are **signed URLs** with 7-day expiry (Firebase Storage uses uniform bucket-level access).

---

## End-to-End Pipeline Summary

```
1. BUILD      concepts --> promptAssembler --> prompts + jobs (queued)
2. GENERATE   processJob --> fal.ai --> Firebase Storage --> images (unrated)
3. CURATE     GalleryPage --> rate / filter / favorite / assign collection
4. UPSCALE    upscaleJobs --> processUpscale --> SeedVR 2x --> faithful + print versions
5. VIDEO      videoJobs --> Claude analysis --> user selects --> Veo 3.1 --> video
6. LISTING    listingJobs --> Claude analysis --> title / tags / description (draft)
7. EDIT       ListingPanel --> review / edit listing data --> (ready)
8. PUBLISH    publishJobs --> Gelato API --> Etsy (physical framed posters)
              digitalPublishJobs --> Etsy API --> Etsy (digital downloads)
```

Every step from generation onward uses Firestore document creation as the trigger mechanism, keeping the frontend stateless and the backend reactive. Real-time Firestore subscriptions in the frontend provide live status updates without polling.
