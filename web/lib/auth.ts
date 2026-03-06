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
      // GitHub App OAuth — must pass empty scope to prevent NextAuth
      // from adding default scopes (read:user user:email), which would
      // cause GitHub to issue a regular OAuth token instead of a
      // GitHub App user-to-server token.
      authorization: { params: { scope: "" } },
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
        token.githubUserId = account.providerAccountId;
      }
      return token;
    },

    /**
     * Expose the access token and GitHub user ID on the session object.
     */
    async session({ session, token }) {
      (session as any).accessToken = token.accessToken;
      (session as any).githubUserId = token.githubUserId;
      return session;
    },
  },
};
