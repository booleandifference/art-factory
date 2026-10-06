const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const functions = require("firebase-functions");

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

// ─── Core Identity (always first in system prompt) ──────────────────────────
const CORE_IDENTITY = `You are the Marketing Agent for "The Hoodie Gamer" — an Etsy shop selling AI-generated gamer wall art as framed posters via Gelato POD.

Your role: generate marketing content that drives sales by appealing to the PRIMARY CUSTOMER — the gift-buyer (mom, partner, friend shopping for a gamer), NOT the gamer themselves.

Shop: https://www.etsy.com/shop/TheHoodieGamer
Tagline: "Gaming wall art — your desk, your world, your wall"`;

// ─── Source Attribution Instruction ─────────────────────────────────────────
const SOURCE_ATTRIBUTION = `
SOURCE ATTRIBUTION RULE:
For every claim, recommendation, keyword choice, or strategic decision in your output, cite which knowledge document informed it using inline [source: doc-slug] tags.

Examples:
- "Target the gift-buyer demographic [source: listing-ai]"
- "The Mikkeller Principle means gaming art that looks like design, not merch [source: project-context]"
- "Pinterest is the #1 platform for gift-buyer discovery [source: listing-ai, project-context]"

Use the exact slug names from the knowledge documents provided. You may cite multiple sources: [source: listing-ai, project-context]. Every paragraph should have at least one citation.`;

// ─── Task-Specific Prompts ──────────────────────────────────────────────────
const TASK_PROMPTS = {
  "seo-description": (meta) => `TASK: Generate an SEO-optimized description for the "${meta.collectionName}" collection.

OUTPUT (provide all of these):
- Etsy shop section description (max 250 chars)
- hoodiegamer.com collection page description (150-300 words)
- Meta description for Google (max 155 chars)
- 5 target keywords this description is optimized for

RULES:
- Write for the gift-buyer (see customer profile in knowledge docs)
- Include keywords she would Google: "gaming room decor," "gamer gift," "wall art for teen"
- Reference the collection tagline: "${meta.tagline}"
- Maintain semantic coherence with existing listing tags (see Etsy LLM rules in knowledge docs)
- Mention room contexts: gaming room, bedroom, dorm, teen room
- Cite which knowledge sources informed your keyword choices`,

  "blog-post": (meta) => `TASK: Generate a blog post for hoodiegamer.com targeting organic Google traffic.

OUTPUT:
- Title (SEO-optimized, includes primary keyword)
- Meta description (max 155 chars)
- Blog post body (800-1200 words, markdown with H2 headers)
- 5 target long-tail keywords this post targets
- 3 internal link suggestions (to Etsy listings or other blog posts)

RULES:
- Target what the gift-buyer Googles: "gaming room decor ideas," "gifts for teenage gamer," "gamer wall art ideas"
- Image-heavy: reference specific artworks from this collection with placeholders for images
- Include natural mentions of room types (bedroom, dorm, gaming room) and recipient types (son, boyfriend, teen)
- Link to specific Etsy listings where appropriate
- Tone: design-forward, not gamer-bro (see Mikkeller Principle in knowledge docs)
- End with email signup CTA
- Cite which knowledge sources informed your angle and keyword choices`,

  "collection-story": (meta) => `TASK: Generate a brand narrative / artist statement for the "${meta.collectionName}" collection.

OUTPUT:
- Collection story (200-400 words)
- Artist quote (1-2 sentences, first person, as Morten — a Copenhagen-based architect turned digital artist)
- Suggested "behind the concept" paragraph for social media

RULES:
- Connect to Morten's personal gaming journey and architect background (see brand story in knowledge docs)
- Explain the visual concept and what inspired the collection
- Speak to both the buyer (why this is worth buying) and the recipient (why this resonates)
- Tone: authentic, personal, not corporate
- Reference the Mikkeller Principle where relevant — design-forward gaming art
- Cite which knowledge sources informed the narrative`,

  "tag-strategy": (meta) => `TASK: Analyze the existing tags across ALL published listings in this collection and recommend improvements.

OUTPUT:
- Current tag coverage analysis: which keyword categories are well-covered, which have gaps
- Tag overlap report: tags that repeat across listings (wasting reach)
- Missing keyword opportunities: searches the gift-buyer makes that aren't covered
- Per-listing tag recommendations: specific tags to add/remove/swap (reference listings by title)
- Seasonal tag rotation suggestions based on current month

RULES:
- Follow the tag framework from the knowledge docs exactly (13 tags per listing)
- Apply the Etsy LLM semantic coherence rules
- Every tag must pass: "If a mom searched this, would she be happy to find this listing?"
- Identify tags that violate the "avoid" list
- Cross-reference tags across listings to maximize unique keyword coverage
- Cite which knowledge sources informed each recommendation`,

  "social-media": (meta) => `TASK: Generate platform-specific social media copy for the "${meta.collectionName}" collection.

OUTPUT:
- Pinterest: 3 pin descriptions (keyword-rich, search-friendly, max 500 chars each) — Pinterest is #1 priority, this is where the gift-buyer browses
- Instagram: 2 caption options (emotional, aesthetic, 150-300 chars each, include 20-30 hashtags per caption)
- TikTok: 2 hook scripts (short, punchy, curiosity-driven, max 3 sentences each, 10-15 hashtags)

RULES:
- Pinterest descriptions should include searchable phrases: "gaming room decor," "gamer gift idea," "teen room wall art"
- Instagram should show the art lifestyle, not sell directly
- TikTok should tease the concept or show the AI generation process
- All platforms: design-forward voice, never gamer-bro
- Cite which knowledge sources informed your copy choices`,
};

