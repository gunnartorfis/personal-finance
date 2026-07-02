import { HouseholdManager } from "@/components/household-manager"
import { getDb } from "@/lib/db"
import { requireHousehold } from "@/lib/household/current"
import { MEMBER_CAP } from "@/lib/household/invites"
import { listMembersWithIdentity } from "@/lib/household/members-view"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/**
 * Household members & invites (ADR-0010): the screen where a Household lists its Members, invites
 * new ones (Premium-gated, capped), revokes pending invites, and where a Member leaves or deletes
 * the Household. Identity for the member list comes from Neon Auth's `users_sync` (see
 * `listMembersWithIdentity`); everything mutating runs through `/api/household/*`.
 */
export default async function HouseholdPage() {
  const { householdId, plan, repo, user } = await requireHousehold()
  const [members, invites] = await Promise.all([
    listMembersWithIdentity(getDb(), householdId),
    repo.invites.listActive(),
  ])

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Household</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Everyone here shares one combined financial picture. Invite the people you share money
          with — up to {MEMBER_CAP} in total.
        </p>
      </header>
      <HouseholdManager
        plan={plan}
        cap={MEMBER_CAP}
        currentUserId={user.id}
        initialMembers={members.map((m) => ({
          id: m.id,
          authUserId: m.authUserId,
          name: m.name,
          email: m.email,
        }))}
        initialInvites={invites.map((i) => ({
          id: i.id,
          email: i.email,
          expiresAt: i.expiresAt.toISOString(),
        }))}
      />
    </div>
  )
}
