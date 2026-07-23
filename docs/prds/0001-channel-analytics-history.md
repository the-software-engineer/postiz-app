# PRD: Channel analytics history

Linear: TSE-384. Related: TSE-379 (Bluesky post analytics), TSE-380 (LinkedIn
post analytics), TSE-383 (Threads connect). Fork-only: upstream stores no
analytics, this doc describes what our fork does.

## Why

The analytics tab exists to answer one question: is a channel growing? A
trend line answers it, a single number does not. For the channels this
instance posts to (X, Threads, Bluesky, LinkedIn personal), the platform APIs
return no history: ask today and you get today's totals, nothing behind them.
A number that is not written down when it is current is gone. So the system
records channel metrics every day, and the tab draws its lines from those
records. History exists from the first recorded day; it can never be
backfilled. That is also the why-now: every day before the recorder ships is
a day of trend line lost forever.

## Metric classes

Every metric a provider reports belongs to exactly one class. The class is
declared on the provider interface per metric, so generic code never names a
platform (repo rule).

- **daily**: the platform API returns one value per calendar day (Facebook,
  LinkedIn Page, Pinterest, YouTube, GMB, Instagram follower_count and reach,
  Threads daily metrics). Served straight from the API, as today.
- **lifetime**: a counter over the whole account life (TikTok follower,
  following, likes, video counts; X profile counts; Bluesky follower count
  when it lands). Recorded once a day. The tab draws the recorded series, and
  the percentage change is the real change across the visible range.
- **windowed**: one aggregate over the requested range, such as "likes on
  posts in the last 7 days" (X engagement totals, Instagram and Threads
  total_value metrics, TikTok recent-video sums). Recorded once a day per
  window the tab offers. The tab draws the rolling value over time: a
  window-7 series shows trailing-7-day engagement, day by day. Windowed
  values are never subtracted from each other; the difference of two
  overlapping windows means nothing.

## Storage

One table, `IntegrationAnalytics`: one row per integration, metric label,
window, and calendar day. Fields: integrationId (FK), date (calendar day),
label (the provider's metric label), window (days; 0 for lifetime metrics),
total, createdAt, updatedAt. Unique on [integrationId, label, date, window];
writes are upserts, so a re-record of the same day overwrites itself and
duplicates are impossible. Mirrors the `Star` table shape
([login, date] daily rows). Additive table, no upstream schema touched, low
merge risk.

## Collection

Two writers feed the same table through one code path:

- The read path. When the tab fetches fresh analytics (Redis cache miss),
  the fetched values for lifetime and windowed metrics are upserted for
  today before the response returns. Anyone looking at the tab is also
  recording.
- A daily recorder. An infinite Temporal workflow (new workflow file,
  registered behind `RUN_CRON` like the others) wakes once a day and calls
  that same read path for every enabled integration whose provider reports
  account metrics, once per window the tab offers that provider. No separate
  fetch code: token refresh, provider dispatch, and caching are the read
  path's, reused.

Recorder rules:

- Skips integrations that are disabled, deleted, or flagged as needing a
  token refresh. A recorder run never disconnects a channel and never
  notifies the user; a failed fetch is logged and skipped, tried again next
  day.
- The recorder's clock drifts with restarts (Temporal sleep loop), so the
  read side tolerates missing days and draws through gaps.

## Reading

- daily metrics: live from the platform API, unchanged.
- lifetime and windowed metrics: from the stored series for the requested
  range. Fewer than two stored points: serve the live single point (the
  chart already duplicates a lone point into a flat line).
- Series totals are numbers, not strings, end to end. Percentage change is
  computed from the served series; no hardcoded values.

## Decisions

1. **Record daily, through the existing read path.** Alternatives weighed:
   recording only when someone opens the tab (no worker) leaves holes on
   every day nobody looks, and a single-user instance looks most days at
   nothing; recording only the platforms whose APIs lack history keeps two
   read paths forever and, for the channels this instance uses, covers the
   same set anyway; a stand-alone fetch worker re-implements token refresh
   and provider dispatch that the read path already has. Daily recorder
   calling the shared path is the smallest version that leaves no holes.
2. **X records what its API tier affords.** Engagement metrics need timeline
   reads (one request per 100 posts, plus a lookup), which the X free tier's
   read cap cannot fund daily. On the free tier the recorder stores X profile
   counts only (followers, post count: one cheap request) and the engagement
   metrics stay live-only, synthetic line and all. On a paid tier the
   engagement windows are recorded like any other windowed metric. Confirm
   the tier before build; `DISABLE_X_ANALYTICS` remains the kill switch.
3. **Bluesky and LinkedIn personal come later, on this storage.** Neither
   reports account metrics today and neither shows in the tab. This table
   plus a small account-metrics method per provider (follower counts exist
   in both clients) adds them. Separate ticket once the recorder ships.

## Rollout

- `RUN_CRON` must be set in the m1srv env or the recorder never starts (the
  backend process reads it at boot).
- The m1srv compose must run the fork image; it pins the upstream image
  until bumped (`machines/m1srv/services/postiz/docker-compose.yml`).
