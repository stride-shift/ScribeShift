// ScribeShift — All skill prompts + brand injection
// Text skills: blog, video, newsletter
// Social skills: linkedin, twitter, facebook, instagram
// Image styles: minimal, vibrant, editorial, artistic, retro, modern, futuristic, cinematic

// ── Brand Injection Helper ──────────────────────────────────────────
export function injectBrand(promptTemplate, brandData = {}) {
  return promptTemplate
    .replace(/\{\{BRAND_NAME\}\}/g, brandData.brandName || '')
    .replace(/\{\{PRIMARY_COLOR\}\}/g, brandData.primaryColor || '#FBBF24')
    .replace(/\{\{SECONDARY_COLOR\}\}/g, brandData.secondaryColor || '#818cf8')
    .replace(/\{\{BRAND_IDENTITY\}\}/g,
      brandData.brandName
        ? `This content is for ${brandData.brandName}. Reflect the brand voice and values where appropriate.`
        : ''
    )
    .replace(/\{\{TOPIC_SUMMARY\}\}/g, brandData.topicSummary || 'professional content');
}

// ── Tone Modifiers ──────────────────────────────────────────────────
// These get injected into prompts based on user selections to shape
// the voice, polish level, and content goal.

export const TONE_DIRECTIVES = {
  conversational: `Write like a sharp friend explaining something over coffee. Use contractions, rhetorical questions, and the occasional sentence fragment. Let thoughts breathe — not every idea needs a perfect landing. Sound like a person, not a content machine.`,
  professional: `Write with authority and substance but not stiffness. Avoid corporate jargon and buzzword soup. Be direct. Say what you mean. A senior leader should read this and think "this person gets it" — not "this was written by committee."`,
  friendly: `Warm and approachable, like a colleague you trust. Use natural language, relatable examples, and a touch of humor where it fits. Don't try too hard to be likeable — just be genuine.`,
  provocative: `Take a stance. Challenge assumptions. Open with something that makes people stop scrolling. Be intellectually honest, not contrarian for clicks — but don't hedge or qualify everything into mush. Have a point of view and own it.`,
  challenging: `Push readers to reconsider what they think they know. Ask uncomfortable questions. Point out elephants in the room. The tone is respectful but unflinching — like a mentor who tells you what you need to hear, not what you want to hear.`,
};

export const POLISH_DIRECTIVES = {
  raw: `Write with rough edges. Leave in some imperfection — a thought that trails off, a sentence that doesn't quite land perfectly, a transition that's abrupt rather than smooth. Real people don't write in perfectly polished paragraphs. This should feel like a smart person's first draft that was good enough to publish, not a committee-reviewed final version. NO neat wrap-ups. NO "and that's why..." conclusions. NO tidy lessons at the end.`,
  natural: `Write naturally. Not sloppy, but not over-produced. Some sentences can be short. Some can run on a bit. Not every paragraph needs a perfect transition. Skip the Hallmark card endings — if the piece ends mid-thought or with a question hanging in the air, that's fine. Aim for the voice of someone who writes well but doesn't overthink it.`,
  balanced: `Well-structured and clear, but not sterile. Good rhythm and flow without feeling machine-generated. Include the occasional rough edge or unexpected turn of phrase to keep it human. Avoid wrapping everything up too neatly — leave some threads for the reader to pull on.`,
  polished: `Clean, well-edited, publication-ready. Strong structure, smooth transitions, precise language. But even here: avoid clichés, avoid motivational-poster conclusions, avoid the temptation to end with a neat bow. The writing should feel crafted by a skilled human, not optimized by an algorithm.`,
};

export const GOAL_DIRECTIVES = {
  engagement: `Optimize for conversation and comments. Ask questions that people actually want to answer from their own experience. Create mild tension or present a dilemma. The goal is to make someone think "I have something to say about this" — not "that was nice."`,
  lead_generation: `Include a clear but non-pushy call to action. Demonstrate expertise through specificity — concrete numbers, real scenarios, insider knowledge. The reader should finish thinking "I want to know more about how they do this." Don't beg for attention. Earn it.`,
  authority: `Establish deep credibility through substance, not self-promotion. Share frameworks, cite specifics, reveal how things actually work behind the scenes. Write like someone who has done the thing, not someone who read about it. No humble-bragging.`,
  awareness: `Make the brand/topic memorable through a strong point of view or unexpected angle. Don't just inform — make people remember and share. One vivid insight beats five generic ones.`,
  signups: `Drive action without being salesy. Lead with the problem, demonstrate understanding, then present the solution as a natural next step. The CTA should feel like a favor to the reader, not a pitch.`,
};

