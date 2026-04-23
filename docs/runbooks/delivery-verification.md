# Delivery Verification — Runbook

## Purpose

Step-by-step guide to verify that the Telegram and Discord alert delivery
channels are correctly wired and that the end-to-end intraday alert flow
works from n8n to the live distribution channels.

---

## Prerequisites

Before running the verification steps you need:

| Requirement | How to get it |
|-------------|---------------|
| **Telegram Bot Token** | Create a bot via [@BotFather](https://t.me/BotFather) and copy the token |
| **Telegram Chat ID** | Send a message to the bot, then call `https://api.telegram.org/bot<TOKEN>/getUpdates` and note the `chat.id` |
| **Discord Webhook URL** | In your Discord server go to **Server Settings → Integrations → Webhooks → New Webhook**, copy the webhook URL |
| **n8n instance running** | Local via `docker compose up` or remote deployment |
| **Cloudflare D1 database** | Provisioned and accessible via `CF_ACCOUNT_ID` and `CF_D1_DATABASE_ID` |
| **CloudflareD1Api credential** | Created in n8n with your `CLOUDFLARE_API_TOKEN` in the Authorization header |
| **TelegramBotApi credential** | Created in n8n with your `TELEGRAM_BOT_TOKEN` |

---

## Step 1 — Configure n8n Variables

Set the following in **n8n Settings → Variables**:

```
TELEGRAM_CHAT_ID          = <your-chat-or-channel-id>
DISCORD_WEBHOOK_URL       = https://discord.com/api/webhooks/<id>/<token>
CF_ACCOUNT_ID             = <cloudflare-account-id>
CF_D1_DATABASE_ID         = <d1-database-id>
```

Also set the workflow ID variables after importing the delivery workflows:

```
INTRADAY_TELEGRAM_WORKFLOW_ID  = <id of 08_telegram_delivery>
INTRADAY_DISCORD_WORKFLOW_ID   = <id of 09_discord_delivery>
```

---

## Step 2 — Configure n8n Credentials

Create or verify these credentials in **n8n Settings → Credentials**:

| Credential name | Type | Config |
|----------------|------|--------|
| `TelegramBotApi` | Telegram API | Bot Token = `TELEGRAM_BOT_TOKEN` |
| `CloudflareD1Api` | Header Auth | Header Name = `Authorization`, Value = `Bearer <CLOUDFLARE_API_TOKEN>` |

---

## Step 3 — Import Workflows

Import the following workflow files into n8n:

```
workflows/n8n/intraday/00_delivery_smoke_test.json
workflows/n8n/intraday/08_telegram_delivery.json
workflows/n8n/intraday/09_discord_delivery.json
workflows/n8n/intraday/12_delivery_retry.json
```

Use the import script if available:

```bash
./scripts/n8n-workflow-import.sh
```

---

## Step 4 — Run the Delivery Smoke Test

1. Open the **Intraday — 00 Delivery Smoke Test** workflow in n8n
2. Click **Execute Workflow** (manual trigger)
3. Inspect the **Collect Results** node output

### Expected outcome

```json
{
  "telegram": { "status": "SUCCESS", "message_id": 12345 },
  "discord":  { "status": "SUCCESS", "message_id": "1234567890" },
  "overall":  "✅ Both channels delivered successfully"
}
```

### Verify in channels

- **Telegram**: Check the target chat/channel for a message with:
  - 🪙 emoji for crypto topic
  - Bold headline
  - Importance bar (🟩🟩🟩⬜⬜)
  - Source link

- **Discord**: Check the target channel for an embed with:
  - Orange sidebar (Bitcoin orange `#F7931A`)
  - Title with emoji and headline
  - Topic, Importance, and Severity fields
  - Footer with source name
  - Timestamp

---

## Step 5 — Run the Full Alert Smoke Test

1. Open the **Intraday — 00 Local Alert Smoke Test** workflow
2. Execute it to write a test alert to D1
3. Note the `alert_id` from the result
4. Open the **Intraday — Orchestrator** workflow
5. Manually trigger it or wait for the next scheduled run

### Expected outcome

- The alert appears in both Telegram and Discord
- The `alerts` table shows `delivered_telegram = 1` and `delivered_discord = 1`
- The `social_publish_log` table has entries for both platforms

### Verify D1 state

```sql
SELECT id, delivered_telegram, delivered_discord
FROM alerts
WHERE id = <alert_id>;
```

```sql
SELECT platform, status, platform_post_id, error_message
FROM social_publish_log
WHERE topic_slug = 'crypto'
ORDER BY created_at DESC
LIMIT 10;
```

---

## Step 6 — Verify Retry Behavior

To test the delivery retry workflow:

1. Temporarily set an invalid `DISCORD_WEBHOOK_URL` in n8n Variables
2. Run the orchestrator — Discord delivery will fail
3. Verify the alert has `delivered_discord = 0` in D1
4. Verify `social_publish_log` has a `failed` entry for Discord
5. Restore the correct webhook URL
6. Run the **Intraday — 12 Delivery Retry** workflow
7. Verify the alert now has `delivered_discord = 1`
8. Verify `social_publish_log` has a new `published` entry

---

## Step 7 — Verify Formatting

### Telegram formatting checks

- [ ] HTML parse mode renders correctly (bold, links)
- [ ] Importance bar shows correct number of filled segments
- [ ] Source link is clickable
- [ ] Special characters in headlines are escaped (`&`, `<`, `>`, `"`)
- [ ] Long messages are truncated to 4096 characters

### Discord formatting checks

- [ ] Embed has correct topic color
- [ ] Title includes topic emoji
- [ ] Importance and Severity fields show correct scores
- [ ] Source URL is clickable when present
- [ ] Timestamp displays correctly
- [ ] Embed description is within 4096 characters

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Telegram returns 401 | Invalid bot token | Regenerate token via @BotFather |
| Telegram returns 400 "chat not found" | Wrong chat ID or bot not added to channel | Verify chat ID; add bot as admin to channel |
| Discord returns 404 | Invalid webhook URL | Recreate webhook in Discord settings |
| Discord returns 429 | Rate limited | Wait and retry; check `waitBetweenTries` setting |
| D1 write fails | Invalid credentials or database ID | Verify `CF_ACCOUNT_ID`, `CF_D1_DATABASE_ID`, and API token |
| Delivery succeeds but `delivered_*` not updated | `Mark Delivered` node failed | Check execution log; verify D1 credentials on that node |
| No messages appear | Workflow not activated or variables not set | Check workflow active status and n8n Variables |

---

## Required n8n Variables — Summary

| Variable | Description |
|----------|-------------|
| `TELEGRAM_CHAT_ID` | Target Telegram chat or channel ID |
| `DISCORD_WEBHOOK_URL` | Discord incoming webhook URL |
| `CF_ACCOUNT_ID` | Cloudflare account ID |
| `CF_D1_DATABASE_ID` | D1 database ID |
| `INTRADAY_TELEGRAM_WORKFLOW_ID` | n8n ID of module 08 |
| `INTRADAY_DISCORD_WORKFLOW_ID` | n8n ID of module 09 |
| `FAILURE_NOTIFIER_WORKFLOW_ID` | n8n ID of the shared failure notifier |

---

## Related Files

| File | Purpose |
|------|---------|
| `workflows/n8n/intraday/08_telegram_delivery.json` | Telegram delivery module |
| `workflows/n8n/intraday/09_discord_delivery.json` | Discord delivery module |
| `workflows/n8n/intraday/12_delivery_retry.json` | Delivery retry module |
| `workflows/n8n/intraday/00_delivery_smoke_test.json` | Delivery smoke test |
| `workflows/n8n/intraday/orchestrator.json` | Orchestrator (fan-out to 08 + 09) |
| `workflows/contracts/intraday_delivery_payload.json` | Delivery payload contract |
| `config/social-publishing.json` | Platform config and limits |
| `db/migrations/0010_social_publish_log.sql` | Delivery log table |
| `schemas/workflow/write_social_publish_log.json` | Delivery log write schema |
