import { afterEach, describe, expect, it } from 'vitest'
import { emailFrom, resendKey, siteOrigin } from '../../../api/_lib/email'

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('email configuration', () => {
  it('prefers and trims EMAIL_FROM while retaining the legacy fallback', () => {
    process.env.EMAIL_FROM = '  KTIP <admin@oecsinnovation.org>  '
    process.env.INVITE_FROM_EMAIL = 'legacy@example.com'
    process.env.RESEND_API_KEY = '  re_test  '

    expect(emailFrom()).toBe('KTIP <admin@oecsinnovation.org>')
    expect(resendKey()).toBe('re_test')

    delete process.env.EMAIL_FROM
    expect(emailFrom()).toBe('legacy@example.com')
  })

  it('uses SITE_URL as an HTTP origin and removes paths and trailing slashes', () => {
    process.env.SITE_URL = ' https://ktip.example/path/ '

    expect(siteOrigin(new Request('https://preview.example/api/invite/send'))).toBe(
      'https://ktip.example',
    )
  })

  it('uses the request origin only when SITE_URL is absent', () => {
    delete process.env.SITE_URL

    expect(siteOrigin(new Request('http://localhost:5173/api/invite/send'))).toBe(
      'http://localhost:5173',
    )
  })

  it.each(['not a URL', 'mailto:admin@example.com', 'javascript:alert(1)'])(
    'rejects an invalid configured SITE_URL: %s',
    (siteUrl) => {
      process.env.SITE_URL = siteUrl

      expect(() => siteOrigin(new Request('https://preview.example/api/invite/send'))).toThrow(
        'SITE_URL must be an absolute HTTP(S) URL',
      )
    },
  )
})
