import type { A11ySettings, ResolvedConfig, StoredState } from './config'

export function sanitize(raw: unknown, cfg: ResolvedConfig): A11ySettings
export function readStored(storage: Pick<Storage, 'getItem'>, cfg: ResolvedConfig): StoredState
export function paint(
  settings: A11ySettings,
  cfg: ResolvedConfig,
  root: HTMLElement,
  win: Pick<Window, 'matchMedia'>
): void
