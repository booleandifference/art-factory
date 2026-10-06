const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const functions = require("firebase-functions");

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

const BRAND_PREAMBLE = `You are a marketing content writer for "The Hoodie Gamer" — an Etsy shop selling gamer wall art as framed posters via Gelato POD.

BRAND: Back-view hoodie gamer at desk, centered composition. The gamer version of the "lo-fi study girl." Always illustrated/concept art (NEVER photorealistic). Gaming-themed but it looks like art, not merch.

PRIMARY CUSTOMER: The gift-buyer (mom, partner, friend), NOT the gamer. Female, age 30-55, shops Etsy for unique gifts, values aesthetics. She googles "gifts for gamers" and "gaming room decor."

BRAND POSITIONING (The Mikkeller Principle): Gaming-themed but it looks like art, not merch. A mom walks into the shop and thinks "this is actually beautiful."

Shop: https://www.etsy.com/shop/TheHoodieGamer
Tagline: "Gaming wall art — your desk, your world, your wall"
`;

const ANALYSIS_PROMPTS = {
  "seo-description": (meta) => `${BRAND_PREAMBLE}
Write an SEO-optimized collection description for the "${meta.collectionName}" collection.
Tagline: "${meta.tagline}"
Mood: ${meta.mood}
This collection has ${meta.imageCount} published artworks. Art styles include: ${meta.artStyles.join(", ") || "various"}.
${meta.sampleTitles.length > 0 ? `Sample listing titles: ${meta.sampleTitles.join("; ")}` : ""}

The description should:
- Be 150-300 words
- Include natural keyword density for: gaming wall art, gamer gift, and terms relevant to this specific collection
- Appeal to the gift-buyer persona — she's searching for "gifts for gamers" and "gaming room decor"
- Work as both an Etsy shop section description and a website landing page blurb
- Open with or prominently feature the collection tagline
- Describe what makes this collection visually distinctive
- Mention room contexts (gaming room, bedroom, dorm, teen room)

I'm attaching sample images from this collection for visual reference.`,

  "blog-post": (meta) => `${BRAND_PREAMBLE}
Write a blog post (800-1200 words) about the "${meta.collectionName}" collection.
Tagline: "${meta.tagline}"
Mood: ${meta.mood}
This collection has ${meta.imageCount} published artworks. Art styles include: ${meta.artStyles.join(", ") || "various"}.
${meta.sampleTitles.length > 0 ? `Sample listing titles: ${meta.sampleTitles.join("; ")}` : ""}

Purpose: drive organic Google traffic to our Etsy shop.
Target keywords: gaming wall art, gamer gifts, gaming room decor, ${meta.collectionName.toLowerCase()} gaming art

Structure:
- H1 title (compelling, SEO-friendly, includes "gaming wall art")
- Introduction hook (2-3 sentences that grab attention)
- 3-4 sections with H2 headers covering: the visual concept, who it's for, styling suggestions, the art styles available
- Conclusion with CTA linking to the Etsy shop

Tone: warm, aesthetic-focused, gift-buyer friendly. NOT gamer jargon.
Include: the story behind the collection theme, what makes it special visually, who would love it as a gift, room styling suggestions.

Format as markdown. I'm attaching sample images for visual inspiration.`,

  "collection-story": (meta) => `${BRAND_PREAMBLE}
Write a brand narrative / origin story for the "${meta.collectionName}" collection (200-400 words).
Tagline: "${meta.tagline}"
Mood: ${meta.mood}

This should feel personal and artistic — like an artist statement explaining the creative vision.
Capture the mood and emotion. What story does this collection tell? What feeling should someone get when they see these artworks on their wall?

This will be used on the Etsy shop "About" section, social media, and our website.
Keep it authentic, slightly poetic, never corporate.

I'm attaching sample images from this collection.`,

  "tag-strategy": (meta) => `${BRAND_PREAMBLE}
Analyze and recommend a tag strategy for the "${meta.collectionName}" collection.
Tagline: "${meta.tagline}"
Mood: ${meta.mood}
Art styles: ${meta.artStyles.join(", ") || "various"}
${meta.sampleTitles.length > 0 ? `Current listing titles:\n${meta.sampleTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}` : "No listing titles available."}

Etsy uses title + tags as a combined keyword pool. Tags should EXTEND keyword reach beyond the title, not repeat it.

Provide:
1. **Keyword Gaps** — important search terms we're likely missing across this collection's listings
2. **Recommended Tags by Category:**
   - Gift-intent tags (3-4 per listing)
   - Room/decor tags (3-4 per listing)
   - Style/aesthetic tags (2-3 per listing, matching the actual art styles)
   - Broad discovery tags (2-3 per listing)
3. **Tags to Avoid** — any tags that could hurt ranking or signal irrelevance
4. **Seasonal Rotation** — tag swaps for different seasons/holidays
5. **Collection-Specific Opportunities** — unique search terms specific to this collection's theme

Format as structured markdown with clear headers and bullet points.`,

  "social-media": (meta) => `${BRAND_PREAMBLE}
Create social media copy for the "${meta.collectionName}" collection.
Tagline: "${meta.tagline}"
Mood: ${meta.mood}
This collection has ${meta.imageCount} published artworks.

Provide content for each platform:

## Instagram
3 caption options (150-300 chars each) with:
- Hashtag set of 20-30 relevant tags per caption
- Mix of broad (#gamerart #wallart) and niche (#gamingwallart #gamergift) hashtags

## Pinterest
3 pin descriptions (100-200 chars each), SEO-optimized for Pinterest search.
Focus on: room decor, gift ideas, aesthetic descriptions.

## TikTok
3 short-form video caption ideas (under 150 chars) with:
- Hook in first 5 words
- Relevant hashtags (10-15 per caption)
- Trending format suggestions (e.g., "POV:", "When your mom...", "Transform your room")

Tone: aesthetic, gift-angle, never gamer-bro. Think "beautiful art that happens to be gaming."
I'm attaching sample images for reference.`,
};

