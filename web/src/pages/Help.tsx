import { Link } from 'react-router'
import { copyText } from '../lib/clipboard'
import { Button, Card, useToast } from '../components/ui'

function CopyBlock({ label, code }: { label: string; code: string }): React.ReactNode {
  const toast = useToast()
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="label">{label}</span>
        <Button
          type="button"
          variant="ghost"
          onClick={async () => {
            const ok = await copyText(code)
            toast(ok ? 'Copied' : 'Copy failed, select the text and copy it manually')
          }}
        >
          Copy
        </Button>
      </div>
      <pre className="code">{code}</pre>
    </div>
  )
}

function Section({
  index,
  title,
  children,
}: {
  index: string
  title: string
  children: React.ReactNode
}): React.ReactNode {
  return (
    <Card className="space-y-4">
      <div className="flex items-baseline gap-3 border-b border-[var(--line)] pb-3">
        <span className="label">{index}</span>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </Card>
  )
}

const TOKEN_CURL = `curl -H "Authorization: Bearer hk_..." \\
  https://recipes.example/api/recipes?q=soup`

const TOKEN_CREATE = `curl -X POST https://recipes.example/api/tokens \\
  -H "Authorization: Bearer hk_..." \\
  -H "content-type: application/json" \\
  -d '{"name":"laptop-cli","expiresInDays":90}'`

const RECIPE_CURL = `curl -X POST https://recipes.example/api/recipes \\
  -H "Authorization: Bearer hk_..." \\
  -H "content-type: application/json" \\
  -d '{
    "title": "Weeknight Pasta",
    "servings": 4,
    "tags": ["pasta"],
    "ingredients": [{"rawText": "400 g flour"}, {"rawText": "2 eggs"}],
    "steps": [{"text": "Mix and rest."}]
  }'`

const MCP_JSON = `{
  "mcpServers": {
    "herrku": {
      "command": "node",
      "args": ["/absolute/path/to/herrku/mcp/dist/index.js"],
      "env": {
        "HERRKU_URL": "https://recipes.example",
        "HERRKU_TOKEN": "hk_..."
      }
    }
  }
}`

const MCP_ENV = `HERRKU_URL=https://recipes.example \\
HERRKU_TOKEN=hk_... \\
node mcp/dist/index.js`

const TOOLS: Array<[string, string]> = [
  ['search_recipes', 'Search by title or ingredient text, filter by tags, paginate.'],
  ['get_recipe', 'Fetch one recipe by slug with ingredients and steps.'],
  ['create_recipe', 'Create a recipe from structured fields or raw ingredient lines.'],
  ['update_recipe', 'Replace a recipe by slug.'],
  ['list_tags', 'List tags with counts.'],
  ['build_shopping_list', 'Merge selected recipes with servings into copyable text.'],
]

