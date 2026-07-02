# App-owned Household invites over Neon Auth's organization plugin

Growing a Household beyond its first Member needs an invite mechanism. Neon Auth (Better Auth) ships a full organization plugin — `invite-member`, `accept-invitation`, `list-members`, email — but adopting it would introduce a *second* membership store (org members) that must stay in lock-step with our `members`/`households` rows on every join, leave, and delete. We instead keep the Household DB row as the single source of truth and build a small app-owned invite: a `household_invites` table (hashed token, invited email, `household_id`, inviter, status, expiry) plus an accept step that inserts a `members` row into the *existing* Household. Provisioning (`ensureHouseholdForUser`) is taught to suppress auto-creating a new Household when a pending Invite matches the signing-in user's verified email, so an invited spouse joins rather than getting a stray empty Household.

## Considered Options

- **Neon Auth organization plugin** — rejected: duplicates the membership model, forces sync/reconciliation between two systems, and drags in org create/slug/role machinery that a v1 "all Members equal, one Household per Member" model doesn't use. Its main win (built-in email) is deferred anyway — v1 delivers the invite as a copyable link.

## Consequences

- Inviting requires **Premium** and is capped (10 Members incl. pending Invites); a joined Member carries no classification budget of their own (the joined Household's Plan governs), so Invites can't manufacture extra **Free cap** allowance.
- A user who already belongs to a Household must exit it before redeeming — joining a second Household is rejected, not auto-resolved (one Household per Member, v1). This makes two net-new capabilities hard dependencies (today only a dev-gated data reset exists): **Leave** (available only when other Members remain — you exit, data stays) and **Delete Household** (the sole/last Member's only exit — removes the tenant and cascades all data behind an explicit confirm). There is no auto-delete on leaving.
- Member identity (name/email) for the member list is read by joining `members.auth_user_id` against Neon Auth's synced `neon_auth.users_sync` table — not denormalized onto `members` and not fetched per-request from the admin API. Requires `users_sync` enabled on the Neon project. The strict-match check on redeem reads the invitee's **verified** email from the live session, not the sync table.
- Email delivery stays unbuilt in v1 (copyable link); wiring a provider later is additive and does not change the data model.
