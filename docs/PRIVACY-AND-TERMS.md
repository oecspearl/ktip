# KTIP — Privacy Policy & Terms of Use

**Status:** DRAFT — not legal advice. Reviewed by counsel before publication.
**Last updated:** 2 August 2026
**Applies to:** the KTIP web application (`oecsinnovation.org`), its API (`/api/*`), and the OECS Virtual Campus SSO integration.

> **Fill these in before publishing** — every `[BRACKET]` below is a placeholder:
> `[LEGAL ENTITY]` (data controller of record, e.g. *Organisation of Eastern Caribbean States Commission*), `[REGISTERED ADDRESS]`, `[PRIVACY CONTACT EMAIL]` (suggested: `privacy@oecsinnovation.org`), `[DPO NAME/OFFICE]`, `[GOVERNING JURISDICTION]` (e.g. Saint Lucia), `[EFFECTIVE DATE]`.

---

# Part 1 — Privacy Policy

## 1. Who we are

KTIP (Knowledge, Technology and Innovation Platform) is operated by `[LEGAL ENTITY]`, `[REGISTERED ADDRESS]`, acting as the **data controller** for personal data processed on the platform. Privacy questions and data-rights requests: `[PRIVACY CONTACT EMAIL]`.

KTIP serves the OECS region. Members are located in multiple jurisdictions, so this policy is written to the stricter of the applicable OECS national data-protection acts and the GDPR standard.

## 2. What we collect

### 2.1 You give us directly

| Data | Where it comes from | Required? |
|---|---|---|
| Display name, email address, password (hashed) | Sign-up step 1 | Yes |
| Selected role(s) — student, mentor, investor, entrepreneur, private sector, faculty, researcher | Sign-up step 1 | Yes |
| **Date of birth** | Sign-up / onboarding age declaration | Yes, for accounts created after the age-declaration release |
| Organisation, industry, country, biography | Sign-up step 2 | Optional |
| Skills, interests, collaboration preferences | Sign-up step 3 | Optional |
| Avatar and cover images | Profile settings | Optional |
| Projects, events, grant applications, proposals, forum posts, comments, reactions, whiteboards, sticky notes | Your use of the platform | Optional |
| Direct and group messages, and message attachments | Messaging | Optional |
| Uploaded documents and CVs | Uploads, CV parsing | Optional |
| Verification evidence (student/faculty status) | Institution or chamber verification flow | Only if you request a gated role |
| Support, feedback, UAT and grievance submissions | Help / feedback forms | Optional |

### 2.2 We collect automatically

- **Product analytics** — page views, feature events, funnel and conversion events, session identifier, page path, timestamps, and your user ID when signed in (`analytics_events` table).
- **Error and performance telemetry** — stack traces, browser/OS, route, release version (Sentry).
- **Security and operational logs** — authentication events, admin actions, moderation actions, rate-limit counters.
- **Rate-limit records for translation** — caller IP addresses are **hashed with a secret salt** before storage, so the throttle table is not a record of who read what.
- **Local storage on your device** — session tokens, theme and accessibility preferences, recent searches (max 5), tutorial completion state.

### 2.3 We receive from third parties

- **Google / Microsoft OAuth** — name, email, profile picture, provider account ID.
- **OECS Virtual Campus SSO** — verified subject identifier, email, and campus attributes asserted by `oecscampus.org`.
- **OECS Commons / catalogue APIs** — course and catalogue records linked to your account where you use those integrations.

Note: **no OAuth or SSO provider supplies a date of birth.** Accounts created that way are still asked to declare one before the account is usable.

## 3. Special handling of date of birth and minors

The declared date of birth is treated as restricted data:

- It is stored in its own table (`account_age`) behind its own row-level security, is **never copied onto your public profile**, and no ordinary application query reads it back.
- Everything downstream consumes a derived boolean (**is this account a minor?**) rather than the date itself.
- The declaration is **write-once**. Correcting it is an administrative action, because an account able to edit its own date of birth is an account able to leave minor mode.
- Access is limited to you and to moderation/safeguarding staff acting in that capacity.

Accounts identified as minors are placed in supervised mode: restricted messaging and collaboration surfaces, and safeguarding controls that a minor cannot switch off. Where a national law in your country of residence sets a minimum age for consent to online services, and you are under that age, a parent or guardian must consent and may exercise your rights on your behalf. Contact `[PRIVACY CONTACT EMAIL]` for guardian requests.

## 4. Why we process it (legal bases)

| Purpose | Basis |
|---|---|
| Creating and running your account; delivering the platform's features | Performance of a contract |
| Age declaration, minor detection, safeguarding of young members | Legal obligation and substantial public interest |
| Verification of student, faculty and organisational status | Performance of a contract; legitimate interests (trust and safety) |
| Content moderation, abuse and fraud prevention, security logging | Legitimate interests; legal obligation |
| Product analytics and service improvement | Legitimate interests (measured against your privacy expectations) |
| Optional email notifications and digests | Consent — withdrawable in **Settings → Notifications** |
| AI features (search, chat assistance, field extraction, CV parsing, moderation assistance) | Legitimate interests; consent where the feature is opt-in |
| Machine translation of user content | Legitimate interests (regional accessibility) |
| Reporting to programme funders and regional partners | Legitimate interests — in aggregate or de-identified form |