async function downloadAndResizeImage(bucket, storagePath) {
  let [imageBuffer] = await bucket.file(storagePath).download();

  // Resize for API payload — keep small since we're sending multiple images
  const sharp = (await import("sharp")).default;
  imageBuffer = await sharp(imageBuffer)
    .resize({ width: 800, withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();

  return imageBuffer.toString("base64");
}

exports.analyzeCollection = onDocumentCreated(
  {
    document: "collectionAnalysisJobs/{jobId}",
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
    const jobRef = db.collection("collectionAnalysisJobs").doc(jobId);

    try {
      await jobRef.update({ status: "processing" });

      // Fetch published images for this collection
      const imagesSnap = await db.collection("images")
        .where("collection", "==", job.collectionSlug)
        .where("listing.status", "==", "published")
        .orderBy("createdAt", "desc")
        .limit(6)
        .get();

      // Download and resize images
      const bucket = admin.storage().bucket("gamer-art-factory.firebasestorage.app");
      const imageBlocks = [];

      for (const doc of imagesSnap.docs) {
        const img = doc.data();
        if (!img.storagePath) continue;
        try {
          const base64 = await downloadAndResizeImage(bucket, img.storagePath);
          imageBlocks.push(base64);
        } catch (err) {
          functions.logger.warn(`Failed to download image ${doc.id}:`, err.message);
        }
      }

      functions.logger.log(`Loaded ${imageBlocks.length} images for analysis`, { jobId, collection: job.collectionSlug });

      // Build prompt
      const meta = {
        collectionName: job.collectionName,
        tagline: job.collectionMeta?.tagline || "",
        mood: job.collectionMeta?.mood || "",
        artStyles: job.collectionMeta?.artStyles || [],
        sampleTitles: job.collectionMeta?.sampleTitles || [],
        imageCount: job.imageCount || 0,
      };

      const promptBuilder = ANALYSIS_PROMPTS[job.analysisType];
      if (!promptBuilder) throw new Error(`Unknown analysis type: ${job.analysisType}`);
      const promptText = promptBuilder(meta);

      const model = job.model || "claude-sonnet-5";
      let resultContent = "";

      if (model.startsWith("claude")) {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

        const contentBlocks = [
          ...imageBlocks.map((b64) => ({
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: b64 },
          })),
          { type: "text", text: promptText },
        ];

        const response = await anthropic.messages.create({
          model: model,
          max_tokens: 4096,
          messages: [{ role: "user", content: contentBlocks }],
        });

        resultContent = response.content.find((b) => b.type === "text")?.text;
      } else if (model.startsWith("gemini")) {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
        const geminiModel = genAI.getGenerativeModel({ model: model });

        const parts = [
          ...imageBlocks.map((b64) => ({
            inlineData: { mimeType: "image/jpeg", data: b64 },
          })),
          { text: promptText },
        ];

        const result = await geminiModel.generateContent(parts);
        resultContent = result.response.text();
      } else {
        throw new Error(`Unsupported model: ${model}`);
      }

      // Save result to job doc
      await jobRef.update({
        status: "completed",
        result: {
          content: resultContent,
          analysisType: job.analysisType,
          model: model,
        },
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Also save to persistent history collection
      await db.collection("collectionAnalyses").add({
        collectionSlug: job.collectionSlug,
        collectionName: job.collectionName,
        analysisType: job.analysisType,
        model: model,
        content: resultContent,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.log("Collection analysis complete", { jobId, collection: job.collectionSlug, type: job.analysisType });
    } catch (error) {
      functions.logger.error("Collection analysis failed:", error, { jobId });
      await jobRef.update({
        status: "failed",
        error: error.message || "Unknown error",
      });
    }
  }
);
