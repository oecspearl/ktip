import type { ReactNode } from 'react'
import { shade } from '../../../lib/venue-map'
import type { FurniturePiece, FurnitureTone, PanelArt } from '../../../lib/venue-furniture'

/**
 * SVG for furniture pieces (venue-furniture.ts decides where; this decides how
 * each piece looks).
 *
 * Panels are drawn in a unit square and mapped onto their wall with a single
 * matrix, the same trick the stage uses for the doorway portal. That keeps
 * every chalkboard, screen and sticky note free of isometric maths: the art is
 * a flat picture, and the matrix leans it onto the wall at whatever tilt the
 * map is at. Strokes are non-scaling so a line is a pixel wide, not a wall wide.
 */

type Project = (x: number, y: number, z?: number) => [number, number]

const TONE: Record<Exclude<FurnitureTone, 'soft'>, string> = {
  wood: '#B08A5E',
  lit: '#97D700',
  dark: '#2B3A55',
  metal: '#9AA8BA',
  accent: '#FFC72C',
  light: '#EEF2F7',
  plant: '#4E8F2A',
}

const STICKY = ['#FFE58A', '#CDEB8B', '#B8DBFF', '#FFC2D8']
const FACE = ['#2B6CB0', '#6D3FD6', '#0E7C66', '#B45309', '#BE185D', '#0369A1']

export interface FurnitureRenderArgs {
  pieces: FurniturePiece[]
  project: Project
  zBase: number
  /** The room's colour; "soft" pieces (seats, sofas) take a lighter shade of it. */
  color: string
  alpha: number
  /** 0 = flat plan, 1 = full isometric. Panels are skipped when nearly flat. */
  tilt: number
  keyPrefix: string
  logoUrl?: string | null
  muralUrl?: string | null
}

const n = (v: number) => v.toFixed(1)
const quad = (a: [number, number], b: [number, number], c: [number, number], d: [number, number]) =>
  `M${n(a[0])} ${n(a[1])} L${n(b[0])} ${n(b[1])} L${n(c[0])} ${n(c[1])} L${n(d[0])} ${n(d[1])} Z`

/** Matrix mapping the unit square (0,0 top-left) onto three projected corners. */
function planeMatrix(tl: [number, number], tr: [number, number], bl: [number, number]): string {
  return `matrix(${tr[0] - tl[0]} ${tr[1] - tl[1]} ${bl[0] - tl[0]} ${bl[1] - tl[1]} ${tl[0]} ${tl[1]})`
}

function frame(fill: string, edge: string): ReactNode {
  return (
    <rect x={0} y={0} width={1} height={1} fill={fill} stroke={edge} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
  )
}

function stickies(cols: number[], rows: number[], seed: number): ReactNode[] {
  const out: ReactNode[] = []
  let i = seed
  for (const x of cols)
    for (const y of rows) {
      out.push(<rect key={`s${x}-${y}`} x={x} y={y} width={0.11} height={0.17} fill={STICKY[i++ % STICKY.length]} />)
    }
  return out
}