## 5. What is visible to others

KTIP is a collaboration platform: some data is deliberately public.

- **Public by default:** display name, avatar, declared role(s), organisation, country, biography, skills, interests, badges, published projects, public events, forum posts.
- **Directory-controlled:** profile visibility, leaderboard participation and connection counts are governed by your settings under **Settings → Privacy**. A private profile is not invisible — a limited teaser may still appear in the directory.
- **Never public:** date of birth, password, email address (unless you publish it yourself), private messages, verification evidence, grievance and moderation records, analytics rows.

Administrators and moderators can access non-public data where necessary to operate the platform, investigate reports, and meet safeguarding duties. Those accesses are logged.

## 6. Who we share it with (processors)

We do not sell personal data. We use the following processors:

| Provider | Purpose | Data reaching them |
|---|---|---|
| **Supabase** | Database, authentication, file storage, realtime | All stored platform data |
| **Vercel** | Hosting and serverless API execution | Request data, IP addresses, logs |
| **Sentry** | Error and performance monitoring | Telemetry, user ID, route, browser context |
| **OpenAI** | AI search, chat assistance, field/CV extraction, moderation assistance | Only the content submitted to those features |
| **Azure AI Translator** | Machine translation of user content | Text submitted for translation |
| **Resend** | Transactional email | Email address, message content |
| **Google / Microsoft** | OAuth sign-in | Authentication exchange |
| **OECS Virtual Campus / Commons** | SSO and catalogue integration | Identity assertions, linked catalogue activity |
| **Jitsi** | Video collaboration | Audio/video/chat stream during a call |

We also disclose data where legally required, to protect the rights and safety of members (particularly minors), and to programme funders in **aggregate or de-identified** form.

## 7. International transfers

Data is hosted outside the OECS, primarily in the United States and the European Union depending on the provider. Transfers rely on the providers' standard contractual clauses and equivalent safeguards. Request the specific list of hosting regions at `[PRIVACY CONTACT EMAIL]`.

## 8. Retention

| Data | Kept |
|---|---|
| Account and profile | While your account is active |
| Date of birth | While your account is active; deleted with the account |
| Published content (projects, events, forum posts) | May remain after account deletion, attributed to a deleted user, where others rely on it |
| Messages | Retained in recipients' threads after your account is deleted |
| Analytics events | `[RETENTION PERIOD — recommend 24 months]` |
| Error telemetry | Per Sentry retention, typically 90 days |
| Moderation, grievance and safeguarding records | `[RETENTION PERIOD — recommend 5 years]`, for legal-defence and safeguarding purposes |
| Hashed rate-limit records | Rolling window, hours |

## 9. Your rights

You can request access, correction, deletion, restriction, objection, and portability, and you can withdraw consent at any time.

- **Self-service deletion** is available in **Settings → Account**. It removes your profile and authentication record; content that has cascaded to other members' contexts is handled as described in section 8.
- **Correcting your date of birth** requires contacting support, by design (section 3).
- Other requests: `[PRIVACY CONTACT EMAIL]`. We respond within **30 days**.
- You may complain to the data-protection authority in your country of residence.

## 10. Security

Row-level security on every table, role-based access control scoped to your active role, encrypted transport, hashed passwords, restricted service-role keys held server-side only, hashed IPs for throttling, audit logging on administrative and moderation actions, and quarantining of sensitive fields (date of birth) away from public queries. No system is perfectly secure; report a vulnerability to `[PRIVACY CONTACT EMAIL]`.

## 11. Cookies and local storage

KTIP uses strictly-necessary storage for authentication sessions and preferences, plus first-party analytics stored in our own database. We do not use third-party advertising or cross-site tracking cookies.

## 12. Changes

Material changes are announced in-app and by email at least **14 days** before taking effect. The "last updated" date at the top of this document always reflects the current version.

---

# Part 2 — Terms of Use

**Effective:** `[EFFECTIVE DATE]`

## 1. Agreement

By creating an account or using KTIP, you agree to these Terms and to the Privacy Policy above. If you use KTIP for an organisation, you confirm you are authorised to bind it.

## 2. Eligibility and age

- You must be at least **13 years old** to hold an account, or the higher minimum age set by the law of your country of residence.
- Every account must **declare a date of birth** at sign-up or during onboarding, including accounts created through Google, Microsoft, or Virtual Campus SSO.
- The declaration must be truthful. A false declaration — in particular one that misrepresents a minor as an adult — is grounds for immediate suspension.
- Accounts identified as minors operate in supervised mode with restricted messaging and collaboration features. These restrictions are not user-configurable.
- KTIP does not knowingly maintain accounts for children under 13. Report one to `[PRIVACY CONTACT EMAIL]` and it will be removed.