export const VOICE_REFERENCE_PROMPT = `
## VOICE REFERENCE — Match This Style
Below are real examples of how this company/person actually communicates. Study the rhythm, vocabulary, sentence structure, level of formality, humor style, and personality. Your output should sound like it was written by the same person or team — not a generic AI approximation of their voice.

Key things to absorb:
- How long are their sentences? Do they use fragments?
- Do they use humor? What kind?
- How formal or informal is the language?
- Do they use industry jargon or plain language?
- What's their energy level? Measured and thoughtful, or fast and punchy?
- Do they use analogies or metaphors? What kind?

VOICE SAMPLES:
{{VOICE_SAMPLES}}

Now write in THIS voice — not a sanitized version of it.
`;

// Assemble an ICP / brand guidelines / writing samples block from brand fields.
// Returns '' when no voice data is supplied so it can be appended unconditionally.
export function buildVoiceContext(brandData = {}) {
  const blocks = [];

  if (brandData.icpDescription && brandData.icpDescription.trim()) {
    blocks.push(
      `## IDEAL CUSTOMER PROFILE\nWrite for this audience. Every sentence should resonate with them:\n${brandData.icpDescription.trim()}`
    );
  }

  if (brandData.brandGuidelines && brandData.brandGuidelines.trim()) {
    blocks.push(
      `## BRAND GUIDELINES\nThe brand's stated values, positioning, and rules. Respect them:\n${brandData.brandGuidelines.trim()}`
    );
  }

  const samples = Array.isArray(brandData.writingSamples)
    ? brandData.writingSamples.map(s => (typeof s === 'string' ? s.trim() : '')).filter(Boolean)
    : [];
  if (samples.length > 0) {
    const formatted = samples.map((s, i) => `--- Sample ${i + 1} ---\n${s}`).join('\n\n');
    blocks.push(VOICE_REFERENCE_PROMPT.replace('{{VOICE_SAMPLES}}', formatted));
  }

  return blocks.length > 0 ? '\n\n' + blocks.join('\n\n') : '';
}

// ── TEXT SKILLS ─────────────────────────────────────────────────────

export const SKILL_TRANSCRIPT_TO_BLOG = `# Source to Blog Post

Turn the source content into a blog post that reads like a real person with a perspective wrote it — someone with opinions, texture, and a voice that doesn't sound like every other AI-generated post on the internet. Match the brand voice provided.

{{BRAND_IDENTITY}}

## CRITICAL: Source-faithful, structured output
- The blog MUST be entirely derived from the source content provided. Use the source's actual arguments, examples, and voice. Do NOT invent topics that aren't in the source.
- The output MUST use proper Markdown structure so it renders correctly in any preview:
  - **# Title** on the first line — 5-10 words, specific, not clickbait
  - **An italicised one-line subtitle/dek** directly below the title (e.g. *A practical look at why most teams confuse activity with progress.*)
  - **## Section headings** for each main section (2-4 sections total)
  - **Short paragraphs** (2-4 sentences each) — long walls of text don't render well on the web
  - **At least one block quote** (\`> ...\`) for a punchline or memorable insight
  - **Optionally a short bulleted list** if the source content lends itself to one — but only if it adds value, not as filler

## Voice & Feel
- Write like a thoughtful person, not a content marketing department. If a sentence could appear in any other company's blog, rewrite it.
- Keep the speaker's actual phrases when they add character. Don't sand the personality off.
- Vary your sentence rhythm. Mix short, declarative sentences with longer ones that let an idea unspool.
- Be specific. Concrete numbers > vague claims. Real scenarios > hypotheticals.
- Humor is welcome when natural; forced wit is worse than none.
- NO motivational-poster endings, NO "and that's the real lesson," NO kumbaya wrap-ups.

## Structure (target: 600-800 words)
1. **Title + dek** (one line each) — hook the reader without clickbait
2. **Opening** (60-90 words): drop the reader into a moment, question, or provocation. NO "In today's fast-paced world..." NO throat-clearing.
3. **2-4 body sections** with ## subheadings. Each section has one clear idea developed across 2-4 short paragraphs.
4. **A pull-quote block (\`>\`)** somewhere in the middle — the line you'd want a reader to screenshot.
5. **Close** (60-100 words): end with something that sticks — a question, a tension, a forward-looking claim. NOT a tidy summary.

## What to KILL on sight
- "In today's [X]..." openings, "At the end of the day...", "It's not about X, it's about Y"
- Tidy three-part conclusions, motivational-poster endings, Hallmark-card sentiment
- Buzzwords: synergy, leverage, ecosystem, unlock, empower (unless used satirically)
- Forced positivity, false resolution, filler transitions ("With that said...", "Now, let me explain...")
- Unsourced claims — if you state a fact, anchor it to something specific from the source

## Output rules
- Output ONLY the blog post in Markdown. No preamble, no code fences, no "Here's your blog post:".
- Start with the # title. End with the last word of the closing paragraph.

When the user provides a source, transform it into a blog post ABOUT THAT SPECIFIC CONTENT following these guidelines.`;

