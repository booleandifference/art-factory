const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

admin.initializeApp();

// Convert any image buffer to optimized JPG (quality 93 — visually lossless, ~50% smaller)
async function toOptimizedJpg(buffer) {
  return sharp(buffer).jpeg({ quality: 93, mozjpeg: true }).toBuffer();
}

// Print-optimized JPG — brightness +12%, contrast +8%, slight vibrance boost
// Makes dark/moody images read better at distance when printed on wall
async function toPrintOptimizedJpg(buffer) {
  return sharp(buffer)
    .modulate({ brightness: 1.12 })        // +12% brightness
    .linear(1.08, -(128 * 1.08 - 128))     // +8% contrast (around midpoint)
    .modulate({ saturation: 1.05 })         // +5% saturation for neon/glow pop
    .jpeg({ quality: 93, mozjpeg: true })
    .toBuffer();
}
const { v4: uuidv4 } = require("uuid");
const db = admin.firestore();
const bucket = admin.storage().bucket("gamer-art-factory.firebasestorage.app");

const FAL_KEY = defineSecret("FAL_KEY");
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const GELATO_API_KEY = defineSecret("GELATO_API_KEY");
const ETSY_API_KEY = defineSecret("ETSY_API_KEY");
const ETSY_SHARED_SECRET = defineSecret("ETSY_SHARED_SECRET");

function etsyXApiKey() {
  const key = ETSY_API_KEY.value();
  let secret = "";
  try { secret = ETSY_SHARED_SECRET.value(); } catch { /* not set */ }
  return secret ? `${key}:${secret}` : key;
}

/**
 * Get a permanent Firebase Storage download URL (never expires).
 * Sets a download token in file metadata if one doesn't exist.
 */
async function getPermUrl(file) {
  const [metadata] = await file.getMetadata();
  let token = metadata.metadata?.firebaseStorageDownloadTokens;
  if (!token) {
    token = uuidv4();
    await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
  }
  const encodedPath = encodeURIComponent(file.name);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;
}

// ─── Model-specific input builders ───────────────────────────────────────────

function isNanoBanana(model) {
  return model?.includes("nano-banana");
}

// Map our aspect ratio format to fal.ai enum values
const ASPECT_RATIO_MAP = {
  "2:3": "2:3",
  "3:4": "3:4",
  "16:9": "16:9",
  "1:1": "1:1",
};

function buildInput(job, seed) {
  if (isNanoBanana(job.model)) {
    // Nano Banana 2 (Gemini) uses aspect_ratio + resolution instead of pixel dimensions
    return {
      prompt: job.promptText,
      num_images: 1,
      seed,
      aspect_ratio: ASPECT_RATIO_MAP[job.modelParams?.aspectRatio] || "2:3",
      output_format: "png",
      resolution: job.modelParams?.resolution || "2K",
      safety_tolerance: "4",
    };
  }

  // Flux / SDXL models use pixel dimensions
  return {
    prompt: job.promptText,
    image_size: {
      width: job.modelParams?.width || 768,
      height: job.modelParams?.height || 1088,
    },
    num_inference_steps: job.modelParams?.num_inference_steps || 28,
    guidance_scale: job.modelParams?.guidance_scale || 3.5,
    num_images: 1,
    enable_safety_checker: false,
    seed,
  };
}

function extractImageUrl(result) {
  // Both Flux and Nano Banana return { images: [{ url }] }
  if (result.data?.images?.[0]?.url) return result.data.images[0].url;
  if (result.images?.[0]?.url) return result.images[0].url;
  return null;
}

function extractDimensions(result, job) {
  const img = result.data?.images?.[0] || result.images?.[0];
  return {
    width: img?.width || job.modelParams?.width || 768,
    height: img?.height || job.modelParams?.height || 1088,
  };
}

function estimateCost(model) {
  if (model?.includes("nano-banana-pro")) return 0.04;
  if (isNanoBanana(model)) return 0.02;
  if (model?.includes("pro")) return 0.05;
  if (model?.includes("schnell")) return 0.01;
  return 0.03;
}

// ─── Image Generation ─────────────────────────────────────────────────────────

