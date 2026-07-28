# PRD: Channel analytics history

Linear: TSE-384. Related: TSE-379 (Bluesky post analytics), TSE-380 (LinkedIn
post analytics), TSE-383 (Threads connect). Fork-only: upstream stores no
analytics, this doc describes what our fork does.

## Why

The analytics tab exists to answer one question: is a channel growing? A
trend line answers it, a single number does not. For the channels this
instance posts to (X, Threads, Bluesky, LinkedIn personal), the platform APIs
return no usable history: ask today and you get today's totals, nothing
behind them. (Threads views is the one exception, a real per-day series the
tab already draws; every other Threads metric is a range total. LinkedIn has
a follower-count API but it sits behind a partner-only permission that
self-serve apps cannot get.) A number that is not written down when it is
current is gone. So the system records channel metrics every day, and the
tab draws its lines from those records. History exists from the first
recorded day; it can never be backfilled. That is also the why-now: every
day before the recorder ships is a day of trend line lost forever.

## Metric classes

Every metric a provider reports belongs to exactly one class. The class is
declared on the provider interface per metric, so generic code never names a
platform (repo rule).

- **daily**: the platform API returns one value per calendar day (Facebook,
  LinkedIn Page, Pinterest, YouTube, GMB, Instagram follower_count and
  reach, Threads views: the one Threads metric Meta serves as a time
  series, and this code path already receives it). Served straight from the
  API, as today.
- **lifetime**: a counter over the whole account life (TikTok follower,
  following, likes, video counts; X profile counts; Bluesky follower count
  when it lands). Recorded once a day. The tab draws the recorded series, and
  the percentage change is the real change across the visible range.
- **windowed**: one aggregate over the requested range, such as "likes on
  posts in the last 7 days" (X engagement totals, Instagram total_value
  metrics, Threads likes, replies, reposts, and quotes: each comes back as
  one total over the range, only views gets a series). Recorded
  once a day per window the tab offers. The tab draws the rolling value over
  time: a window-7 series shows trailing-7-day engagement, day by day.
  Windowed values are never subtracted from each other; the difference of
  two overlapping windows means nothing.
- **recent-content**: an aggregate over the provider's own basket of recent
  posts, not a calendar range (TikTok sums over its last 20 videos, whatever
  range is requested). Recorded once a day under a single key; the label
  makes clear it covers recent posts, not a date window. Never recorded per
  tab window: that would store the same value under two keys and dress a
  basket up as a calendar range.

## Storage

One table, `IntegrationAnalytics`: one row per integration, metric label,
window, and calendar day. Fields: integrationId (FK), date (calendar day),
label (the provider's metric label), window (days; 0 for lifetime and
recent-content metrics, which the label tells apart), total, createdAt,
updatedAt. Unique on [integrationId, label, date, window]; writes are
upserts, so a re-record of the same day overwrites itself and duplicates are
impossible. Last write of the day wins, so a lifetime counter carries up to
a day of time-of-day jitter depending on when the last writer ran; accepted,
not a bug. Mirrors the `Star` table shape ([login, date] daily rows).
Additive table, no upstream schema touched, low merge risk.

## Collection

Two writers feed the same table through one code path:

- The read path. When the tab fetches fresh analytics (Redis cache miss),
  the fetched values for lifetime, windowed, and recent-content metrics are
  upserted for today before the response returns. Anyone looking at the tab
  is also recording. What is recorded is the aggregate total per metric,
  never the data points a provider fabricates for chart shape (X emits a
  synthetic two-point 0-to-total series; only the total is real).
- A daily recorder. An infinite Temporal workflow (new workflow file,
  registered behind `RUN_CRON`, copying the missingPostWorkflow pattern, the
  one workflow that register runs today) wakes once a day and calls that
  same read path for every enabled integration whose provider reports
  lifetime, windowed, or recent-content metrics, once per window the tab
  offers that provider. Daily-only providers are skipped: the write-through
  stores nothing for them, so a recorder pass would spend their API quota
  for zero rows. No separate fetch code: token refresh and provider dispatch
  are the read path's, reused.