export const SKILL_BLOG_TO_VIDEO = `# Blog to Video Script

Turn a blog post into a video script that sounds like someone talking — not someone reading a teleprompter. The script should feel like you're overhearing a smart person explain something they care about.

{{BRAND_IDENTITY}}

## CRITICAL: Source-Based Content
The video script MUST be entirely derived from the blog post provided below. Cover the same topics and insights. Do NOT introduce new topics not present in the blog.

## Script Requirements
- Target length: 600-800 words spoken (~3-5 minutes)
- Format: Include [SCENE] and [VISUAL] directions
- Tone: Conversational and direct. Not "presenter voice" — more like explaining to a colleague who asked a good question.
- Allow for natural pauses, emphasis, and rhythm changes. Real people don't speak in perfectly even paragraphs.

## Script Structure

### 1. Cold Open (First 10 seconds / ~30-40 words)
Drop straight into it. A question, a surprising claim, a "here's the thing nobody talks about" moment. No "Hey guys, welcome back to..."

### 2. Context (15-20 seconds / ~50-60 words)
Why this matters. Why now. Keep it tight.

### 3. Main Content (2-3 minutes / 350-450 words)
2-3 clear sections. Each should:
- Explain one idea clearly
- Include a concrete example or specific detail
- Have at least one moment that's unexpected or challenges the viewer
Visual directions should feel cinematic, not corporate-training-video.

### 4. Close (30-40 seconds / ~100-120 words)
Don't summarize everything you just said. Either end with a forward-looking question, a challenge to the viewer, or an honest admission of what you don't know yet. The best video endings leave people thinking, not nodding along.

## Visual Direction Tags
- [SCENE: description] - Major scene change or setting
- [VISUAL: description] - Specific visual to show
- [TEXT ON SCREEN: "text"] - Text overlay
- [B-ROLL: description] - Background footage suggestion

When the user provides a blog post, generate a complete video script ABOUT THAT SPECIFIC CONTENT following these guidelines.`;

export const SKILL_WEEKLY_NEWSLETTER = `# Weekly Newsletter

Write a newsletter that reads like a thoughtful email from someone the reader actually likes hearing from — not a company broadcast. Match the brand voice. Use proper Markdown structure so it renders correctly inside any of the four newsletter templates the app supports (Executive, Modern, Bold, Classic).

{{BRAND_IDENTITY}}

## CRITICAL: Source-faithful, structured output
- Every section MUST be derived from the source content. Don't invent topics.
- Output MUST use Markdown headings the templates can parse:
  - **First line: \`Subject: <subject line>\`** — under 60 chars, specific (NOT "This Week's Newsletter!")
  - **## Hello / Greeting** — the opener
  - **## What's been on my mind** — the hook
  - **## Featured** — the main piece
  - **## Quick hits** — 2-3 marginalia items as a bulleted list
  - **## Question to sit with** — one real question
  - **## Coming up** — a tease
  - **## Sign-off** — closing line + name

## Voice
- Write like someone who respects the reader's time. Skip the "Happy Tuesday!" greeting.
- Be specific. "I watched a tool demo Friday that broke three assumptions I had" beats "exciting innovations this week."
- Genuine > polished. If something surprised you, say that.
- "Hey," is fine. A joke is fine. Getting straight to it is fine.
- NO "Warm regards, The Team." Be a person.

## Section sizes (target 500-700 words total)
- **Subject line**: 1 line, ≤60 chars
- **Greeting**: 15-25 words
- **What's been on my mind**: 60-90 words. Specific moment or insight from the source.
- **Featured**: 180-250 words. The main thing. Give enough to be valuable. End at a tension, not a tidy resolution.
- **Quick hits**: 3 bullet points, each 1-2 short sentences. Texture > bullet points that read like memos.
- **Question to sit with**: 30-50 words. Specific enough to be interesting, open enough to be worth thinking about.
- **Coming up**: 25-40 words. Tease, don't list.
- **Sign-off**: 15-25 words. Human.

## What to kill
- "Happy [Day]!", "We're excited to share..."
- Corporate "we" when a singular voice would land harder
- Tidy bow-tied conclusions
- Bullet lists that read like internal status updates

## Output rules
- Output ONLY the newsletter in Markdown. Start with \`Subject: ...\` on line 1.
- No preamble, no code fences, no "Here is your newsletter:" wrapper.

When the user provides content, transform it into a newsletter ABOUT THAT CONTENT.`;

