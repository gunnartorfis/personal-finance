"use client"

import * as React from "react"
import { Check, Monitor, Moon, Sun } from "lucide-react"
import { useTranslations } from "next-intl"
import { useTheme } from "next-themes"

import { cn } from "@/lib/utils"

type ThemeValue = "system" | "light" | "dark"

const OPTIONS: ReadonlyArray<{ value: ThemeValue; icon: typeof Monitor }> = [
  { value: "system", icon: Monitor },
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
]

type ThemeMenuOptionProps = React.ComponentPropsWithoutRef<"button"> & {
  icon: typeof Monitor
  label: string
  active: boolean
  onSelectTheme: () => void
}

/**
 * A single theme choice, shaped to sit inside the auth-ui `UserButton` dropdown:
 * that menu renders any non-link `additionalLinks` node as `<DropdownMenuItem asChild>`,
 * so this forwards the item's injected props/ref onto a real `<button>` and still runs
 * its own `setTheme` on click (calling the injected `onClick` keeps the menu's
 * close-on-select behaviour).
 */
// react-doctor-disable-next-line react-doctor/only-export-components -- module's public API is the useThemeMenuItems hook; ThemeMenuOption is its private render helper, not a separable non-component value to relocate
function ThemeMenuOption({
  icon: Icon,
  label,
  active,
  onSelectTheme,
  className,
  onClick,
  ref,
  ...props
}: ThemeMenuOptionProps & { ref?: React.Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn("flex w-full items-center gap-2", className)}
      onClick={(event) => {
        onClick?.(event)
        onSelectTheme()
      }}
      {...props}
    >
      <Icon />
      <span className="flex-1 text-left">{label}</span>
      <Check className={cn("size-4", !active && "invisible")} />
    </button>
  )
}

/**
 * System / Light / Dark options for the account dropdown. Returns an array of nodes
 * to spread into the `UserButton` `additionalLinks` prop. No SSR/hydration guard is
 * needed: the dropdown content only mounts once opened (a client interaction well
 * after hydration), by which point next-themes has resolved the persisted `theme`.
 */
export function useThemeMenuItems(): React.ReactNode[] {
  const t = useTranslations("theme")
  const { theme, setTheme } = useTheme()

  return React.useMemo(
    () =>
      OPTIONS.map(({ value, icon }) => (
        <ThemeMenuOption
          key={value}
          icon={icon}
          label={t(value)}
          active={theme === value}
          onSelectTheme={() => setTheme(value)}
        />
      )),
    [t, theme, setTheme],
  )
}
