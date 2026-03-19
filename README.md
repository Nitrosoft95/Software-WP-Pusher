# Softoto WordPress Version Pusher

Automatically push software version data from a JSON file to your WordPress site.

---

## What This System Does

You maintain a file called `versions.json` that contains the latest version numbers, download links, and changelogs for all the software on your Softoto website.

Every time you upload a new `versions.json` to this GitHub repository, a GitHub Action automatically:

1. **Reads** the new version data
2. **Compares** it against the previous version data (stored in `old-versions.json`)
3. **Updates WordPress** — only for software where the version number actually changed
4. **Saves** the current versions for next time
5. **Sends you a Telegram message** summarizing exactly what happened

You never need to manually update WordPress. Just upload `versions.json` and everything happens automatically.

---

## Repository Files Explained

| File | What it does |
|---|---|
| `versions.json` | The file you upload with the latest software data. This triggers the whole process. |
| `old-versions.json` | Automatically maintained. Stores the version numbers from the last run so the system knows what changed. **Don't edit this manually.** |
| `overrides.json` | Optional. If the version checker got something wrong, you can put the correct data here and it will be used instead. |
| `wp-pusher.js` | The main script that does all the work. You never need to edit this. |
| `.github/workflows/push-to-wordpress.yml` | The GitHub Action that runs the script automatically. You never need to edit this. |
| `logs/last-push.log` | A detailed log of the most recent run. Useful for troubleshooting. |
| `package.json` | Tells Node.js what the project needs. You never need to edit this. |

---

## Setup Guide

### Step 1: Add GitHub Actions Secrets

These are private values that the system needs to connect to your WordPress site and Telegram.

1. Go to your GitHub repository
2. Click **Settings** (top menu bar)
3. Click **Secrets and variables** → **Actions** (left sidebar)
4. Click **New repository secret**
5. Add each of these four secrets one at a time:

| Secret Name | Value |
|---|---|
| `WP_SITE_URL` | Your WordPress site URL. Currently: `https://springgreen-gazelle-675211.hostingersite.com` |
| `WP_TRACKER_TOKEN` | The secret token you set up in your WordPress custom endpoint plugin |
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token (from BotFather) |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID |

**Important:** Make sure there are no spaces before or after the values when you paste them.

### Step 2: Make Sure the WordPress Endpoint Is Ready

Before running the pusher, your WordPress site needs the custom REST API endpoint installed and working. Visit this URL in your browser to confirm:

```
https://springgreen-gazelle-675211.hostingersite.com/wp-json/softoto/v1/update-version
```

You should see a response (even if it's an error about missing token — that's fine, it means the endpoint exists).

### Step 3: Upload versions.json

Simply commit and push a new `versions.json` file to the `main` branch. The workflow will start automatically.

---

## How the Workflow Triggers

### Automatic trigger
Every time you push a commit that changes `versions.json` on the `main` branch, the workflow runs automatically. You don't need to do anything extra.

### Manual trigger
You can also run it manually anytime:

1. Go to your GitHub repository
2. Click **Actions** (top menu bar)
3. Click **Push Versions to WordPress** in the left sidebar
4. Click the **Run workflow** button (right side)
5. Click the green **Run workflow** button in the dropdown

This is useful for testing or re-running after fixing an issue.

---

## How to Read the Telegram Summary

After every run, you'll receive a Telegram message like this:

```
✅ Softoto Update Complete
March 19, 2026 — 17:05

Updated (version changed):
• NordVPN — Windows v7.59.1.0, Android v5.4.3
• Avast — Windows v26.2.10802

No changes detected:
• CyberGhost VPN — all platforms unchanged

⚠️ Warnings:
• Kaspersky — Windows: new version 21.14 appears older than current 21.15 — skipped

Total: 12 software checked | 2 updated | 8 unchanged | 1 warnings
```

**Updated** = these were pushed to WordPress.
**No changes** = version numbers were the same, so nothing was touched.
**Warnings** = something looked wrong and was skipped — you may need to check these manually.

If there are **Security Alerts**, you'll also receive a separate urgent message for each one.

---

## How to Use overrides.json

If the version checker reported wrong data for a specific software, you can override it.

### Example: Fix a wrong Windows version for NordVPN

Edit `overrides.json`:

```json
{
  "nordvpn": {
    "platforms": {
      "windows": {
        "version": "7.60.0.0",
        "build": null,
        "release_date": "March 20, 2026",
        "file_size": "~60 MB",
        "download_url": "https://nordvpn.com/download/windows/",
        "confidence": "high",
        "changelog": "<ul><li>Manually corrected version.</li></ul>"
      }
    }
  }
}
```

The override data will be used **instead of** whatever is in `versions.json` for that software/platform.

**After it's fixed in a future versions.json**, remove the override by resetting the file to `{}`.

---

## Switching to a New Domain

When you're ready to move from the temporary Hostinger URL to your real domain:

1. **Update the secret**: Go to GitHub → Settings → Secrets → Actions → Edit `WP_SITE_URL` → Change it to your new domain (e.g., `https://softoto.com`)

2. **Confirm the endpoint works**: Visit `https://softoto.com/wp-json/softoto/v1/update-version` in your browser to make sure it responds.

3. **Re-save permalinks**: In WordPress admin, go to **Settings → Permalinks** and click **Save Changes** (even without changing anything). This rebuilds the URL routing.

4. **Run the workflow manually** to confirm everything connects properly.

---

## How to Check If a Run Succeeded

1. Go to your GitHub repository
2. Click **Actions** (top menu bar)
3. You'll see a list of recent runs:
   - ✅ **Green checkmark** = everything worked
   - ❌ **Red X** = something failed — click on it to see the error details
   - 🟡 **Yellow circle** = still running

Click on any run to see the full log output.

---

## Common Errors and How to Fix Them

### "WP_SITE_URL secret is missing"
You haven't added the `WP_SITE_URL` secret yet. Go to Settings → Secrets → Actions and add it.

### "HTTP 401" or "HTTP 403" from WordPress
The `WP_TRACKER_TOKEN` doesn't match what your WordPress endpoint expects. Double-check the token value in both GitHub secrets and your WordPress plugin.

### "HTTP 404" from WordPress
The custom endpoint doesn't exist on your WordPress site. Make sure the Softoto endpoint plugin is installed and activated. Try visiting the URL in your browser.

### "Cannot read versions.json"
The file is missing or has invalid JSON. Open it in a JSON validator (like jsonlint.com) to check for syntax errors.

### "version format unreadable"
The version string has an unusual format that can't be compared numerically. Check the version in your versions.json and fix it, or use overrides.json.

### "new version appears older than current"
The new version number is lower than what's currently tracked. This usually means the version checker found outdated data. Verify the actual version and use overrides.json if needed.

### Telegram messages not arriving
Check that `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are correct. Make sure you've started a conversation with your bot in Telegram first.

### Git push fails at the end
The workflow needs write permissions to push `old-versions.json` back. This is already configured in the workflow file, but if you're using a fork or have branch protection rules, you may need to adjust repository settings.

---

## Technical Details

- **Runtime**: Node.js 20 (uses built-in `fetch`, no external dependencies)
- **Comparison**: Only version number changes trigger a WordPress update — other field changes alone are ignored
- **Global fields**: `min_req_*`, `software_status`, and `days_since_update` are always sent to WordPress regardless of version changes
- **History**: When a version changes, the old version is added to the history repeater before updating
- **Null safety**: Null fields in versions.json are never sent to WordPress (existing values are preserved)
- **Error isolation**: One software failing never crashes the entire run — the script always continues to the next