The analytics cache key includes the current UTC calendar day. Today the key
is org, integration, and window only, with a 1 hour TTL, so a recorder
firing just after midnight can hit a cache warmed at 23:40 and record
nothing for the new day. With the day in the key, a new day is always a
cache miss and both writers always produce the day's row. The recorder never
uses forceRefresh, which exists to force the token refresh path.

Recorder rules:

- Skips integrations that are disabled, deleted, mid-connection
  (inBetweenSteps), or flagged as needing a token refresh (the same skip
  list as the existing refresh workflow).
- Runs in a recorder mode threaded through checkAnalytics and the refresh
  service: a token refresh failure in this mode is logged and the
  integration skipped until the next day. It never disconnects the channel
  and never notifies the user; those side effects stay on the user-facing
  path. This mode is a new flag, not current behavior: today a refresh
  failure disconnects and notifies, and non-refresh fetch errors are
  swallowed silently. The recorder logs both.
- Wakes at a fixed UTC time by sleeping until the next occurrence, not by
  sleeping a fixed duration, so restarts shift the wake time by minutes,
  not days. The read side still tolerates missing days and draws through
  gaps: API failures leave them regardless.

## Reading

- daily metrics: live from the platform API, unchanged.
- lifetime, windowed, and recent-content metrics: from the stored series for
  the requested range. Fewer than two stored points: serve the live single
  point (the chart already duplicates a lone point into a flat line). While
  the stored span is shorter than the requested range, the drawn line and
  the percentage change cover the stored span only; a 30 day request two
  days after launch shows a 2 day line, honestly.
- Aggregation follows the class. Daily series sum (a sum of per-day values
  is a real total), except metrics flagged average, which average: YouTube's
  average view duration and percentage carry that flag today, the card
  headline respects it, and the chart's bucket merge sums them anyway, a
  standing bug this rule closes. Lifetime, windowed, and recent-content
  series aggregate
  by last value everywhere a series is collapsed: the chart's bucket
  merging and the card headline both currently sum, which would show 30
  snapshots of a follower count as roughly 30 times the followers. Snapshots
  collapse to the most recent value, never a sum.
- Series totals are numbers, not strings, end to end. This touches the
  provider interface (total is typed string today), every provider, and the
  two frontend reduces that survive on accidental coercion. Percentage
  change is computed from the served series; the per-provider hardcoded
  values (5, 0, or absent) go away.

## Decisions

1. **Record daily, through the existing read path.** Alternatives weighed:
   recording only when someone opens the tab (no worker) leaves holes on
   every day nobody looks, and a single-user instance looks most days at
   nothing; recording only the platforms whose APIs lack history keeps two
   read paths forever and, for the channels this instance uses, covers the
   same set anyway; a stand-alone fetch worker re-implements token refresh
   and provider dispatch that the read path already has. Daily recorder
   calling the shared path is the smallest version that leaves no holes.
2. **X records what its credit budget affords.** X pricing is pay per use
   (per-read pricing with a monthly cap; the old free tier is gone).
   Engagement metrics need timeline reads (one request per 100 posts, plus a
   lookup) every day per window, which multiplies cost; a profile-counts
   read is one cheap request a day. So the recorder stores X profile counts
   (followers, post count) by default, and engagement windows are recorded
   only if a monthly credit budget for them is explicitly funded. Confirm
   the account's pricing mode and budget before build. The X provider's
   analytics path has no profile-counts request today (its me-lookups live
   in authenticate), so that fetch is new provider work, not a reuse.
   `DISABLE_X_ANALYTICS` remains the kill switch.
3. **Bluesky and LinkedIn personal come later, on this storage.** Neither
   reports account metrics today and neither shows in the tab. Bluesky is
   cheap: the client's profile call already returns a follower count,
   currently unused. LinkedIn personal has no self-serve follower API (the
   official one is partner-gated), so its follower count is a Voyager
   scraping job in the shape of the post analytics work, or it stays out.
   The tab shell also hardcodes a provider allow-list and a per-platform
   window map, so adding either channel means editing those, not just the
   provider. Separate ticket once the recorder ships, scoped to all of the
   above.

## Rollout

- `RUN_CRON` must be set in the m1srv env or the recorder never starts (the
  backend process reads it at boot).
- The m1srv compose must run the fork image; it pins the upstream image
  until bumped (`machines/m1srv/services/postiz/docker-compose.yml`).
