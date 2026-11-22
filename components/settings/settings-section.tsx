"use client"

import { isReverificationCancelledError } from "@clerk/nextjs/errors"
import { CircleAlert } from "lucide-react"
import { useId, useState, type ReactNode } from "react"

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-base font-medium">
          {title}
        </h2>
        {description && (
          <p className="text-sm text-pretty text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  )
}

export function SettingsFeedback({
  error,
  success,
}: {
  error?: string
  success?: string
}) {
  if (error) {
    return (
      <p
        role="alert"
        className="flex items-start gap-2 text-sm text-destructive"
      >
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {error}
      </p>
    )
  }
  return (
    <p role="status" className="text-sm text-muted-foreground empty:hidden">
      {success}
    </p>
  )
}

export function useSettingsAction() {
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState<{
    error?: string
    success?: string
  }>({})

  async function run(
    action: () => Promise<void>,
    error: string | ((cause: unknown) => string),
    success?: string
  ) {
    if (pending) return
    setPending(true)
    setFeedback({})
    try {
      await action()
      setFeedback({ success })
    } catch (cause) {
      if (!isReverificationCancelledError(cause)) {
        setFeedback({
          error: typeof error === "function" ? error(cause) : error,
        })
      }
    } finally {
      setPending(false)
    }
  }

  return { pending, feedback, run }
}