## 3. Accounts

You are responsible for the accuracy of your details, the security of your credentials, and all activity under your account. Do not share credentials or impersonate another person or organisation. Roles marked as requiring verification (student, faculty) are granted only after an institution or chamber confirms your status; claiming one falsely is a breach of these Terms.

## 4. Acceptable use

You must not:

1. Post unlawful, defamatory, harassing, hateful, or discriminatory content.
2. Post sexual content, or any content that sexualises or endangers a minor. Zero tolerance — reported to authorities where required.
3. Harass, bully, threaten, or stalk another member, or contact a minor outside supervised channels.
4. Post spam, unsolicited promotions, pyramid or investment schemes, or fraudulent funding offers.
5. Misrepresent a grant, project, event, organisation, or your own credentials.
6. Upload malware, or content infringing another party's intellectual property.
7. Scrape, crawl, or bulk-extract platform data, or circumvent rate limits, access controls, row-level security, or the API's authentication.
8. Probe, load-test, or attack the platform's security without written authorisation.
9. Use AI features to generate content that violates these rules, or present AI output as verified fact where accuracy matters to others.
10. Resell or sublicense access to KTIP.

## 5. Your content

You keep ownership of everything you post. You grant `[LEGAL ENTITY]` a **non-exclusive, worldwide, royalty-free licence** to host, store, reproduce, translate, adapt for display, and distribute your content **solely to operate and promote the platform and its programme objectives**. The licence ends when you delete the content, except where it has already been shared into another member's context (messages, collaborative documents, whiteboards) or where retention is legally required.

Content you mark as public may be indexed by search engines and viewed by anyone.

## 6. Grants, funding and events

Grant listings, funding opportunities, events, and partner offerings on KTIP are published by their sponsors. `[LEGAL ENTITY]` does not guarantee their accuracy, availability, or outcome, is not a party to any agreement you reach with a sponsor, and does not disburse funds unless it is expressly the named funder. **Verify any funding opportunity independently before sending money, documents, or personal data.**

## 7. Verification, badges and points

Verification badges reflect a check made at a point in time and can be revoked. Points, badges, and leaderboard positions have no monetary value, are not transferable, and may be recalculated or reset.

## 8. AI features

KTIP includes AI-assisted search, chat, field extraction, CV parsing, translation, and moderation support. Output may be inaccurate or incomplete. It is not professional, legal, financial, or academic advice. You remain responsible for anything you publish or act on based on it. Content submitted to these features is processed by the providers listed in section 6 of the Privacy Policy.

## 9. Moderation and enforcement

We may remove content, restrict features, suspend or terminate accounts, and report to authorities, where we reasonably believe these Terms or the law have been breached, or where safeguarding requires it. Where practical we give notice and a route to appeal at `[PRIVACY CONTACT EMAIL]`. Safeguarding cases involving minors may be acted on immediately without prior notice.

## 10. Third-party services and integrations

Sign-in providers, the OECS Virtual Campus and Commons, video calls, and partner APIs are governed by their own terms. We are not responsible for their availability or conduct.

## 11. Availability

KTIP is provided **"as is"** and **"as available"**. We do not warrant uninterrupted or error-free operation, and we may change, suspend, or discontinue features. Planned maintenance is announced where practical.

## 12. Limitation of liability

To the maximum extent permitted by law, `[LEGAL ENTITY]` is not liable for indirect, incidental, special, consequential, or punitive damages, nor for lost profits, lost opportunities, lost funding, or data loss. Nothing in these Terms limits liability for death or personal injury caused by negligence, for fraud, or for anything else that cannot be limited by law.

## 13. Indemnity

You will indemnify `[LEGAL ENTITY]` against claims arising from your content, your use of the platform, or your breach of these Terms.

## 14. Termination

You may delete your account at any time in **Settings → Account**. Sections 5 (existing licences), 12, 13, and 15 survive termination.

## 15. Governing law

These Terms are governed by the laws of `[GOVERNING JURISDICTION]`, and its courts have exclusive jurisdiction, without prejudice to any mandatory consumer-protection rights in your country of residence.

## 16. Changes

We may amend these Terms. Material changes are announced in-app and by email at least **14 days** in advance. Continued use after that date is acceptance.

## 17. Contact

`[LEGAL ENTITY]` · `[REGISTERED ADDRESS]` · `[PRIVACY CONTACT EMAIL]`

---

## Implementation checklist (delete before publishing)

- [ ] Counsel review against each OECS member state's data-protection act
- [ ] Fill every `[BRACKET]` placeholder
- [ ] Name a data-protection contact/office
- [ ] Confirm the analytics and moderation retention periods
- [ ] Add routes `/privacy` and `/terms`, and link both from the footer and sign-up step 1
- [ ] Add a sign-up consent checkbox recording acceptance (timestamp + version)
- [ ] Publish a records-of-processing entry and confirm processor DPAs are on file
- [ ] Add a guardian-consent path for members below the local consent age
