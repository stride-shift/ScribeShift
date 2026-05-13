// ── Tour step definitions ───────────────────────────────────────────
//
// Two layers of tours:
//
// 1. MAIN tour — shown once per role on first login. Walks the user across
//    every nav view to orient them.
//
// 2. PER-VIEW tours — shown on demand (via the Help "?" button) and once
//    automatically the first time the user visits each view. Walks through
//    the key features inside that specific tab.
//
// Targets are CSS selectors. Prefer [data-tour="..."] attributes on stable
// elements so refactors don't silently break the tour. When a target can't
// be found (or for intro/outro cards), use `target: 'body'` which the
// CustomTour component treats as a centered modal.

const NAV_VIEW_STEPS = [
  {
    target: '[data-tour="nav-create"]',
    title: 'Create',
    content: 'Start here. Upload a video, paste a URL, or type a topic and ScribeShift turns it into ready-to-publish content.',
    view: 'create',
  },
  {
    target: '[data-tour="nav-history"]',
    title: 'History',
    content: 'Everything you\'ve generated lives here. Re-open past results, copy them, or send them straight to the scheduler.',
    view: 'history',
  },
  {
    target: '[data-tour="nav-schedule"]',
    title: 'Schedule',
    content: 'Plan when posts go live across LinkedIn, Twitter, Facebook and Instagram. Drag, drop, done.',
    view: 'schedule',
  },
  {
    target: '[data-tour="nav-planner"]',
    title: 'Pillars',
    content: 'A bird\'s-eye view of your content themes. See which pillars are getting attention — and which are quiet.',
    view: 'planner',
  },
  {
    target: '[data-tour="nav-analytics"]',
    title: 'Analytics',
    content: 'Track reach, engagement, and growth across every connected channel.',
    view: 'analytics',
  },
  {
    target: '[data-tour="nav-brands"]',
    title: 'Brands',
    content: 'Manage the brand voices ScribeShift writes in. Each brand is shared across your whole company.',
    view: 'brands',
  },
  {
    target: '[data-tour="nav-settings"]',
    title: 'Settings',
    content: 'Connect your social accounts and your Google Calendar here.',
    view: 'settings',
  },
];

const WELCOME_STEP = {
  target: 'body',
  title: 'Welcome to ScribeShift',
  content: 'A 60-second tour of where everything lives. Use Next to advance, or Skip to dismiss — you can replay it anytime from the Help button.',
};

const FAREWELL_STEP_USER = {
  target: 'body',
  title: 'You\'re all set',
  content: 'That\'s the grand tour. Head back to Create whenever you\'re ready to make something — and click the Help icon any time you want this walkthrough again.',
};

const FAREWELL_STEP_ADMIN = {
  target: 'body',
  title: 'You\'re all set',
  content: 'Quick note as an admin: you can manage your team\'s users and credits from the Admin tab. Click Help any time you want to replay this walkthrough.',
};

const FAREWELL_STEP_SUPER = {
  target: 'body',
  title: 'You\'re all set',
  content: 'As super admin you can manage every company on the platform from the Admin tab — including brand limits, credits, and per-company usage. Help button replays this tour anytime.',
};

// ── Main tours per role ─────────────────────────────────────────────
export const userSteps = [
  WELCOME_STEP,
  ...NAV_VIEW_STEPS,
  FAREWELL_STEP_USER,
];

export const adminSteps = [
  WELCOME_STEP,
  ...NAV_VIEW_STEPS,
  {
    target: '[data-tour="nav-admin"]',
    title: 'Admin',
    content: 'Admin home for your company. Invite teammates, change roles, top up credits, and watch overall usage.',
    view: 'admin',
  },
  FAREWELL_STEP_ADMIN,
];

export const superAdminSteps = [
  WELCOME_STEP,
  ...NAV_VIEW_STEPS,
  {
    target: '[data-tour="nav-admin"]',
    title: 'Admin',
    content: 'Your super-admin control panel. Switch between Overview, Users, Companies, and Usage tabs to drill into any organisation.',
    view: 'admin',
  },
  {
    target: '[data-tour="admin-tab-companies"]',
    title: 'Companies (super admin only)',
    content: 'This tab is just for you. Create new companies, adjust brand limits, and assign credits company-wide.',
    view: 'admin',
  },
  FAREWELL_STEP_SUPER,
];

export function stepsForRole(role) {
  if (role === 'super_admin') return superAdminSteps;
  if (role === 'admin') return adminSteps;
  return userSteps;
}

// ── Per-view tours (run inside each tab) ────────────────────────────
// Each tour is a small 2-4 step walkthrough of that view's key features.
// Steps without a matching data-tour anchor fall back to centered cards
// (CustomTour handles target-not-found gracefully).

