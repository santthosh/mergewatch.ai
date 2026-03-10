import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * NextAuth.js route handler (App Router).
 *
 * This single file handles every auth-related route:
 *   /api/auth/signin
 *   /api/auth/callback/github
 *   /api/auth/signout
 *   /api/auth/session
 */
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
