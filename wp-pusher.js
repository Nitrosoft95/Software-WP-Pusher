/**
 * Softoto WordPress Version Pusher
 * 
 * Reads versions.json, compares against old-versions.json,
 * pushes changed versions to WordPress, and sends a Telegram summary.
 */

const fs = require('fs');
const path = require('path');

// ─── Configuration ───────────────────────────────────────────────
const WP_SITE_URL = (process.env.WP_SITE_URL || '').replace(/\/+$/, '');
const WP_TRACKER_TOKEN = process.env.WP_TRACKER_TOKEN || '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

const VERSIONS_FILE = path.join(__dirname, 'versions.json');
const OLD_VERSIONS_FILE = path.join(__dirname, 'old-versions.json');
const OVERRIDES_FILE = path.join(__dirname, 'overrides.json');
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'last-push.log');

const PLATFORMS = ['windows', 'mac', 'ios', 'android'];

// ─── Logging ─────────────────────────────────────────────────────
const logLines = [];

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  logLines.push(line);
}

function saveLog() {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(LOG_FILE, logLines.join('\n') + '\n', 'utf8');
  } catch (err) {
    console.error('Failed to save log file:', err.message);
  }
}

// ─── File helpers ────────────────────────────────────────────────
function readJSON(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// ─── Version comparison ──────────────────────────────────────────
/**
 * Clean a version string for numeric comparison.
 * Returns an array of numbers, or null if unparseable.
 */
function cleanVersion(raw) {
  if (raw == null || raw === '') return null;
  let v = String(raw).trim();

  // Remove leading v/V
  v = v.replace(/^[vV]/, '');

  // Remove trailing letter suffixes like -beta, -alpha, -rc, b, a
  v = v.replace(/[-_]?(beta|alpha|rc)\d*$/i, '');
  v = v.replace(/[ba]$/i, '');

  // Remove build strings after - or _
  v = v.replace(/[-_].+$/, '');

  // Split by dot
  const parts = v.split('.');
  const nums = [];
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (isNaN(n)) return null; // unparseable
    nums.push(n);
  }
  if (nums.length === 0) return null;
  return nums;
}

/**
 * Compare two version strings.
 * Returns: 'changed' | 'same' | 'older' | 'needs_review'
 */
function compareVersions(newVer, oldVer) {
  // First time seeing this software — treat as changed
  if (oldVer == null || oldVer === '') return 'changed';

  const newParts = cleanVersion(newVer);
  const oldParts = cleanVersion(oldVer);

  if (newParts === null || oldParts === null) return 'needs_review';

  const maxLen = Math.max(newParts.length, oldParts.length);
  for (let i = 0; i < maxLen; i++) {
    const a = i < newParts.length ? newParts[i] : 0;
    const b = i < oldParts.length ? oldParts[i] : 0;
    if (a > b) return 'changed';
    if (a < b) return 'older';
  }
  return 'same';
}

