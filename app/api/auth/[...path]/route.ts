import { auth } from "@/lib/auth/server";

// Neon Auth's catch-all handler: sign-in/out, callbacks, session endpoints.
export const { GET, POST } = auth.handler();
