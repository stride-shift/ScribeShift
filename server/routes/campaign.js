import { Router } from 'express';
import { geminiText } from '../services/gemini-client.js';
import { CAMPAIGN_PLAN_PROMPT } from '../config/skills.js';
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

    const prompt = CAMPAIGN_PLAN_PROMPT({ topic, campaignGoal, platformList, timeframe, brandName, context });

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