exports.processJob = onDocumentCreated(
  {
    document: "jobs/{jobId}",
    secrets: [FAL_KEY],
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  async (event) => {
    const jobId = event.params.jobId;
    const job = event.data.data();

    if (job.status !== "queued") return;

    const jobRef = db.collection("jobs").doc(jobId);

    try {
      await jobRef.update({
        status: "processing",
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Use new @fal-ai/client
      const { fal } = await import("@fal-ai/client");
      fal.config({ credentials: FAL_KEY.value() });

      const variants = job.variants || 1;
      const imageIds = [];
      let totalCost = 0;

      for (let i = 0; i < variants; i++) {
        const seed = job.modelParams?.seed || Math.floor(Math.random() * 2147483647);
        const model = job.model || "fal-ai/flux/dev";

        const result = await fal.subscribe(model, {
          input: buildInput(job, seed),
          logs: true,
          onQueueUpdate: (update) => {
            if (update.status === "IN_PROGRESS") {
              console.log(`Job ${jobId} variant ${i}: in progress`);
            }
          },
        });

        const imageUrl = extractImageUrl(result);
        if (!imageUrl) {
          throw new Error("No images returned from fal.ai");
        }

        const dims = extractDimensions(result, job);

        // Download image from fal.ai and convert to optimized JPG
        const fetch = (await import("node-fetch")).default;
        const response = await fetch(imageUrl);
        const rawBuffer = Buffer.from(await response.arrayBuffer());
        const buffer = await toOptimizedJpg(rawBuffer);

        // Upload to Firebase Storage
        const storagePath = `images/${jobId}/${i}.jpg`;
        const file = bucket.file(storagePath);
        await file.save(buffer, {
          metadata: { contentType: "image/jpeg" },
        });

        // Get a permanent download URL (never expires)
        const publicUrl = await getPermUrl(file);

        // Create image document
        const imageRef = await db.collection("images").add({
          jobId,
          promptId: job.promptId,
          ideationCollectionId: job.ideationCollectionId || null,
          promptText: job.promptText || "",
          category: job.category || "art",
          storagePath,
          storagePathUpscaled: null,
          thumbnailPath: storagePath,
          url: publicUrl,
          width: dims.width,
          height: dims.height,
          rating: "unrated",
          tags: [],
          favorite: false,
          upscaled: false,
          upscaleJobId: null,
          exportedAt: null,
          publishedAt: null,
          etsyListingId: null,
          metadata: {
            seed,
            model,
            inferenceSteps: job.modelParams?.num_inference_steps || null,
            guidanceScale: job.modelParams?.guidance_scale || null,
          },
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        imageIds.push(imageRef.id);
        totalCost += estimateCost(model);
      }

      await jobRef.update({
        status: "completed",
        imageIds,
        cost: totalCost,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update prompt generation count
      if (job.promptId) {
        await db.collection("prompts").doc(job.promptId).update({
          generationCount: admin.firestore.FieldValue.increment(variants),
        });
      }
    } catch (error) {
      console.error("Job failed:", jobId, error);
      await jobRef.update({
        status: "failed",
        error: error.message || "Unknown error",
      });
    }
  }
);

// ─── Upscale Image (Firestore trigger — avoids Cloud Run IAM org policy) ─────

exports.processUpscale = onDocumentCreated(
  {
    document: "upscaleJobs/{jobId}",
    secrets: [FAL_KEY],
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (event) => {
    const jobId = event.params.jobId;
    const job = event.data.data();

    if (job.status !== "queued") return;

    const jobRef = db.collection("upscaleJobs").doc(jobId);
    const imageId = job.imageId;

    try {
      await jobRef.update({
        status: "processing",
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const imageRef = db.collection("images").doc(imageId);
      const imageDoc = await imageRef.get();
      if (!imageDoc.exists) throw new Error("Image not found");

      const image = imageDoc.data();
      // Allow re-upscaling — use original URL if available
      if (image.upscaled && image.urlOriginal) {
        image.url = image.urlOriginal;
      }

      console.log("Starting upscale for image:", imageId, "URL:", image.url?.substring(0, 80));

      const { fal } = await import("@fal-ai/client");
      fal.config({ credentials: FAL_KEY.value() });

      // Download source image directly from Storage (avoids URL expiry/auth issues)
      const fetchMod = (await import("node-fetch")).default;
      if (!image.storagePath) throw new Error("Image has no storagePath");
      const [srcBuffer] = await bucket.file(image.storagePath).download();
      console.log("Downloaded source image from Storage:", srcBuffer.length, "bytes");

      // Upload to fal.ai storage for reliable access
      const falUrl = await fal.storage.upload(new Blob([srcBuffer], { type: "image/png" }));
      console.log("Uploaded to fal storage:", falUrl);

      // Target: A3 at 300 DPI = 3508×4961px, A4 at 300 DPI = 2480×3508px
      // SeedVR upscaler — faithful upscale, preserves the original image (max 10x)
      const w = image.width || 768;
      const h = image.height || 1088;
      const longEdge = Math.max(w, h);

      // Pick factor to reach at least A3 at 300 DPI (long edge ~4961px)
      // 768×1088 × 4 → 3072×4352 (A3 ~263 DPI, A4 ~372 DPI)
      // 1696×2528 × 2 → 3392×5056 (A3+ at 300 DPI)
      const targetLongEdge = 4400;
      const upscaleFactor = longEdge >= 2200 ? 2 : 4;
      console.log(`Image ${w}×${h}, SeedVR ${upscaleFactor}x → ${w * upscaleFactor}×${h * upscaleFactor}`);

      const result = await fal.subscribe("fal-ai/seedvr/upscale/image", {
        input: {
          image_url: falUrl,
          upscale_mode: "factor",
          upscale_factor: upscaleFactor,
          noise_scale: 0.1,
          output_format: "jpg",
        },
        logs: true,
        onQueueUpdate: (update) => {
          console.log("Upscale queue:", update.status);
        },
      });

      console.log("Upscale result keys:", Object.keys(result));

      const upscaledUrl = result.data?.image?.url || result.image?.url;
      if (!upscaledUrl) throw new Error("No upscaled URL returned from fal.ai");

      // Download upscaled image from fal.ai
      const response = await fetchMod(upscaledUrl);
      const rawBuffer = Buffer.from(await response.arrayBuffer());

      // Save faithful upscale (standard JPG)
      const buffer = await toOptimizedJpg(rawBuffer);
      console.log(`Upscaled file size: ${(buffer.length / 1024 / 1024).toFixed(1)} MB (JPG q93)`);

      const storagePath = `upscaled/${imageId}.jpg`;
      const file = bucket.file(storagePath);
      await file.save(buffer, { metadata: { contentType: "image/jpeg" } });
      const publicUrl = await getPermUrl(file);

      // Save print-optimized version (brighter, more contrast for wall viewing)
      const printBuffer = await toPrintOptimizedJpg(rawBuffer);
      console.log(`Print-optimized file size: ${(printBuffer.length / 1024 / 1024).toFixed(1)} MB`);

      const printStoragePath = `upscaled/${imageId}_print.jpg`;
      const printFile = bucket.file(printStoragePath);
      await printFile.save(printBuffer, { metadata: { contentType: "image/jpeg" } });
      const printUrl = await getPermUrl(printFile);

      // Preserve original URL before overwriting with upscaled
      const currentImage = (await imageRef.get()).data();
      const upscaledWidth = w * upscaleFactor;
      const upscaledHeight = h * upscaleFactor;
      await imageRef.update({
        upscaled: true,
        upscaleScale: upscaleFactor,
        upscaledWidth,
        upscaledHeight,
        storagePathUpscaled: storagePath,
        storagePathPrint: printStoragePath,
        urlOriginal: currentImage.urlOriginal || currentImage.url,
        url: publicUrl,
        urlPrint: printUrl,
      });

      await jobRef.update({
        status: "completed",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log("Upscale complete for image:", imageId);
    } catch (error) {
      console.error("Upscale error:", error);
      await jobRef.update({
        status: "failed",
        error: error.message || "Unknown error",
      });
    }
  }
);

// ─── Video Generation (Claude analysis + Veo 3.1) ──────────────────────────

const VIDEO_ANALYSIS_PROMPT = `You are a video animation director for The Hoodie Gamer, a gaming wall art brand.
You receive a still artwork of a gamer at their desk and need to create a 4-second
animation prompt for Veo 3.1.

Analyze the image and identify:
- The art style (charcoal, cyberpunk, pixel art, anime, etc.)
- Key elements that could animate (screens, hands, cables, reflections, particles)
- The mood and atmosphere

Then suggest 3 video prompt options:
1. Subtle/eerie — minimal movement, atmospheric (screen flicker, dust particles)
2. Medium — moderate movement (typing hands, swaying cables, shifting light)
3. Dramatic — bold effect (shattering glass, room warping, dimensional glitch)

Each prompt should specify that the gamer remains still/unflinching while the
environment moves around them. End each with "4 seconds, smooth loop."

Return ONLY a JSON object with this structure (no markdown, no explanation):
{"prompts": ["prompt1", "prompt2", "prompt3"]}`;

// Step 1: Analyze image with Claude and suggest video prompts
exports.analyzeImageForVideo = onDocumentCreated(
  {
    document: "videoJobs/{jobId}",
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 120,
    memory: "1GiB",
  },
  async (event) => {
    const jobId = event.params.jobId;
    const job = event.data.data();

    // Only "queued" jobs get analyzed. This early return is the contract that
    // lets ManualVideoPromptForm bypass Claude: it writes status "manual" and
    // enqueues videoGenerate itself. Loosening this guard would silently
    // rewrite user-authored prompts.
    if (job.status !== "queued") return;

    const jobRef = db.collection("videoJobs").doc(jobId);

    try {
      await jobRef.update({
        status: "analyzing",
      });

      // Get the source image
      const imageDoc = await db.collection("images").doc(job.imageId).get();
      if (!imageDoc.exists) throw new Error("Source image not found");
      const image = imageDoc.data();

      // Download from Storage directly (avoids URL expiry/auth issues)
      const fetchMod = (await import("node-fetch")).default;
      if (!image.storagePath) throw new Error("Image has no storagePath");
      let [imageBuffer] = await bucket.file(image.storagePath).download();

      const MAX_RAW_BYTES = 3.7 * 1024 * 1024;
      if (imageBuffer.length > MAX_RAW_BYTES) {
        const sharp = (await import("sharp")).default;
        imageBuffer = await sharp(imageBuffer)
          .resize({ width: 1600, withoutEnlargement: true })
          .jpeg({ quality: 75 })
          .toBuffer();
        if (imageBuffer.length > MAX_RAW_BYTES) {
          imageBuffer = await sharp(imageBuffer)
            .resize({ width: 1200, withoutEnlargement: true })
            .jpeg({ quality: 65 })
            .toBuffer();
        }
      }
      const imageBase64 = imageBuffer.toString("base64");
      const mediaType = "image/jpeg";

      // Call Claude to analyze image and suggest prompts
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

      const message = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: imageBase64,
                },
              },
              {
                type: "text",
                text: VIDEO_ANALYSIS_PROMPT,
              },
            ],
          },
        ],
      });

      const responseText = message.content.find((b) => b.type === "text")?.text;
      let suggestedPrompts;
      try {
        const parsed = JSON.parse(responseText);
        suggestedPrompts = parsed.prompts;
      } catch {
        // Try to extract JSON from the response
        const match = responseText.match(/\{[\s\S]*"prompts"[\s\S]*\}/);
        if (match) {
          suggestedPrompts = JSON.parse(match[0]).prompts;
        } else {
          throw new Error("Failed to parse Claude response as JSON");
        }
      }

      if (!Array.isArray(suggestedPrompts) || suggestedPrompts.length < 3) {
        throw new Error("Expected 3 prompt suggestions from Claude");
      }

      await jobRef.update({
        status: "awaiting_selection",
        suggestedPrompts: suggestedPrompts.slice(0, 3),
      });

      // Also update the image document with video job reference
      await db.collection("images").doc(job.imageId).update({
        videoJobId: jobId,
        videoStatus: "awaiting_selection",
      });
    } catch (error) {
      console.error("Video analysis failed:", jobId, error);
      await jobRef.update({
        status: "failed",
        error: error.message || "Unknown error",
      });
      await db.collection("images").doc(job.imageId).update({
        videoStatus: "failed",
      });
    }
  }
);

// Step 2: Generate video with Veo 3.1 via fal.ai (triggered when prompt is selected)
exports.generateVideo = onDocumentCreated(
  {
    document: "videoGenerate/{triggerId}",
    secrets: [FAL_KEY],
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (event) => {
    const trigger = event.data.data();
    const { videoJobId, prompt } = trigger;

    const jobRef = db.collection("videoJobs").doc(videoJobId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) return;
    const job = jobDoc.data();

    try {
      await jobRef.update({
        status: "generating",
        prompt,
      });

      const imageDoc = await db.collection("images").doc(job.imageId).get();
      if (!imageDoc.exists) throw new Error("Source image not found");
      const image = imageDoc.data();

      await db.collection("images").doc(job.imageId).update({
        videoStatus: "generating",
        videoPrompt: prompt,
      });

      // Download source image from Storage directly (avoids URL expiry/auth issues)
      const fetchMod = (await import("node-fetch")).default;
      if (!image.storagePath) throw new Error("Image has no storagePath");
      const [imageBuffer] = await bucket.file(image.storagePath).download();

      const { fal } = await import("@fal-ai/client");
      fal.config({ credentials: FAL_KEY.value() });

      // Upload to fal storage for reliable access
      const falImageUrl = await fal.storage.upload(
        new Blob([imageBuffer], { type: "image/jpeg" })
      );
      console.log("Uploaded source image to fal storage:", falImageUrl);

      // Call Veo 3.1 via fal.ai
      const result = await fal.subscribe("fal-ai/veo3.1/fast/image-to-video", {
        input: {
          prompt,
          image_url: falImageUrl,
          aspect_ratio: "9:16",
          duration: "4s",
          resolution: "720p",
          generate_audio: false,
          safety_tolerance: "4",
        },
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === "IN_PROGRESS") {
            console.log(`Video job ${videoJobId}: in progress`);
          }
        },
      });

      const videoUrl = result.data?.video?.url;
      if (!videoUrl) {
        throw new Error("No video URL returned from fal.ai");
      }

      // Download video from fal.ai
      const videoResponse = await fetchMod(videoUrl);
      if (!videoResponse.ok) throw new Error(`Failed to download video: ${videoResponse.status}`);
      const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

      // Upload to Firebase Storage (unique path per job so old videos are preserved)
      const videoStoragePath = `videos/${job.imageId}_${videoJobId}.mp4`;
      const videoFile = bucket.file(videoStoragePath);
      await videoFile.save(videoBuffer, {
        metadata: { contentType: "video/mp4" },
      });

      const videoPermUrl = await getPermUrl(videoFile);

      // Update video job with its own video URL
      await jobRef.update({
        status: "completed",
        videoStoragePath,
        videoUrl: videoPermUrl,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update image document with latest video info
      await db.collection("images").doc(job.imageId).update({
        videoPath: videoStoragePath,
        videoUrl: videoPermUrl,
        videoPrompt: prompt,
        videoStatus: "completed",
        videoJobId,
      });

      console.log("Video generation complete for image:", job.imageId);
    } catch (error) {
      console.error("Video generation failed:", videoJobId, error);
      await jobRef.update({
        status: "failed",
        error: error.message || "Unknown error",
      });
      await db.collection("images").doc(job.imageId).update({
        videoStatus: "failed",
      });
    }
  }
);

// Step 2b: Generate custom prompt with Claude then trigger video generation
exports.generateCustomVideoPrompt = onDocumentCreated(
  {
    document: "videoCustomPrompt/{triggerId}",
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 120,
    memory: "1GiB",
  },
  async (event) => {
    const trigger = event.data.data();
    const { videoJobId, userDirection } = trigger;

    const jobRef = db.collection("videoJobs").doc(videoJobId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) return;
    const job = jobDoc.data();

    try {
      // Get the source image
      const imageDoc = await db.collection("images").doc(job.imageId).get();
      if (!imageDoc.exists) throw new Error("Source image not found");
      const image = imageDoc.data();

      // Download from Storage directly (avoids URL expiry/auth issues)
      const fetchMod = (await import("node-fetch")).default;
      if (!image.storagePath) throw new Error("Image has no storagePath");
      let [imageBuffer] = await bucket.file(image.storagePath).download();

      const MAX_RAW_BYTES = 3.7 * 1024 * 1024;
      if (imageBuffer.length > MAX_RAW_BYTES) {
        const sharp = (await import("sharp")).default;
        imageBuffer = await sharp(imageBuffer)
          .resize({ width: 1600, withoutEnlargement: true })
          .jpeg({ quality: 75 })
          .toBuffer();
        if (imageBuffer.length > MAX_RAW_BYTES) {
          imageBuffer = await sharp(imageBuffer)
            .resize({ width: 1200, withoutEnlargement: true })
            .jpeg({ quality: 65 })
            .toBuffer();
        }
      }
      const imageBase64 = imageBuffer.toString("base64");
      const mediaType = "image/jpeg";

      // Call Claude with user direction
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

      const message = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: imageBase64,
                },
              },
              {
                type: "text",
                text: `You are a video animation director. Based on this artwork image, create a specific Veo 3.1 video generation prompt incorporating this creative direction: "${userDirection}"\n\nThe gamer should remain still/unflinching while the environment moves. End with "4 seconds, smooth loop."\n\nReturn ONLY the prompt text, nothing else.`,
              },
            ],
          },
        ],
      });

      const customPrompt = message.content.find((b) => b.type === "text")?.text.trim();

      await jobRef.update({
        userDirection,
      });

      // Trigger video generation with the custom prompt
      await db.collection("videoGenerate").add({
        videoJobId,
        prompt: customPrompt,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error("Custom prompt generation failed:", error);
      await jobRef.update({
        status: "failed",
        error: error.message || "Unknown error",
      });
    }
  }
);

// ─── Listing Generation (Claude analysis for Etsy) ──────────────────────────

// Listing prompts are the shop's private playbook: they live in the gitignored
// prompts/ folder (still uploaded on deploy). prompts.example/ holds generic
// stand-ins so a fresh clone still runs.
function loadPrompt(file) {
  const privatePath = path.join(__dirname, "prompts", file);
  if (fs.existsSync(privatePath)) return fs.readFileSync(privatePath, "utf8").trimEnd();
  console.warn(`Prompt ${file} not found in prompts/ — using prompts.example/ fallback`);
  return fs.readFileSync(path.join(__dirname, "prompts.example", file), "utf8").trimEnd();
}

const LISTING_ANALYSIS_PROMPT = loadPrompt("listing.md");

const LISTING_ANALYSIS_PROMPT_INNER_ANIMAL = loadPrompt("listing-inner-animal.md");

const LISTING_MUG_PROMPT = loadPrompt("listing-mug.md");

exports.analyzeListing = onDocumentCreated(
  {
    document: "listingJobs/{jobId}",
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 120,
    memory: "1GiB",
  },
  async (event) => {
    const jobId = event.params.jobId;
    const job = event.data.data();

    if (job.status !== "queued") return;

    const jobRef = db.collection("listingJobs").doc(jobId);

    try {
      await jobRef.update({ status: "analyzing" });

      const imageDoc = await db.collection("images").doc(job.imageId).get();
      if (!imageDoc.exists) throw new Error("Source image not found");
      const image = imageDoc.data();

      // Download from Storage directly (avoids URL expiry/auth issues)
      const fetchMod = (await import("node-fetch")).default;
      if (!image.storagePath) throw new Error("Image has no storagePath");
      let [imageBuffer] = await bucket.file(image.storagePath).download();
      console.log(`Raw image size: ${(imageBuffer.length / 1024 / 1024).toFixed(2)} MB`);

      // Claude's 5MB limit is on the base64 string, which is ~33% larger than raw bytes
      // So raw bytes must stay under ~3.7MB to be safe after base64 encoding
      const MAX_RAW_BYTES = 3.7 * 1024 * 1024;
      if (imageBuffer.length > MAX_RAW_BYTES) {
        const sharp = (await import("sharp")).default;
        imageBuffer = await sharp(imageBuffer)
          .resize({ width: 1600, withoutEnlargement: true })
          .jpeg({ quality: 75 })
          .toBuffer();
        console.log(`Resized for analysis: ${(imageBuffer.length / 1024 / 1024).toFixed(2)} MB`);
        // If still too large, resize more aggressively
        if (imageBuffer.length > MAX_RAW_BYTES) {
          imageBuffer = await sharp(imageBuffer)
            .resize({ width: 1200, withoutEnlargement: true })
            .jpeg({ quality: 65 })
            .toBuffer();
          console.log(`Re-resized for analysis: ${(imageBuffer.length / 1024 / 1024).toFixed(2)} MB`);
        }
      }

      const imageBase64 = imageBuffer.toString("base64");
      const mediaType = "image/jpeg";

      // Call Claude to analyze image and generate listing data
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

      const message = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: imageBase64,
                },
              },
              {
                type: "text",
                text: (() => {
                  const store = job.store || "hoodie-gamer";
                  const basePrompt = image.collection === "inner-animal"
                    ? LISTING_ANALYSIS_PROMPT_INNER_ANIMAL
                    : (store === "shop-a-mug" ? LISTING_MUG_PROMPT : LISTING_ANALYSIS_PROMPT);
                  return basePrompt + (image.collection ? `\n\nIMPORTANT: This image is ALREADY assigned to collection "${image.collection}" ("${image.collectionDisplayName || image.collection}"). You MUST use this exact collection in your response — do NOT change it. The title MUST start with "${image.collectionDisplayName || image.collection}".` : "");
                })(),
              },
            ],
          },
        ],
      });

      const responseText = message.content.find((b) => b.type === "text")?.text;
      let listingData;
      try {
        listingData = JSON.parse(responseText);
      } catch {
        const match = responseText.match(/\{[\s\S]*\}/);
        if (match) {
          listingData = JSON.parse(match[0]);
        } else {
          throw new Error("Failed to parse Claude response as JSON");
        }
      }

      // Validate
      if (!listingData.title || !listingData.tags || !listingData.description) {
        throw new Error("Missing required listing fields from Claude response");
      }
      if (listingData.tags.length !== 13) {
        console.warn(`Expected 13 tags, got ${listingData.tags.length}`);
      }

      // Update the image document with listing data
      // Preserve existing collection — don't let Claude's response overwrite it
      await db.collection("images").doc(job.imageId).update({
        listing: {
          status: "draft",
          collection: image.collection || listingData.collection || null,
          collectionDisplayName: image.collectionDisplayName || listingData.collectionDisplayName || null,
          title: listingData.title,
          tags: listingData.tags,
          description: listingData.description,
          artStyle: listingData.artStyle || null,
          mood: listingData.mood || null,
          gamerType: listingData.gamerType || null,
          videoPrompt: listingData.videoPrompt || null,
          generatedAt: admin.firestore.FieldValue.serverTimestamp(),
          editedAt: null,
          publishedAt: null,
          gelatoProductId: null,
          etsyListingId: null,
          etsyListingUrl: null,
        },
      });

      await jobRef.update({
        status: "completed",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log("Listing analysis complete for image:", job.imageId);
    } catch (error) {
      console.error("Listing analysis failed:", jobId, error);
      await jobRef.update({
        status: "failed",
        error: error.message || "Unknown error",
      });
    }
  }
);

