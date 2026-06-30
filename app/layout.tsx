import { NeonAuthUIProvider, UserButton } from "@neondatabase/auth-ui"
import Link from "next/link"
import { Geist_Mono, Inter } from "next/font/google"

import "./globals.css"
import { MainNav } from "@/components/main-nav"
import { ThemeProvider } from "@/components/theme-provider"
import { authClient } from "@/lib/auth/client"
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", inter.variable)}
    >
      <body>
        <ThemeProvider>
          <NeonAuthUIProvider authClient={authClient} emailOTP>
            <header className="flex h-14 items-center justify-between border-b px-4">
              <div className="flex items-center gap-6">
                <Link href="/dashboard" className="font-semibold">
                  Finance
                </Link>
                <MainNav />
              </div>
              <UserButton size="icon" />
            </header>
            {children}
          </NeonAuthUIProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