// ── SOCIAL MEDIA SKILLS ─────────────────────────────────────────────
// Updated with 2025-2026 trending best practices from top-performing
// professional/business accounts across each platform.

export const SKILL_LINKEDIN_POSTS = `# Content to LinkedIn Posts

Generate 5 LinkedIn posts that sound like they were written by a real human with real opinions — not by a content marketing playbook. The goal is to make someone stop scrolling because the voice is interesting, not because the formatting is optimized.

{{BRAND_IDENTITY}}

## CRITICAL: Self-Contained & Source-Derived
Every post MUST be derived from the source content below. Each post must be FULLY SELF-CONTAINED — a reader with zero context must understand it. NEVER reference "this transcript," "this video," or "the source." Present insights as firsthand expertise about the TOPIC.

## Voice Rules (MORE IMPORTANT THAN FORMAT)
- Write as a specific person with a point of view, not "a professional sharing insights."
- Unpack ideas. Don't compress everything into neat one-liners. LinkedIn isn't Twitter — you have room to develop a thought. Use it.
- Let some sentences be imperfect. A thought that trails into an em dash — or a paragraph that's just a question with no answer — feels more real than a perfectly structured argument.
- NO Hallmark card endings. If your last line could be printed on a motivational poster, delete it and write something with more teeth.
- NO "Here's the thing:" or "Here's what I've learned:" or "And that's what [X] is really about." These are AI tells.
- Humor, frustration, surprise, uncertainty — actual human emotions make content memorable. Don't sanitize them out.
- Avoid the LinkedIn-bro cadence of short. Punchy. Lines. Used. For. Dramatic. Effect. It's overplayed.

## Post Structure Rules
- Character range: 900-1800 characters
- Quantity: 5 posts, each using a DIFFERENT format below
- First 150 characters = your hook. Make it specific and interesting, not clickbaity.
- Paragraphs: 1-3 sentences. Blank lines between them.
- End posts with genuine questions — ones you'd actually want answered, not rhetorical softballs.
- 3-5 niche hashtags at the END only.
- 0-2 emojis. Only as bullet markers, never as decoration.
- NO external links in post body. Say "link in comments" if needed.

## The 5 Post Formats

### Post 1 — Contrarian / Uncomfortable Truth
Open with something most people in the industry believe — then explain why it's wrong or incomplete. Be specific. Use a real example, a number, or a scenario. Don't just be contrarian for clicks — have a genuine argument.

### Post 2 — Real Story (not a parable)
Start in a specific moment. Not "I once had a client who..." but "Tuesday afternoon, 3pm, I'm staring at a dashboard that's telling me everything I built is wrong." Make the reader feel the moment before you explain what happened. The lesson doesn't have to be tidy.

### Post 3 — Practical Framework
A numbered list that's actually useful — not obvious advice dressed up with bold text. Each point should make someone think "I hadn't thought of it that way." If a point is obvious ("Be consistent"), either skip it or reframe it in a non-obvious way.

### Post 4 — Specific Result + Honest Context
Lead with a concrete number or outcome. Then be honest about the context — what worked, what almost didn't, what you'd do differently. Avoid humble-bragging. The most engaging results posts include at least one thing that went wrong.

### Post 5 — Genuine Question
Not "What do you think about [broad topic]?" but something specific enough that it reveals your thinking and invites real debate. Share your own position in 2-3 sentences before opening it up. Show your uncertainty.

## Format Output
[POST 1 - Contrarian / Uncomfortable Truth]
[Post text with natural line breaks]
(XXX characters)

Continue through POST 5.`;