// ─── Publish to Gelato / Etsy ────────────────────────────────────────────────
// v2 — removed salesChannels, added public URL + placeholder detection

exports.publishToGelato = onDocumentCreated(
  {
    document: "publishJobs/{jobId}",
    secrets: [GELATO_API_KEY],
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (event) => {
    const jobId = event.params.jobId;
    const job = event.data.data();

    console.log("publishToGelato triggered:", jobId, "status:", job.status, "imageId:", job.imageId);

    if (job.status !== "queued") {
      console.log("Skipping — status is not queued:", job.status);
      return;
    }

    const jobRef = db.collection("publishJobs").doc(jobId);

    try {
      await jobRef.update({ status: "publishing" });
      console.log("Status updated to publishing");

      const imageDoc = await db.collection("images").doc(job.imageId).get();
      if (!imageDoc.exists) throw new Error("Source image not found");
      const image = imageDoc.data();
      const listing = image.listing;
      console.log("Image found, listing status:", listing?.status, "collection:", listing?.collection);
      console.log("Image storage fields:", JSON.stringify({
        storagePath: image.storagePath || null,
        storagePathUpscaled: image.storagePathUpscaled || null,
        storagePathPrint: image.storagePathPrint || null,
        url: image.url ? image.url.substring(0, 80) + '...' : null,
        urlUpscaled: image.urlUpscaled ? image.urlUpscaled.substring(0, 80) + '...' : null,
        urlPrint: image.urlPrint ? image.urlPrint.substring(0, 80) + '...' : null,
      }));

      if (!listing || !listing.title) {
        throw new Error("No listing data found — run AI analysis first");
      }

      // Require 4x upscale before publishing to Gelato
      if (!image.upscaled || (image.upscaleScale || 0) < 4) {
        throw new Error(`Image must be 4x upscaled before publishing. Current: ${image.upscaleScale || 'not upscaled'}x`);
      }

      // Get Gelato config from Firestore
      const configDoc = await db.collection("config").doc("gelato").get();
      if (!configDoc.exists) {
        throw new Error("Gelato config not found. Run template sync first.");
      }
      const gelatoConfig = configDoc.data();
      const store = job.store || "hoodie-gamer";

      let storeId, templateId, variants;

      if (store === "shop-a-mug") {
        const mugTemplates = {
          floor: "27d8d480-5063-448a-8053-b93a7f6b290d",
          stool: "00c8a0f1-52dc-4994-bdd9-cec0b84cc9cb",
        };
        templateId = mugTemplates[job.mugTemplate || "floor"];
        storeId = "89b4d2fb-9775-46e5-95b0-5686a5b1a5d7";
        variants = [];
      } else {
        storeId = gelatoConfig.storeId;
        templateId = job.templateId || gelatoConfig.templateId;
        variants = gelatoConfig.variants;

        // If using a non-default template, fetch its variants from cached templates
        if (job.templateId && job.templateId !== gelatoConfig.templateId) {
          const templatesDoc = await db.collection("config").doc("gelatoTemplates").get();
          if (templatesDoc.exists) {
            const matched = (templatesDoc.data().templates || []).find((t) => t.id === job.templateId);
            if (matched) {
              variants = matched.variants;
              console.log(`Using template "${matched.title}" with ${variants.length} variants`);
            }
          }
        }
      }

      if (!storeId || !templateId) {
        throw new Error("Missing Gelato storeId or templateId in config");
      }

      // Import fetch early — needed for both image URL and Gelato API calls
      const fetchMod = (await import("node-fetch")).default;

      // Get the single best image for Gelato — always the print-optimized 4x version
      const printStoragePath = image.storagePathPrint || image.storagePathUpscaled;
      if (!printStoragePath) {
        throw new Error("No upscaled storage path found — upscale the image first");
      }
      const imageFile = bucket.file(printStoragePath);
      const [signedUrl] = await imageFile.getSignedUrl({
        action: "read",
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      });
      const printImageUrl = signedUrl;
      console.log(`Gelato image: ${printStoragePath} (${image.upscaleScale}x, ${image.upscaledWidth}×${image.upscaledHeight})`);

      console.log("Image URL for Gelato:", printImageUrl?.substring(0, 100) + "...");

      // Fetch fresh template data from Gelato to get exact placeholder names
      console.log("Fetching fresh template data from Gelato...");
      const templateResponse = await fetchMod(
        `https://ecommerce.gelatoapis.com/v1/templates/${templateId}`,
        { headers: { "X-API-KEY": GELATO_API_KEY.value() } }
      );
      let templateVariants = variants; // fallback to cached
      if (templateResponse.ok) {
        const templateData = await templateResponse.json();
        console.log("Template first variant:", JSON.stringify(templateData.variants?.[0])?.substring(0, 500));
        templateVariants = templateData.variants || variants;
      } else {
        console.log("Template fetch failed, using cached variants");
      }

      // Build variants array — use each variant's own placeholder names
      const variantPayload = templateVariants.map((v) => {
        const placeholders = v.imagePlaceholders || v.image_placeholders || [];
        return {
          templateVariantId: v.id,
          imagePlaceholders: placeholders.map((p) => ({
            name: p.name,
            fileUrl: printImageUrl,
          })),
        };
      });
      console.log("First variant payload:", JSON.stringify(variantPayload[0]));

      if (variantPayload.length === 0) {
        throw new Error("No variants found in Gelato config. Sync template first.");
      }

      // Format description as HTML for Gelato/Etsy
      const htmlDescription = listing.description
        .split("\n")
        .map((line) => {
          if (line.startsWith("•")) return line;
          if (line.trim() === "") return "<br>";
          return line;
        })
        .join("\n");

      console.log("Sending to Gelato:", { storeId, templateId, variantCount: variantPayload.length, title: listing.title });

      // Create product from template via Gelato API
      const gelatoResponse = await fetchMod(
        `https://ecommerce.gelatoapis.com/v1/stores/${storeId}/products:create-from-template`,
        {
          method: "POST",
          headers: {
            "X-API-KEY": GELATO_API_KEY.value(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            templateId,
            title: listing.title,
            description: htmlDescription,
            isVisibleInTheOnlineStore: true,
            tags: listing.tags,
            variants: variantPayload,
          }),
        }
      );

      if (!gelatoResponse.ok) {
        const errorBody = await gelatoResponse.text();
        throw new Error(`Gelato API ${gelatoResponse.status}: ${errorBody}`);
      }

      const gelatoResult = await gelatoResponse.json();
      console.log("Gelato product created:", gelatoResult.id);

      // Update image listing with Gelato/Etsy IDs
      await db.collection("images").doc(job.imageId).update({
        "listing.status": "published",
        "listing.publishedAt": admin.firestore.FieldValue.serverTimestamp(),
        "listing.gelatoProductId": gelatoResult.id || null,
        "listing.etsyListingId": gelatoResult.externalId || null,
        publishedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await jobRef.update({
        status: "completed",
        gelatoProductId: gelatoResult.id || null,
        etsyListingId: gelatoResult.externalId || null,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log("Published to Gelato/Etsy for image:", job.imageId);
    } catch (error) {
      console.error("Publish failed:", jobId, error);
      await jobRef.update({
        status: "failed",
        error: error.message || "Unknown error",
      });
    }
  }
);

// ─── Sync Gelato Template Variants ───────────────────────────────────────────

exports.syncGelatoTemplate = onDocumentCreated(
  {
    document: "gelatoSync/{triggerId}",
    secrets: [GELATO_API_KEY],
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (event) => {
    const trigger = event.data.data();
    const { storeId, templateId } = trigger;

    try {
      const fetchMod = (await import("node-fetch")).default;

      const response = await fetchMod(
        `https://ecommerce.gelatoapis.com/v1/templates/${templateId}`,
        {
          headers: { "X-API-KEY": GELATO_API_KEY.value() },
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Gelato API ${response.status}: ${errorBody}`);
      }

      const template = await response.json();
      console.log("Template keys:", Object.keys(template));
      console.log("Template raw (first 2000 chars):", JSON.stringify(template).substring(0, 2000));

      // Extract image placeholder names from template
      const imagePlaceholders = template.imagePlaceholders || template.image_placeholders || [];
      console.log("Image placeholders:", JSON.stringify(imagePlaceholders));

      // Check first variant for placeholder info
      if (template.variants?.[0]) {
        console.log("First variant keys:", Object.keys(template.variants[0]));
        console.log("First variant:", JSON.stringify(template.variants[0]).substring(0, 500));
      }

      // Extract variant info
      const variants = (template.variants || []).map((v) => ({
        id: v.id,
        title: v.title || "",
        productUid: v.productUid || "",
        imagePlaceholders: v.imagePlaceholders || v.image_placeholders || [],
      }));

      // Cache in Firestore
      await db.collection("config").doc("gelato").set(
        {
          storeId,
          templateId,
          templateTitle: template.title || "",
          imagePlaceholders,
          variants,
          lastSynced: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // Update trigger doc
      await db.collection("gelatoSync").doc(event.params.triggerId).update({
        status: "completed",
        variantCount: variants.length,
      });

      console.log(`Gelato template synced: ${variants.length} variants`);
    } catch (error) {
      console.error("Gelato sync failed:", error);
      await db.collection("gelatoSync").doc(event.params.triggerId).update({
        status: "failed",
        error: error.message,
      });
    }
  }
);

// ─── Fetch All Gelato Templates ──────────────────────────────────────────────

exports.fetchGelatoTemplates = onDocumentCreated(
  {
    document: "gelatoTemplateSync/{triggerId}",
    secrets: [GELATO_API_KEY],
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (event) => {
    const triggerId = event.params.triggerId;
    const triggerRef = db.collection("gelatoTemplateSync").doc(triggerId);

    try {
      await triggerRef.update({ status: "processing" });
      const fetchMod = (await import("node-fetch")).default;

      // Fetch all templates
      let allTemplates = [];
      let offset = 0;
      const limit = 100;

      while (true) {
        const url = `https://ecommerce.gelatoapis.com/v1/templates?limit=${limit}&offset=${offset}`;
        console.log("Fetching templates:", url);
        const res = await fetchMod(url, {
          headers: { "X-API-KEY": GELATO_API_KEY.value() },
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Gelato API ${res.status}: ${errText}`);
        }
        const data = await res.json();
        const templates = data.templates || data.data || data;
        if (!Array.isArray(templates) || templates.length === 0) break;
        allTemplates = allTemplates.concat(templates);
        if (templates.length < limit) break;
        offset += limit;
      }

      console.log(`Found ${allTemplates.length} templates`);

      // For each template, fetch full details to get variants
      const templateSummaries = [];
      for (const t of allTemplates) {
        const tid = t.id || t.uid;
        try {
          const detailRes = await fetchMod(
            `https://ecommerce.gelatoapis.com/v1/templates/${tid}`,
            { headers: { "X-API-KEY": GELATO_API_KEY.value() } }
          );
          if (detailRes.ok) {
            const detail = await detailRes.json();
            const variants = (detail.variants || []).map((v) => ({
              id: v.id,
              title: v.title || "",
              productUid: v.productUid || "",
              imagePlaceholders: v.imagePlaceholders || v.image_placeholders || [],
            }));
            templateSummaries.push({
              id: tid,
              title: detail.title || t.title || "Untitled",
              description: detail.description || t.description || "",
              variantCount: variants.length,
              variants,
              imagePlaceholders: detail.imagePlaceholders || detail.image_placeholders || [],
            });
            console.log(`  Template "${detail.title}": ${variants.length} variants`);
          } else {
            console.log(`  Failed to fetch template ${tid}: ${detailRes.status}`);
            templateSummaries.push({
              id: tid,
              title: t.title || "Untitled",
              description: t.description || "",
              variantCount: 0,
              variants: [],
              imagePlaceholders: [],
            });
          }
        } catch (err) {
          console.error(`  Error fetching template ${tid}:`, err.message);
        }
      }

      // Cache in Firestore
      await db.collection("config").doc("gelatoTemplates").set({
        templates: templateSummaries,
        totalCount: templateSummaries.length,
        lastSynced: admin.firestore.FieldValue.serverTimestamp(),
      });

      await triggerRef.update({
        status: "completed",
        totalTemplates: templateSummaries.length,
      });

      console.log(`Cached ${templateSummaries.length} Gelato templates`);
    } catch (error) {
      console.error("Gelato template fetch failed:", error);
      await triggerRef.update({ status: "failed", error: error.message });
    }
  }
);

// ─── Sync Gelato Products to Firestore ──────────────────────────────────────

exports.syncGelatoProducts = onDocumentCreated(
  {
    document: "gelatoProductSync/{triggerId}",
    secrets: [GELATO_API_KEY],
    timeoutSeconds: 60,
    memory: "512MiB",
  },
  async (event) => {
    const triggerRef = db.collection("gelatoProductSync").doc(event.params.triggerId);
    try {
      const trigger = event.data.data();
      const storeId = trigger.storeId;
      if (!storeId) throw new Error("Missing storeId");

      await triggerRef.update({ status: "processing" });

      const fetchMod = (await import("node-fetch")).default;

      // First, list all stores to find the right one
      const storesRes = await fetchMod(
        "https://ecommerce.gelatoapis.com/v1/stores",
        { headers: { "X-API-KEY": GELATO_API_KEY.value() } }
      );
      if (storesRes.ok) {
        const storesData = await storesRes.json();
        console.log("All Gelato stores:", JSON.stringify(storesData).substring(0, 2000));
      } else {
        console.log("Stores list failed:", storesRes.status, await storesRes.text());
      }

      // Fetch all products from Gelato
      let allProducts = [];
      let offset = 0;
      const limit = 100;

      while (true) {
        const url = `https://ecommerce.gelatoapis.com/v1/stores/${storeId}/products?limit=${limit}&offset=${offset}&order=desc&orderBy=createdAt`;
        console.log("Fetching products from:", url);
        const res = await fetchMod(url, { headers: { "X-API-KEY": GELATO_API_KEY.value() } });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Gelato API ${res.status}: ${errText}`);
        }
        const data = await res.json();
        console.log("Gelato products response:", JSON.stringify(data).substring(0, 2000));
        const products = data.products || data.data || data;
        if (!Array.isArray(products) || products.length === 0) break;
        allProducts = allProducts.concat(products);
        if (products.length < limit) break;
        offset += limit;
      }

      // Store products summary in config doc
      const productSummaries = allProducts.map((p) => ({
        id: p.id || p.uid,
        title: p.title || p.name || "Untitled",
        status: p.status || "unknown",
        storeProductId: p.storeProductId || null,
        previewUrl: p.previewUrl || (p.images && p.images[0]?.url) || null,
        createdAt: p.createdAt || null,
      }));

      await db.collection("config").doc("gelatoProducts").set({
        products: productSummaries,
        totalCount: allProducts.length,
        lastSynced: admin.firestore.FieldValue.serverTimestamp(),
        storeId,
      });

      await triggerRef.update({
        status: "completed",
        totalProducts: allProducts.length,
      });

      console.log(`Synced ${allProducts.length} Gelato products`);
    } catch (error) {
      console.error("Gelato product sync failed:", error);
      await triggerRef.update({ status: "failed", error: error.message });
    }
  }
);

// ─── Etsy OAuth & Digital Download Publishing ────────────────────────────────

const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const crypto = require("crypto");

// Helper: Get valid Etsy access token (auto-refreshes if expired)
async function getEtsyAccessToken() {
  const configDoc = await db.collection("config").doc("etsy").get();
  if (!configDoc.exists) throw new Error("Etsy not connected. Go to Settings → Etsy to connect.");
  const config = configDoc.data();

  const now = Date.now();
  const expiresAt = config.expiresAt?.toMillis?.() || config.expiresAt || 0;

  // If token expires in < 5 minutes, refresh
  if (now > expiresAt - 5 * 60 * 1000) {
    console.log("Etsy token expired or expiring soon, refreshing...");
    const fetchMod = (await import("node-fetch")).default;
    const response = await fetchMod("https://api.etsy.com/v3/public/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: ETSY_API_KEY.value(),
        refresh_token: config.refreshToken,
      }).toString(),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Etsy token refresh failed (${response.status}): ${errBody}`);
    }

    const tokens = await response.json();
    await db.collection("config").doc("etsy").update({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    });
    console.log("Etsy token refreshed successfully");
    return tokens.access_token;
  }

  return config.accessToken;
}

// Step 1: Generate Etsy OAuth URL (HTTPS callable)
exports.etsyAuthUrl = onRequest(
  { secrets: [ETSY_API_KEY, ETSY_SHARED_SECRET], cors: true, invoker: "public" },
  async (req, res) => {
    try {
      // Generate PKCE code verifier and challenge
      const codeVerifier = crypto.randomBytes(32).toString("base64url");
      const codeChallenge = crypto
        .createHash("sha256")
        .update(codeVerifier)
        .digest("base64url");

      const state = crypto.randomBytes(16).toString("hex");

      // Store PKCE verifier temporarily in Firestore
      await db.collection("config").doc("etsyPkce").set({
        codeVerifier,
        state,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Build the callback URL — use the etsyCallback Cloud Function URL
      const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "gamer-art-factory";
      const redirectUri = `https://us-central1-${projectId}.cloudfunctions.net/etsyCallback`;

      const authUrl = `https://www.etsy.com/oauth/connect?` +
        `response_type=code` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent("listings_w listings_r shops_r")}` +
        `&client_id=${ETSY_API_KEY.value()}` +
        `&state=${state}` +
        `&code_challenge=${codeChallenge}` +
        `&code_challenge_method=S256`;

      res.json({ authUrl, redirectUri });
    } catch (error) {
      console.error("etsyAuthUrl error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Step 2: Etsy OAuth callback (receives redirect from Etsy)
exports.etsyCallback = onRequest(
  { secrets: [ETSY_API_KEY, ETSY_SHARED_SECRET], invoker: "public" },
  async (req, res) => {
    try {
      const { code, state } = req.query;
      if (!code || !state) {
        res.status(400).send("Missing code or state parameter");
        return;
      }

      // Retrieve stored PKCE verifier
      const pkceDoc = await db.collection("config").doc("etsyPkce").get();
      if (!pkceDoc.exists || pkceDoc.data().state !== state) {
        res.status(400).send("Invalid state parameter — possible CSRF attack");
        return;
      }
      const { codeVerifier } = pkceDoc.data();

      const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "gamer-art-factory";
      const redirectUri = `https://us-central1-${projectId}.cloudfunctions.net/etsyCallback`;

      // Exchange code for tokens
      const fetchMod = (await import("node-fetch")).default;
      const tokenResponse = await fetchMod("https://api.etsy.com/v3/public/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: ETSY_API_KEY.value(),
          redirect_uri: redirectUri,
          code,
          code_verifier: codeVerifier,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const errBody = await tokenResponse.text();
        console.error("Token exchange failed:", errBody);
        res.status(500).send(`Token exchange failed: ${errBody}`);
        return;
      }

      const tokens = await tokenResponse.json();
      console.log("Etsy tokens received, access_token length:", tokens.access_token?.length);

      // Get user's shop ID
      let shopId = null;
      try {
        // The token response includes user_id as part of the access token prefix
        // Format: "userId.tokenValue"
        const userId = tokens.access_token.split(".")[0];

        const shopsResponse = await fetchMod(
          `https://api.etsy.com/v3/application/users/${userId}/shops`,
          {
            headers: {
              Authorization: `Bearer ${tokens.access_token}`,
              "x-api-key": etsyXApiKey(),
            },
          }
        );
        if (shopsResponse.ok) {
          const shopsData = await shopsResponse.json();
          if (shopsData.results?.[0]) {
            shopId = shopsData.results[0].shop_id;
            console.log("Found Etsy shop:", shopId, shopsData.results[0].shop_name);
          }
        }
      } catch (shopErr) {
        console.warn("Could not auto-detect shop ID:", shopErr.message);
      }

      // Store tokens in Firestore
      await db.collection("config").doc("etsy").set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        shopId,
        scope: "listings_w listings_r shops_r",
        connectedAt: admin.firestore.FieldValue.serverTimestamp(),
        defaultPrice: 6.99,
        taxonomyId: 2078, // Art Prints
        whoMade: "i_did",
        whenMade: "2020_2025",
      }, { merge: true });

      // Clean up PKCE doc
      await db.collection("config").doc("etsyPkce").delete();

      // Redirect back to the app
      res.redirect("https://gamer-art-factory.web.app/settings/etsy?connected=true");
    } catch (error) {
      console.error("etsyCallback error:", error);
      res.status(500).send(`OAuth error: ${error.message}`);
    }
  }
);

// Step 3: Publish digital download to Etsy
exports.publishDigitalToEtsy = onDocumentCreated(
  {
    document: "digitalPublishJobs/{jobId}",
    secrets: [ETSY_API_KEY, ETSY_SHARED_SECRET],
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async (event) => {
    const job = event.data.data();
    const jobRef = db.collection("digitalPublishJobs").doc(event.params.jobId);

    if (job.status !== "queued") return;

    try {
      await jobRef.update({ status: "publishing" });
      console.log("Digital publish started for image:", job.imageId);

      // Load image data
      const imageDoc = await db.collection("images").doc(job.imageId).get();
      if (!imageDoc.exists) throw new Error("Image not found");
      const image = imageDoc.data();
      const listing = image.listing;

      if (!listing || !listing.title) {
        throw new Error("No listing data — run AI analysis first");
      }

      // Get Etsy config
      const etsyConfig = (await db.collection("config").doc("etsy").get()).data();
      if (!etsyConfig?.shopId) throw new Error("Etsy not connected or shop ID missing");

      const shopId = etsyConfig.shopId;
      const accessToken = await getEtsyAccessToken();
      const fetchMod = (await import("node-fetch")).default;
      const FormData = (await import("form-data")).default;

      const headers = {
        Authorization: `Bearer ${accessToken}`,
        "x-api-key": etsyXApiKey(),
      };

      // ── Step A: Create draft listing ──
      console.log("Creating draft listing on Etsy...");
      const createResponse = await fetchMod(
        `https://api.etsy.com/v3/application/shops/${shopId}/listings`,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            quantity: "999",
            title: listing.title,
            description: listing.description,
            price: String(etsyConfig.defaultPrice || 6.99),
            who_made: etsyConfig.whoMade || "i_did",
            when_made: etsyConfig.whenMade || "2020_2025",
            taxonomy_id: String(etsyConfig.taxonomyId || 2078),
            type: "download",
            is_digital: "true",
            tags: (listing.tags || []).join(","),
          }).toString(),
        }
      );

      if (!createResponse.ok) {
        const errBody = await createResponse.text();
        throw new Error(`Etsy createDraftListing failed (${createResponse.status}): ${errBody}`);
      }

      const etsyListing = await createResponse.json();
      const listingId = etsyListing.listing_id;
      console.log("Draft listing created:", listingId);

      await jobRef.update({ etsyListingId: String(listingId) });

      // ── Step B: Upload listing preview image ──
      console.log("Uploading preview image...");
      const previewPath = image.storagePathPrint || image.storagePathUpscaled || image.storagePath;
      const previewFile = bucket.file(previewPath);
      const [previewBuffer] = await previewFile.download();

      const imageForm = new FormData();
      imageForm.append("image", previewBuffer, {
        filename: "preview.jpg",
        contentType: "image/jpeg",
      });
      imageForm.append("rank", "1");

      const imageUploadResponse = await fetchMod(
        `https://api.etsy.com/v3/application/shops/${shopId}/listings/${listingId}/images`,
        {
          method: "POST",
          headers: { ...headers, ...imageForm.getHeaders() },
          body: imageForm,
        }
      );

      if (!imageUploadResponse.ok) {
        const errBody = await imageUploadResponse.text();
        console.warn("Image upload warning:", errBody);
        // Don't fail — image upload is non-critical, listing still works
      } else {
        console.log("Preview image uploaded");
      }

      // ── Step C: Upload digital download file ──
      console.log("Uploading digital download file...");
      const digitalPath = image.storagePathUpscaled || image.storagePathPrint || image.storagePath;
      const digitalFile = bucket.file(digitalPath);
      const [digitalBuffer] = await digitalFile.download();

      // Sanitize filename
      const safeTitle = (listing.title || "artwork")
        .replace(/[^a-zA-Z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .substring(0, 50)
        .toLowerCase();

      const fileForm = new FormData();
      fileForm.append("file", digitalBuffer, {
        filename: `${safeTitle}-high-res.jpg`,
        contentType: "image/jpeg",
      });
      fileForm.append("name", `${safeTitle}-high-res.jpg`);

      const fileUploadResponse = await fetchMod(
        `https://api.etsy.com/v3/application/shops/${shopId}/listings/${listingId}/files`,
        {
          method: "POST",
          headers: { ...headers, ...fileForm.getHeaders() },
          body: fileForm,
        }
      );

      if (!fileUploadResponse.ok) {
        const errBody = await fileUploadResponse.text();
        throw new Error(`Digital file upload failed (${fileUploadResponse.status}): ${errBody}`);
      }
      console.log("Digital file uploaded");

      // ── Step D: Activate the listing ──
      console.log("Activating listing...");
      const activateResponse = await fetchMod(
        `https://api.etsy.com/v3/application/shops/${shopId}/listings/${listingId}`,
        {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ state: "active" }).toString(),
        }
      );

      if (!activateResponse.ok) {
        const errBody = await activateResponse.text();
        console.warn("Listing activation warning:", errBody);
        // Some listings need manual review — don't fail the whole job
      } else {
        console.log("Listing activated!");
      }

      const etsyListingUrl = `https://www.etsy.com/listing/${listingId}`;

      // Update image document
      await db.collection("images").doc(job.imageId).update({
        "listing.digitalStatus": "published",
        "listing.etsyDigitalListingId": String(listingId),
        "listing.etsyDigitalListingUrl": etsyListingUrl,
        "listing.digitalPublishedAt": admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update job
      await jobRef.update({
        status: "completed",
        etsyListingId: String(listingId),
        etsyListingUrl,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log("Digital download published to Etsy:", etsyListingUrl);
    } catch (error) {
      console.error("Digital publish failed:", event.params.jobId, error);
      await jobRef.update({
        status: "failed",
        error: error.message,
      });
      await db.collection("images").doc(job.imageId).update({
        "listing.digitalStatus": "failed",
      }).catch(() => {});
    }
  }
);

// ─── Bundle publish (digital download bundle to Etsy) ────────────────────────

exports.publishBundleToEtsy = onDocumentCreated(
  {
    document: "bundlePublishJobs/{jobId}",
    secrets: [ETSY_API_KEY, ETSY_SHARED_SECRET],
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (event) => {
    const job = event.data.data();
    const jobRef = db.collection("bundlePublishJobs").doc(event.params.jobId);

    if (job.status !== "queued") return;

    const slugify = (s) =>
      (s || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || "bundle";

    try {
      await jobRef.update({ status: "publishing", step: "creating" });

      if (!Array.isArray(job.imageIds) || job.imageIds.length < 3) {
        throw new Error("Bundle must contain at least 3 images");
      }
      if (!job.title || !job.description || !Array.isArray(job.tags) || job.tags.length === 0) {
        throw new Error("Missing title, description, or tags — generate the AI listing first");
      }

      const etsyConfig = (await db.collection("config").doc("etsy").get()).data();
      if (!etsyConfig?.shopId) throw new Error("Etsy not connected or shop ID missing");
      const shopId = etsyConfig.shopId;
      const accessToken = await getEtsyAccessToken();

      const fetchMod = (await import("node-fetch")).default;
      const FormData = (await import("form-data")).default;
      const JSZip = (await import("jszip")).default;

      const headers = {
        Authorization: `Bearer ${accessToken}`,
        "x-api-key": etsyXApiKey(),
      };

      // Load image docs in the order they appear in the job
      const imageDocs = await Promise.all(
        job.imageIds.map((id) => db.collection("images").doc(id).get())
      );
      const images = imageDocs
        .map((d, i) => (d.exists ? { id: job.imageIds[i], ...d.data() } : null))
        .filter(Boolean);
      if (images.length !== job.imageIds.length) {
        throw new Error("One or more bundle images could not be loaded");
      }
      for (const img of images) {
        if (!img.storagePathUpscaled && !img.storagePathPrint) {
          throw new Error(`Image ${img.id} has no upscaled storage path`);
        }
      }

      // ── Step A: Create draft listing ──
      console.log("Creating Etsy draft listing for bundle:", job.name);
      const createBody = new URLSearchParams();
      createBody.append("title", String(job.title).slice(0, 140));
      createBody.append("description", job.description);
      createBody.append("price", String(job.price || 14.99));
      createBody.append("quantity", "999");
      createBody.append("taxonomy_id", "2078");
      createBody.append("type", "download");
      createBody.append("is_digital", "true");
      createBody.append("should_auto_renew", "true");
      createBody.append("state", "draft");
      createBody.append("who_made", etsyConfig.whoMade || "i_did");
      createBody.append("when_made", etsyConfig.whenMade || "2020_2025");
      for (const t of job.tags) createBody.append("tags", t);

      const createRes = await fetchMod(
        `https://api.etsy.com/v3/application/shops/${shopId}/listings`,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
          body: createBody.toString(),
        }
      );
      if (!createRes.ok) {
        const txt = await createRes.text();
        throw new Error(`Etsy createDraftListing failed (${createRes.status}): ${txt}`);
      }
      const draft = await createRes.json();
      const listingId = draft.listing_id;
      const etsyListingUrl = `https://www.etsy.com/listing/${listingId}`;
      console.log("Draft listing created:", listingId);

      await jobRef.update({
        etsyListingId: String(listingId),
        etsyListingUrl,
        step: "zipping",
      });

      // ── Step B: Build zip(s), splitting if needed to stay under Etsy's 20MB-per-file cap ──
      const ETSY_MAX_FILE_BYTES = 18 * 1024 * 1024; // 18MB target, 20MB hard cap
      const ETSY_MAX_DIGITAL_FILES = 5;
      const baseSlug = slugify(job.name);

      // Download all image buffers (paired with their filenames inside the zip)
      const entries = [];
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const path = img.storagePathPrint || img.storagePathUpscaled;
        const [buf] = await bucket.file(path).download();
        const filename = `${slugify(img.collection || job.name)}-${String(i + 1).padStart(2, "0")}-hoodie-gamer.jpg`;
        if (buf.length > ETSY_MAX_FILE_BYTES) {
          throw new Error(
            `Image ${img.id} is ${(buf.length / 1024 / 1024).toFixed(1)}MB — too large to fit in any single Etsy file (max 20MB)`
          );
        }
        entries.push({ filename, buf });
      }

      // Pack greedily into chunks, each ≤ 18MB
      const chunks = [];
      let cur = [];
      let curSize = 0;
      for (const e of entries) {
        if (curSize + e.buf.length > ETSY_MAX_FILE_BYTES && cur.length > 0) {
          chunks.push(cur);
          cur = [];
          curSize = 0;
        }
        cur.push(e);
        curSize += e.buf.length;
      }
      if (cur.length > 0) chunks.push(cur);

      if (chunks.length > ETSY_MAX_DIGITAL_FILES) {
        throw new Error(
          `Bundle needs ${chunks.length} zip files but Etsy allows max ${ETSY_MAX_DIGITAL_FILES}. ` +
          `Reduce image count or compress sources.`
        );
      }

      // Generate zip buffers
      const zipParts = [];
      for (let i = 0; i < chunks.length; i++) {
        const z = new JSZip();
        for (const e of chunks[i]) z.file(e.filename, e.buf);
        const zipBuf = await z.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
        if (zipBuf.length > 20 * 1024 * 1024) {
          throw new Error(
            `Zip part ${i + 1} is ${(zipBuf.length / 1024 / 1024).toFixed(1)}MB, exceeds Etsy's 20MB cap`
          );
        }
        const zipName = chunks.length === 1
          ? `${baseSlug}-hoodie-gamer-bundle.zip`
          : `${baseSlug}-hoodie-gamer-bundle-part${i + 1}of${chunks.length}.zip`;
        zipParts.push({ name: zipName, buf: zipBuf });
        console.log(`Built ${zipName}: ${(zipBuf.length / 1024 / 1024).toFixed(1)} MB (${chunks[i].length} images)`);
      }

      await jobRef.update({ step: "uploadingZip", totalZips: zipParts.length, uploadedZips: 0 });

      // ── Step C: Upload each zip part as a digital download file ──
      for (let i = 0; i < zipParts.length; i++) {
        const part = zipParts[i];
        const fileForm = new FormData();
        fileForm.append("file", part.buf, { filename: part.name, contentType: "application/zip" });
        fileForm.append("name", part.name);
        const fileRes = await fetchMod(
          `https://api.etsy.com/v3/application/shops/${shopId}/listings/${listingId}/files`,
          { method: "POST", headers: { ...headers, ...fileForm.getHeaders() }, body: fileForm }
        );
        if (!fileRes.ok) {
          const txt = await fileRes.text();
          throw new Error(`Etsy file upload failed on part ${i + 1} (${fileRes.status}): ${txt}`);
        }
        await jobRef.update({ uploadedZips: i + 1 });
      }

      await jobRef.update({ step: "uploadingImages" });

      // ── Step D: Upload listing images (cover first, up to 10 total) ──
      const ETSY_MAX_LISTING_IMAGES = 10;
      const imagesToUpload = images.slice(0, ETSY_MAX_LISTING_IMAGES);
      for (let i = 0; i < imagesToUpload.length; i++) {
        const img = imagesToUpload[i];
        const path = img.storagePathPrint || img.storagePathUpscaled;
        const [buf] = await bucket.file(path).download();
        const filename = i === 0
          ? `${slugify(job.name)}-cover.jpg`
          : `${slugify(job.name)}-${String(i + 1).padStart(2, "0")}.jpg`;
        const imgForm = new FormData();
        imgForm.append("image", buf, { filename, contentType: "image/jpeg" });
        imgForm.append("rank", String(i + 1));
        const imgRes = await fetchMod(
          `https://api.etsy.com/v3/application/shops/${shopId}/listings/${listingId}/images`,
          { method: "POST", headers: { ...headers, ...imgForm.getHeaders() }, body: imgForm }
        );
        if (!imgRes.ok) {
          const txt = await imgRes.text();
          console.warn(`Listing image ${i + 1} upload warning (${imgRes.status}): ${txt}`);
        }
        await jobRef.update({ uploadedImages: i + 1 });
      }

      await jobRef.update({ step: "activating" });

      // ── Step E: Activate ──
      const actRes = await fetchMod(
        `https://api.etsy.com/v3/application/shops/${shopId}/listings/${listingId}`,
        {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ state: "active" }).toString(),
        }
      );
      if (!actRes.ok) {
        const txt = await actRes.text();
        console.warn(`Activate warning (${actRes.status}): ${txt}`);
      }

      // ── Step F: Save bundle record ──
      const slugsInBundle = [...new Set(images.map((i) => i.collection).filter(Boolean))];
      const bundleRef = await db.collection("bundles").add({
        name: job.name,
        price: job.price || 14.99,
        tags: job.tags,
        description: job.description,
        title: job.title,
        imageIds: job.imageIds,
        collectionSlugs: slugsInBundle,
        etsyListingId: String(listingId),
        etsyListingUrl,
        status: "published",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await jobRef.update({
        status: "completed",
        step: "done",
        bundleId: bundleRef.id,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log("Bundle published to Etsy:", etsyListingUrl);
    } catch (error) {
      console.error("Bundle publish failed:", event.params.jobId, error);
      await jobRef.update({
        status: "failed",
        error: error.message,
      });
    }
  }
);

// ─── Image Edit (fal.ai Nano Banana 2 Edit) ─────────────────────────────────

exports.processImageEdit = onDocumentCreated(
  {
    document: "editJobs/{jobId}",
    secrets: [FAL_KEY],
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  async (event) => {
    const jobId = event.params.jobId;
    const job = event.data.data();

    if (job.status !== "queued") return;

    const jobRef = db.collection("editJobs").doc(jobId);

    try {
      await jobRef.update({
        status: "processing",
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const imageRef = db.collection("images").doc(job.imageId);
      const imageDoc = await imageRef.get();
      if (!imageDoc.exists) throw new Error("Image not found");

      const image = imageDoc.data();

      console.log("Starting image edit for:", job.imageId, "Prompt:", job.prompt);

      const { fal } = await import("@fal-ai/client");
      fal.config({ credentials: FAL_KEY.value() });

      // Download source image directly from Storage (avoids URL expiry/auth issues)
      const fetchMod = (await import("node-fetch")).default;
      const srcPath = image.storagePath;
      if (!srcPath) throw new Error("Image has no storagePath");
      const [srcBuffer] = await bucket.file(srcPath).download();
      console.log("Downloaded source from Storage:", srcBuffer.length, "bytes");

      const falUrl = await fal.storage.upload(new Blob([srcBuffer], { type: "image/png" }));
      console.log("Uploaded to fal storage:", falUrl);

      const result = await fal.subscribe("fal-ai/nano-banana-2/edit", {
        input: {
          prompt: job.prompt,
          image_urls: [falUrl],
          num_images: job.numImages || 1,
          resolution: job.resolution || "1K",
          aspect_ratio: "auto",
          output_format: "png",
          thinking_level: "high",
        },
        logs: true,
        onQueueUpdate: (update) => {
          console.log("Edit queue:", update.status);
        },
      });

      console.log("Edit result keys:", Object.keys(result));

      const editedImages = result.data?.images || result.images || [];
      if (editedImages.length === 0) throw new Error("No edited images returned");

      // Save each edited variant to Firebase Storage and create new image docs
      const savedImages = [];
      for (let i = 0; i < editedImages.length; i++) {
        const editedImg = editedImages[i];
        const editUrl = editedImg.url;
        if (!editUrl) continue;

        // Download from fal.ai
        const dlResponse = await fetchMod(editUrl);
        const rawBuffer = Buffer.from(await dlResponse.arrayBuffer());

        // Convert to optimized JPG
        const buffer = await toOptimizedJpg(rawBuffer);
        console.log(`Edit variant ${i}: ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);

        // Save to Firebase Storage
        const timestamp = Date.now();
        const storagePath = `edits/${job.imageId}_${timestamp}_${i}.jpg`;
        const file = bucket.file(storagePath);
        await file.save(buffer, { metadata: { contentType: "image/jpeg" } });
        const permUrl = await getPermUrl(file);

        // Get dimensions
        const metadata = await sharp(buffer).metadata();

        // Create a new image document (variant of the original)
        const newImageRef = await db.collection("images").add({
          url: permUrl,
          storagePath,
          width: metadata.width || editedImg.width,
          height: metadata.height || editedImg.height,
          promptText: `[Edit of ${job.imageId}] ${job.prompt}`,
          editSourceId: job.imageId,
          editPrompt: job.prompt,
          rating: job.batchId ? "unrated" : null,
          favorite: false,
          upscaled: false,
          collection: image.collection || null,
          collectionDisplayName: image.collectionDisplayName || null,
          batchId: job.batchId || null,
          personaId: job.personaId || null,
          personaName: job.personaName || null,
          style: job.style || null,
          gender: job.gender || null,
          clothing: job.clothing || null,
          clothingColor: job.clothingColor || null,
          hairStyle: job.hairStyle || null,
          hairColor: job.hairColor || null,
          skinTone: job.skinTone || null,
          headwear: job.headwear || null,
          store: job.store || null,
          metadata: {
            model: "nano-banana-2/edit",
            sourceImageId: job.imageId,
          },
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        savedImages.push({
          imageId: newImageRef.id,
          url: permUrl,
          storagePath,
        });
      }

      await jobRef.update({
        status: "completed",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        results: savedImages,
        resultCount: savedImages.length,
      });

      console.log("Image edit complete:", savedImages.length, "variants created");
    } catch (error) {
      console.error("Image edit error:", error);
      await jobRef.update({
        status: "failed",
        error: error.message || "Unknown error",
      });
    }
  }
);

// ─── fal.ai Usage / Cost Tracking ─────────────────────────────────────────────

exports.fetchFalUsage = onDocumentWritten(
  { document: "config/falUsageRequest", secrets: [FAL_KEY] },
  async (event) => {
    try {
      const fetchMod = (await import("node-fetch")).default;

      // Use start date from request doc, or find earliest job in Firestore
      let startDate = event.data?.after?.data()?.start;
      if (!startDate) {
        // Find the earliest job across all job collections
        const collections = ["jobs", "editJobs", "upscaleJobs", "videoJobs"];
        let earliest = null;
        for (const col of collections) {
          const snap = await db.collection(col)
            .orderBy("createdAt", "asc")
            .limit(1)
            .get();
          if (!snap.empty) {
            const ts = snap.docs[0].data().createdAt;
            const date = ts?.toDate ? ts.toDate() : new Date(ts);
            if (!earliest || date < earliest) earliest = date;
          }
        }
        if (earliest) {
          // Start from beginning of that day
          startDate = earliest.toISOString().split("T")[0] + "T00:00:00Z";
        } else {
          startDate = "2025-01-01T00:00:00Z";
        }
      }

      // Fetch all pages from fal.ai Usage API (time_series is the default expand)
      const allResults = [];
      let cursor = null;
      let hasMore = true;
      let pageCount = 0;

      while (hasMore) {
        const url = new URL("https://api.fal.ai/v1/models/usage");
        url.searchParams.set("start", startDate);
        url.searchParams.set("limit", "100");
        url.searchParams.set("timeframe", "month");
        if (cursor) url.searchParams.set("cursor", cursor);

        console.log(`Fetching fal.ai usage page ${++pageCount}: ${url.toString()}`);

        const response = await fetchMod(url.toString(), {
          headers: { Authorization: `Key ${FAL_KEY.value().trim()}` },
        });

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`fal.ai Usage API error (${response.status}): ${errBody}`);
        }

        const data = await response.json();
        console.log(`Page ${pageCount} response keys: ${Object.keys(data).join(", ")}`);

        // Collect time_series data
        if (data.time_series && Array.isArray(data.time_series)) {
          for (const bucket of data.time_series) {
            for (const r of bucket.results || []) {
              allResults.push(r);
            }
          }
        }

        // Also collect summary if present
        if (data.summary && Array.isArray(data.summary)) {
          // Only use summary if we got no time_series data
          if (!data.time_series || data.time_series.length === 0) {
            allResults.push(...data.summary);
          }
        }

        console.log(`Running total: ${allResults.length} records`);

        hasMore = data.has_more || false;
        cursor = data.next_cursor || null;
      }

      // Aggregate by endpoint_id
      const byEndpoint = {};
      let totalCost = 0;

      for (const r of allResults) {
        const id = r.endpoint_id;
        if (!byEndpoint[id]) {
          byEndpoint[id] = {
            endpoint_id: id,
            unit: r.unit,
            quantity: 0,
            cost: 0,
            currency: r.currency || "USD",
          };
        }
        byEndpoint[id].quantity += r.quantity || 0;
        byEndpoint[id].cost += r.cost || 0;
        totalCost += r.cost || 0;
      }

      // Categorize endpoints into types
      const categories = {
        image: { cost: 0, quantity: 0, endpoints: {} },
        upscale: { cost: 0, quantity: 0, endpoints: {} },
        video: { cost: 0, quantity: 0, endpoints: {} },
        other: { cost: 0, quantity: 0, endpoints: {} },
      };

      for (const [id, data] of Object.entries(byEndpoint)) {
        let cat = "other";
        if (id.includes("upscale") || id.includes("seedvr")) cat = "upscale";
        else if (id.includes("video") || id.includes("veo") || id.includes("kling") || id.includes("minimax")) cat = "video";
        else if (id.includes("flux") || id.includes("sdxl") || id.includes("banana") || id.includes("recraft") || id.includes("ideogram") || id.includes("stable-diffusion")) cat = "image";

        categories[cat].cost += data.cost;
        categories[cat].quantity += data.quantity;
        categories[cat].endpoints[id] = data;
      }

      const result = {
        totalCost,
        startDate,
        categories,
        byEndpoint,
        fetchedAt: new Date().toISOString(),
        endpointCount: Object.keys(byEndpoint).length,
      };

      // Cache in Firestore
      await db.collection("config").doc("falUsage").set(result);

      console.log(`fal.ai usage fetched: $${totalCost.toFixed(2)} total across ${Object.keys(byEndpoint).length} endpoints`);
    } catch (error) {
      console.error("fetchFalUsage error:", error);
      await db.collection("config").doc("falUsage").set(
        { error: error.message, fetchedAt: new Date().toISOString() },
        { merge: true }
      );
    }
  }
);

const { handleAiConversation } = require("./src/aiConversation");
exports.handleAiConversation = handleAiConversation;

const { analyzeCollection } = require("./src/collectionAnalysis");
exports.analyzeCollection = analyzeCollection;

const { runMarketingAnalysis } = require("./src/marketingAgent");
exports.runMarketingAnalysis = runMarketingAnalysis;
