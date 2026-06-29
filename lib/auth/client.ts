"use client";

import { createAuthClient } from "@neondatabase/auth/next";

/** Client-side Neon Auth instance for the provider and `useSession()` (ADR-0001). */
export const authClient = createAuthClient();
