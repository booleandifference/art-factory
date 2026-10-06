import { collection, addDoc, getDocs, writeBatch, doc, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'

const ts = () => serverTimestamp()

const concepts = [
  // ── Camera / Composition ──
  { type: "camera", name: "Centered behind", value: "camera centered directly behind the gamer, symmetrical composition, looking over shoulder at monitor, centered desk and chair", tier: 1, tags: ["centered", "symmetrical", "behind"], category: "", notes: "Default — the iconic back-view composition" },
  { type: "camera", name: "Centered low angle", value: "camera centered behind the gamer, low angle looking up, dramatic perspective, centered desk and monitors", tier: 1, tags: ["centered", "dramatic", "low"], category: "", notes: "More dramatic, hero shot feel" },
  { type: "camera", name: "Centered wide", value: "wide shot camera centered behind the gamer, full room visible, symmetrical composition, desk and monitors centered in frame", tier: 2, tags: ["wide", "room", "centered"], category: "", notes: "Shows more room context" },
  { type: "camera", name: "Slightly elevated", value: "camera centered slightly above and behind the gamer, birds eye angle, looking down at desk setup, centered symmetrical", tier: 2, tags: ["elevated", "overhead", "centered"], category: "", notes: "Good for showing desk chaos" },
  { type: "camera", name: "Close behind", value: "close-up camera centered behind the gamer's head and shoulders, monitors filling the background, centered composition", tier: 2, tags: ["close", "intimate", "centered"], category: "", notes: "Intimate, focused on the screen glow" },

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
  { type: "theme", name: "Cloud dream", value: "dreamy scene floating in soft fluffy clouds, desk and gaming chair made entirely of clouds, cloud furniture, monitor resting on cloud desk, ethereal sky, heavenly atmosphere, pastel sky colors, everything formed from clouds", tier: 1, tags: ["dreamy", "soft", "clouds", "feminine", "ethereal", "surreal"], category: "", notes: "Cloud furniture — desk/chair/setup all made of clouds, surreal dreamy vibe" },
  { type: "theme", name: "Bright room", value: "bright airy room, sunlit, white walls, natural light flooding in, clean and fresh", tier: 1, tags: ["bright", "clean", "light", "feminine", "fresh"], category: "", notes: "Light feminine aesthetic, opposite of dark gamer cave" },
  { type: "theme", name: "Rainbow", value: "rainbow color palette, colorful prismatic light, rainbow reflections, vibrant spectrum colors throughout", tier: 1, tags: ["colorful", "rainbow", "pride", "feminine", "vibrant"], category: "", notes: "Broad appeal — pride, positivity, color lovers" },
  { type: "prop", name: "Monitor wall", value: "room entirely covered in monitors and screens, wall of screens glowing, overwhelming amount of displays", tier: 2, tags: ["tech", "overwhelming", "screens", "epic"], category: "room", notes: "Epic tech overload aesthetic" },
  { type: "theme", name: "Mirror room", value: "infinite mirror room, reflections everywhere, kaleidoscopic mirrors surrounding the gamer, trippy reflections", tier: 2, tags: ["trippy", "infinite", "reflections", "surreal"], category: "", notes: "Surreal art piece — unique wall art" },
  { type: "theme", name: "Fantasy RPG", value: "fantasy concept art, epic painterly", tier: 3, tags: ["swords", "magic", "medieval"], category: "", notes: "" },
  { type: "theme", name: "Horror", value: "dark horror illustration, ominous", tier: 3, tags: ["creepy", "fog", "red"], category: "", notes: "" },
  { type: "theme", name: "In This Life or the Next", value: "undead skeleton gamer, bony skeleton hands on keyboard and mouse, skull wearing gaming headphones, dark afterlife atmosphere, eternal devotion to gaming beyond death, macabre yet devoted", tier: 1, tags: ["skeleton", "undead", "dark", "devotion", "macabre", "horror", "metal"], category: "", notes: "Skeleton gamer — pairs with Horror, Metal/Dark and Ink/Line art style" },
  { type: "theme", name: "Till the Sun Comes Up", value: "early morning golden sunlight beams streaming through window blinds, warm sun rays cutting through dusty hazy atmosphere, dust particles floating in light beams, all-night gaming session ending at sunrise, dawn light contrasting with monitor glow", tier: 1, tags: ["sunrise", "morning", "golden hour", "dust", "blinds", "atmospheric", "relatable"], category: "", notes: "Relatable all-nighter — beautiful golden hour lighting through blinds" },

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
  { type: "prop", name: "Desktop speakers", value: "desktop speakers on either side of monitor, bookshelf speakers", tier: 2, tags: ["audio", "clean"], category: "gear", notes: "Alternative to headphones" },
  { type: "prop", name: "RGB speakers", value: "RGB gaming speakers glowing on desk", tier: 2, tags: ["audio", "glow", "gamer"], category: "gear", notes: "Gamer aesthetic speakers" },

  // ── Props: room ──
  { type: "prop", name: "Dark room", value: "screen-lit dark room lit only by screen light", tier: 1, tags: ["moody", "atmospheric"], category: "room", notes: "" },
  { type: "prop", name: "Anime posters", value: "anime posters on wall behind", tier: 1, tags: ["otaku", "colorful"], category: "room", notes: "" },
  { type: "prop", name: "Figurines on shelf", value: "collectible figurines on shelf", tier: 2, tags: ["collector", "detail"], category: "room", notes: "" },
  { type: "prop", name: "Cat on desk", value: "cat sitting on desk or lap", tier: 2, tags: ["cozy", "cute", "viral"], category: "room", notes: "" },
  { type: "prop", name: "Rain on window", value: "rain streaks on window behind", tier: 2, tags: ["moody", "lo-fi"], category: "room", notes: "" },
  { type: "prop", name: "Clock showing 3 AM", value: "clock on wall showing 3 AM", tier: 2, tags: ["late night", "detail"], category: "room", notes: "" },

  // ── Props: body ──
  { type: "prop", name: "Hoodie", value: "wearing hoodie", tier: 1, tags: ["universal", "cozy"], category: "body", notes: "" },
  { type: "prop", name: "Hoodie up", value: "wearing hoodie with hood pulled over head", tier: 1, tags: ["anonymous", "cozy", "mysterious"], category: "body", notes: "More atmospheric, hides identity" },
  { type: "prop", name: "Blanket", value: "wrapped in blanket", tier: 2, tags: ["cozy", "winter"], category: "body", notes: "" },
  { type: "prop", name: "Blanket over head", value: "wrapped in blanket draped over head like a cocoon", tier: 2, tags: ["cozy", "extreme", "funny"], category: "body", notes: "Ultimate cozy gamer mode" },
  { type: "prop", name: "Gamer headphones", value: "wearing large over-ear gaming headphones with RGB lighting", tier: 1, tags: ["iconic", "gamer", "gear"], category: "body", notes: "Classic gamer look" },
  { type: "prop", name: "In-ear buds", value: "wearing small in-ear earbuds", tier: 2, tags: ["minimal", "subtle"], category: "body", notes: "Cleaner silhouette" },
  { type: "prop", name: "No headphones", value: "no headphones, speakers on desk instead", tier: 2, tags: ["clean", "minimal"], category: "body", notes: "Shows more of the head/hair" },
  { type: "prop", name: "Buried in cables", value: "buried in tangled cables and wires with just head sticking out, drowning in cable spaghetti", tier: 2, tags: ["messy", "funny", "meme", "chaos"], category: "body", notes: "Meme-level cable chaos" },

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

  // ── Camera - Mockup (room/wall focused) ──
  { type: "cameraMockup", name: "Straight on wall", value: "camera straight on facing the wall, eye level, centered on the framed print, symmetrical composition", tier: 1, tags: ["centered", "straight", "wall"], category: "", notes: "Classic product photo angle — straight at the art" },
  { type: "cameraMockup", name: "Slight angle", value: "camera at slight angle to the wall, showing room depth, framed print prominent, natural perspective", tier: 1, tags: ["angle", "depth", "natural"], category: "", notes: "More dynamic, shows room context" },
  { type: "cameraMockup", name: "Wide room shot", value: "wide angle room shot, wall with framed print visible, showing full room context, interior photography", tier: 1, tags: ["wide", "room", "context"], category: "", notes: "Shows the art in full room context" },
  { type: "cameraMockup", name: "Close-up on art", value: "close-up shot of framed print on wall, showing frame detail and texture, shallow depth of field", tier: 2, tags: ["close", "detail", "shallow DOF"], category: "", notes: "Detail shot showing print quality" },
  { type: "cameraMockup", name: "Low angle looking up", value: "low angle camera looking up at framed print on wall, dramatic perspective, art feels imposing and important", tier: 2, tags: ["low", "dramatic", "imposing"], category: "", notes: "Makes the art feel grand" },
  { type: "cameraMockup", name: "Corner view", value: "camera from room corner, two walls visible, framed print on main wall, showing room layout and furniture", tier: 2, tags: ["corner", "two walls", "layout"], category: "", notes: "Shows room layout naturally" },
  { type: "cameraMockup", name: "Over shoulder", value: "over the shoulder of person looking at framed print on wall, showing scale of art relative to human, lifestyle shot", tier: 2, tags: ["lifestyle", "scale", "human"], category: "", notes: "Lifestyle shot with human scale reference" },

  // ── Mockup: Room ──
  { type: "mockupRoom", name: "Gaming den dark", value: "photorealistic gaming room, dark walls, RGB LED lighting, gaming desk below the framed poster, headphones on desk, energy cans, moody atmosphere", tier: 1, tags: ["dark", "gaming", "RGB"], category: "", notes: "Classic dark gamer room" },
  { type: "mockupRoom", name: "Gaming den bright", value: "photorealistic bright gaming room, clean white desk, daylight, modern gaming setup below the framed poster, minimal and tidy", tier: 1, tags: ["bright", "clean", "modern"], category: "", notes: "Clean modern setup" },
  { type: "mockupRoom", name: "Brick wall loft", value: "photorealistic exposed brick wall, industrial loft apartment, warm Edison bulb lighting, framed poster on brick wall, wooden floor", tier: 1, tags: ["industrial", "warm", "brick"], category: "", notes: "Industrial loft vibe" },
  { type: "mockupRoom", name: "White minimal wall", value: "photorealistic clean white wall, minimalist Scandinavian interior, light wood furniture, bright natural light, framed poster centered on wall", tier: 1, tags: ["minimal", "scandi", "clean"], category: "", notes: "Scandinavian minimal" },
  { type: "mockupRoom", name: "Concrete wall", value: "photorealistic raw concrete wall, modern industrial interior, minimal furniture, spot light on framed poster, urban apartment", tier: 2, tags: ["concrete", "industrial", "urban"], category: "", notes: "Raw urban look" },
  { type: "mockupRoom", name: "Dark moody wall", value: "photorealistic dark charcoal painted wall, dramatic spot lighting on framed poster, cozy dark interior, warm accent lighting", tier: 2, tags: ["dark", "dramatic", "moody"], category: "", notes: "Dramatic spotlight on art" },
  { type: "mockupRoom", name: "Teen bedroom", value: "photorealistic teenager bedroom, LED strip lights, posters on wall, messy bed visible, framed poster above desk, lived-in feel", tier: 1, tags: ["teen", "lived-in", "LED"], category: "", notes: "Relatable teen room" },
  { type: "mockupRoom", name: "Dorm room", value: "photorealistic college dorm room, small desk, fairy lights, books stacked, framed poster above bed, compact cozy space", tier: 2, tags: ["college", "cozy", "compact"], category: "", notes: "College dorm" },
  { type: "mockupRoom", name: "Man cave", value: "photorealistic man cave basement, dark walls, neon beer signs, leather couch visible, framed poster prominently displayed", tier: 2, tags: ["basement", "man cave", "neon"], category: "", notes: "Classic man cave" },
  { type: "mockupRoom", name: "Streaming setup", value: "photorealistic streamer room, ring light, microphone, dual monitors, acoustic foam on walls, framed poster visible behind setup", tier: 2, tags: ["streamer", "tech", "pro"], category: "", notes: "Streamer/content creator room" },
  { type: "mockupRoom", name: "Gallery wall", value: "photorealistic gallery wall arrangement, multiple framed prints together, clean white wall, museum-style lighting, curated art display", tier: 1, tags: ["gallery", "curated", "museum"], category: "", notes: "Gallery wall arrangement" },
  { type: "mockupRoom", name: "Above sofa", value: "photorealistic living room, framed poster centered above modern sofa, neutral tones, coffee table with books, warm ambient light", tier: 1, tags: ["living room", "sofa", "neutral"], category: "", notes: "Living room above sofa" },

  // ── Mockup: Frame ──
  { type: "mockupFrame", name: "Thin black frame", value: "thin black modern frame, white mat border", tier: 1, tags: ["black", "modern", "thin"], category: "", notes: "Classic modern frame" },
  { type: "mockupFrame", name: "Thick black frame", value: "thick chunky black frame, no mat", tier: 1, tags: ["black", "chunky", "bold"], category: "", notes: "Bold statement frame" },
  { type: "mockupFrame", name: "Natural wood frame", value: "light natural oak wood frame, white mat border", tier: 1, tags: ["wood", "oak", "natural"], category: "", notes: "Warm natural look" },
  { type: "mockupFrame", name: "Dark wood frame", value: "dark walnut wood frame, thin profile", tier: 2, tags: ["wood", "walnut", "dark"], category: "", notes: "Premium dark wood" },
  { type: "mockupFrame", name: "White frame", value: "clean white frame, white mat border", tier: 1, tags: ["white", "clean", "minimal"], category: "", notes: "Clean minimal frame" },
  { type: "mockupFrame", name: "Floating frame", value: "frameless floating mount, small gap between art and wall", tier: 2, tags: ["frameless", "floating", "modern"], category: "", notes: "Modern floating mount" },
  { type: "mockupFrame", name: "No frame", value: "unframed poster, hung with clips or tape, casual raw look", tier: 2, tags: ["unframed", "casual", "raw"], category: "", notes: "Casual poster look" },

  // ── Mockup: Size Display ──
  { type: "mockupSize", name: "A4 small", value: "small A4 sized print on wall, showing scale against furniture", tier: 1, tags: ["A4", "small"], category: "", notes: "Shows A4 scale" },
  { type: "mockupSize", name: "A3 medium", value: "medium A3 sized print on wall, prominent but not dominating", tier: 1, tags: ["A3", "medium"], category: "", notes: "Shows A3 scale" },
  { type: "mockupSize", name: "Large statement", value: "large oversized print dominating the wall, statement piece", tier: 1, tags: ["large", "statement"], category: "", notes: "Large statement piece" },
  { type: "mockupSize", name: "Set of 3", value: "three matching prints in a row, gallery triptych, evenly spaced", tier: 2, tags: ["triptych", "set", "gallery"], category: "", notes: "Triptych arrangement" },
  { type: "mockupSize", name: "Set of 2 stacked", value: "two prints stacked vertically, matching frames", tier: 2, tags: ["diptych", "stacked", "vertical"], category: "", notes: "Stacked pair" },

  // ── Mockup: Lighting ──
  { type: "mockupLighting", name: "Warm golden hour", value: "warm golden hour light, soft shadows, cozy atmosphere", tier: 1, tags: ["warm", "golden", "cozy"], category: "", notes: "Warm golden light" },
  { type: "mockupLighting", name: "Cool daylight", value: "cool natural daylight, clean bright even lighting", tier: 1, tags: ["cool", "bright", "clean"], category: "", notes: "Clean daylight" },
  { type: "mockupLighting", name: "Dramatic spot", value: "dramatic spotlight on the framed print, darker surroundings", tier: 2, tags: ["dramatic", "spotlight", "dark"], category: "", notes: "Museum-style spotlight" },
  { type: "mockupLighting", name: "RGB ambient", value: "purple and cyan RGB ambient glow, gaming atmosphere lighting", tier: 1, tags: ["RGB", "gaming", "neon"], category: "", notes: "Gaming RGB atmosphere" },
  { type: "mockupLighting", name: "Moody evening", value: "dim evening light, warm lamp glow, intimate atmosphere", tier: 2, tags: ["evening", "warm", "intimate"], category: "", notes: "Cozy evening vibe" },

  // ── Etsy Tags (metadata only, not for image generation) ──
  { type: "etsyTags", name: "Core gaming", value: "gaming wall art, gamer room decor, video game poster, gaming poster, digital download print", tier: 1, tags: [], category: "tags", notes: "Universal gamer tags" },
  { type: "etsyTags", name: "Cyberpunk set", value: "cyberpunk gamer art, neon gaming poster, sci fi wall art, dark gaming decor, futuristic illustration", tier: 1, tags: [], category: "tags", notes: "Cyberpunk niche" },
  { type: "etsyTags", name: "Anime set", value: "anime gamer wall art, kawaii gaming poster, Japanese style game art, anime room decor, cute gaming print", tier: 1, tags: [], category: "tags", notes: "Anime niche" },
  { type: "etsyTags", name: "Horror / dark set", value: "dark gaming wall art, horror gamer poster, skeleton gamer art, gothic gaming decor, macabre illustration", tier: 2, tags: [], category: "tags", notes: "Horror/dark niche" },
  { type: "etsyTags", name: "Cozy / lo-fi set", value: "cozy gamer wall art, lo-fi gaming poster, chill gaming decor, warm gaming illustration, relaxing game art", tier: 1, tags: [], category: "tags", notes: "Cozy/lo-fi niche" },
  { type: "etsyTags", name: "Retro set", value: "retro gaming wall art, pixel art poster, 8-bit game print, nostalgic gaming decor, vintage gamer art", tier: 2, tags: [], category: "tags", notes: "Retro niche" },
  { type: "etsyTags", name: "Gift tags", value: "gift for gamer, gamer boyfriend gift, gift for gamer girl, birthday gift for gamer, teen boy gift", tier: 1, tags: [], category: "tags", notes: "Gift-related search terms" },
  { type: "etsyTags", name: "Room tags", value: "game room decor, man cave wall art, dorm room poster, teen bedroom art, streamer room decor", tier: 1, tags: [], category: "tags", notes: "Room decor search terms" },
  { type: "etsyTags", name: "Mirror / trippy set", value: "trippy wall art, mirror room poster, infinity art print, surreal gaming decor, psychedelic gamer art", tier: 2, tags: [], category: "tags", notes: "Surreal/trippy niche" },

  // ── Art styles (pure rendering style, independent of theme) ──
  { type: "style", name: "Digital painting", value: "digital painting, rich colors, detailed brushwork", tier: 1, tags: ["painterly", "detailed"], category: "painting", notes: "Versatile default style" },
  { type: "style", name: "Anime / Manga", value: "anime style, cel-shaded, clean lines, vibrant colors", tier: 1, tags: ["japanese", "clean", "colorful"], category: "illustration", notes: "Classic anime rendering" },
  { type: "style", name: "Concept art", value: "concept art, painterly, cinematic lighting, atmospheric", tier: 1, tags: ["painterly", "cinematic"], category: "painting", notes: "Professional game/film art look" },
  { type: "style", name: "Ink illustration", value: "ink illustration, detailed linework, crosshatching, monochrome with accent color", tier: 1, tags: ["monochrome", "detailed", "linework"], category: "illustration", notes: "Striking wall art potential" },
  { type: "style", name: "Pixel art", value: "pixel art, 8-bit style, retro pixel rendering, chunky pixels visible", tier: 1, tags: ["retro", "nostalgic", "blocky"], category: "digital", notes: "Strong nostalgia appeal" },
  { type: "style", name: "Watercolor", value: "watercolor painting, soft washes, bleeding edges, paper texture visible", tier: 2, tags: ["soft", "organic", "textured"], category: "painting", notes: "Softer, more artistic feel" },
  { type: "style", name: "Oil painting", value: "oil painting style, thick impasto brushstrokes, rich texture, classical", tier: 2, tags: ["classical", "textured", "rich"], category: "painting", notes: "Premium wall art feel" },
  { type: "style", name: "Line art", value: "clean line art, minimal coloring, bold outlines, graphic novel style", tier: 2, tags: ["minimal", "bold", "graphic"], category: "illustration", notes: "Clean modern look" },
  { type: "style", name: "Realistic / Photorealistic", value: "photorealistic digital art, hyperdetailed, realistic lighting and materials", tier: 2, tags: ["realistic", "detailed", "hyperreal"], category: "digital", notes: "Use sparingly — illustrated styles sell better" },
  { type: "style", name: "Flat vector", value: "flat vector illustration, bold shapes, limited color palette, clean geometric", tier: 2, tags: ["clean", "modern", "minimal"], category: "illustration", notes: "Modern poster/print style" },
  { type: "style", name: "Graffiti / Street art", value: "graffiti art style, spray paint texture, drips, bold tags, urban wall texture", tier: 2, tags: ["urban", "bold", "textured"], category: "illustration", notes: "Edgy wall art" },
  { type: "style", name: "Woodblock print", value: "japanese woodblock print style, ukiyo-e inspired, flat areas of color, bold outlines", tier: 3, tags: ["japanese", "traditional", "flat"], category: "illustration", notes: "Unique crossover with anime themes" },
  { type: "style", name: "Charcoal sketch", value: "charcoal sketch, rough textured strokes, dramatic contrast, raw and gritty", tier: 3, tags: ["raw", "dark", "textured"], category: "drawing", notes: "Pairs well with dark/metal themes" },
  { type: "style", name: "Neon glow", value: "neon glow art style, glowing outlines, dark background, vivid neon colors, light bloom effects", tier: 1, tags: ["neon", "glow", "dark", "vibrant"], category: "digital", notes: "Perfect for cyberpunk/gaming vibe" },
  { type: "style", name: "Risograph", value: "risograph print style, limited ink colors, halftone dots, slight misregistration, grainy texture", tier: 3, tags: ["retro", "print", "grainy"], category: "print", notes: "Trendy indie art look" },
]

const killerCombos = [
  {
    name: "The 3 AM grind",
    theme: "Lo-fi / Chill",
    props: ["Energy can", "Rain on window", "Cat on desk", "Clock showing 3 AM"],
    text: "One more game",
    bodyType: "Hood up neutral",
    chaosLevel: "Lived-in",
    style: "Anime / Manga",
  },
  {
    name: "Noodle & chill",
    theme: "Anime",
    props: ["Instant noodles", "Anime posters", "Figurines on shelf"],
    text: null,
    bodyType: "Hood up neutral",
    chaosLevel: "Lived-in",
    style: "Anime / Manga",
  },
  {
    name: "Can graveyard",
    theme: "Cyberpunk",
    props: ["Energy can", "LED strips", "Cable spaghetti"],
    text: "GG",
    bodyType: "Hood up neutral",
    chaosLevel: "Absurd",
    style: "Neon glow",
  },
  {
    name: "Girl gamer sanctuary",
    theme: "Anime",
    props: ["RGB keyboard", "Figurines on shelf"],
    text: null,
    bodyType: "Girl ponytail dark",
    chaosLevel: "Minimal",
    style: "Anime / Manga",
  },
  {
    name: "Pizza throne",
    theme: "Cyberpunk",
    props: ["Pizza boxes", "RGB keyboard"],
    text: "GG EZ",
    bodyType: "Hood up neutral",
    chaosLevel: "Chaotic",
    style: "Digital painting",
  },
  {
    name: "Cozy den",
    theme: "Lo-fi / Chill",
    props: ["Blanket", "Cat on desk", "Coffee mugs", "Rain on window"],
    text: null,
    bodyType: "Hood up neutral",
    chaosLevel: "Lived-in",
    style: "Watercolor",
  },
  {
    name: "Mosh pit setup",
    theme: "Metal / Dark",
    props: ["Dark room", "Anime posters"],
    text: null,
    bodyType: "Hood up neutral",
    chaosLevel: "Chaotic",
    style: "Charcoal sketch",
  },
  {
    name: "Streamer life",
    theme: "Cyberpunk",
    props: ["Streaming mic", "LED strips", "RGB keyboard"],
    text: "Level up",
    bodyType: "Hood up neutral",
    chaosLevel: "Lived-in",
    style: "Neon glow",
  },
  {
    name: "Retro cave",
    theme: "Retro / Nostalgia",
    props: ["Triple monitors", "Anime posters"],
    text: "Press F",
    bodyType: "Hood up neutral",
    chaosLevel: "Lived-in",
    style: "Pixel art",
  },
]

/**
 * Seed all concepts and killer combo prompts into Firestore.
 * Uses the client-side SDK (runs in the browser while authenticated).
 */
export async function seedDatabase() {
  // Check if already seeded
  const existing = await getDocs(collection(db, 'concepts'))
  if (existing.size > 0) {
    throw new Error(`Firestore already has ${existing.size} concepts. Clear the collection first to re-seed.`)
  }

  // Seed concepts using batched writes (max 500 per batch)
  const nameToId = {}
  let batch = writeBatch(db)
  let count = 0

  for (const concept of concepts) {
    const ref = doc(collection(db, 'concepts'))
    batch.set(ref, { ...concept, createdAt: ts(), updatedAt: ts() })
    nameToId[`${concept.type}:${concept.name}`] = ref.id
    count++

    if (count % 400 === 0) {
      await batch.commit()
      batch = writeBatch(db)
    }
  }
  await batch.commit()

  // Seed killer combos as saved prompts
  const promptBatch = writeBatch(db)

  for (const combo of killerCombos) {
    const themeId = nameToId[`theme:${combo.theme}`]
    const propIds = combo.props.map((p) => nameToId[`prop:${p}`]).filter(Boolean)
    const textId = combo.text ? nameToId[`text:${combo.text}`] : null
    const bodyTypeId = nameToId[`bodyType:${combo.bodyType}`]
    const chaosLevelId = nameToId[`chaosLevel:${combo.chaosLevel}`]
    const styleId = nameToId[`style:${combo.style}`]

    // Assemble prompt text
    const findValue = (type, name) => concepts.find((c) => c.type === type && c.name === name)?.value || ''
    const parts = [
      findValue('bodyType', combo.bodyType),
      findValue('theme', combo.theme),
      findValue('chaosLevel', combo.chaosLevel),
      combo.props.map((p) => findValue('prop', p)).join(', '),
      combo.text ? findValue('text', combo.text) : '',
      findValue('style', combo.style),
    ].filter(Boolean)

    const ref = doc(collection(db, 'prompts'))
    promptBatch.set(ref, {
      name: combo.name,
      nanoPrompt: parts.join(', '),
      conceptRefs: {
        theme: themeId || null,
        props: propIds,
        text: textId,
        bodyType: bodyTypeId || null,
        chaosLevel: chaosLevelId || null,
        style: styleId || null,
      },
      formatParams: { aspectRatio: '2:3', orientation: 'portrait', size: 'A4' },
      model: 'fal-ai/nano-banana-2',
      negativePrompt: '',
      generationCount: 0,
      bestImageId: null,
      status: 'active',
      createdAt: ts(),
      updatedAt: ts(),
    })
  }

  await promptBatch.commit()

  return { concepts: concepts.length, prompts: killerCombos.length }
}

/**
 * Add only missing concepts (ones that don't exist yet by type+name).
 * Safe to run on an already-seeded database.
 */
export async function seedMissingConcepts() {
  const existing = await getDocs(collection(db, 'concepts'))
  const existingKeys = new Set()
  existing.forEach((d) => {
    const data = d.data()
    existingKeys.add(`${data.type}:${data.name}`)
  })

  let added = 0
  const batch = writeBatch(db)

  for (const concept of concepts) {
    const key = `${concept.type}:${concept.name}`
    if (!existingKeys.has(key)) {
      const ref = doc(collection(db, 'concepts'))
      batch.set(ref, { ...concept, createdAt: ts(), updatedAt: ts() })
      added++
    }
  }

  if (added > 0) await batch.commit()
  return { added, skipped: concepts.length - added }
}

/**
 * Backfill category field on all images that don't have one.
 * Images without category get "art". Images from mockup prompts get "mockup".
 */
export async function backfillImageCategories() {
  const imagesSnap = await getDocs(collection(db, 'images'))
  let updated = 0
  let batch = writeBatch(db)

  for (const imgDoc of imagesSnap.docs) {
    const data = imgDoc.data()
    if (!data.category) {
      // Check if linked prompt is a mockup
      let category = 'art'
      if (data.promptId) {
        try {
          const promptSnap = await getDocs(collection(db, 'prompts'))
          const prompt = promptSnap.docs.find(d => d.id === data.promptId)
          if (prompt?.data()?.category === 'mockup') {
            category = 'mockup'
          }
        } catch (e) {
          // fallback to art
        }
      }
      batch.update(doc(db, 'images', imgDoc.id), { category })
      updated++

      if (updated % 400 === 0) {
        await batch.commit()
        batch = writeBatch(db)
      }
    }
  }

  if (updated > 0) await batch.commit()
  return { updated, total: imagesSnap.size }
}