export const SKILL_TWITTER_POSTS = `# Content to Twitter/X Posts

Generate 5 tweets that sound like a real person with a brain, not a content strategist with a template. The bar on X is: would you actually post this from your own account?

{{BRAND_IDENTITY}}

## CRITICAL: Self-Contained & Source-Derived
Every post MUST be derived from the source content below. Each post must make COMPLETE sense standalone. NEVER reference transcripts, videos, or source material.

## X/Twitter Rules
- Single tweets: 70-100 characters get highest engagement. Max 280.
- 1-2 hashtags MAX. More = spam.
- Every word earns its place. Zero filler.
- Em dashes — for rhythm.
- Don't write "I think" — just say it.
- Be specific. Numbers > vague claims.
- Write like a smart person thinking out loud, not a brand "sharing value."

## The 5 Post Formats

### Post 1 — Hot Take (70-150 chars)
Something true that most people haven't articulated yet. Not "Unpopular opinion:" (overused) — just the take, stated with confidence.

### Post 2 — Observation (150-280 chars)
Something you've noticed that others haven't. "Most people [do X]. The ones getting results [do Y]." But only if Y is genuinely surprising. If it's obvious advice, don't bother.

### Post 3 — One Useful Thing (100-200 chars)
A single concrete insight someone can use today. Not "be consistent" — something specific enough to act on.

### Post 4 — Thread Starter (150-280 chars)
Set up a story or framework worth expanding. Don't use "A thread:" if you can avoid it — just write something compelling enough that people want to keep reading.

### Post 5 — Real Question (70-150 chars)
Something you're genuinely curious about. Not engagement bait — a question that reveals your thinking and invites people who've been in the trenches to respond.

## Format Output
[POST 1 - Hot Take]
[Post text]
(XXX characters)

Continue through POST 5.`;

export const SKILL_FACEBOOK_POSTS = `# Content to Facebook Posts

Generate 5 Facebook posts that feel like they came from a person, not a page. Facebook rewards genuine conversation — write things people would actually comment on because they have something to say, not because you asked them to.

{{BRAND_IDENTITY}}

## CRITICAL: Self-Contained & Source-Derived
Every post MUST be derived from the source content below. Each post must be FULLY self-contained. NEVER reference transcripts, videos, or sources.

## Facebook Rules
- Short posts (40-80 chars) get 66% higher engagement. Longer posts need clear line breaks.
- First 125 chars show before "See more" — make them count.
- Conversational always beats corporate.
- NO engagement bait ("Like if you agree!"). Ask real questions.
- Include [IMAGE:] suggestion for each post.
- Avoid external links in the post body.

## The 5 Post Formats

### Post 1 — Short Question (40-120 chars)
A specific question about the topic that people can answer from their own experience. Not "What do you think about innovation?" but "What's one tool you started using this year that you can't believe you lived without?"
[IMAGE: clean graphic with the question as text]

### Post 2 — One Thing I Learned (200-500 chars)
Share a single concrete insight from the source content. Explain it in 2-3 short paragraphs like you're telling a friend. End with a question that invites their experience.
[IMAGE: simple visual that reinforces the insight]

### Post 3 — Real Story (300-600 chars)
A moment, not a moral. Start in the middle of the action. Keep paragraphs to 1-2 sentences. Let the reader draw their own conclusion — or ask them what they would have done.
[IMAGE: candid, behind-the-scenes style photo suggestion]

### Post 4 — Surprising Detail (150-400 chars)
Lead with something counterintuitive from the source content. Not a "did you know" format — just state the surprising thing and explain why it matters. End with genuine curiosity about others' experiences.
[IMAGE: bold visual highlighting the key detail]

### Post 5 — Useful List (300-600 chars)
3-5 specific, actionable points. Each should be non-obvious enough that someone reading it thinks "huh, I hadn't thought of that." End with "what would you add?"
[IMAGE: numbered list graphic]

## Format Output
[POST 1 - Short Question]
[IMAGE: description]
[Post text]
(XXX characters)

Continue through POST 5.`;