function art(kind: PanelArt, roomColor: string, image: string | null): ReactNode {
  const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, w = 1.2, k = '') => (
    <line key={`l${k}${x1}${y1}${x2}${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={w} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
  )
  switch (kind) {
    case 'chalkboard':
      return (
        <>
          {frame('#22402F', '#8B6B47')}
          <polyline points="0.08,0.72 0.2,0.5 0.32,0.6 0.46,0.32" fill="none" stroke="#F4F7FB" strokeOpacity={0.75} strokeWidth={1.3} vectorEffect="non-scaling-stroke" />
          {line(0.08, 0.2, 0.42, 0.2, 'rgba(244,247,251,0.7)')}
          {line(0.08, 0.3, 0.32, 0.3, 'rgba(244,247,251,0.55)')}
          <ellipse cx={0.74} cy={0.48} rx={0.13} ry={0.22} fill="none" stroke="#FFE58A" strokeOpacity={0.8} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          {line(0.58, 0.82, 0.92, 0.82, 'rgba(244,247,251,0.5)')}
          <rect x={0} y={0.93} width={1} height={0.07} fill="#8B6B47" />
        </>
      )
    case 'whiteboard':
      return (
        <>
          {frame('#F4F7FB', '#9AA8BA')}
          {stickies([0.07, 0.22, 0.37], [0.1, 0.36], 0)}
          {stickies([0.58, 0.73], [0.12], 2)}
          <path d="M0.56 0.55 Q0.7 0.4 0.82 0.62 T0.94 0.58" fill="none" stroke="#2F6FE0" strokeWidth={1.3} vectorEffect="non-scaling-stroke" />
          {line(0.07, 0.75, 0.45, 0.75, '#D63B3B')}
          {line(0.07, 0.85, 0.3, 0.85, '#2B3A55')}
        </>
      )
    case 'kanban':
      return (
        <>
          {frame('#F4F7FB', '#9AA8BA')}
          {line(0.34, 0.06, 0.34, 0.94, '#C9D4E4', 1, 'k')}
          {line(0.67, 0.06, 0.67, 0.94, '#C9D4E4', 1, 'k')}
          <rect x={0.05} y={0.06} width={0.26} height={0.08} fill="#041E42" />
          <rect x={0.38} y={0.06} width={0.26} height={0.08} fill="#E6AC09" />
          <rect x={0.71} y={0.06} width={0.25} height={0.08} fill="#7AB000" />
          {stickies([0.06, 0.19], [0.2, 0.42, 0.64], 0)}
          {stickies([0.39, 0.52], [0.2, 0.42], 1)}
          {stickies([0.72], [0.2, 0.42, 0.64], 3)}
        </>
      )
    case 'video': {
      const tiles: ReactNode[] = []
      const cols = 3
      const rows = 2
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c
          const x = 0.04 + c * 0.32
          const y = 0.06 + r * 0.45
          tiles.push(
            <g key={`t${i}`}>
              <rect x={x} y={y} width={0.29} height={0.4} fill={FACE[i % FACE.length]} stroke={i === 1 ? '#97D700' : 'none'} strokeWidth={2} vectorEffect="non-scaling-stroke" />
              <ellipse cx={x + 0.145} cy={y + 0.17} rx={0.045} ry={0.075} fill="rgba(255,255,255,0.85)" />
              <ellipse cx={x + 0.145} cy={y + 0.37} rx={0.09} ry={0.07} fill="rgba(255,255,255,0.7)" />
            </g>
          )
        }
      return (
        <>
          {frame('#06142B', '#97D700')}
          {tiles}
        </>
      )
    }
    case 'slides':
      return (
        <>
          {frame('#041E42', '#97D700')}
          <rect x={0.08} y={0.12} width={0.5} height={0.12} fill="#97D700" />
          {line(0.08, 0.42, 0.7, 0.42, 'rgba(231,238,249,0.75)')}
          {line(0.08, 0.56, 0.6, 0.56, 'rgba(231,238,249,0.6)')}
          {line(0.08, 0.7, 0.66, 0.7, 'rgba(231,238,249,0.6)')}
          <circle cx={0.82} cy={0.6} r={0.1} fill="#FFC72C" />
        </>
      )
    case 'dashboard':
      return (
        <>
          {frame('#041E42', '#2F8FD6')}
          {[0.3, 0.55, 0.42, 0.75, 0.62].map((h, i) => (
            <rect key={`b${i}`} x={0.08 + i * 0.1} y={0.9 - h * 0.75} width={0.07} height={h * 0.75} fill={i === 3 ? '#FFC72C' : '#97D700'} />
          ))}
          <polyline points="0.62,0.7 0.7,0.5 0.78,0.58 0.86,0.3 0.94,0.36" fill="none" stroke="#7DB0FF" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </>
      )
    case 'leaderboard':
      return (
        <>
          {frame('#041E42', '#FFC72C')}
          {[0.8, 0.66, 0.5, 0.38].map((w, i) => (
            <g key={`r${i}`}>
              <circle cx={0.1} cy={0.18 + i * 0.22} r={0.05} fill="#FFC72C" />
              <rect x={0.2} y={0.13 + i * 0.22} width={w * 0.72} height={0.1} fill={i === 0 ? '#97D700' : 'rgba(231,238,249,0.55)'} />
            </g>
          ))}
        </>
      )
    case 'monitor':
      return (
        <>
          {frame('#1B2433', '#0B1220')}
          <rect x={0.08} y={0.12} width={0.84} height={0.7} fill="#2F6FE0" />
          {line(0.16, 0.32, 0.6, 0.32, 'rgba(255,255,255,0.8)')}
          {line(0.16, 0.5, 0.48, 0.5, 'rgba(255,255,255,0.6)')}
        </>
      )
    case 'banner':
      return (
        <>
          {frame(shade(roomColor, 1, 1), shade(roomColor, 0.6, 1))}
          {image ? (
            <image href={image} x={0.08} y={0.08} width={0.84} height={0.84} preserveAspectRatio="xMidYMid meet" />
          ) : (
            <>
              <rect x={0} y={0.4} width={1} height={0.2} fill="rgba(255,255,255,0.25)" />
              <circle cx={0.5} cy={0.5} r={0.16} fill="#FFC72C" />
            </>
          )}
        </>
      )
    case 'mural':
      return image ? (
        <>
          {frame('#041E42', '#041E42')}
          <image href={image} x={0} y={0} width={1} height={1} preserveAspectRatio="xMidYMid slice" />
        </>
      ) : (
        <>
          {frame(shade(roomColor, 1.2, 1), shade(roomColor, 0.6, 1))}
          <path d="M0 0.7 Q0.25 0.45 0.5 0.7 T1 0.65 L1 1 L0 1 Z" fill="#2F8FD6" />
          <path d="M0 0.82 Q0.3 0.65 0.6 0.84 T1 0.8 L1 1 L0 1 Z" fill="#041E42" />
          <circle cx={0.75} cy={0.3} r={0.13} fill="#FFC72C" />
        </>
      )
  }
}

export function renderFurniture(args: FurnitureRenderArgs): ReactNode[] {
  const { pieces, project: P, zBase, color, alpha, tilt, keyPrefix, logoUrl, muralUrl } = args
  if (alpha < 0.02) return []
  const out: ReactNode[] = []
  // Seats and sofas take the room's own colour, lifted, so a team's colour
  // choice shows up in its furniture as well as its floor.
  const soft = color

  pieces.forEach((p, i) => {
    const key = `${keyPrefix}-${i}`
    if (p.type === 'box') {
      const base = p.tone === 'soft' ? soft : TONE[p.tone]
      const z0 = zBase + p.z
      const z1 = z0 + p.h
      const { x, y, w, d } = p
      const lift = p.tone === 'soft' ? 1.25 : 1
      out.push(
        <g key={key} opacity={alpha}>
          {tilt > 0.01 && (
            <>
              <path d={quad(P(x, y + d, z0), P(x + w, y + d, z0), P(x + w, y + d, z1), P(x, y + d, z1))} fill={shade(base, 0.82 * lift, 1)} />
              <path d={quad(P(x + w, y, z0), P(x + w, y + d, z0), P(x + w, y + d, z1), P(x + w, y, z1))} fill={shade(base, 0.64 * lift, 1)} />
            </>
          )}
          <path d={quad(P(x, y, z1), P(x + w, y, z1), P(x + w, y + d, z1), P(x, y + d, z1))} fill={shade(base, 1.08 * lift, 1)} stroke={shade(base, 0.55, 0.5)} strokeWidth={0.5} />
        </g>
      )
      return
    }
    if (p.type === 'rug') {
      const z = zBase + 0.004
      const tl = P(p.x, p.y, z)
      const tr = P(p.x + p.w, p.y, z)
      const bl = P(p.x, p.y + p.d, z)
      out.push(
        <g key={key} opacity={alpha}>
          <path d={quad(tl, tr, P(p.x + p.w, p.y + p.d, z), bl)} fill={shade(color, 1.35, 0.55)} stroke={shade(color, 0.7, 0.8)} strokeWidth={1} />
          {p.image === 'logo' && logoUrl && (
            <g transform={planeMatrix(tl, tr, bl)}>
              <image href={logoUrl} x={0.15} y={0.15} width={0.7} height={0.7} preserveAspectRatio="xMidYMid meet" opacity={0.9} />
            </g>
          )}
        </g>
      )
      return
    }
    // Panels need a tilted map to have a face at all.
    if (tilt < 0.2) return
    const z0 = zBase + p.z0
    const z1 = zBase + p.z1
    const corner = (a: number, z: number) => (p.plane === 'xz' ? P(a, p.at, z) : P(p.at, a, z))
    const tl = corner(p.a0, z1)
    const tr = corner(p.a1, z1)
    const bl = corner(p.a0, z0)
    const image = p.image === 'logo' ? logoUrl ?? null : p.image === 'mural' ? muralUrl ?? null : null
    out.push(
      <g key={key} transform={planeMatrix(tl, tr, bl)} opacity={alpha}>
        {art(p.art, color, image)}
      </g>
    )
  })
  return out
}
