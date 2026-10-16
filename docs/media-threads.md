Postiz media thread contract

GET /api/public/v1/posts/:id/thread reads the caller organization's root and ordered parts. Each part has id, published, release_id and release_url. The thread has state (pending, failed, published) and can_resume.
POST /api/public/v1/posts/:id/resume requires a durable root receipt and a stopped original workflow. It starts one resume workflow, reuses every saved receipt and posts only missing replies. Repeated calls reuse the running resume workflow. Existing Temporal workflows remain unchanged.
Mastodon settings.visibility accepts public (default), unlisted, private or direct. Both statuses use it. A media-only reply has content "" and media attached. Mastodon status requests use a stable Idempotency-Key derived from the part ID.

Resume does not rewrite a root or accept replacement text. It rejects child IDs,
other organizations, repeating posts, and a thread whose original workflow is
still running. Root failure without a receipt remains blocked. A provider status
request can have an uncertain outcome; Mastodon idempotency protects repeated
requests while its key is retained. Check Mastodon before retrying an uncertain
reply after that retention window.