export const SKILL_INSTAGRAM_POSTS = `# Content to Instagram Captions

Generate 5 Instagram captions that feel written by a person with taste, not scheduled by a social media tool. The best Instagram business content doesn't look like business content — it looks like someone sharing what they know.

{{BRAND_IDENTITY}}

## CRITICAL: Self-Contained & Source-Derived
Every caption MUST be derived from the source content below. Each caption must be FULLY self-contained. NEVER reference transcripts, videos, or sources. Image descriptions should match the content themes.

## Instagram Rules
- First 125 chars show before "...more" — write the hook last, make it earn the tap.
- Mix short (under 125 chars) and long (up to 2200 chars) captions.
- 3-5 niche hashtags only. Keyword-rich captions > hashtag stuffing.
- ONE CTA per caption. Be specific.
- Conversational and real. No press releases.
- Line breaks between paragraphs.
- 2-4 emojis as formatting aids only.

## The 5 Caption Formats

### Post 1 — Educational Carousel (800-1500 chars)
Hook with a specific, bold claim. List 5-7 points — each one should be non-obvious. If someone could Google the tip and find it on page one, it's too generic. End with a CTA to save.
[IMAGE: Carousel — bold title slide, one point per slide, clean design]

### Post 2 — Mini Story (500-1000 chars)
Start in a specific moment, not with background context. Let the reader feel they're there. Build to an insight, but don't gift-wrap the lesson — let some of it land by implication. End with a question.
[IMAGE: Candid, authentic photo suggestion that fits the moment]

### Post 3 — How It Actually Works (400-800 chars)
Pull back the curtain on something. Be honest about the messy parts. The value of behind-the-scenes content is honesty, not performance. If it's all polished, it defeats the purpose.
[IMAGE: Behind-the-scenes — workspace, whiteboard, screen, real environment]

### Post 4 — One Sharp Insight (300-600 chars)
A single framework, reframe, or insight that's immediately useful. Short. Direct. The kind of thing someone screenshots and sends to a colleague.
[IMAGE: Bold graphic with key insight as text overlay]

### Post 5 — Take a Position (300-700 chars)
State your view on something in the source content. Give 2-3 sentences of reasoning. Then open it up — but genuinely. Not "what do you think?" (too vague) but a specific question that invites disagreement.
[IMAGE: Thought-provoking graphic or split-design]

## Format Output
[POST 1 - Educational Carousel]
[IMAGE: description]
[Caption text with natural line breaks]

#hashtag1 #hashtag2 #hashtag3 #hashtag4 #hashtag5
(XXX characters)

Continue through POST 5.`;

// ── IMAGE STYLE PROMPTS ─────────────────────────────────────────────

export const IMAGE_STYLE_MINIMAL = `Generate a clean, minimal social media graphic about the following topic.

STYLE: Flat design, geometric shapes, limited 3-4 color palette, generous white space, modern sans-serif typography. Think Swiss poster design — a single standalone graphic, NOT a webpage or screenshot.

COLORS: Use these brand colors as the primary palette:
- Primary: {{PRIMARY_COLOR}}
- Secondary: {{SECONDARY_COLOR}}
- Background: Clean white or very light gray
- Text: Dark charcoal (#1a1a2e)

BRAND: {{BRAND_NAME}}

CONTENT TOPIC: {{TOPIC_SUMMARY}}

REQUIREMENTS:
- This is a standalone social media graphic — NOT a webpage, article, screenshot, or UI mockup
- Do NOT include browser chrome, navigation bars, scroll bars, cards, containers, or any web interface elements
- Include the brand name tastefully (small, corner placement)
- One clear headline or key message (5-8 words max)
- 1-2 simple geometric icons or shapes that represent the topic
- Generous negative space — less is more
- Professional and polished look
- No stock photo feel — this should look designed
- 16:9 aspect ratio
- All text must be clearly legible`;

export const IMAGE_STYLE_VIBRANT = `Generate a bold, vibrant social media graphic about the following topic.

STYLE: Rich gradients, dynamic composition, bold typography, eye-catching contrast, energetic feel. Think music festival poster meets concert flyer — a single standalone graphic, NOT a webpage.

COLORS: Build a vibrant palette from these brand colors:
- Primary: {{PRIMARY_COLOR}} (dominant)
- Secondary: {{SECONDARY_COLOR}} (accent)
- Add complementary bright accents for energy
- Dark background with glowing elements

BRAND: {{BRAND_NAME}}

CONTENT TOPIC: {{TOPIC_SUMMARY}}

REQUIREMENTS:
- This is a standalone social media graphic — NOT a webpage, article, screenshot, or UI mockup
- Do NOT include browser chrome, navigation bars, scroll bars, cards, containers, or any web interface elements
- Include the brand name prominently
- Bold headline text with impact (5-10 words)
- Dynamic composition — angles, overlapping elements, depth layers
- Gradient backgrounds or color transitions
- Abstract shapes or patterns that suggest motion/energy
- Modern, trendy aesthetic
- 16:9 aspect ratio
- All text must be clearly legible against the background`;

