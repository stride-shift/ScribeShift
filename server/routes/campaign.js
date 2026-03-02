import { Router } from 'express';
import { geminiText } from '../config/gemini.js';
import { verifyToken } from '../middleware/auth.js';
import { checkCredits, deductCredits } from '../services/credits.js';

const router = Router();
router.use(verifyToken);

// ── POST /api/campaign/plan ─────────────────────────────────────────
// AI-generated content campaign / story arc plan
router.post('/plan', async (req, res) => {
  try {
    const {
      topic,
      goal,
      platforms,
      duration,  // e.g., "2 weeks", "1 month"
      brandName,
      context,   // optional extra context
    } = req.body;

    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }

    // Check credits before AI call
    const creditCheck = await checkCredits(req.user.company_id, 'campaign_plan');
    if (!creditCheck.allowed) {
      return res.status(402).json({ error: creditCheck.error });
    }

    const platformList = (platforms || ['linkedin']).join(', ');
    const campaignGoal = goal || 'engagement';
    const timeframe = duration || '2 weeks';

    const prompt = `You are a content strategist planning a content campaign.

## Campaign Brief
- Topic / Theme: ${topic}
- Primary Goal: ${campaignGoal}
- Platforms: ${platformList}
- Duration: ${timeframe}
${brandName ? `- Brand: ${brandName}` : ''}
${context ? `- Additional Context: ${context}` : ''}

## Your Task
Create a content campaign plan that maps out a story arc across the timeframe. This isn't just a list of posts — it's a narrative sequence where each piece builds on the last.

## Story Arc Structure
Design the campaign as a narrative:
1. **Opening** (first 20% of posts): Introduce the theme, establish why it matters, create curiosity
2. **Rising Action** (next 40%): Deepen the exploration, introduce specifics, share real examples and data
3. **Climax** (next 20%): The most provocative/valuable/surprising content — the pieces that make people stop and share
4. **Resolution** (final 20%): Synthesize insights, call to action, what's next

## Output Format
Return a JSON array of content plan items. Each item should have:
- "day": number (day of campaign, starting from 1)
- "platform": which platform this post is for
- "type": "contrarian" | "story" | "framework" | "data" | "question" | "behind_the_scenes" | "case_study" | "cta"
- "pillar": "thought_leadership" | "product" | "culture" | "education" | "social_proof" | "engagement" | "news"
- "arc_phase": "opening" | "rising" | "climax" | "resolution"
- "hook": the first line / hook for the post (specific, not generic)
- "brief": 2-3 sentence description of what this post should cover
- "goal": specific goal for this post (e.g., "spark debate about X", "drive saves by providing framework for Y")

Create ${timeframe === '1 week' ? '5-7' : timeframe === '2 weeks' ? '8-12' : '15-25'} posts spread across the timeframe.

IMPORTANT: Each post hook must be SPECIFIC to the topic — not generic. If the topic is about AI in hiring, don't write "Here's what I learned about AI." Write "We ran 200 interviews with an AI screener last quarter. The results surprised us."

Return ONLY the JSON array. No markdown code fences, no preamble.`;

    console.log('[CAMPAIGN] Generating campaign plan...');
    const raw = await geminiText(prompt);

    // Parse the JSON response
    let plan;
    try {
      // Try to extract JSON from the response
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        plan = JSON.parse(jsonMatch[0]);
      } else {
        plan = JSON.parse(raw);
      }
    } catch (parseErr) {
      console.error('[CAMPAIGN] Failed to parse plan:', parseErr.message);
      return res.status(500).json({ error: 'Failed to parse campaign plan. Please try again.' });
    }

    // Deduct credits after successful generation
    await deductCredits(req.user.id, req.user.company_id, 'campaign_plan', creditCheck.cost, {
      topic,
      platforms: platformList,
      plan_items: plan.length,
    });

    console.log(`[CAMPAIGN] Generated plan with ${plan.length} items`);
    res.json({ success: true, plan });
  } catch (err) {
    console.error('[CAMPAIGN] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
