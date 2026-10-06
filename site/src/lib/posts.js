// Blog posts. Newest first. `body` is light markdown:
//   ### subheading
//   **bold** within a paragraph
//   *italic* within a paragraph
//   - bullet list item
//   blank line = new paragraph
// See MarkdownLite.jsx for the renderer.

export const POSTS = [
  {
    slug: 'the-120-milestone',
    title: 'The 120+ Milestone — What It Means',
    date: '2026-05-28',
    dateLabel: 'May 28, 2026',
    excerpt:
      "120+ pieces of art we actually care about. We didn't get here by maximizing output — we got here by rejecting 90% of generations and only publishing what we believed in.",
    body: `We just hit 120+ live listings.

People ask: is that a lot?

By volume metrics, no. Some Etsy sellers have thousands.

But that's not what we were building for.

### What 120+ Means

120+ pieces of art we actually care about. 120+ images we looked at and thought: yes, this is worth someone's wall. This is worth their money. This is worth their time.

We didn't get here by maximizing output. We got here by:

- Running 1000+ generations per week
- Accepting about 10%
- Rejecting 90%
- Never publishing something that felt forced

120+ listings means we've made thousands of decisions about what's good enough and what isn't. It means we've learned what works. It means we have enough variety that there's something for everyone.

### Why the Pace Matters

One new piece per day is sustainable. It's achievable. It's not burning us out.

It also means each new piece teaches us something. We learn what colors work. Which collections resonate. Which moods people connect with. Each piece feeds the next.

### What's Next

We're not slowing down. But we're also not speeding up.

At this pace, we'll have 200+ pieces by the fall. By then we'll have enough data to know which collections to expand, which ideas to retire, which new directions to explore.

That's how you build something real. Not all at once. Steadily. With intention. Listening as you go.

### What This Has Been

Six months of:

- Asking what gaming feels like
- Making art about those feelings
- Publishing only what we believe in
- Listening to what works
- Expanding what works
- Refining what doesn't

It's not a business strategy. It's just the work of making something we care about.

And the fact that people want to buy it? That's the surprise. That's the gift.`,
  },
  {
    slug: 'listening-to-the-work',
    title: 'Listening to the Work',
    date: '2026-05-15',
    dateLabel: 'May 15, 2026',
    excerpt:
      "Sometimes you have an idea and you build it and it doesn't work the way you thought it would. Sometimes it works better. Three times the work surprised us — and what we did about it.",
    body: `Sometimes you have an idea and you build it and it doesn't work the way you thought it would.

Sometimes it works better.

### Hero Within Wasn't Supposed to Be the Biggest

We had 13 collections planned equally. We didn't expect Hero Within to become our strongest seller.

But when people see that image — the gamer on top, the hero reflection below, the transformation happening in between — something clicks. It speaks to something real. Something people don't have words for.

So we listened. We expanded it. More character variants. More colors. More sizes.

The work told us what it wanted to be.

### Like a Butterfly Found an Audience We Didn't Expect

We created this for girls who game. Transformation, beauty, wings, soft colors.

But then people started buying it for college dorm rooms. For offices. For people who wanted something that felt uplifting and hopeful, regardless of gender.

The art had a bigger conversation than we thought. So we listened.

### The Multitasker Went in a Completely Different Direction

We started with a funny concept: one gamer, many arms, doing everything at once.

Then we experimented with a Japanese ukiyo-e woodblock print style. And something profound happened. The many-armed gamer became a spiritual image. A Shiva-like figure. Meditation energy.

It became something more serious and more beautiful than we intended.

We listened to that shift. We kept exploring in that direction.

### Why Listening Matters

If we had stuck rigidly to our original plan ("13 collections, all equal importance, all equal size"), we would have missed what the work actually wanted to be.

Art surprises you. Collections tell you where they want to go. Audiences tell you what resonates.

Your job as a maker is to stay flexible enough to listen.

### The Practical Side

This is why we don't publish 500 pieces at once. We publish 1-2 per day. We watch how they perform. We listen to what works. We expand the strong collections. We let the weak ones rest.

This pace lets us evolve based on what we learn, not based on a preset plan.`,
  },
  {
    slug: 'the-technical-magic',
    title: 'The Technical Magic Behind the Scenes',
    date: '2026-05-03',
    dateLabel: 'May 3, 2026',
    excerpt:
      "How we make one new piece per day. The system doesn't make the art — it amplifies our taste. The hard part (deciding what's good) is still all human.",
    body: `People ask: how do you make one new piece per day?

The answer: we built a system.

But I want to be clear: the system doesn't make the art. It amplifies our taste. It lets us explore more ideas without getting bogged down in the repetitive parts.

### The Concept Library

We have about 150 building blocks: camera angles (centered behind, elevated, wide shot), themes (zen, chaos, cyberpunk, floaty), props (keyboard, headphones, energy cans, cat), body types (hood up, long hair, short hair), art styles (watercolor, anime, concept art, 3D), moods, colors.

When we want to explore a new idea, we pick concepts and combine them.

### The Prompt

Then we write a very precise prompt to an AI image generator. We've learned that specificity beats vagueness.

Instead of "draw a gamer," we say:

- "Person sitting on a stool, back of hands facing camera, left hand on keyboard, right hand on mouse"
- "No furniture except the stool. Pure white background"
- "Watercolor style with tight expressive brushstrokes"
- "Emphasize the mood, not the equipment"

A single word wrong and the entire image changes. We've spent months learning this language.

### Generation

The AI generates 4-8 variations based on that prompt. We look at them. We ask: does this feel right? Does it capture the mood? Is the composition clean? Is the color palette working?

### Curation

Here's the hard part: we reject most of them. We're ruthless. If an image is good but not excellent, we delete it and regenerate.

We'll run 50 generations to get 5 that are worth keeping.

### Upscaling

The good ones get upscaled 4x (from ~1000px to ~4000px) so they print beautifully at A3 size. This is the difference between a poster and wall art. The resolution matters.

### Listing

We write a title and description that describes what the image feels like. Not what it is (gaming wall art), but what you feel when you see it. The colors, the mood, the moment.

Then it goes live on Etsy.

### Why This Takes Time

People think AI means instant. It doesn't. The generation is fast. The curation is slow. The decision-making is slow. We're not trying to maximize output — we're trying to maintain quality.

One good piece per day is more valuable than five mediocre pieces per day.

### What Gets Automated

- Image generation (fal.ai handles this)
- Upscaling (SeedVR handles this)
- Listing title/description (Claude AI drafts based on our templates)
- Publishing to Etsy (Gelato handles print-on-demand)

### What Doesn't Get Automated

- Deciding whether the image is good
- Deciding if the mood is right
- Deciding if it belongs in this collection
- Deciding what color variants to create
- Deciding if it's worth publishing

Those are human decisions. That's where the taste lives.

### The Philosophy

We built this system because we wanted to explore more ideas without burning out on the repetitive parts. But the hard part — deciding what's good — that's still all us.

It's not magic. It's work. The system just lets us do more of it without getting tired.`,
  },
  {
    slug: 'color-choices',
    title: 'Color Choices — Why Orange Means Heroic',
    date: '2026-04-20',
    dateLabel: 'April 20, 2026',
    excerpt:
      "Every collection comes in different colors. The same image, completely different mood depending on the palette. That's not accidental — it's how we encode meaning.",
    body: `Every collection comes in different colors. The same image, completely different mood depending on the palette.

This is not accidental.

### Warm vs. Cool

Warm colors (oranges, reds, warm golds) feel active. Energetic. Alive. Heroic. When you see Hero Within in warm sunset orange, you feel power. Triumph. Becoming.

The same image in cool blue feels different. Still strong, still epic, but quieter. Cooler. More introspective. You're becoming something, but it's a private moment.

Same art. Completely different emotional experience. That's color psychology at work.

### The Patina Blue Moment

Etsy announced their 2026 color of the year: patina blue. A soft, vintage blue-green, like oxidized copper.

We created a Hero Within variant in patina blue and something clicked. It's now one of our strongest sellers. The color changed how people felt about the image. Not the image itself — the color.

This taught us: don't think of collections as one thing. Think of them as a palette. Each collection should exist in multiple colors, each one triggering a different feeling.

### Color as Narrative

In Cold as Ice, we use blues and whites and greys. The colors ARE the coldness.

In Spellbound, we use vibrant magentas, electric purples, bright yellows. The colors ARE the spell energy.

In Like a Butterfly, we use soft pastels — baby pink, pale yellow, gentle blues. The colors ARE the transformation and beauty.

You're not just seeing different art. You're experiencing different moods. The color carries meaning.

### The Technical Side

Color also affects how the image prints. A warm image feels deeper, richer when printed. A cool image feels more ethereal, more distant. The same resolution and upscaling, but the color changes the whole feeling.

We test every color variant before publishing. We want to make sure it feels right on the actual print, not just on the screen.

### What This Means

When you choose a piece, you're not just choosing the image. You're choosing a mood. That palette color is part of the art. It's not a variation. It's a complete choice.

That's why we put so much thought into color. It's not decoration. It's meaning.`,
  },
  {
    slug: 'why-back-view',
    title: 'Why Back-View',
    date: '2026-04-02',
    dateLabel: 'April 2, 2026',
    excerpt:
      "We could have shown gamers from the front. We chose the opposite. Back-view only, always. Because when you see a gamer from behind, you become that gamer.",
    body: `We could have shown gamers from the front. Face visible. Expression clear. That's what you usually see in gaming art — the gamer's face, their reaction, their intensity written on their features.

We chose the opposite. Back-view only. Always.

Why?

Because when you see a gamer from behind, looking at the screen, you become that gamer.

You're not watching someone play. You're the one playing. You're in their perspective. Your hands are on the keyboard. Your eyes are on the screen. You're the gamer, not observing one.

That matters. It's the difference between a portrait *of* a gamer and a portrait *as* a gamer.

### The Universality

By showing the back, we remove identity. You don't see gender unless we explicitly show it. You don't see age. You don't see what kind of gamer they are. You just see: person at desk, hands on keyboard, completely focused.

Every gamer sees themselves. Not because we made assumptions about who they are, but because we showed *any* gamer in a moment every gamer recognizes.

It's the same reason the "lo-fi study girl" became a global phenomenon. She's drawn from behind, in a specific pose, and everyone sees themselves in that image. Not because she's a particular person, but because she's everyone.

### The Composition

Centered. Stable. A desk in the middle of the frame. Everything radiates outward from that point.

This is architect thinking. Clean composition. Everything where it should be. The gamer is the focal point. The environment supports the gamer, doesn't compete with them.

This consistency — same camera angle, same desk position, always centered — means each collection still feels like part of the same universe. It's the same gamer in different moments. Different moods. Different places. But always that same fundamental perspective.

### What You See When You Stop Describing

Look at a Hero Within print. Don't think about what it is. Just look.

You see yourself. At your desk. Becoming something more. That's it. That's the whole thing. No explanation needed. No jargon required. Just: I recognize this. I've felt this. This is me.

That's why back-view. That's why always the same angle.

Because art that needs explanation isn't art. It's decoration.`,
  },
  {
    slug: 'the-collections',
    title: 'The Collections We\'ve Built — What Each One Means',
    date: '2026-03-01',
    dateLabel: 'March 1, 2026',
    excerpt:
      "Every collection starts with a feeling. A moment. Something you've experienced while gaming that's hard to put into words. A guided tour through nine collections — and what's still ahead.",
    body: `Every collection starts with a feeling. A moment. Something you've experienced while gaming that's hard to put into words.

### In the Clouds

Close your eyes and remember a moment where you felt weightless while gaming. Like the real world disappeared and you were floating. That's "In the Clouds."

The gamer is in the sky, surrounded by soft clouds. Watercolor style — gentle, dreamy, cozy. The keyboard is still there. The focus is still there. But gravity doesn't apply anymore. You've left the ground.

This collection is for people who recognize that feeling.

### The Hero Within

There's a moment in gaming where you stop being yourself and become someone else. You're a warrior. A wizard. A soldier. Your hands are still on the keyboard and mouse, but your *mind* is somewhere else entirely. You're more powerful there. More capable. More yourself, somehow.

"The Hero Within" shows that split. Top half: you at your desk. Bottom half: inverted reflection showing the character you become. Your keyboard transforms into a weapon. Your mouse becomes armor. The gaming moment is the moment of transformation.

It's not fantasy. It's real. It's the part of gaming that's hard to explain to people who don't game. The part where you become something.

### Like a Butterfly

Transformation, but gentler. Growth. Change.

The gamer has wings — in soft watercolors, pastels, beautiful colors. A butterfly moment. You're becoming something more beautiful than you were before. Not more powerful, not more heroic. Just more beautiful.

This collection came from watching someone play and realizing they're more alive, more vibrant, more *themselves* when they're gaming.

### Spellbound

When you're in a really intense moment in a game, your entire body tenses up. Your fingers move faster. You hold your breath. You're under a spell.

"Spellbound" is that moment frozen. Magical spheres radiating outward. Lightning. Energy. The moment when the game has complete control over you, and you wouldn't want it any other way.

The art style shifts here — concept art, cyberpunk edges, fantasy elements. Because magic doesn't follow the rules of the real world.

### Cold as Ice

Some games are survival. The cold sets in. Everything is harsh and sharp and dangerous. You're not floating in clouds. You're not becoming a hero. You're fighting to survive.

"Cold as Ice" is the dark side. The apocalypse. The frozen world. The gamer in a survival scenario, rendered in photorealistic 3D that makes it feel real and threatening.

It's the other side of gaming. Not every moment is peaceful or beautiful. Some are brutal. Some are desperate. This collection honors that.

### Tunnel Vision

Sometimes you're so focused on one thing that everything else disappears. Your peripheral vision blacks out. The world narrows to just the game, just this moment, just this move.

"Tunnel Vision" is that intensity visualized. A swirling vortex. Chaos closing in around the edges. Complete absorption. Nothing else matters.

### The Labyrinth

Ever feel lost in a game? Like you're wandering a maze and can't find the exit? Like maybe there's no exit at all?

"The Labyrinth" is that feeling made visual. Hedge mazes, concrete mazes, lava mazes. Different styles, same feeling: being surrounded, unsure which way is out, but knowing there has to be a way.

It's not a bad feeling. It's just the feeling of being lost. And maybe that's part of the fun.

### The Multitasker

Gaming isn't just gaming. It's eating pizza while gaming. It's checking your phone while gaming. It's petting the cat while gaming. It's doing five things at once because you're a person, not just a player.

"The Multitasker" is the chaos of actually being human who games. Arms doing different things. Each one focused on something different. We even did a Japanese woodblock print variant, because the energy is almost spiritual — like Shiva with a thousand arms, all of them busy.

### Beautiful Bubbles

You're in different locations but you feel close. Your friends are in their rooms, you're in yours, but you're together somehow. Each in your own bubble, but the bubbles touch. Some connected, some drifting apart.

It's about the weirdness and beauty of online gaming. You're physically alone but emotionally together. You can almost touch each other through the screen.

### What's Coming

There are feelings we haven't captured yet.

The 3 AM grind when nothing else matters. The neon cyberpunk future where gaming is everything. The retro nostalgia for the games you played as a kid and still remember perfectly. The pure joy of the moment when you know you've won. The moment when you finally solve the puzzle everyone's been stuck on for weeks.

Gaming is vast. Each collection is just one honest moment from that experience.

That's the work.`,
  },
  {
    slug: 'how-we-build-a-collection',
    title: 'How We Build a Collection — From Feeling to Image',
    date: '2026-02-03',
    dateLabel: 'February 3, 2026',
    excerpt:
      "Every collection begins as a question. A moment. Something you recognize from your own experience. Then we build a visual system, write very precise words, generate, curate, finish.",
    body: `Every collection begins as a question. A moment. Something you recognize from your own experience.

What's that feeling when you're so deep in a game that you forget to eat? What does it feel like when everything clicks and you play for six hours without realizing it? What's the moment when you realize you're not just controlling a character — you've *become* that character?

Once we have that feeling, we start building.

### The Process

**1. Finding the Feeling**

We start by asking ourselves: when have I felt this? Not as a designer or a builder, but as a person. As someone who's sat at a desk for eight hours straight without moving. As someone who felt invincible in a game and then walked into the real world expecting to be a warrior.

That's real. That's where the art comes from.

**2. The Visual System**

Once we know the mood, we design the visual language. What art style captures this? Watercolor for dreams and softness. Concept art for epic moments. Photorealistic 3D for things that feel dangerous and real. Anime for things that feel alive and human.

What props or environment tell this story without stealing focus from the gamer? If it's about floating in clouds, we don't need a detailed landscape. We need clouds. We need sky. Enough to set the mood, not enough to distract.

What color palette makes someone stop and look? Warm sunset oranges for heroic moments. Cool blues for peaceful ones. Jewel tones for richness and depth.

**3. The Words**

This is where it gets technical. We've learned that precise language matters enormously when you're describing something to an AI image generator.

Instead of "draw a gamer," we say:

- "Person sitting on a stool, back of hands facing camera, typing naturally"
- "No furniture except the stool — pure white background"
- "Emphasize the emotional moment, not the equipment"
- "Watercolor with tight expressive brushstrokes"

A single word difference can change everything. Say "gamer" and the model fills in stereotypes from its training data. Say "person sitting on a stool" and it actually listens to the rest of the prompt.

We've spent months learning this language. Each collection has a template now. The words are refined. They work.

**4. Making the Images**

We generate. We curate. We reject anything that doesn't feel right. We upscale so it prints beautifully.

This is the part people think is automatic. It's not. We might generate 50 variations to get 5 good ones. We kill the good ones if they're not excellent.

The work is in the curation, not the generation.

**5. Finishing It**

We write the title and description. But not for algorithms — for humans. We describe what the image feels like. We tell you why you'd want this on your wall. Not because it's gaming-themed, but because it's beautiful.

### Why This Matters

This process is the opposite of mass production. Each collection has intention. Each piece has a voice.

You can feel it. That's what separates art from decoration.`,
  },
  {
    slug: 'what-gaming-feels-like',
    title: 'What Gaming Actually Feels Like',
    date: '2026-01-15',
    dateLabel: 'January 15, 2026',
    excerpt:
      "If you've ever tried to explain gaming to someone who doesn't game, you know it's almost impossible. The Hoodie Gamer started with a single question: what does that feeling actually look like?",
    body: `If you've ever tried to explain gaming to someone who doesn't game, you know it's almost impossible.

"What are you doing?"

"Playing."

"Playing what?"

How do you describe that moment when the real world falls away? When you're not thinking about the room around you, or your to-do list, or anything except the next move? When you're completely somewhere else?

That's what The Hoodie Gamer started with. Not a business plan. Just: **what does gaming actually feel like, and how do you make art about that?**

We didn't want to make posters with game logos or characters. That's hanging someone else's story on your wall. We wanted to make something about *your* story. The gamer. The person at the desk. The moment when you're so focused nothing else exists.

So we started with the simplest image: **the back-view hoodie gamer at the desk.**

You're behind them. You're in their perspective. You're the one at the keyboard. It's not a portrait of a gamer — it's a portrait of the gaming moment itself. The concentration. The focus. The second before the next move.

From there, we asked: what does that moment *feel* like in different states of mind? When you're zen and peaceful, what's around you? When you're in complete chaos, what does that look like? When you're becoming something else — a hero, a wizard, a warrior — how do you visualize that transformation?

That's where the collections come from. Not from spreadsheets. From trying to make the invisible visible. Trying to show what gaming *is*, not what it looks like on screen.

Each collection is a different flavor of that moment. Each one is designed like it belongs in a gallery — somewhere you look at it and feel something. It just happens to also be gaming.`,
  },
]

export function getPost(slug) {
  return POSTS.find((p) => p.slug === slug) || null
}
