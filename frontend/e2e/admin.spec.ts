import { expect, test, type Page } from '@playwright/test'

const TOKEN = 'test-token'

function document(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    filename: 'politika-e-pushimeve.md',
    title: 'Politika e Pushimeve dhe e Lejeve',
    version: '1.2',
    owner: 'HR',
    chunk_count: 9,
    indexed: true,
    updated_at: '2026-08-01T10:00:00',
    ...overrides,
  }
}

interface AdminStubs {
  deleted: number[]
  uploads: number
}

/** Stub the document endpoints, honouring the token the way the backend does. */
async function stubAdmin(
  page: Page,
  options: { documents?: ReturnType<typeof document>[]; listStatus?: number } = {},
): Promise<AdminStubs> {
  const state = { documents: options.documents ?? [document()] }
  const stubs: AdminStubs = { deleted: [], uploads: 0 }

  await page.route('**/admin/documents**', async (route) => {
    const request = route.request()
    const token = await request.headerValue('x-admin-token')

    if (!token || token !== TOKEN) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Token-i i administrimit nuk eshte i vlefshem.' }),
      })
    }

    if (request.method() === 'DELETE') {
      const id = Number(new URL(request.url()).pathname.split('/').pop())
      stubs.deleted.push(id)
      state.documents = state.documents.filter((d) => d.id !== id)
      return route.fulfill({ status: 204, body: '' })
    }

    if (request.method() === 'POST') {
      stubs.uploads++
      const added = document({ id: 2, title: 'Politika e Re', filename: 'e-re.md', chunk_count: 4 })
      state.documents = [...state.documents, added]
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ document: added }),
      })
    }

    if (options.listStatus && options.listStatus !== 200) {
      return route.fulfill({
        status: options.listStatus,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Lista e dokumenteve nuk u mor.' }),
      })
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(state.documents),
    })
  })

  return stubs
}

async function signIn(page: Page, token = TOKEN): Promise<void> {
  await page.getByLabel('Token').fill(token)
  await page.getByRole('button', { name: 'Hyr' }).click()
}

test.describe('the admin panel', () => {
  test('asks for a token before showing anything', async ({ page }) => {
    await stubAdmin(page)
    await page.goto('/admin')

    await expect(page.getByText('Vendos token-in e administrimit per te vazhduar.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Hyr' })).toBeDisabled()
    // No document list leaks before authentication.
    await expect(page.getByText('Politika e Pushimeve dhe e Lejeve')).toBeHidden()
  })

  test('lists the documents once a valid token is given', async ({ page }) => {
    await stubAdmin(page)
    await page.goto('/admin')

    await signIn(page)

    await expect(page.getByText('Politika e Pushimeve dhe e Lejeve')).toBeVisible()
    await expect(page.getByText('9')).toBeVisible()
  })

  test('rejects a bad token and returns to the form', async ({ page }) => {
    await stubAdmin(page)
    await page.goto('/admin')

    await signIn(page, 'wrong-token')

    await expect(page.getByRole('alert')).toContainText('nuk eshte i vlefshem')
    // A rejected token is cleared, so the form comes back rather than leaving
    // the page stuck on an error it cannot recover from.
    await expect(page.getByRole('button', { name: 'Hyr' })).toBeVisible()
  })

  test('keeps the token in sessionStorage, not localStorage', async ({ page }) => {
    await stubAdmin(page)
    await page.goto('/admin')
    await signIn(page)
    await expect(page.getByText('Politika e Pushimeve dhe e Lejeve')).toBeVisible()

    // Closing the tab should end access rather than leaving a shared secret
    // on disk.
    const stored = await page.evaluate(() => ({
      session: JSON.stringify(sessionStorage).includes('test-token'),
      local: JSON.stringify(localStorage).includes('test-token'),
    }))
    expect(stored.session).toBe(true)
    expect(stored.local).toBe(false)
  })

  test('uploads a document and reports how many sections it produced', async ({ page }) => {
    const stubs = await stubAdmin(page)
    await page.goto('/admin')
    await signIn(page)
    await expect(page.getByText('Politika e Pushimeve dhe e Lejeve')).toBeVisible()

    await page.locator('input[type="file"]').setInputFiles({
      name: 'e-re.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('## Titull\n\nPermbajtje.\n'),
    })

    await expect(page.getByRole('status')).toContainText('u shtua me 4 seksione')
    expect(stubs.uploads).toBe(1)
    // Indexing completes before the upload returns, so it appears immediately.
    // Scoped to the table: the success notice repeats the title.
    await expect(page.getByRole('table').getByText('Politika e Re')).toBeVisible()
  })

  test('asks before deleting, and says what is lost', async ({ page }) => {
    const stubs = await stubAdmin(page)
    await page.goto('/admin')
    await signIn(page)
    await expect(page.getByText('Politika e Pushimeve dhe e Lejeve')).toBeVisible()

    await page.getByRole('button', { name: /^Fshij / }).first().click()

    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText('Te fshihet dokumenti?')
    await expect(dialog).toContainText('Asistenti nuk do t')

    await dialog.getByRole('button', { name: 'Anulo' }).click()

    // The dialog has an exit animation; waiting for it to go keeps a later
    // interaction from landing on a closing copy of it.
    await expect(dialog).toBeHidden()
    expect(stubs.deleted).toHaveLength(0)
    await expect(page.getByText('Politika e Pushimeve dhe e Lejeve')).toBeVisible()
  })

  test('deletes a document once confirmed', async ({ page }) => {
    const stubs = await stubAdmin(page)
    await page.goto('/admin')
    await signIn(page)
    await expect(page.getByText('Politika e Pushimeve dhe e Lejeve')).toBeVisible()

    await page.getByRole('button', { name: /^Fshij / }).first().click()

    const dialog = page.getByRole('alertdialog')
    await dialog.getByRole('button', { name: 'Fshij', exact: true }).click()

    await expect.poll(() => stubs.deleted).toEqual([1])

    // The list is re-fetched after a delete, so the row goes. The success
    // notice repeats the title, which is why this checks the table and not
    // the whole page.
    await expect(page.getByRole('status')).toContainText('u fshi')
    await expect(page.getByText('Nuk ka asnje dokument')).toBeVisible()
    await expect(page.getByRole('table')).toBeHidden()
  })

  test('signs out and asks for the token again', async ({ page }) => {
    await stubAdmin(page)
    await page.goto('/admin')
    await signIn(page)
    await expect(page.getByText('Politika e Pushimeve dhe e Lejeve')).toBeVisible()

    await page.getByRole('button', { name: 'Dil' }).click()

    await expect(page.getByText('Vendos token-in e administrimit per te vazhduar.')).toBeVisible()
  })

  test('is a separate route, not a mode of the chat page', async ({ page }) => {
    await stubAdmin(page)
    await page.goto('/admin')
    await signIn(page)

    await page.getByRole('link', { name: 'Biseda' }).click()

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: 'Asistenti Zanor' })).toBeVisible()
  })
})
