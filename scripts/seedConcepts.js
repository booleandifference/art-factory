/**
 * Seed script — populates the Firestore `concepts` and `prompts` collections
 * with the initial concept library and killer combo recipes.
 *
 * Usage:
 *   1. Set GOOGLE_APPLICATION_CREDENTIALS to your Firebase service account key
 *   2. Run: node scripts/seedConcepts.js
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "fs";

// Initialize Firebase Admin
const serviceAccount = JSON.parse(
  readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS || "./service-account.json", "utf8")
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const now = () => FieldValue.serverTimestamp();

// ─── Concept Library ──────────────────────────────────────────────────────────

const concepts = [
  // ── Themes ──
  { type: "theme", name: "Cyberpunk", value: "cyberpunk illustration", tier: 1, tags: ["dark", "neon", "sci-fi"], category: "", notes: "" },
  { type: "theme", name: "Anime", value: "anime style digital painting", tier: 1, tags: ["japanese", "colorful"], category: "", notes: "" },
  { type: "theme", name: "Lo-fi / Chill", value: "lo-fi aesthetic illustration, warm cozy", tier: 1, tags: ["warm", "relaxed", "soft"], category: "", notes: "" },
  { type: "theme", name: "Metal / Dark", value: "dark fantasy illustration, intense", tier: 2, tags: ["dark", "aggressive", "red"], category: "", notes: "" },
  { type: "theme", name: "Retro / Nostalgia", value: "retro pixel art, 8-bit aesthetic", tier: 2, tags: ["vintage", "colorful", "nostalgic"], category: "", notes: "" },
  { type: "theme", name: "Vaporwave", value: "vaporwave illustration, pastel neon", tier: 2, tags: ["pastel", "pink", "retro"], category: "", notes: "" },
  { type: "theme", name: "Cel-shaded", value: "cel-shaded bold outlines, comic style", tier: 2, tags: ["bold", "flat color"], category: "", notes: "" },
  { type: "theme", name: "Ink / Line art", value: "ink illustration, detailed linework", tier: 2, tags: ["monochrome", "detailed"], category: "", notes: "" },
  { type: "theme", name: "Street art", value: "street art illustration, graffiti style, gritty", tier: 2, tags: ["urban", "bold", "textured"], category: "", notes: "" },
  { type: "theme", name: "Neon noir", value: "neon noir high contrast, dramatic shadows", tier: 2, tags: ["dark", "contrast", "moody"], category: "", notes: "" },
  { type: "theme", name: "Fantasy RPG", value: "fantasy concept art, epic painterly", tier: 3, tags: ["swords", "magic", "medieval"], category: "", notes: "" },
  { type: "theme", name: "Horror", value: "dark horror illustration, ominous", tier: 3, tags: ["creepy", "fog", "red"], category: "", notes: "" },

  // ── Props: food_drink ──
  { type: "prop", name: "Energy can", value: "mountain energy drink cans piled up", tier: 1, tags: ["iconic", "messy"], category: "food_drink", notes: "" },
  { type: "prop", name: "Chip bags", value: "potato chip bags, snack wrappers", tier: 1, tags: ["messy", "relatable"], category: "food_drink", notes: "" },
  { type: "prop", name: "Pizza boxes", value: "stacked pizza boxes", tier: 1, tags: ["iconic", "food"], category: "food_drink", notes: "" },
  { type: "prop", name: "Instant noodles", value: "instant noodle cups", tier: 2, tags: ["anime", "cozy"], category: "food_drink", notes: "" },
  { type: "prop", name: "Coffee mugs", value: "coffee mugs scattered", tier: 2, tags: ["warm", "morning"], category: "food_drink", notes: "" },
  { type: "prop", name: "Soda cans", value: "soda cans", tier: 2, tags: ["classic"], category: "food_drink", notes: "" },

  // ── Props: gear ──
  { type: "prop", name: "RGB keyboard", value: "RGB mechanical keyboard glowing", tier: 1, tags: ["tech", "glow"], category: "gear", notes: "" },
  { type: "prop", name: "Headphones", value: "over-ear headphones headset", tier: 1, tags: ["iconic", "essential"], category: "gear", notes: "" },
  { type: "prop", name: "Triple monitors", value: "triple monitor setup", tier: 1, tags: ["epic", "pro"], category: "gear", notes: "" },
  { type: "prop", name: "Cable spaghetti", value: "tangled cables and wires everywhere", tier: 2, tags: ["messy", "realistic"], category: "gear", notes: "" },
  { type: "prop", name: "Streaming mic", value: "condenser microphone on desk", tier: 2, tags: ["streamer", "pro"], category: "gear", notes: "" },
  { type: "prop", name: "LED strips", value: "LED light strips purple cyan", tier: 2, tags: ["ambient", "neon"], category: "gear", notes: "" },

  // ── Props: room ──
  { type: "prop", name: "Dark room", value: "screen-lit dark room lit only by screen light", tier: 1, tags: ["moody", "atmospheric"], category: "room", notes: "" },
  { type: "prop", name: "Anime posters", value: "anime posters on wall behind", tier: 1, tags: ["otaku", "colorful"], category: "room", notes: "" },
  { type: "prop", name: "Figurines on shelf", value: "collectible figurines on shelf", tier: 2, tags: ["collector", "detail"], category: "room", notes: "" },
  { type: "prop", name: "Cat on desk", value: "cat sitting on desk or lap", tier: 2, tags: ["cozy", "cute", "viral"], category: "room", notes: "" },
  { type: "prop", name: "Rain on window", value: "rain streaks on window behind", tier: 2, tags: ["moody", "lo-fi"], category: "room", notes: "" },
  { type: "prop", name: "Clock showing 3 AM", value: "clock on wall showing 3 AM", tier: 2, tags: ["late night", "detail"], category: "room", notes: "" },

  // ── Props: body ──
  { type: "prop", name: "Hoodie", value: "wearing hoodie", tier: 1, tags: ["universal", "cozy"], category: "body", notes: "" },
  { type: "prop", name: "Blanket", value: "wrapped in blanket", tier: 2, tags: ["cozy", "winter"], category: "body", notes: "" },

  // ── Text expressions ──
  { type: "text", name: "GG", value: 'text "GG" floating above', tier: 1, tags: ["respect", "universal"], category: "neon/floating", notes: "Good game — universal gamer respect" },
  { type: "text", name: "One more game", value: 'text "one more game" on screen', tier: 1, tags: ["relatable", "late night"], category: "screen/subtitle", notes: "The eternal lie at 2 AM" },
  { type: "text", name: "AFK", value: 'text "AFK"', tier: 1, tags: ["ironic", "away"], category: "floating/neon", notes: "Away from keyboard" },
  { type: "text", name: "Respawn", value: 'text "Respawn"', tier: 1, tags: ["motivational", "comeback"], category: "subtitle", notes: "Coming back to life" },
  { type: "text", name: "GG EZ", value: 'text "GG EZ"', tier: 1, tags: ["cocky", "flex"], category: "screen/chat", notes: "Good game, easy — cocky flex" },
  { type: "text", name: "Press F", value: 'large "F" key glowing', tier: 1, tags: ["meme", "respect"], category: "screen/key", notes: "Pay respects — meme classic" },
  { type: "text", name: "No sleep only game", value: 'text "no sleep only game"', tier: 1, tags: ["lifestyle", "dedication"], category: "subtitle/caption", notes: "Lifestyle statement" },
  { type: "text", name: "Level up", value: 'text "Level Up" with XP bar', tier: 1, tags: ["motivational", "broad"], category: "screen/floating", notes: "Motivational, broad appeal" },
  { type: "text", name: "Noob", value: 'text "noob"', tier: 2, tags: ["self-deprecating", "humor"], category: "chat bubble", notes: "Newbie" },
  { type: "text", name: "Rage quit", value: "scene shows aftermath of rage quit, empty chair", tier: 2, tags: ["angry", "dramatic"], category: "scene-based", notes: "Angry quit, no text" },
  { type: "text", name: "Skill issue", value: 'text "skill issue"', tier: 2, tags: ["sarcastic", "dismissal"], category: "screen/opponent chat", notes: "Sarcastic dismissal" },
  { type: "text", name: "Touch grass", value: 'text "touch grass"', tier: 2, tags: ["self-aware", "humor"], category: "subtitle", notes: "Go outside" },
  { type: "text", name: "NPC energy", value: 'text "NPC"', tier: 2, tags: ["scripted", "clueless"], category: "floating", notes: "Acting scripted" },
  { type: "text", name: "Clutch", value: 'text "CLUTCH"', tier: 2, tags: ["epic", "last-moment"], category: "screen/bold", notes: "Epic last-moment win" },
  { type: "text", name: "Git gud", value: 'text "git gud"', tier: 3, tags: ["dark souls", "challenge"], category: "chat/screen", notes: "Get good — Dark Souls origin" },
  { type: "text", name: "Copium", value: "scene of coping after a loss", tier: 3, tags: ["coping", "loss"], category: "scene-based", notes: "Coping after a loss" },

  // ── Body types ──
  { type: "bodyType", name: "Hood up neutral", value: "gamer from behind centered, hood up, gender neutral silhouette, hoodie", tier: 1, tags: [], category: "", notes: "" },
  { type: "bodyType", name: "Girl dark long hair", value: "female gamer from behind centered, long dark hair, hoodie down", tier: 1, tags: [], category: "", notes: "" },
  { type: "bodyType", name: "Girl blonde long hair", value: "female gamer from behind centered, long blonde hair, hoodie down", tier: 1, tags: [], category: "", notes: "" },
  { type: "bodyType", name: "Girl dark short hair", value: "female gamer from behind centered, short dark hair, hoodie down", tier: 2, tags: [], category: "", notes: "" },
  { type: "bodyType", name: "Girl blonde short hair", value: "female gamer from behind centered, short blonde hair, hoodie down", tier: 2, tags: [], category: "", notes: "" },
  { type: "bodyType", name: "Boy dark short hair", value: "male gamer from behind centered, short dark hair, hoodie down", tier: 1, tags: [], category: "", notes: "" },
  { type: "bodyType", name: "Boy blonde short hair", value: "male gamer from behind centered, short blonde hair, hoodie down", tier: 1, tags: [], category: "", notes: "" },
  { type: "bodyType", name: "Boy dark long hair", value: "male gamer from behind centered, long dark messy hair, hoodie down", tier: 2, tags: [], category: "", notes: "" },
  { type: "bodyType", name: "Girl ponytail dark", value: "female gamer from behind centered, dark hair ponytail, hoodie", tier: 1, tags: [], category: "", notes: "" },
  { type: "bodyType", name: "Girl ponytail blonde", value: "female gamer from behind centered, blonde hair ponytail, hoodie", tier: 2, tags: [], category: "", notes: "" },

  // ── Chaos levels ──
  { type: "chaosLevel", name: "Minimal", value: "clean organized desk, minimal items", tier: 3, tags: [], category: "", notes: "" },
  { type: "chaosLevel", name: "Lived-in", value: "some cans and wires, realistic mess", tier: 1, tags: [], category: "", notes: "" },
  { type: "chaosLevel", name: "Chaotic", value: "messy desk covered in cans, wrappers, cables", tier: 1, tags: [], category: "", notes: "" },
  { type: "chaosLevel", name: "Absurd", value: "ridiculous amount of cans and trash, buried in mess, meme level chaos", tier: 2, tags: [], category: "", notes: "" },

  // ── Art styles ──
  { type: "style", name: "A4 portrait cyberpunk", value: "cyberpunk illustration, vertical composition, portrait format --ar 2:3", tier: 1, tags: [], category: "", notes: "" },
  { type: "style", name: "A4 portrait anime", value: "anime digital painting, vertical composition, portrait format --ar 2:3", tier: 1, tags: [], category: "", notes: "" },
  { type: "style", name: "A4 portrait concept art", value: "concept art, vertical composition, portrait format --ar 2:3", tier: 1, tags: [], category: "", notes: "" },
  { type: "style", name: "A4 portrait ink", value: "ink illustration, vertical composition, portrait format --ar 2:3", tier: 1, tags: [], category: "", notes: "" },
  { type: "style", name: "Landscape 16:9 cyberpunk", value: "cyberpunk illustration, horizontal composition, widescreen --ar 16:9", tier: 2, tags: [], category: "", notes: "" },
];

// ─── Killer Combos (saved prompts) ────────────────────────────────────────────

// These reference concept names — we'll resolve to IDs after seeding concepts
const killerCombos = [
  {
    name: "The 3 AM grind",
    theme: "Lo-fi / Chill",
    props: ["Energy can", "Rain on window", "Cat on desk", "Clock showing 3 AM"],
    text: "One more game",
    bodyType: "Hood up neutral",
    chaosLevel: "Lived-in",
    style: "A4 portrait anime",
  },
  {
    name: "Noodle & chill",
    theme: "Anime",
    props: ["Instant noodles", "Anime posters", "Figurines on shelf"],
    text: null,
    bodyType: "Hood up neutral",
    chaosLevel: "Lived-in",
    style: "A4 portrait anime",
  },
  {
    name: "Can graveyard",
    theme: "Cyberpunk",
    props: ["Energy can", "LED strips", "Cable spaghetti"],
    text: "GG",
    bodyType: "Hood up neutral",
    chaosLevel: "Absurd",
    style: "A4 portrait cyberpunk",
  },
  {
    name: "Girl gamer sanctuary",
    theme: "Anime",
    props: ["RGB keyboard", "Figurines on shelf"],
    text: null,
    bodyType: "Girl ponytail dark",
    chaosLevel: "Minimal",
    style: "A4 portrait anime",
  },
  {
    name: "Pizza throne",
    theme: "Cyberpunk",
    props: ["Pizza boxes", "RGB keyboard"],
    text: "GG EZ",
    bodyType: "Hood up neutral",
    chaosLevel: "Chaotic",
    style: "A4 portrait cyberpunk",
  },
  {
    name: "Cozy den",
    theme: "Lo-fi / Chill",
    props: ["Blanket", "Cat on desk", "Coffee mugs", "Rain on window"],
    text: null,
    bodyType: "Hood up neutral",
    chaosLevel: "Lived-in",
    style: "A4 portrait concept art",
  },
  {
    name: "Mosh pit setup",
    theme: "Metal / Dark",
    props: ["Dark room", "Anime posters"],
    text: null,
    bodyType: "Hood up neutral",
    chaosLevel: "Chaotic",
    style: "A4 portrait concept art",
  },
  {
    name: "Streamer life",
    theme: "Cyberpunk",
    props: ["Streaming mic", "LED strips", "RGB keyboard"],
    text: "Level up",
    bodyType: "Hood up neutral",
    chaosLevel: "Lived-in",
    style: "A4 portrait cyberpunk",
  },
  {
    name: "Retro cave",
    theme: "Retro / Nostalgia",
    props: ["Triple monitors", "Anime posters"],
    text: "Press F",
    bodyType: "Hood up neutral",
    chaosLevel: "Lived-in",
    style: "A4 portrait concept art",
  },
];

// ─── Seeding Logic ────────────────────────────────────────────────────────────

async function seed() {
  console.log("Seeding concepts...");

  // Seed concepts and build a name→id map
  const nameToId = {};
  const batch = db.batch();

  for (const concept of concepts) {
    const ref = db.collection("concepts").doc();
    batch.set(ref, { ...concept, createdAt: now(), updatedAt: now() });
    nameToId[`${concept.type}:${concept.name}`] = ref.id;
  }

  await batch.commit();
  console.log(`Seeded ${concepts.length} concepts.`);

  // Seed killer combos as saved prompts
  console.log("Seeding killer combo prompts...");
  const promptBatch = db.batch();

  for (const combo of killerCombos) {
    const themeId = nameToId[`theme:${combo.theme}`];
    const propIds = combo.props.map((p) => nameToId[`prop:${p}`]).filter(Boolean);
    const textId = combo.text ? nameToId[`text:${combo.text}`] : null;
    const bodyTypeId = nameToId[`bodyType:${combo.bodyType}`];
    const chaosLevelId = nameToId[`chaosLevel:${combo.chaosLevel}`];
    const styleId = nameToId[`style:${combo.style}`];

    // Assemble prompt text from concept values
    const findValue = (type, name) => concepts.find((c) => c.type === type && c.name === name)?.value || "";
    const parts = [
      findValue("bodyType", combo.bodyType),
      findValue("theme", combo.theme),
      findValue("chaosLevel", combo.chaosLevel),
      combo.props.map((p) => findValue("prop", p)).join(", "),
      combo.text ? findValue("text", combo.text) : "",
      findValue("style", combo.style),
    ].filter(Boolean);

    const ref = db.collection("prompts").doc();
    promptBatch.set(ref, {
      name: combo.name,
      nanoPrompt: parts.join(", "),
      conceptRefs: {
        theme: themeId || null,
        props: propIds,
        text: textId,
        bodyType: bodyTypeId || null,
        chaosLevel: chaosLevelId || null,
        style: styleId || null,
      },
      formatParams: {
        aspectRatio: "2:3",
        orientation: "portrait",
        size: "A4",
      },
      model: "fal-ai/flux/dev",
      negativePrompt: "",
      generationCount: 0,
      bestImageId: null,
      status: "active",
      createdAt: now(),
      updatedAt: now(),
    });
  }

  await promptBatch.commit();
  console.log(`Seeded ${killerCombos.length} killer combo prompts.`);
  console.log("Done!");
}

seed().catch(console.error);
