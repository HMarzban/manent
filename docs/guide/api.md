# Public API and notifications

External scripts and studio tools can read a workspace's folders and scripts over HTTP using a workspace API key, and workspace owners can send comment notifications to a custom webhook, Slack or email.

## API keys

Workspace owners create and revoke keys in **Workspace settings → API keys**. Other workspace members can view the list of keys (name, creation date, last-used time and revoked status), never the secret.

- **Shown once.** A new key begins with `mk_` and is shown only when it is created. Copy and store it straight away; the server keeps only its SHA-256 hash.
- **Read-only workspace scope.** A key reads only its own workspace's live folders, projects and documents. It cannot change anything, and it never sees Trash, a person's Private folder (`user:` homes), deleted documents or any other workspace. Requests for those answer `404`.
- **Key authentication only.** Send `Authorization: Bearer <key>` on every `/api/v1/` request. User session tokens are refused with `401`.
- **Immediate revocation.** Revoking a key in Workspace settings stops it immediately and clears its rate-limit bucket.

## Endpoints

The examples below assume the server is running locally on `$MANENT_PORT` (default `4747`). Replace `<key>` with your workspace API key.

### List a folder

`GET /api/v1/folder` lists the child folders, projects and live documents at a folder level. Omit `folderId` to list the workspace's top level.

```sh
curl -sS -H "Authorization: Bearer <key>" \
  "http://localhost:$MANENT_PORT/api/v1/folder?folderId=<folder-id>"
```

Responds `200` with JSON (`application/json`):

```json
{
  "folders": [{ "folderId": "...", "name": "Film — Production" }],
  "projects": [
    {
      "projectId": "...",
      "title": "Every Key But One",
      "documents": [{ "docId": "...", "title": "Script", "kind": "script" }]
    }
  ]
}
```

Folders, projects and documents are sorted alphabetically by name. Trashed and Private items are omitted.

### Read script lines

`GET /api/v1/lines?docId=<doc-id>` returns the committed blocks of a document in order.

```sh
curl -sS -H "Authorization: Bearer <key>" \
  "http://localhost:$MANENT_PORT/api/v1/lines?docId=<doc-id>"
```

Responds `200` with JSON (`application/json`):

```json
{
  "docId": "...",
  "lines": [
    {
      "id": "...",
      "type": "scene_heading",
      "text": "INT. HARBOUR OFFICE - NIGHT"
    },
    {
      "id": "...",
      "type": "action",
      "text": "Rain taps against the tall windows."
    }
  ]
}
```

### Export Final Draft XML (FDX)

`GET /api/v1/fdx?docId=<doc-id>` exports a `script` document as Final Draft XML (`application/xml; charset=utf-8` with `Content-Disposition: attachment`).

```sh
curl -sS -H "Authorization: Bearer <key>" \
  "http://localhost:$MANENT_PORT/api/v1/fdx?docId=<doc-id>" \
  -o script.fdx
```

The exported FDX carries the script's elements, notes and preserved import details, without production revision marks or locked page labels (`production: null`). Requesting a document whose kind is not `script` answers `415`.

### Compile an Ink story

`GET /api/v1/ink?docId=<doc-id>` compiles an `ink` document and returns the compiled Ink story JSON (`application/json; charset=utf-8`).

```sh
curl -sS -H "Authorization: Bearer <key>" \
  "http://localhost:$MANENT_PORT/api/v1/ink?docId=<doc-id>"
```

Requesting a document whose kind is not `ink` answers `415`. If the Ink source cannot be compiled, the server answers `422`.

## Status codes and refusals

Refusals return a JSON object naming the code:

| Status | Code               | Meaning                                                                                       |
| ------ | ------------------ | --------------------------------------------------------------------------------------------- |
| `401`  | `unauthenticated`  | Missing `Authorization: Bearer` header, user session token, unknown key or revoked key        |
| `404`  | `not_found`        | Unknown `folderId` or `docId`, or a document in Trash, Private, deleted or another workspace  |
| `415`  | `unsupported_kind` | `/api/v1/fdx` on a non-`script` document, or `/api/v1/ink` on a non-`ink` document            |
| `422`  | `invalid`          | `/api/v1/ink` on an Ink document whose source does not compile                                |
| `429`  | `rate_limited`     | Per-key rate limit reached; read the `Retry-After` header (whole seconds) before trying again |

## Rate limit

Each API key has its own token bucket: **1 request a second** sustained, with a **burst of 30**. Exceeding the bucket answers `429` with `Retry-After` in whole seconds (at least `1`). Revoking a key removes its bucket.

## Notifications

Workspace owners can turn on comment notifications in **Workspace settings → Notifications** for a custom webhook, Slack or email. Notifications fire only for comments on live workspace scripts — never for documents in a person's Private folder (`user:` homes).

### Delivery and retries

Every adapter sends with a **10-second** per-attempt timeout. If the destination does not answer with a `2xx` status or times out, the server retries after **1, 5, 30, 120 and 720 minutes**, stopping after **6 tries** in total.

### Webhook

Configure any `http://` or `https://` URL. The server sends an HTTP `POST` with `Content-Type: application/json`:

```json
{
  "type": "person_mentioned",
  "workspaceId": "medium",
  "docId": "...",
  "title": "The Long Night",
  "threadId": "...",
  "itemId": "...",
  "authorUserId": "dana",
  "authorName": "Dana Reyes",
  "mentionedUserIds": ["sam"],
  "text": "Can we tighten the harbour scene?",
  "url": "http://127.0.0.1:4747/s/...",
  "at": 1760000000000
}
```

The `type` field is one of three values:

- `thread_opened` — a new comment thread was started on the script.
- `reply_added` — a reply was posted to an existing thread.
- `person_mentioned` — one or more workspace members were mentioned (`mentionedUserIds` lists them).

### Slack

Configure a Slack incoming webhook URL beginning with `https://hooks.slack.com/`. The server posts `{ "text": "..." }` containing the headline, quoted comment body and direct link to the script.

Slack is built against its public API and not verified against a real Slack workspace.

### Email (Resend)

Email notifications send through Resend to one owner-chosen recipient address saved in **Workspace settings → Notifications**. To turn email delivery on, set both `MANENT_RESEND_API_KEY` and `MANENT_RESEND_FROM` when starting the server (see [The server's settings](../development/setup.md#the-servers-settings)). If either variable is unset or blank, email delivery stays off and the Email option in Workspace settings stays unavailable. Stored outbox entries hold only the message subject and body, never credentials.
