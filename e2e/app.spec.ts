import { expect, test, type Page } from '@playwright/test'

async function signIn(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible()
}

test('creates a recipe, finds it by search, and copies a shopping list', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await signIn(page, 'admin', 'admin-password-123')

  await page.getByRole('link', { name: 'New recipe' }).click()
  await page.getByLabel('Title').fill('E2E Pancakes')
  await page.getByLabel('Servings').fill('4')

  const raw = page.getByLabel('Ingredient 1 raw line')
  await raw.fill('200 g flour')
  await raw.blur()
  await expect(page.getByLabel('Ingredient 1 unit')).toHaveValue('g')
  await expect(page.getByLabel('Ingredient 1 name')).toHaveValue('flour')

  await page.getByLabel('Add tag').fill('breakfast')
  await page.getByLabel('Add tag').press('Enter')
  await page.getByLabel('Step 1 text').fill('Mix and fry.')

  await page.getByRole('button', { name: 'Create recipe' }).click()
  await expect(page.getByRole('heading', { name: 'E2E Pancakes' })).toBeVisible()
  await expect(page.getByText('200 g flour')).toBeVisible()

  await page.getByRole('link', { name: 'Recipes', exact: true }).click()
  await page.getByLabel('Search recipes').fill('pancake')
  await expect(page.getByRole('heading', { name: 'E2E Pancakes' })).toBeVisible()

  await page.getByRole('link', { name: 'Shopping list' }).click()
  const pancakes = page.getByRole('checkbox', { name: /E2E Pancakes/ })
  await pancakes.click()
  await expect(pancakes).toBeChecked()
  const preview = page.getByLabel('Shopping list text')
  await expect(preview).toHaveValue(/200 g flour/)
  await page.getByRole('button', { name: 'Copy' }).click()
  await expect(page.getByRole('status')).toHaveText('Shopping list copied')

  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboard).toContain('200 g flour')
})

test('admin invites a new member who can sign in and read the shared library', async ({
  browser,
  baseURL,
}) => {
  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await signIn(adminPage, 'admin', 'admin-password-123')

  await adminPage.getByRole('link', { name: 'Admin' }).click()
  await adminPage.getByRole('button', { name: 'Invite' }).click()

  const linkInput = adminPage.getByLabel('One-time link')
  await expect(linkInput).toBeVisible()
  const inviteLink = await linkInput.inputValue()
  expect(inviteLink).toContain('/invite/')
  await adminContext.close()

  const inviteeContext = await browser.newContext()
  const inviteePage = await inviteeContext.newPage()
  await inviteePage.goto(inviteLink.replace(baseURL ?? '', ''))
  await inviteePage.getByLabel('Username').fill('newfriend')
  await inviteePage.getByLabel('Password').fill('new-friend-password-1')
  await inviteePage.getByRole('button', { name: 'Create account' }).click()

  await expect(inviteePage.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await inviteePage.getByLabel('Username').fill('newfriend')
  await inviteePage.getByLabel('Password').fill('new-friend-password-1')
  await inviteePage.getByRole('button', { name: 'Sign in' }).click()

  await expect(inviteePage.getByRole('heading', { name: 'Recipes' })).toBeVisible()
  await expect(inviteePage.getByRole('heading', { name: 'Tomato Soup' })).toBeVisible()
  await inviteeContext.close()
})

test('falls back to manual copy when the clipboard api is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    document.execCommand = () => false
  })

  await signIn(page, 'admin', 'admin-password-123')
  await page.getByRole('link', { name: 'Shopping list' }).click()
  const pahkina = page.getByRole('checkbox', { name: /Pähkinäleipä/ })
  await pahkina.click()
  await expect(pahkina).toBeChecked()
  await page.getByRole('button', { name: 'Copy' }).click()

  await expect(page.getByRole('status')).toHaveText(
    'Copy failed — select the text and copy manually',
  )
})

test('help page documents tokens and the MCP server', async ({ page }) => {
  await signIn(page, 'admin', 'admin-password-123')
  await page.getByRole('link', { name: 'Help' }).click()

  await expect(page.getByRole('heading', { name: 'API and MCP' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Personal API tokens' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'MCP server' })).toBeVisible()
  await expect(page.getByText('HERRKU_TOKEN', { exact: true })).toBeVisible()
})

test('creates a personal API token in the UI and uses it with bearer auth', async ({
  page,
  request,
}) => {
  await signIn(page, 'admin', 'admin-password-123')
  await page.getByRole('link', { name: 'Account' }).click()

  await page.getByLabel('Token name').fill('e2e-agent')
  await page.getByRole('button', { name: 'Create token' }).click()

  const secret = await page.getByLabel('New API token').inputValue()
  expect(secret).toMatch(/^hk_/)

  const tokenRow = page.getByRole('listitem').filter({ hasText: 'e2e-agent' })

  const listed = await request.get('/api/recipes', {
    headers: { authorization: `Bearer ${secret}` },
  })
  expect(listed.status()).toBe(200)

  const created = await request.post('/api/recipes', {
    headers: { authorization: `Bearer ${secret}` },
    data: { title: 'Agent Recipe', ingredients: [], steps: [{ text: 'Serve.' }] },
  })
  expect(created.status()).toBe(201)

  await tokenRow.getByRole('button', { name: 'Revoke' }).click()
  await tokenRow.getByRole('button', { name: 'Revoke', exact: true }).click()
  await expect(page.getByText('No API tokens yet.')).toBeVisible()

  const afterRevoke = await request.get('/api/recipes', {
    headers: { authorization: `Bearer ${secret}` },
  })
  expect(afterRevoke.status()).toBe(401)
})
