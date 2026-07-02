import type { ReactNode } from "react"

import { SettingsNav } from "@/components/settings-nav"

/**
 * Settings hub shell: a persistent left navigation (see {@link SettingsNav}) with the active section
 * rendered on the right, so every `/settings/*` route shares one layout — the same two-column shape
 * Neon Auth's account view uses. Each section page self-guards (requireHousehold / requireUser); the
 * `/settings` index redirects to `/settings/account`.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
        <SettingsNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}
