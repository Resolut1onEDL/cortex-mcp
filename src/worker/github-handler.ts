import { Hono } from 'hono';
import type { Env } from './env.js';

// OAuthHelpers is injected by OAuthProvider into env
interface OAuthHelpers {
  parseAuthRequest(request: Request): Promise<{ clientId: string; redirectUri: string; state: string; scope: string; codeChallenge?: string; codeChallengeMethod?: string }>;
  completeAuthorization(opts: {
    request: unknown;
    userId: string;
    metadata: { label: string };
    scope: string;
    props: unknown;
  }): Promise<{ redirectTo: string }>;
  lookupClient(clientId: string): Promise<unknown>;
}

type HonoEnv = { Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } };

const app = new Hono<HonoEnv>();

// Step 1: Claude.ai redirects user here to authorize
app.get('/authorize', async (c) => {
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);

  // Store state for CSRF protection
  const stateKey = `oauth_state:${crypto.randomUUID()}`;
  await c.env.OAUTH_KV.put(stateKey, JSON.stringify(oauthReqInfo), { expirationTtl: 600 });

  // Redirect to GitHub OAuth
  const githubUrl = new URL('https://github.com/login/oauth/authorize');
  githubUrl.searchParams.set('client_id', c.env.GITHUB_CLIENT_ID);
  githubUrl.searchParams.set('redirect_uri', new URL('/callback', c.req.url).href);
  githubUrl.searchParams.set('scope', 'read:user user:email');
  githubUrl.searchParams.set('state', stateKey);

  return c.redirect(githubUrl.href);
});

// Step 2: GitHub redirects back here with code
app.get('/callback', async (c) => {
  const code = c.req.query('code');
  const stateKey = c.req.query('state');

  if (!code || !stateKey) {
    return c.text('Missing code or state', 400);
  }

  // Retrieve and validate OAuth request info
  const stored = await c.env.OAUTH_KV.get(stateKey);
  if (!stored) {
    return c.text('Invalid or expired state', 400);
  }
  await c.env.OAUTH_KV.delete(stateKey);
  const oauthReqInfo = JSON.parse(stored);

  // Exchange code for GitHub access token
  const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: new URL('/callback', c.req.url).href,
    }),
  });

  const tokenData = await tokenResp.json() as { access_token?: string; error?: string };
  if (!tokenData.access_token) {
    return c.text(`GitHub token error: ${tokenData.error || 'unknown'}`, 400);
  }

  // Get GitHub user info
  const userResp = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${tokenData.access_token}`,
      'User-Agent': 'cortex-mcp',
    },
  });
  const user = await userResp.json() as { login: string; name: string; email: string };

  // Complete OAuth — props are encrypted and stored in the token
  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: user.login,
    metadata: { label: user.name || user.login },
    scope: oauthReqInfo.scope,
    props: {
      login: user.login,
      name: user.name || user.login,
      email: user.email || '',
      accessToken: tokenData.access_token,
    },
  });

  return c.redirect(redirectTo);
});

export { app as GitHubHandler };
