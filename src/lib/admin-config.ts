export const FEATURE_KEYS = [
  "account",
  "settings",
  "security",
  "help",
  "terms",
  // Sidebar visibility. Deliberately separate from the page flags above: a
  // page flag turns the feature off for everyone, these only decide whether
  // the entry is listed in the sidebar. Hiding a link and closing a page
  // are different intentions.
  "nav_settings",
  "nav_help",
  "nav_terms",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  account: "Account page",
  settings: "Settings page",
  security: "Security page",
  help: "Help page",
  terms: "Terms page",
  nav_settings: "Settings",
  nav_help: "Help",
  nav_terms: "Terms",
};

/** Which toggles belong together in the admin console. */
export const FEATURE_GROUPS = {
  pages: [
    "account",
    "settings",
    "security",
    "help",
    "terms",
  ],
  sidebar: [
    "nav_settings",
    "nav_help",
    "nav_terms",
  ],
  // Anything that can be put behind a plan while it is still being tested.
  beta: [],
} as const satisfies Record<string, readonly FeatureKey[]>;
