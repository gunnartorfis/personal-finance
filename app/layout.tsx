import { NeonAuthUIProvider } from "@neondatabase/auth-ui"
import { NextIntlClientProvider } from "next-intl"
import { getLocale } from "next-intl/server"
import { Geist_Mono, Inter } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { authClient } from "@/lib/auth/client"
import { cn } from "@/lib/utils"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable
      )}
    >
      <body>
        <NextIntlClientProvider>
          <ThemeProvider>
            {/* Account-scoped views (profile, security) live under the app Settings hub rather than a
              standalone /account tree: basePath "/settings" + the SETTINGS view path "account" put
              them at /settings/account and /settings/security, and Neon Auth's own tab links resolve
              there too. */}
            <NeonAuthUIProvider
              authClient={authClient}
              emailOTP
              account={{
                basePath: "/settings",
                viewPaths: { SETTINGS: "account" },
              }}
            >
              {children}
            </NeonAuthUIProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