// ─── WordPress API ───────────────────────────────────────────────
async function pushToWordPress(payload) {
  const url = `${WP_SITE_URL}/wp-json/softoto/v1/update-version`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tracker-Token': WP_TRACKER_TOKEN,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.text();
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    json = { raw: body };
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(json)}`);
  }

  return json;
}

// ─── Telegram API ────────────────────────────────────────────────
async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    log('Telegram not configured — skipping notification');
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      log(`Telegram send failed: HTTP ${response.status} — ${err}`);
    } else {
      log('Telegram message sent successfully');
    }
  } catch (err) {
    log(`Telegram send error: ${err.message}`);
  }
}

// ─── Main processing ─────────────────────────────────────────────
async function main() {
  const startTime = Date.now();
  const runDate = new Date();
  const dateStr = runDate.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const timeStr = runDate.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

  log('=== Softoto WordPress Pusher — Run Started ===');
  log(`Date: ${dateStr} — ${timeStr}`);

  // ── Validate secrets ──
  if (!WP_SITE_URL) {
    log('FATAL: WP_SITE_URL secret is not set');
    await sendTelegram('🚨 <b>Softoto Pusher FAILED</b>\nWP_SITE_URL secret is missing.');
    saveLog();
    process.exit(1);
  }
  if (!WP_TRACKER_TOKEN) {
    log('FATAL: WP_TRACKER_TOKEN secret is not set');
    await sendTelegram('🚨 <b>Softoto Pusher FAILED</b>\nWP_TRACKER_TOKEN secret is missing.');
    saveLog();
    process.exit(1);
  }

  // ── Read versions.json ──
  let versionsData;
  try {
    versionsData = readJSON(VERSIONS_FILE);
    if (!versionsData || !versionsData.software) {
      throw new Error('versions.json is missing or has no "software" key');
    }
    log(`Loaded versions.json — generated at: ${versionsData.generated_at || 'unknown'}`);
  } catch (err) {
    log(`FATAL: Cannot read versions.json — ${err.message}`);
    await sendTelegram(`🚨 <b>Softoto Pusher FAILED</b>\nCannot read versions.json: ${err.message}`);
    saveLog();
    process.exit(1);
  }

  // ── Read old-versions.json ──
  let oldVersions;
  try {
    oldVersions = readJSON(OLD_VERSIONS_FILE) || {};
    log(`Loaded old-versions.json — ${Object.keys(oldVersions).length} software tracked`);
  } catch {
    oldVersions = {};
    log('old-versions.json not found or invalid — treating all as first-time entries');
  }

  // ── Read overrides.json ──
  let overrides;
  try {
    overrides = readJSON(OVERRIDES_FILE) || {};
    const overrideCount = Object.keys(overrides).length;
    if (overrideCount > 0) log(`Loaded overrides.json — ${overrideCount} overrides active`);
  } catch {
    overrides = {};
  }

  // ── Processing ──
  const softwareEntries = versionsData.software;
  const slugs = Object.keys(softwareEntries);
  log(`Processing ${slugs.length} software entries...`);

  // Tracking arrays for the Telegram summary
  const updated = [];      // { name, platforms: ['Windows v1.2.3', ...] }
  const unchanged = [];    // { name }
  const warnings = [];     // { name, message }
  const securityAlerts = []; // { name, message }

  // New old-versions to save at the end
  const newOldVersions = { ...oldVersions };

  for (const slug of slugs) {
    let entry = softwareEntries[slug];
    const name = entry.software_name || slug;

    log(`\n--- ${name} (${slug}) ---`);

    // Check for overrides
    if (overrides[slug]) {
      log(`  Override found for ${slug} — merging override data`);
      const override = overrides[slug];
      // Deep merge: override platforms into entry platforms
      if (override.platforms) {
        entry = {
          ...entry,
          platforms: { ...entry.platforms, ...override.platforms },
        };
      }
      // Override top-level fields
      for (const key of Object.keys(override)) {
        if (key !== 'platforms') {
          entry[key] = override[key];
        }
      }
    }

    // Validate post_id
    const postId = entry.post_id;
    if (!postId) {
      log(`  WARNING: No post_id for ${name} — skipping WordPress update`);
      warnings.push({ name, message: 'no post_id — skipped' });
      continue;
    }

    // Check security alerts
    if (entry.security_alert) {
      log(`  🚨 SECURITY ALERT: ${entry.security_alert}`);
      securityAlerts.push({ name, message: entry.security_alert });
    }

    const platforms = entry.platforms || {};
    const oldSoftware = oldVersions[slug] || {};
    const changedPlatforms = {};
    const platformSummary = [];
    let anyVersionChanged = false;
    let softwareHasWarning = false;

    // Process each platform independently
    for (const platform of PLATFORMS) {
      const platformData = platforms[platform];
      if (!platformData) continue; // platform not present for this software

      const newVer = platformData.version;
      const oldVer = oldSoftware[platform] || null;

      const result = compareVersions(newVer, oldVer);
      const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);

      log(`  ${platformLabel}: new="${newVer}" old="${oldVer}" → ${result}`);

      if (result === 'changed') {
        anyVersionChanged = true;
        platformSummary.push(`${platformLabel} v${newVer}`);

        // Build the changed platform payload
        changedPlatforms[platform] = {
          version: platformData.version,
          build: platformData.build || null,
          release_date: platformData.release_date || null,
          file_size: platformData.file_size || null,
          download_url: platformData.download_url || null,
          changelog_summary: platformData.changelog || null,
          confidence: platformData.confidence || null,
          old_version: oldVer || null,
          old_build: null, // We don't store old build in old-versions.json
          old_date: null,  // We don't store old date in old-versions.json
        };

        // Update tracking for next run
        if (!newOldVersions[slug]) newOldVersions[slug] = {};
        newOldVersions[slug][platform] = newVer;

      } else if (result === 'same') {
        // Keep existing tracking
        if (!newOldVersions[slug]) newOldVersions[slug] = {};
        newOldVersions[slug][platform] = oldVer;

      } else if (result === 'older') {
        warnings.push({
          name,
          message: `${platformLabel}: new version ${newVer} appears older than current ${oldVer} — skipped`,
        });
        softwareHasWarning = true;
        // Keep old version in tracking
        if (!newOldVersions[slug]) newOldVersions[slug] = {};
        newOldVersions[slug][platform] = oldVer;

      } else if (result === 'needs_review') {
        warnings.push({
          name,
          message: `${platformLabel}: version format unreadable (new="${newVer}", old="${oldVer}") — skipped`,
        });
        softwareHasWarning = true;
        // Keep old version in tracking
        if (!newOldVersions[slug]) newOldVersions[slug] = {};
        if (oldVer) newOldVersions[slug][platform] = oldVer;
      }
    }

    // ── Build and send WordPress payload ──
    // Global fields are always sent. Changed platforms only when versions changed.
    const globalFields = {};
    if (entry.min_req_windows != null) globalFields.min_req_windows = entry.min_req_windows;
    if (entry.min_req_mac != null) globalFields.min_req_mac = entry.min_req_mac;
    if (entry.min_req_ios != null) globalFields.min_req_ios = entry.min_req_ios;
    if (entry.min_req_android != null) globalFields.min_req_android = entry.min_req_android;
    if (entry.software_status != null) globalFields.software_status = entry.software_status;
    if (entry.days_since_update != null) globalFields.days_since_update = entry.days_since_update;

    const hasChangedPlatforms = Object.keys(changedPlatforms).length > 0;
    const hasGlobalFields = Object.keys(globalFields).length > 0;

    if (hasChangedPlatforms || hasGlobalFields) {
      const payload = {
        post_id: postId,
        changed_platforms: hasChangedPlatforms ? changedPlatforms : {},
        global_fields: globalFields,
        update_post_date: anyVersionChanged,
      };

      try {
        const result = await pushToWordPress(payload);
        log(`  WordPress update OK: ${JSON.stringify(result)}`);
      } catch (err) {
        log(`  WordPress update FAILED: ${err.message}`);
        warnings.push({ name, message: `WordPress update failed: ${err.message}` });
      }
    }

    // ── Track summary ──
    if (anyVersionChanged) {
      updated.push({ name, platforms: platformSummary });
    } else if (!softwareHasWarning) {
      unchanged.push({ name });
    }
  }

  // ── Save new old-versions.json ──
  writeJSON(OLD_VERSIONS_FILE, newOldVersions);
  log(`\nSaved old-versions.json — ${Object.keys(newOldVersions).length} software tracked`);

  // ── Send security alerts immediately (separate messages) ──
  for (const alert of securityAlerts) {
    await sendTelegram(
      `🚨 <b>Security Alert — ${alert.name}</b>\n${alert.message}`
    );
  }

  // ── Build Telegram summary ──
  let summary = `✅ <b>Softoto Update Complete</b>\n${dateStr} — ${timeStr}\n`;

  if (updated.length > 0) {
    summary += `\n<b>Updated (version changed):</b>\n`;
    for (const u of updated) {
      summary += `• ${u.name} — ${u.platforms.join(', ')}\n`;
    }
  }

  if (unchanged.length > 0) {
    summary += `\n<b>No changes detected:</b>\n`;
    for (const u of unchanged) {
      summary += `• ${u.name} — all platforms unchanged\n`;
    }
  }

  if (warnings.length > 0) {
    summary += `\n<b>⚠️ Warnings:</b>\n`;
    for (const w of warnings) {
      summary += `• ${w.name} — ${w.message}\n`;
    }
  }

  if (securityAlerts.length > 0) {
    summary += `\n<b>🚨 Security Alerts:</b>\n`;
    for (const a of securityAlerts) {
      summary += `• ${a.name}: ${a.message}\n`;
    }
  }

  const totalChecked = slugs.length;
  const totalUpdated = updated.length;
  const totalUnchanged = unchanged.length;
  const totalWarnings = warnings.length;
  summary += `\nTotal: ${totalChecked} software checked | ${totalUpdated} updated | ${totalUnchanged} unchanged | ${totalWarnings} warnings`;

  await sendTelegram(summary);

  // ── Finish ──
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`\n=== Run Complete — ${elapsed}s elapsed ===`);
  saveLog();
}

// ── Execute ──────────────────────────────────────────────────────
main().catch(async (err) => {
  log(`FATAL UNHANDLED ERROR: ${err.message}`);
  log(err.stack);
  await sendTelegram(`🚨 <b>Softoto Pusher CRASHED</b>\n${err.message}`);
  saveLog();
  process.exit(1);
});
