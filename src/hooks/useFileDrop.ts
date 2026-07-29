import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'

interface UseFileDropOptions {
  /** Called with the accepted files from a drop. Never called with an empty array. */
  onFiles: (files: File[]) => void
  /** MIME allowlist — supports wildcards like `image/*`. Undefined accepts anything. */
  accept?: readonly string[]
  /** When false (default) only the first accepted file is passed through. */
  multiple?: boolean
  disabled?: boolean
}

export interface FileDropProps {
  onDragEnter: (e: DragEvent) => void
  onDragOver: (e: DragEvent) => void
  onDragLeave: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}

function matches(file: File, accept?: readonly string[]): boolean {
  if (!accept || accept.length === 0) return true
  return accept.some((pattern) => {
    if (pattern.endsWith('/*')) return file.type.startsWith(pattern.slice(0, -1))
    return file.type === pattern
  })
}

/**
 * Drag-and-drop file handling for an existing drop zone.
 *
 * Spread `dropProps` onto the zone element and use `isDragging` to style it.
 * Files are filtered by `accept` before reaching `onFiles`, so a dragged folder
 * or text selection is ignored rather than surfacing a confusing upload error.
 */
export function useFileDrop({
  onFiles,
  accept,
  multiple = false,
  disabled = false,
}: UseFileDropOptions): { isDragging: boolean; dropProps: FileDropProps } {
  const [isDragging, setIsDragging] = useState(false)

  // A plain boolean flickers off whenever the pointer crosses a child element,
  // so track enter/leave depth instead.
  const depth = useRef(0)

  useEffect(() => {
    return () => {
      depth.current = 0
    }
  }, [])

  useEffect(() => {
    if (disabled) {
      depth.current = 0
      setIsDragging(false)
    }
  }, [disabled])

  const onDragEnter = useCallback(
    (e: DragEvent) => {
      if (disabled) return
      e.preventDefault()
      e.stopPropagation()
      depth.current += 1
      setIsDragging(true)
    },
    [disabled]
  )

  const onDragOver = useCallback(
    (e: DragEvent) => {
      if (disabled) return
      // Without preventDefault the browser navigates to the dropped file and
      // onDrop never fires.
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    },
    [disabled]
  )

  const onDragLeave = useCallback(
    (e: DragEvent) => {
      if (disabled) return
      e.preventDefault()
      e.stopPropagation()
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setIsDragging(false)
    },
    [disabled]
  )

  const onDrop = useCallback(
    (e: DragEvent) => {
      if (disabled) return
      e.preventDefault()
      e.stopPropagation()
      depth.current = 0
      setIsDragging(false)

      const dropped = Array.from(e.dataTransfer?.files ?? [])
      const accepted = dropped.filter((file) => matches(file, accept))
      if (accepted.length === 0) return

      onFiles(multiple ? accepted : [accepted[0]])
    },
    [disabled, accept, multiple, onFiles]
  )

  return {
    isDragging,
    dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop },
  }
}