export const IMAGE_STYLE_EDITORIAL = `Generate a professional, editorial-style social media graphic about the following topic.

STYLE: Photography-inspired, sophisticated, business-ready. Think premium magazine cover — a single standalone graphic, NOT a webpage or article screenshot. Subtle textures, refined typography, muted tones with brand color accents.

COLORS: Refined palette based on brand:
- Primary accent: {{PRIMARY_COLOR}} (used sparingly for emphasis)
- Secondary: {{SECONDARY_COLOR}}
- Base: Warm grays, deep navy, or off-white backgrounds
- Text: High contrast, professional

BRAND: {{BRAND_NAME}}

CONTENT TOPIC: {{TOPIC_SUMMARY}}

REQUIREMENTS:
- This is a standalone social media graphic — NOT a webpage, article, screenshot, or UI mockup
- Do NOT include browser chrome, navigation bars, scroll bars, cards, containers, or any web interface elements
- Do NOT render article body text or paragraph content — only a short headline
- Include the brand name in a refined placement
- Elegant headline typography (5-8 words)
- Professional feel suitable for social media sharing
- Subtle background texture or pattern
- Structured layout with clear visual hierarchy
- 16:9 aspect ratio
- All text must be clearly legible`;

export const IMAGE_STYLE_ARTISTIC = `Generate an artistic, expressive social media graphic about the following topic.

STYLE: Painterly textures, mixed-media collage feel, hand-drawn elements blended with digital precision. Think museum exhibition poster meets indie album cover — a single standalone graphic, NOT a webpage. Organic shapes, brush strokes, textured paper backgrounds.

COLORS: Artistic palette derived from brand:
- Primary: {{PRIMARY_COLOR}} (washed out or saturated for artistic effect)
- Secondary: {{SECONDARY_COLOR}}
- Add earthy, muted tones for depth
- Off-white or kraft paper background textures

BRAND: {{BRAND_NAME}}

CONTENT TOPIC: {{TOPIC_SUMMARY}}

REQUIREMENTS:
- This is a standalone social media graphic — NOT a webpage, article, screenshot, or UI mockup
- Do NOT include browser chrome, navigation bars, scroll bars, cards, containers, or any web interface elements
- Include the brand name in a hand-lettered or artistic typeface style
- Headline with character (5-8 words max)
- Mixed media feel — combine illustration elements with clean typography
- Organic, non-grid compositions welcome
- Artistic but still readable and professional
- 16:9 aspect ratio
- All text must be clearly legible`;

export const IMAGE_STYLE_RETRO = `Generate a retro/vintage-inspired social media graphic about the following topic.

STYLE: Nostalgic aesthetics — think 70s/80s design revival. Halftone patterns, rounded fonts, warm color casts, film grain overlay, retro geometric patterns. Inspired by vintage print ads and old-school poster design — a single standalone graphic, NOT a webpage.

COLORS: Warm retro palette:
- Primary: {{PRIMARY_COLOR}} (with warm vintage cast)
- Secondary: {{SECONDARY_COLOR}}
- Add warm amber, burnt orange, and cream tones
- Slightly desaturated overall for vintage feel

BRAND: {{BRAND_NAME}}

CONTENT TOPIC: {{TOPIC_SUMMARY}}

REQUIREMENTS:
- This is a standalone social media graphic — NOT a webpage, article, screenshot, or UI mockup
- Do NOT include browser chrome, navigation bars, scroll bars, cards, containers, or any web interface elements
- Include the brand name in retro-styled typography
- Bold headline in a rounded or slab-serif style (5-8 words)
- Retro patterns: halftone dots, sunburst rays, or rounded rectangles
- Warm, nostalgic feel that still reads as modern
- Optional: VHS-style scan lines or film grain texture
- 16:9 aspect ratio
- All text must be clearly legible`;

