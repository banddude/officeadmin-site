# OfficeAdmin.io — Landing Page Brief

Working folder for designing the officeadmin.io landing page and figuring out
what OfficeAdmin actually is as a product.

Reference image in this folder: `mockup-aiva-original.png` — a hand-drawn
sketch of an AIVA landing page that Mike made first. The conversation that
produced this brief was a critique of that mockup and a pivot toward a
different product framing.

---

## The product decision

**OfficeAdmin is the product. AIVA is the engine inside it.**

- The customer buys "OfficeAdmin." That's the brand on the site, the invoice,
  the support email.
- AIVA stays as the engine. Maybe a "Powered by AIVA" footer line, maybe
  invisible entirely.
- This is the right move because:
  - "AIVA" alone reads as a personal-assistant product, a crowded category
    where the competitor is ChatGPT + integrations.
  - "OfficeAdmin" reads as a business back-office product, a category where
    nobody is shipping a credible AI offering yet.
  - The domain name (officeadmin.io) already tells you which audience to
    serve. Listen to it.

## Positioning

**One-line:** "The AI office admin for small business."

**Punchier alternate:** "Hire OfficeAdmin. Skip the $60k salary."

**Subhead direction:** It reads your email, drafts your replies, sends your
invoices, books your calls, and chases your payments — so you can run your
business instead of your inbox.

The frame is **virtual employee**, not chatbot. The buyer should think
"this replaces the office admin I can't afford to hire," not "this is
ChatGPT with integrations."

## Target customer

Small business owners — solo contractors, electricians, plumbers, designers,
service businesses with 1-20 people. People who:

- Can't afford a $50-70k/year office admin, or don't want to manage one.
- Are drowning in inbox + invoicing + scheduling + follow-ups.
- Already use QuickBooks, Gmail, Calendar, iMessage (the tools OfficeAdmin
  plugs into).
- Compare the price not to ChatGPT Plus ($20/mo) but to hiring help
  ($3-5k/mo). 10-50x pricing power vs. a solopreneur tier.

Mike is the proof point — he runs Shaffer Construction on this stack.
Frankie at First Phase Electric and Firefly (with Brendan) are secondary
deployments.

**Note:** Maricar is *Mike's* human employee, not part of the product.
For customers who don't have a Maricar (most of them), OfficeAdmin
fills that role.

## Business model — NOT reselling inference

This is a hard constraint. Mike does not want to mark up Anthropic/OpenAI
API calls and resell them. Reasons:

- Margins compress as models get cheaper.
- Heavy users destroy unit economics.
- Customer can always go direct to the API provider.
- You're a commodity reseller of a commodity that wants to be free.

**Model: BYOK SaaS.** Customer brings their own Anthropic/OpenAI API keys.
OfficeAdmin charges a flat monthly subscription for the software,
integrations, and ongoing skill/feature updates. The inference bill is
the customer's problem — predictable margins on our side, no penalty for
power users.

Deployment options to consider:
- **Self-host:** Customer runs OfficeAdmin on a Mac mini in their office
  (like Mike runs AIVA on his AIVA mac). One-time setup, lower trust risk
  for customer because data never leaves their hardware.
- **Hosted tier (later):** For non-technical customers who don't want to
  manage hardware. Modest markup on inference is OK here because it's
  bundled with hosting/ops.

## Differentiation — what makes this not-a-wrapper

The thing nobody else ships:

1. **Trust tiers.** OfficeAdmin classifies every action into three lanes:
   - *Auto-handled:* confirmations, reminders, invoice receipts. Just done.
   - *Drafted for review:* customer questions, scheduling, follow-ups.
     One tap to send.
   - *Sent to you:* anything ambiguous, sensitive, or new. With full
     context attached.

   This is the answer to the #1 objection from a business owner:
   "but what if it sends something wrong?"

2. **Dossier per contact.** Every reply OfficeAdmin drafts is informed by
   full context on the person: history, current job, what they owe,
   communication preferences, who referred them, last contact. Sketch
   this as a card on the page. THIS is what ChatGPT doesn't do.

3. **Deep integrations as workflows, not just connections.** QuickBooks,
   Gmail, Calendar, iMessage, Phone (transcripts), Apple Notes/Reminders.
   Not "connected to QuickBooks" — "sends estimates from QuickBooks,
   follows up on overdue invoices, reconciles payments."

4. **Commitments tracker.** Nothing falls through the cracks because
   OfficeAdmin knows what you owe people and what people owe you, and
   nudges accordingly.

## Landing page structure (next sketch)

In order down the page:

1. **Hero.** Headline + subhead + one CTA (Book a demo). Visual is the
   most important thing here. Skip the "you at the center of the world"
   warmth pattern from the AIVA mockup — too personal for a business
   buyer. Instead: **drowning vs. handled contrast** — chaotic desk
   with 247 unread emails and a ringing phone, vs. the same desk calm
   with one notification "3 drafts ready for your approval."

2. **The trust tiers section.** Three lanes, sketched as columns or
   parallel tracks. This is the differentiator — lead with it, not
   bury it.

3. **"A day with OfficeAdmin."** Walk through a morning concretely.
   7am: coffee, 4 things to approve, 12 things handled overnight.
   9am: customer texts asking for a quote — estimate's drafted with
   their full job history attached by the time you check. 2pm:
   invoice goes out automatically when you mark the job complete.
   Makes abstract concrete.