// ─── Image download helper ──────────────────────────────────────────────────
async function downloadAndResizeImage(bucket, storagePath) {
  let [imageBuffer] = await bucket.file(storagePath).download();
  const sharp = (await import("sharp")).default;
  imageBuffer = await sharp(imageBuffer)
    .resize({ width: 800, withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();
  return imageBuffer.toString("base64");
}

// ─── Source citation parser (server-side) ───────────────────────────────────
function parseSourceCitations(text) {
  const sourceRegex = /\[source:\s*([^\]]+)\]/g;
  const sources = new Set();
  let match;
  while ((match = sourceRegex.exec(text)) !== null) {
    match[1].split(",").forEach((s) => sources.add(s.trim().toLowerCase()));
  }
  return Array.from(sources);
}

// ─── Main Cloud Function ────────────────────────────────────────────────────
exports.runMarketingAnalysis = onDocumentCreated(
  {
    document: "marketingJobs/{jobId}",
    secrets: [ANTHROPIC_API_KEY, GEMINI_API_KEY],
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  async (event) => {
    const jobId = event.params.jobId;
    const snap = event.data;
    if (!snap) return;
    const job = snap.data();

    if (job.status !== "queued") return;

    const db = admin.firestore();
    const jobRef = db.collection("marketingJobs").doc(jobId);

    try {
      await jobRef.update({ status: "processing" });

      // ─── 1. Load knowledge base ───────────────────────────────────────
      const knowledgeSnap = await db
        .collection("knowledge")
        .where("enabled", "==", true)
        .get();

      const knowledgeDocs = knowledgeSnap.docs.map((d) => ({
        slug: d.data().slug,
        name: d.data().name,
        content: d.data().content,
      }));

      const knowledgeSlugs = knowledgeDocs.map((d) => d.slug);
      functions.logger.log(`Loaded ${knowledgeDocs.length} knowledge docs: ${knowledgeSlugs.join(", ")}`, { jobId });

      // Build knowledge section for system prompt
      const knowledgeSection = knowledgeDocs
        .map((d) => `--- ${d.name} (slug: ${d.slug}) ---\n${d.content}`)
        .join("\n\n");

      // ─── 2. Load published images + full listing data ─────────────────
      const imagesSnap = await db
        .collection("images")
        .where("collection", "==", job.collectionSlug)
        .where("listing.status", "==", "published")
        .orderBy("createdAt", "desc")
        .get();

      // Full listing data for all published images
      const listings = imagesSnap.docs.map((d) => {
        const img = d.data();
        return {
          title: img.listing?.title || "(no title)",
          tags: img.listing?.tags || [],
          description: img.listing?.description || "",
          artStyle: img.listing?.artStyle || "",
          mood: img.listing?.mood || "",
        };
      });

      // Download up to 6 images for vision
      const bucket = admin.storage().bucket("gamer-art-factory.firebasestorage.app");
      const imageBlocks = [];
      const imageDocs = imagesSnap.docs.slice(0, 6);

      for (const doc of imageDocs) {
        const img = doc.data();
        if (!img.storagePath) continue;
        try {
          const base64 = await downloadAndResizeImage(bucket, img.storagePath);
          imageBlocks.push(base64);
        } catch (err) {
          functions.logger.warn(`Failed to download image ${doc.id}:`, err.message);
        }
      }

      functions.logger.log(`Loaded ${imageBlocks.length} images, ${listings.length} listings`, { jobId });

      // ─── 3. Build prompts ─────────────────────────────────────────────
      const systemPrompt = [
        CORE_IDENTITY,
        "",
        "KNOWLEDGE BASE (reference these in your citations):",
        knowledgeSection,
        "",
        SOURCE_ATTRIBUTION,
      ].join("\n");

      const meta = {
        collectionName: job.collectionName,
        tagline: job.collectionMeta?.tagline || "",
        mood: job.collectionMeta?.mood || "",
        artStyles: job.collectionMeta?.artStyles || [],
        imageCount: listings.length,
      };

      const taskPrompt = TASK_PROMPTS[job.analysisType];
      if (!taskPrompt) throw new Error(`Unknown analysis type: ${job.analysisType}`);

      // Build listing data summary
      const listingsSummary = listings.length > 0
        ? `\n\nPUBLISHED LISTINGS IN THIS COLLECTION (${listings.length} total):\n` +
          listings.map((l, i) => {
            return `${i + 1}. Title: ${l.title}\n   Tags: ${l.tags.join(", ")}\n   Style: ${l.artStyle} | Mood: ${l.mood}`;
          }).join("\n")
        : "\n\nNo published listings yet.";

      const userPrompt = [
        `Collection: ${meta.collectionName}`,
        `Tagline: "${meta.tagline}"`,
        `Mood: ${meta.mood}`,
        `Art styles: ${meta.artStyles.join(", ") || "various"}`,
        `Published images: ${listings.length}`,
        listingsSummary,
        "",
        taskPrompt(meta),
        "",
        `I'm attaching ${imageBlocks.length} sample images from this collection for visual reference.`,
      ].join("\n");

      // ─── 4. Call AI model ─────────────────────────────────────────────
      const model = job.model || "claude-sonnet-5";
      let resultContent = "";

      if (model.startsWith("claude")) {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

        const userContent = [
          ...imageBlocks.map((b64) => ({
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: b64 },
          })),
          { type: "text", text: userPrompt },
        ];

        const response = await anthropic.messages.create({
          model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: "user", content: userContent }],
        });

        resultContent = response.content.find((b) => b.type === "text")?.text;
      } else if (model.startsWith("gemini")) {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
        const geminiModel = genAI.getGenerativeModel({
          model,
          systemInstruction: systemPrompt,
        });

        const parts = [
          ...imageBlocks.map((b64) => ({
            inlineData: { mimeType: "image/jpeg", data: b64 },
          })),
          { text: userPrompt },
        ];

        const result = await geminiModel.generateContent(parts);
        resultContent = result.response.text();
      } else {
        throw new Error(`Unsupported model: ${model}`);
      }

      // ─── 5. Parse sources and save ────────────────────────────────────
      const citedSources = parseSourceCitations(resultContent);

      await jobRef.update({
        status: "completed",
        result: {
          content: resultContent,
          analysisType: job.analysisType,
          model,
          citedSources,
          loadedSources: knowledgeSlugs,
        },
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Persistent history
      await db.collection("marketingAnalyses").add({
        collectionSlug: job.collectionSlug,
        collectionName: job.collectionName,
        analysisType: job.analysisType,
        model,
        content: resultContent,
        citedSources,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.log("Marketing analysis complete", {
        jobId,
        collection: job.collectionSlug,
        type: job.analysisType,
        citedSources,
      });
    } catch (error) {
      functions.logger.error("Marketing analysis failed:", error, { jobId });
      await jobRef.update({
        status: "failed",
        error: error.message || "Unknown error",
      });
    }
  }
);
