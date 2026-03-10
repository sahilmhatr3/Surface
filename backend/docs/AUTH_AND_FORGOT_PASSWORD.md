# Auth and forgot-password: standard approaches

## How we implemented it (custom auth)

- **Forgot password:** User enters email → we store a 6-digit OTP in memory (for now `123456`; no email sent yet). Same flow works when you add real email later.
- **Verify OTP:** User enters 6 digits → we return a short-lived JWT (`reset_token`) that encodes the email and expiry (15 min).
- **Reset password:** User submits `reset_token` + new password → we verify the JWT, find the user by email, set the new password. No login required for this step.

OTP is in-memory (see `app/core/otp_store.py`). For production you’d use Redis or a DB so it survives restarts and works across multiple app instances.

---

## Do websites use a third party for login?

**Many do.** Common options:

| Approach | Pros | Cons |
|----------|------|------|
| **Third-party auth (Auth0, Firebase Auth, Cognito, Okta, Supabase Auth)** | Handles OTP/magic links/MFA, security patches, compliance (e.g. SOC2). Less code to maintain. | Cost, vendor lock-in, custom branding limits, dependency on their availability. |
| **Custom auth (what we built)** | Full control, no per-user or per-MAU fees, no vendor. | You own security (hashing, tokens, rate limits, email sending, OTP storage). |

**Typical split:**

- **Startups / internal tools:** Often use Auth0, Firebase, or Cognito to ship faster and avoid building password reset, MFA, etc.
- **Larger or compliance-heavy products:** May use Okta, Auth0, or custom auth with a dedicated identity team.
- **Custom auth:** Used when you need full control, no vendor, or tight integration with your own user/tenant model (like Surface with teams and roles).

**If you keep custom auth and add real email later:**

1. Use an email provider (SendGrid, AWS SES, Resend, Postmark) to send the OTP (or a magic link).
2. Keep OTP/codes in Redis or DB with expiry.
3. Optionally add rate limiting on forgot-password and verify-otp by IP/email to prevent abuse.

So: yes, many sites use a third party for login and password reset; we implemented a custom flow that you can later plug into a real email sender and persistent OTP store.
