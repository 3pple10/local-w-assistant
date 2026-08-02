# Connector pricing (as of 2026)

Use these numbers as a baseline. Verify with a web search if the page might be stale — providers change pricing often.

Skip `LOVABLE_API_KEY` — it ships with every Lovable project, no setup needed.

| Connector | Detect via env / URL | Free tier | Paid entry | Typical template usage |
|---|---|---|---|---|
| Firecrawl | `FIRECRAWL_API_KEY` | 500 credits on signup, no card | Hobby $16/mo (3,000 credits) | 1–5 credits per page scrape — stays free for casual use |
| Resend | `RESEND_API_KEY` | 3,000 emails/mo, 100/day | Pro $20/mo (50k emails) | Free unless sending real product email |
| Stripe | `STRIPE_SECRET_KEY` | Free to integrate | 2.9% + $0.30 per charge | Free until you process payments |
| Twilio | `TWILIO_AUTH_TOKEN` | Trial credit on signup | Pay-as-you-go per SMS / call | Cents per message after trial |
| OpenAI direct | `OPENAI_API_KEY` | $5 free credit (new accounts) | Pay-as-you-go per token | Skip — recommend Lovable AI Gateway instead |
| Anthropic direct | `ANTHROPIC_API_KEY` | Limited free credit | Pay-as-you-go | Skip — recommend Lovable AI Gateway instead |
| ElevenLabs | `ELEVENLABS_API_KEY` | 10k characters/mo | Starter $5/mo (30k chars) | Free for demos |
| Slack | `SLACK_API_KEY` | Free workspace | Workspace plans vary | Free for connector use |
| Notion | `NOTION_API_KEY` via gateway | Free Notion account | N/A for API | Free |
| Linear | `LINEAR_API_KEY` | Free for small teams | Standard $8/user/mo | Free for connector use |
| Airtable | `AIRTABLE_API_KEY` | Free tier (1k records/base) | Team $20/user/mo | Free for small templates |
| Google * (Drive, Sheets, Calendar, Docs, Maps) | `GOOGLE_*_API_KEY` | Generous free quotas | Pay-as-you-go above quotas | Almost always free for personal use |
| Mapbox / Maps | `MAPBOX_TOKEN` | 50k loads/mo | Pay-per-load above | Free for hobby sites |
| Perplexity | `PERPLEXITY_API_KEY` | Limited free queries | Pay-per-query | Free for low volume |
| Inngest | `INNGEST_*` | Free tier (50k runs/mo) | Pro $20/mo | Free for most templates |

## Detection patterns

Grep the project for:

```bash
rg -l "API_KEY|AUTH_TOKEN|SECRET" src/server src/lib supabase 2>/dev/null
rg "connector-gateway\.lovable\.dev/([a-z_]+)/" -or '$1' src/ | sort -u
rg "process\.env\.([A-Z_]+)" -or '$1' src/server src/lib 2>/dev/null | sort -u
```

## Estimation method

1. Identify the primary action the template performs (one extraction? one email? one image gen?)
2. Find how many connector calls that action makes.
3. Multiply by a realistic monthly volume for a hobby user (10–50 actions/mo).
4. Compare to the free tier. If 10× hobby usage still fits free, say "stays free for casual use." If not, give the paid tier honestly.

Always cite real numbers. Never write "affordable" or "reasonably priced" without a dollar figure.