export const viewTours = {
  create: [
    {
      target: 'body',
      title: 'Create Content',
      content: 'This is where you turn an idea into ready-to-publish content. Three steps: pick a source, set the style, generate.',
    },
    {
      target: '[data-tour="create-brand-selector"]',
      title: 'Pick a brand',
      content: 'Every piece is generated in a specific brand voice. Switch brands here — your ICP, guidelines, and writing samples come along automatically.',
    },
    {
      target: '#step-source',
      title: 'Step 1 — Source',
      content: 'Upload videos, audio, or documents. Paste a YouTube link, or just type a topic. Choose the formats you want (LinkedIn, blog, newsletter…).',
    },
    {
      target: '#step-style',
      title: 'Step 2 — Style',
      content: 'Tone, length, and visuals. ScribeShift auto-detects tone from your brand voice, but you can override anything here.',
    },
    {
      target: '#step-generate',
      title: 'Step 3 — Generate',
      content: 'Review your setup and let it rip. Results land below and are saved to History — copy, edit, or send straight to Schedule.',
    },
  ],

  history: [
    {
      target: 'body',
      title: 'Your content bank',
      content: 'Every piece ScribeShift has ever generated for you. Search, filter, sort — and one-click send anything to the scheduler.',
    },
    {
      target: '[data-tour="history-search"]',
      title: 'Search anything',
      content: 'Type a topic, platform, or snippet of copy. Search runs across all your past generations instantly.',
    },
    {
      target: '[data-tour="history-stats"]',
      title: 'Quick stats',
      content: 'Snapshot of your library — total posts, pinned favourites, top performers, and gaps in your content mix.',
    },
    {
      target: '[data-tour="history-view-modes"]',
      title: 'Switch the view',
      content: 'Grid, compact, list, or Kanban — pick whichever way you like to skim your archive.',
    },
  ],

  schedule: [
    {
      target: 'body',
      title: 'Plan your posts',
      content: 'Drag content from History onto a date, connect a social account, and ScribeShift posts it for you at the time you pick.',
    },
    {
      target: '[data-tour="schedule-stats"]',
      title: 'Schedule health',
      content: 'See where you\'ve got coverage and where there are gaps — including a posting cadence warning if you\'re going dark.',
    },
    {
      target: '[data-tour="schedule-mode-toggle"]',
      title: 'Calendar or list',
      content: 'Switch between a calendar grid for a monthly view, or a flat list to plan in sequence.',
    },
    {
      target: '[data-tour="schedule-calendar"]',
      title: 'Drop posts in',
      content: 'Click any day to schedule a post for that date, or drag a post chip to move it. Past dates are read-only.',
    },
  ],

  planner: [
    {
      target: 'body',
      title: 'Content pillars',
      content: 'See which themes your content lives in. Helps you spot what\'s over-represented and what\'s missing in your mix.',
    },
    {
      target: '[data-tour="pillar-view-modes"]',
      title: 'Seven views, one set of data',
      content: 'Donut, breakdown, bar, tree, timeline, radar, board — same pillars rendered seven ways. Find the one your brain prefers.',
    },
    {
      target: '[data-tour="pillar-chart"]',
      title: 'Your pillar mix',
      content: 'Each slice/branch is a pillar. Click into one to see every piece of content tagged to it.',
    },
  ],

  analytics: [
    {
      target: 'body',
      title: 'Analytics',
      content: 'Reach, engagement, and growth across every connected channel — refreshed automatically every few hours.',
    },
    {
      target: '[data-tour="analytics-tabs"]',
      title: 'Three lenses',
      content: 'Native (everything on your channels), Made with ScribeShift (only posts you generated here), Boosted vs Organic (paid impact).',
    },
    {
      target: '[data-tour="analytics-top-stats"]',
      title: 'At-a-glance',
      content: 'Followers, 30-day reach, impressions, post count — your cross-platform snapshot.',
    },
    {
      target: '[data-tour="analytics-posts-table"]',
      title: 'Post-by-post',
      content: 'Every published post with its actual metrics. Sort by reach or engagement to find your top performers.',
    },
  ],

  brands: [
    {
      target: 'body',
      title: 'Brand voices',
      content: 'A brand is the voice, audience, and visual style ScribeShift writes in. Every piece of content gets generated against one.',
    },
    {
      target: '[data-tour="brands-limit"]',
      title: 'Your plan limit',
      content: 'How many brands your plan allows. Brands are company-shared — everyone in your org sees the same set.',
    },
    {
      target: '[data-tour="brands-list"]',
      title: 'Your brands',
      content: 'Click a card to edit it. Each brand has its own ICP, writing samples, guidelines, and visual identity.',
    },
    {
      target: '[data-tour="brands-create"]',
      title: 'Add a new brand',
      content: 'Click here to set up a new voice. Tip: filling in writing samples dramatically improves generation match.',
    },
  ],

  settings: [
    {
      target: 'body',
      title: 'Connections',
      content: 'Connect your social accounts so ScribeShift can post for you, and link Google Calendar so scheduled posts land on your calendar.',
    },
    {
      target: '[data-tour="settings-socials"]',
      title: 'Social accounts',
      content: 'LinkedIn, Twitter, Facebook, Instagram — one click each.',
    },
    {
      target: '[data-tour="settings-calendar"]',
      title: 'Google Calendar',
      content: 'Optional but handy: scheduled posts appear as calendar events you can see alongside your meetings.',
    },
  ],

  admin: [
    {
      target: 'body',
      title: 'Admin home',
      content: 'Manage users, top up credits, and watch usage. Super admins also manage companies and brand limits.',
    },
    {
      target: '[data-tour="admin-tab-users"]',
      title: 'Users',
      content: 'See every member of your org. Change roles, deactivate users, or add credits to specific people.',
    },
    {
      target: '[data-tour="admin-tab-usage"]',
      title: 'Usage',
      content: 'Drill into consumption — by company, by user, by feature. Spot heavy users and gaps fast.',
    },
  ],
};

export function tourForView(viewId) {
  return viewTours[viewId] || null;
}
