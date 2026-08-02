/**
 * One-frame screen capture, using only what the browser already provides.
 *
 * `getDisplayMedia` hands back a live video stream; a screenshot is that
 * stream's first frame drawn to a canvas, after which every track is stopped.
 * Stopping matters: a track left running keeps the browser's "sharing your
 * screen" indicator up long after the modal closed, which reads as the site
 * still watching.
 *
 * No library: html2canvas-style DOM rendering re-draws the page from CSS and
 * loses exactly what a bug report needs — cross-origin images, canvases, and
 * anything mid-transition. A real frame shows what the reporter actually saw.
 */

/**
 * Set on <html> for the few hundred ms the frame is being grabbed. CSS in
 * index.css hides the app's own chrome — the feedback modal, the FAB, toasts —
 * while it is present, because a screenshot of the bug report on top of the bug
 * is useless to whoever reads the report.
 */
const CAPTURING_ATTR = 'data-capturing'

/**
 * How long to wait after hiding the chrome before reading a frame. The hide is
 * a style change; it has to reach the compositor, and the compositor has to
 * push a new frame into the capture stream. Two rAFs are not enough — the
 * capture pipeline runs a frame or two behind the page.
 */
const CHROME_HIDE_SETTLE_MS = 320

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

/** Desktop-only API. Mobile Safari and Android Chrome do not implement it, so
 *  the capture button is hidden rather than offered and then failing. */
export function isScreenCaptureSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === 'function'
  )
}

/** Thrown when the person dismisses the browser's share picker. Callers treat
 *  this as a no-op — a cancelled capture is not an error to apologise for. */
export class CaptureCancelledError extends Error {
  constructor() {
    super('Screen capture cancelled')
    this.name = 'CaptureCancelledError'
  }
}

function firstFrame(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    // Some browsers fire loadedmetadata before there is anything to paint;
    // requestVideoFrameCallback is the only signal that a frame exists.
    const withFrameCallback = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number
    }
    const timeout = window.setTimeout(() => reject(new Error('Timed out waiting for the screen')), 5000)
    const done = () => {
      window.clearTimeout(timeout)
      resolve()
    }

    if (typeof withFrameCallback.requestVideoFrameCallback === 'function') {
      withFrameCallback.requestVideoFrameCallback(done)
    } else {
      video.onloadeddata = done
      video.onerror = () => {
        window.clearTimeout(timeout)
        reject(new Error('Could not read the screen'))
      }
    }
  })
}

/**
 * Prompt for a surface, grab one frame, stop sharing. `preferCurrentTab` puts
 * this tab at the top of the picker — the reporter is nearly always reporting
 * the page they are on, and any extra step there is a step people abandon.
 */
export async function captureScreen(): Promise<Blob> {
  if (!isScreenCaptureSupported()) {
    throw new Error('This browser cannot capture the screen')
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser' },
      audio: false,
      // Chromium-only hint; other engines ignore the unknown key.
      preferCurrentTab: true,
    } as DisplayMediaStreamOptions)
  } catch (err) {
    const name = (err as DOMException)?.name
    if (name === 'NotAllowedError' || name === 'AbortError') throw new CaptureCancelledError()
    throw err
  }

  const video = document.createElement('video')
  video.srcObject = stream
  video.muted = true
  video.playsInline = true

  // Only now, after the picker has been answered: hiding earlier would have
  // pulled the modal out from under the person while they were still choosing
  // a surface in the browser's own dialog.
  document.documentElement.setAttribute(CAPTURING_ATTR, '')

  try {
    await video.play()
    await firstFrame(video)
    // The first frame is whatever the stream had ready, which is usually the
    // page as it looked before the chrome was hidden. Let a few more land.
    await wait(CHROME_HIDE_SETTLE_MS)

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not prepare the screenshot')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    return await canvasToBlob(canvas)
  } finally {
    // Runs on the error path too — a failed capture must not leave the tab
    // marked as sharing, or the app permanently invisible.
    document.documentElement.removeAttribute(CAPTURING_ATTR)
    stream.getTracks().forEach((track) => track.stop())
    video.srcObject = null
  }
}

/** PNG, not WebP or JPEG: annotation strokes are thin hard edges and lossy
 *  compression smears them into the screenshot behind. */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not encode the screenshot'))
    }, 'image/png')
  })
}
