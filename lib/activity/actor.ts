/**
 * The identity fields the Activity log needs to attribute an action. Structurally matches the
 * signed-in session user (which carries `name`/`email`), so routes can pass `user` directly.
 */
export interface ActorIdentity {
  name?: string | null;
  email?: string | null;
}

/** Last-resort label when an actor has neither a name nor an email (should be rare). */
const UNKNOWN_ACTOR = "Unknown member";

/**
 * The denormalized display name stored on an Activity log entry (ADR-0017): the actor's name, else
 * their email, else a constant. Snapshotted at record time so a departed Member's history stays
 * readable after their `members`/identity row is gone.
 */
export function resolveActorName(identity: ActorIdentity): string {
  return identity.name?.trim() || identity.email?.trim() || UNKNOWN_ACTOR;
}
