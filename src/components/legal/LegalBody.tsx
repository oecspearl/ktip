import type { I18n } from '@lingui/core'
import { useLingui } from '@lingui/react/macro'
import { AlertTriangle, Info } from 'lucide-react'
import { LinkedText } from '../ui/LinkedText'
import { fillTokens, type LegalBlock } from '../../lib/legal'
import { cn } from '../../lib/utils'

/**
 * Resolves one string of legal copy: catalog lookup, then token substitution.
 *
 * Order matters. `i18n._()` returns the translated text — which still carries
 * the `%entity%` placeholders, because the translator was shown them and told
 * to leave them alone — and `fillTokens` puts the real names in afterwards. Doing
 * it the other way round would send a different English string to the catalog
 * than the one that was extracted, and every lookup would miss.
 */
export function resolveLegal(i18n: I18n, text: string): string {
  return fillTokens(i18n._(text))
}

/**
 * Prose is rendered through LinkedText rather than as a bare string: the
 * documents carry email addresses in the copy itself ("write to
 * privacy@…"), and a contact address you cannot click is a contact address
 * people retype wrongly. It renders tokens, never HTML, so nothing in the
 * content data can inject markup.
 */
function Prose({ text }: { text: string }) {
  return <LinkedText text={text} linkClassName="text-ktip-ocean-700 dark:text-ktip-ocean-300" />
}

export function LegalBody({ blocks }: { blocks: LegalBlock[] }) {
  const { i18n } = useLingui()
  const r = (text: string) => resolveLegal(i18n, text)

  return (
    <div className="space-y-4">
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'para':
            return (
              <p key={index} className="text-body leading-relaxed text-ktip-sand-700">
                <Prose text={r(block.text)} />
              </p>
            )

          case 'note': {
            const warn = block.tone === 'warn'
            const Icon = warn ? AlertTriangle : Info
            return (
              <div
                key={index}
                role="note"
                className={cn(
                  'flex gap-3 rounded-surface border p-4',
                  warn
                    ? 'border-ktip-sun-300 bg-ktip-sun-50 text-ktip-sand-900'
                    : 'border-ktip-ocean-200 bg-ktip-ocean-50 text-ktip-sand-900'
                )}
              >
                <Icon
                  size={18}
                  aria-hidden
                  className={cn('mt-0.5 shrink-0', warn ? 'text-ktip-sun-700' : 'text-ktip-ocean-600')}
                />
                <p className="text-body leading-relaxed">
                  <Prose text={r(block.text)} />
                </p>
              </div>
            )
          }

          case 'list': {
            const List = block.ordered ? 'ol' : 'ul'
            return (
              <List
                key={index}
                className={cn(
                  'space-y-2 pl-5 text-body leading-relaxed text-ktip-sand-700',
                  block.ordered ? 'list-decimal' : 'list-disc'
                )}
              >
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="pl-1">
                    <Prose text={r(item)} />
                  </li>
                ))}
              </List>
            )
          }

          case 'defs':
            return (
              <dl key={index} className="space-y-3">
                {block.items.map((item, itemIndex) => (
                  <div
                    key={itemIndex}
                    className="rounded-surface border border-ktip-sand-200 bg-ktip-cream p-4"
                  >
                    <dt className="text-label font-semibold text-ktip-sand-900">{r(item.term)}</dt>
                    <dd className="mt-1 text-body leading-relaxed text-ktip-sand-700">
                      <Prose text={r(item.def)} />
                    </dd>
                  </div>
                ))}
              </dl>
            )

          case 'table':
            return (
              // Wide tables scroll inside their own container. The page body must
              // never scroll sideways, and the processors table is four columns
              // of prose on a phone.
              <div
                key={index}
                className="overflow-x-auto rounded-surface border border-ktip-sand-200"
                tabIndex={0}
                role="region"
                aria-label={r(block.columns[0] ?? '')}
              >
                <table className="w-full border-collapse text-left">
                  <thead className="bg-ktip-sand-50">
                    <tr>
                      {block.columns.map((column, columnIndex) => (
                        <th
                          key={columnIndex}
                          scope="col"
                          className="whitespace-nowrap px-4 py-3 text-caption font-semibold uppercase tracking-wide text-ktip-sand-600"
                        >
                          {r(column)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ktip-sand-100">
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="align-top">
                        {row.cells.map((cell, cellIndex) => (
                          <td
                            key={cellIndex}
                            className="px-4 py-3 text-body leading-relaxed text-ktip-sand-700"
                          >
                            <Prose text={r(cell)} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        }
      })}
    </div>
  )
}