4. **What it knows about your business.** The dossier card. "Bob
   Henderson — kitchen remodel, $14k, last contact Tuesday, owes
   $4k, prefers texts, hates morning calls, referred by Susan."
   Every reply is informed by this. This is the moat.

5. **Integrations.** QuickBooks, Gmail, Google Calendar, iMessage,
   Phone (transcripts), Apple Notes/Reminders. "Works with the
   tools you already use."

6. **Proof.** "Built and battle-tested in a real Los Angeles
   electrical contractor. Used daily by Shaffer Construction."
   Mike is his own testimonial. One real number if available
   ("handles 200+ messages a week so I don't have to").

7. **Privacy / control.** BYOK. Runs on your hardware (Mac mini
   in your office) or hosted. Your data never trains anyone's
   model. You approve what gets sent until you tell it not to.
   This earns trust with paranoid-about-AI business owners.

8. **Pricing teaser + CTA.** "Starts at $X/mo. Setup in a weekend."
   Book a call.

## Things to NOT put on the page

- The "70+ skills" pattern from the AIVA mockup. Business owners don't
  care about skill count — they care about outcomes. Frame as jobs done,
  not capabilities listed.
- "You are the center of your world" warmth. Right for AIVA-as-personal,
  wrong for OfficeAdmin-as-business-tool. The vibe is competent and
  calm, not warm and friend-shaped.
- Generic AI testimonials ("AIVA is like a smart partner who knows me").
  If you use testimonials, use them from real contractors or solo
  business owners with real numbers.
- Anything that sounds like a personal-life assistant — no "habit
  tracking," no "travel planning," no "goal tracking" tiles. Those
  are fine for AIVA-the-personal-tool, wrong for OfficeAdmin.

## Visual direction

Hand-drawn sketch aesthetic from the AIVA mockup still works — it says
"small business, human-scale" and differentiates from every other SaaS
landing page using gradients and 3D illustrations. Just dial the
warmth down a notch and the credibility up a notch. Less "your AI
friend," more "your virtual employee who shows up early."

## What already exists in AIVA that powers this

This is not a greenfield product. Most of OfficeAdmin already exists as
working code in `~/.aiva` and `~/AIVA`. The productization work is
mostly packaging, multi-tenancy, and a clean install path — not
rebuilding the underlying system.

Relevant existing AIVA modules / skills that map to OfficeAdmin features:

- **comms-pipeline** — the comms triage and drafting engine. Scans
  inbox, routes items, drafts on full model with cross-channel
  verification, tier-classifies, auto-sends Tier 1, surfaces Tier 3
  for review. This IS the trust-tier feature.
- **drafts** — pending-drafts review system. Same pipeline, the
  review side.
- **dossier / entity-context / know** — the "everything known about a
  person/company/job/property/topic" lookup. Bridges CRM, MemPalace,
  tasks, drafts, commitments, session notes. This IS the dossier
  feature.
- **mempalace / memory-graph** — Neo4j-backed knowledge graph for
  persistent memory. The substrate for the dossier feature.
- **commitments / waiton / waiting-on** — dependency-chain tracking
  ("Mike is waiting on X before he can respond to Y"). This IS
  the commitments-tracker feature.
- **quickbooks** — QuickBooks Online integration (customers, invoices,
  estimates, items).
- **google** — Gmail, Calendar, Drive, Sheets, Docs, Tasks.
- **imessage** — real-time iMessage read/send.
- **contacts / icalendar / reminders / notes** — Apple Contacts,
  Calendar, Reminders, Notes.
- **conversations** — voice memo transcripts with speaker ID.
- **identity** — cross-source person resolution (one canonical record
  per human across CRM, MemPalace, email, phone).
- **akaunting / mikeshaffer / shaffer** — the business management
  layer (dashboard, tasks, work records, comms, money, calendar).
- **pipeline** — same as comms-pipeline (alias).

Infrastructure:
- Runs on `aiva` (Mac mini in Mike's office) with sync to laptop.
- Public surface at officeadmin.io is currently infra: MCP server
  (`mcp.officeadmin.io`), n8n (`officeadmin.io/mcp/misc/sse`), file
  sharing (`files.officeadmin.io`).
- For OfficeAdmin-the-product, this same domain becomes the marketing
  + signup surface, with the infrastructure paths moved to subdomains
  or stayed where they are.

## Open questions to decide before building

- Software company or service company? Mike has indicated software /
  BYOK, but worth being explicit.
- Pricing: $200/mo? $500/mo? Tiered by integrations? By contact
  volume? By number of customers in CRM?
- Single-tenant install on customer's Mac mini, or hosted multi-tenant,
  or both? Single-tenant is simpler and Mike already has the install
  path nearly working; multi-tenant is a bigger lift but higher
  ceiling.
- Brand relationship: "OfficeAdmin" alone, or "OfficeAdmin by Shaffer"
  / similar? What's the parent company name on the legal docs?
- What's the first vertical to lead with on the page? "For
  electrical contractors" is the easiest pitch (Mike is the demo),
  but limits the TAM. "For small service businesses" is broader but
  vaguer. Could lead with electrical and broaden over time.
- What's the actual demo flow at a book-a-demo call? Mike's own
  Shaffer setup, or a sanitized sandbox?
