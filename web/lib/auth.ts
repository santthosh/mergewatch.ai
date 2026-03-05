import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";

/**
 * Shared NextAuth configuration.
 *
 * Exported from a standalone module so it can be imported by both the
 * route handler and any server-side helpers that need the session.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      // Request the scopes MergeWatch needs:
      //   read:user — basic profile info
      //   repo     — read access to repos for review orchestration
      authorization: { params: { scope: "read:user repo" } },
    }),
  ],

  callbacks: {
    /**
     * Persist the GitHub access token inside the JWT so we can use it
     * in API routes to call the GitHub API on behalf of the user.
     */
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },

    /**
     * Expose the access token on the client-side session object.
     */
    async session({ session, token }) {
      (session as any).accessToken = token.accessToken;
      return session;
    },
  },
};
