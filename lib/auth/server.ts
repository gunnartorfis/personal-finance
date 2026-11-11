import { currentUser } from "@clerk/nextjs/server"

/** Authoritative Clerk identity; household membership remains in our database. */
export async function getIdentity() {
  const user = await currentUser()
  if (!user) return null
  const email = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId)
  if (!email) return null
  return {
    id: user.id,
    email: email.emailAddress,
    emailVerified: email.verification?.status === "verified",
  }
}