export default function HelpPage(): React.ReactNode {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="border-b border-[var(--line)] pb-4">
        <p className="label">Reference</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">API and MCP</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          Two ways to use herrku outside the browser. Personal tokens authenticate plain HTTP
          clients; the bundled MCP server gives AI clients the same access through six tools.
        </p>
      </header>

      <Section index="01" title="Personal API tokens">
        <p className="text-sm leading-relaxed text-[var(--text-soft)]">
          A token is a password for scripts. It belongs to one account and inherits that
          account&apos;s role. The secret is shown once, stored only as a hash, and can be revoked
          at any time from the account page. You can also set an expiry.
        </p>

        <ol className="space-y-2 text-sm text-[var(--text-soft)]">
          <li>
            <span className="label mr-2">1</span>Open{' '}
            <Link to="/account" className="link">
              Account
            </Link>{' '}
            and find <span className="mono text-xs">API tokens</span>.
          </li>
          <li>
            <span className="label mr-2">2</span>Create a token with a name, pick an expiry, copy
            the secret.
          </li>
          <li>
            <span className="label mr-2">3</span>Send it as{' '}
            <span className="mono text-xs">Authorization: Bearer hk_...</span>.
          </li>
        </ol>

        <CopyBlock label="Search with a token" code={TOKEN_CURL} />
        <CopyBlock label="Create a token from the CLI" code={TOKEN_CREATE} />
        <CopyBlock label="Create a recipe with a token" code={RECIPE_CURL} />

        <ul className="space-y-1.5 border-t border-[var(--line)] pt-3 text-sm text-[var(--muted)]">
          <li>Bearer requests do not need cookies or an Origin header.</li>
          <li>Expired, revoked, or disabled-user tokens return 401.</li>
          <li>Rate limits are tracked per token, not per cookie session.</li>
          <li>Tokens have the same permissions as the account. There are no scopes yet.</li>
        </ul>
      </Section>

      <Section index="02" title="Endpoints">
        <p className="text-sm text-[var(--muted)]">
          Every route below accepts a bearer token in place of the session cookie. JSON in, JSON
          out; errors use <span className="mono text-xs">{'{ error: { code, message } }'}</span>.
        </p>
        <div className="well overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)]">
                <th className="label px-3 py-2">Method</th>
                <th className="label px-3 py-2">Path</th>
                <th className="label px-3 py-2">Purpose</th>
              </tr>
            </thead>
            <tbody className="text-[var(--text-soft)]">
              {[
                ['GET', '/api/recipes', 'List or search recipes'],
                ['POST', '/api/recipes', 'Create a recipe'],
                ['GET', '/api/recipes/:slug', 'Full recipe document'],
                ['PUT', '/api/recipes/:slug', 'Replace a recipe'],
                ['POST', '/api/recipes/:slug/image', 'Upload a photo (multipart)'],
                ['GET', '/api/tags', 'Tags with counts'],
                ['POST', '/api/shopping-list', 'Merge recipes into a list'],
                ['GET', '/api/tokens', 'List your tokens'],
                ['POST', '/api/tokens', 'Create a token'],
                ['DELETE', '/api/tokens/:id', 'Revoke a token'],
                ['GET', '/api/auth/me', 'Current account'],
              ].map(([method, path, purpose]) => (
                <tr key={`${method}${path}`} className="border-b border-[var(--line)] last:border-0">
                  <td className="mono px-3 py-2 text-xs text-[var(--accent)]">{method}</td>
                  <td className="mono px-3 py-2 text-xs">{path}</td>
                  <td className="px-3 py-2 text-xs text-[var(--muted)]">{purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section index="03" title="MCP server">
        <p className="text-sm leading-relaxed text-[var(--text-soft)]">
          <span className="mono text-xs">mcp/</span> is a stdio MCP server over the same REST API.
          It reads two environment variables and has no other auth: the token you give it decides
          what it can do. Create a dedicated token per client and revoke it when you are done.
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="well p-3">
            <p className="label">HERRKU_URL</p>
            <p className="mt-1 text-sm text-[var(--text-soft)]">Base URL of the instance</p>
          </div>
          <div className="well p-3">
            <p className="label">HERRKU_TOKEN</p>
            <p className="mt-1 text-sm text-[var(--text-soft)]">Personal token (hk_...)</p>
          </div>
        </div>

        <CopyBlock label="Client configuration" code={MCP_JSON} />
        <CopyBlock label="Run the server directly" code={MCP_ENV} />

        <div className="well overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)]">
                <th className="label px-3 py-2">Tool</th>
                <th className="label px-3 py-2">Does</th>
              </tr>
            </thead>
            <tbody className="text-[var(--text-soft)]">
              {TOOLS.map(([tool, description]) => (
                <tr key={tool} className="border-b border-[var(--line)] last:border-0">
                  <td className="mono px-3 py-2 text-xs text-[var(--accent)]">{tool}</td>
                  <td className="px-3 py-2 text-xs text-[var(--muted)]">{description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="border-t border-[var(--line)] pt-3 text-sm text-[var(--muted)]">
          The server runs locally next to the client. It is not part of the web container. Remote
          MCP hosting with OAuth is not implemented; for that, the token would be replaced by an
          OAuth 2.1 flow.
        </p>
      </Section>

      <Section index="04" title="Housekeeping">
        <ul className="space-y-1.5 text-sm text-[var(--muted)]">
          <li>Revoke any token you no longer use. Revocation takes effect on the next request.</li>
          <li>Disabling an account invalidates all of its tokens and sessions immediately.</li>
          <li>Use one token per client so you can revoke one without disturbing the others.</li>
          <li>Tokens are shown once. If you lose one, revoke it and create another.</li>
        </ul>
      </Section>
    </div>
  )
}