export const IMAGE_STYLE_MODERN = `Generate a sleek, ultra-modern social media graphic about the following topic.

STYLE: Cutting-edge digital design. Glass-morphism effects, frosted translucent elements, thin-line icons, soft shadows, layered depth. Think premium brand advertisement — a single standalone graphic, NOT a webpage or app screenshot.

COLORS: Modern palette:
- Primary: {{PRIMARY_COLOR}} (used for glass highlights and accents)
- Secondary: {{SECONDARY_COLOR}}
- Soft gradients between neutrals
- Light frosted glass over dark subtle backgrounds

BRAND: {{BRAND_NAME}}

CONTENT TOPIC: {{TOPIC_SUMMARY}}

REQUIREMENTS:
- This is a standalone social media graphic — NOT a webpage, article, screenshot, app UI, or landing page
- Do NOT include browser chrome, navigation bars, scroll bars, cards with body text, containers, or any web interface elements
- Include the brand name with modern, clean sans-serif typography
- Headline with impact (5-8 words max)
- Glass-morphism as a decorative style element, not as UI components
- Layered depth with soft shadows and translucency
- Clean, airy feel with intentional white space
- 16:9 aspect ratio
- All text must be clearly legible`;

export const IMAGE_STYLE_FUTURISTIC = `Generate a futuristic, sci-fi inspired social media graphic about the following topic.

STYLE: Cyberpunk meets high-tech aesthetics. Neon accents, dark environments, holographic effects, circuit-board patterns. Think Blade Runner movie poster meets SpaceX branding — a single standalone graphic, NOT a webpage or software UI.

COLORS: Futuristic palette:
- Primary: {{PRIMARY_COLOR}} (as neon glow/accent)
- Secondary: {{SECONDARY_COLOR}} (holographic highlight)
- Deep blacks and dark blues as base
- Electric neon accents and glow effects

BRAND: {{BRAND_NAME}}

CONTENT TOPIC: {{TOPIC_SUMMARY}}

REQUIREMENTS:
- This is a standalone social media graphic — NOT a webpage, article, screenshot, dashboard, or UI mockup
- Do NOT include browser chrome, navigation bars, scroll bars, cards, containers, or any web interface elements
- Include the brand name with a tech/futuristic typeface style
- Headline with authority (5-8 words max)
- Neon glow effects, light trails, or holographic elements
- Dark background with high-contrast luminous accents
- Techy details as decorative elements: grid lines, particle effects
- 16:9 aspect ratio
- All text must be clearly legible`;

export const IMAGE_STYLE_CINEMATIC = `Generate a cinematic, movie-poster style social media graphic about the following topic.

STYLE: Dramatic lighting, wide-format composition, cinematic color grading. Think movie poster meets premium brand campaign — a single standalone graphic, NOT a webpage. Moody atmosphere with deliberate light sources, dramatic shadows, and depth of field effects.

COLORS: Cinematic palette:
- Primary: {{PRIMARY_COLOR}} (as dramatic light source or accent)
- Secondary: {{SECONDARY_COLOR}}
- Teal and orange cinematic color grading
- Deep shadows with selective highlighting

BRAND: {{BRAND_NAME}}

CONTENT TOPIC: {{TOPIC_SUMMARY}}

REQUIREMENTS:
- This is a standalone social media graphic — NOT a webpage, article, screenshot, or UI mockup
- Do NOT include browser chrome, navigation bars, scroll bars, cards, containers, or any web interface elements
- Include the brand name in premium cinematic typography
- Dramatic headline (5-8 words max)
- Strong directional lighting — dramatic light and shadow
- Cinematic aspect and composition
- Atmospheric depth — haze, bokeh, or lens flare
- 16:9 aspect ratio
- All text must be clearly legible`;

// ── MAPS ────────────────────────────────────────────────────────────

export const SKILL_MAP = {
  blog: SKILL_TRANSCRIPT_TO_BLOG,
  video: SKILL_BLOG_TO_VIDEO,
  newsletter: SKILL_WEEKLY_NEWSLETTER,
  linkedin: SKILL_LINKEDIN_POSTS,
  twitter: SKILL_TWITTER_POSTS,
  facebook: SKILL_FACEBOOK_POSTS,
  instagram: SKILL_INSTAGRAM_POSTS,
};

export const IMAGE_STYLE_MAP = {
  minimal: IMAGE_STYLE_MINIMAL,
  vibrant: IMAGE_STYLE_VIBRANT,
  editorial: IMAGE_STYLE_EDITORIAL,
  artistic: IMAGE_STYLE_ARTISTIC,
  retro: IMAGE_STYLE_RETRO,
  modern: IMAGE_STYLE_MODERN,
  futuristic: IMAGE_STYLE_FUTURISTIC,
  cinematic: IMAGE_STYLE_CINEMATIC,
};
