import { supabase } from '../config/supabase.js';

// Credit costs per action
const CREDIT_COSTS = {
  generate_text: 1,     // per content type
  generate_image: 1,    // single image
  generate_image_suite: 3, // per style (3 variants each)
  generate_tts: 2,
  detect_tone: 1,
  campaign_plan: 1,
  schedule_post: 0,     // free
};

// ── Check if company has enough credits ─────────────────────────────
export async function checkCredits(companyId, action, quantity = 1) {
  const cost = (CREDIT_COSTS[action] || 1) * quantity;
  if (cost === 0) return { allowed: true, cost: 0 };

  // Users without a company cannot use paid features
  if (!companyId) {
    return {
      allowed: false,
      cost,
      balance: 0,
      error: 'No company assigned. Contact your admin to get access.',
    };
  }

  const { data: company, error } = await supabase
    .from('companies')
    .select('credit_balance, credit_monthly_limit')
    .eq('id', companyId)
    .single();

  if (error || !company) {
    console.error(`[CREDITS] Company ${companyId} lookup failed:`, error?.message);
    return {
      allowed: false,
      cost,
      balance: 0,
      error: 'Could not verify credit balance. Please try again.',
    };
  }

  // Unlimited companies (credit_monthly_limit = -1) bypass balance checks
  if (company.credit_monthly_limit === -1) {
    return { allowed: true, cost: 0, balance: Infinity, unlimited: true };
  }

  if (company.credit_balance < cost) {
    return {
      allowed: false,
      cost,
      balance: company.credit_balance,
      error: `Insufficient credits. Need ${cost}, have ${company.credit_balance}.`,
    };
  }

  return { allowed: true, cost, balance: company.credit_balance };
}

// ── Deduct credits and log usage ────────────────────────────────────
export async function deductCredits(userId, companyId, action, creditsUsed, metadata = {}) {
  if (creditsUsed === 0 || !companyId) return;

  // Deduct from company balance
  const { error: deductError } = await supabase.rpc('deduct_credits', {
    p_company_id: companyId,
    p_amount: creditsUsed,
  });

  if (deductError) {
    console.warn(`[CREDITS] RPC deduct_credits failed, using fallback:`, deductError.message);
    // Fallback: manual deduction if RPC doesn't exist yet
    const { data: company, error: fetchError } = await supabase
      .from('companies')
      .select('credit_balance')
      .eq('id', companyId)
      .single();

    if (fetchError || !company) {
      console.error(`[CREDITS] Fallback deduction failed — could not fetch company ${companyId}`);
      throw new Error('Failed to deduct credits. Please try again.');
    }

    const { error: updateError } = await supabase
      .from('companies')
      .update({ credit_balance: Math.max(0, company.credit_balance - creditsUsed) })
      .eq('id', companyId);

    if (updateError) {
      console.error(`[CREDITS] Fallback update failed for company ${companyId}:`, updateError.message);
      throw new Error('Failed to deduct credits. Please try again.');
    }
  }

  // Log usage
  const { error: logError } = await supabase.from('usage_logs').insert({
    user_id: userId,
    company_id: companyId,
    action,
    credits_used: creditsUsed,
    metadata,
  });

  if (logError) {
    console.error(`[CREDITS] Failed to log usage for ${action}:`, logError.message);
    // Don't throw here — credits were deducted, logging failure is non-critical
  }
}

export { CREDIT_COSTS };
