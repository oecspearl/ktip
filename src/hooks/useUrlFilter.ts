import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'

/**
 * A list filter that lives in the URL as well as in state, so another page can
 * link straight to a filtered list (a breadcrumb's "Environment" opens
 * /projects?category=environment) and back/forward restore it.
 *
 * State stays the source the page renders from; the URL follows it with a
 * replace, so changing a filter does not stack history entries. When the URL
 * changes underneath (a link, back/forward), the state follows the URL.
 */
export function useUrlFilter(key: string): [string, (next: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const fromUrl = searchParams.get(key) ?? ''
  const [value, setValue] = useState(fromUrl)

  useEffect(() => {
    setValue(fromUrl)
  }, [fromUrl])

  const set = useCallback(
    (next: string) => {
      setValue(next)
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          if (next) params.set(key, next)
          else params.delete(key)
          return params
        },
        { replace: true }
      )
    },
    [key, setSearchParams]
  )

  return [value, set]
}
