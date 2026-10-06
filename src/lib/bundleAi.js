import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `You are a listing copywriter for The Hoodie Gamer, a Copenhagen-based gaming wall art brand. You write Etsy listings for digital download bundles — collections of high-res illustrated gaming wall art prints that buyers can print at home or at a local print shop.

The primary customer is a gift-buyer: women 30-55 buying for gaming kids, partners, or friends. She wants art that looks beautiful on the wall. The brand positioning is architect-designed gaming art — beautiful enough for any room, authentic enough for any gamer.

Return ONLY valid JSON with these fields:
{
  title: string (max 140 chars, lead with collection name, include 'Digital Download' and 'Gaming Wall Art', under 15 words),
  description: string (200-250 words, 3 paragraphs: what the bundle contains, how to use/print, gift-buyer reassurance. Include 'digital download', 'print at home', 'gift for gamer' naturally),
  tags: array of exactly 13 strings (each max 20 chars, gift-buyer first, follow the Hoodie Gamer 13-tag framework)
}`

function getClient() {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Missing VITE_ANTHROPIC_API_KEY in .env')
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AI response did not contain JSON')
  return JSON.parse(match[0])
}

export async function generateBundleListing({ bundleName, collectionNames, imageCount, imageTitles }) {
  const client = getClient()
  const userMessage = `Bundle name: ${bundleName}
Collections included: ${collectionNames.join(', ')}
Number of images: ${imageCount}
Image listing titles: ${JSON.stringify(imageTitles)}`

  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock) throw new Error('AI returned no text')
  return extractJson(textBlock.text)
}
