import { screen } from "@testing-library/react"
import { useTranslations } from "next-intl"
import { describe, expect, it } from "vitest"

import { renderWithIntl } from "@/lib/test/render"

function Probe() {
  const t = useTranslations("common")
  return <span>{t("loading")}</span>
}

describe("renderWithIntl", () => {
  it("provides en messages to client components by default", () => {
    renderWithIntl(<Probe />)
    expect(screen.getByText("Loading…")).toBeInTheDocument()
  })
})
