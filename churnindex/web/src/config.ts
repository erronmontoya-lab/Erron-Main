// Every brand name, link and tunable number for the marketing site lives here.

// Working name. Not yet checked for trademark or domain (brief section 14, item 1).
export const BRAND_NAME = "ChurnIndex";

export const PRIMARY_CTA = "Get my free scorecard";

// Where every "Get my free scorecard" button goes. Becomes the sign-up page
// once Supabase Auth is set up.
export const SIGNUP_HREF = "#connect";
export const SIGNIN_HREF = "#signin";

// Calculator assumptions (brief section 13). Shown on the page.
export const FAILED_PAYMENT_SHARE = 0.25; // Stripe research: about 1 in 4 churns
export const CALCULATOR_SAVE_RATE = 0.3; // Autopilot saves 3 in 10 at-risk subscriptions
export const AUTOPILOT_PRICE = 49;
export const GROWTH_PRICE = 149;

// Open decision for Erron (brief section 14, item 4).
export const SHOW_GUARANTEE = true;
