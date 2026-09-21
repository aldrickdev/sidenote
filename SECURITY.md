# Security policy

## Reporting a vulnerability

Please use GitHub's **Report a vulnerability** workflow in the repository's Security tab so details remain private. If private vulnerability reporting is unavailable, open a minimal issue asking the maintainer to enable a private reporting channel. Do not publish exploit details or sensitive user data in an issue.

Security reports should include reproduction steps and the affected version, but must not include real bookmarks, exported Sidenote backups, browsing history, Chrome profile data, credentials, or access tokens. Use synthetic `example.com` data instead.

## Data and permission scope

Sidenote stores its library locally in the user's Chrome profile. It has no account system, backend, analytics, or cloud sync. Exported backups are plain-text JSON and can contain private URLs and notes, so they should never be attached to public issues or committed to this repository.

The extension requests `sidePanel`, `storage`, and `tabs`. Per-site HTTP(S) access is optional and requested only when fetching a pasted page's title. See [README.md](README.md#permissions-and-privacy) for details.

## Credential exposure

Run `npm run check:public` before committing. This is a heuristic check, not a guarantee. If a credential is exposed, revoke or rotate it immediately; deleting it in a later commit does not remove it from Git history.
