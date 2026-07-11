'use client'

import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  className?: string
  tooltipClassName?: string
}

type TooltipPosition = {
  top: number
  left: number
  placement: 'top' | 'bottom'
}

const OPEN_DELAY_MS = 200
const CLOSE_DELAY_MS = 100
const VIEWPORT_PADDING_PX = 8
const TOOLTIP_GAP_PX = 8

export default function Tooltip({ content, children, className, tooltipClassName }: TooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const openTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipId = useId()
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<TooltipPosition | null>(null)

  const clearOpenTimeout = useCallback(() => {
    if (openTimeoutRef.current) clearTimeout(openTimeoutRef.current)
    openTimeoutRef.current = null
  }, [])

  const clearCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current)
    closeTimeoutRef.current = null
  }, [])

  const show = useCallback((immediately = false) => {
    clearCloseTimeout()
    clearOpenTimeout()
    if (immediately) {
      setOpen(true)
      return
    }
    openTimeoutRef.current = setTimeout(() => setOpen(true), OPEN_DELAY_MS)
  }, [clearCloseTimeout, clearOpenTimeout])

  const hide = useCallback(() => {
    clearOpenTimeout()
    clearCloseTimeout()
    closeTimeoutRef.current = setTimeout(() => {
      const trigger = triggerRef.current
      if (trigger?.matches(':hover') || document.activeElement === trigger) return
      setOpen(false)
    }, CLOSE_DELAY_MS)
  }, [clearCloseTimeout, clearOpenTimeout])

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    const tooltip = tooltipRef.current
    if (!trigger || !tooltip) return

    const triggerRect = trigger.getBoundingClientRect()
    const tooltipRect = tooltip.getBoundingClientRect()
    const placement = triggerRect.bottom + TOOLTIP_GAP_PX + tooltipRect.height
      <= window.innerHeight - VIEWPORT_PADDING_PX
      ? 'bottom'
      : 'top'
    const left = Math.min(
      window.innerWidth - VIEWPORT_PADDING_PX - tooltipRect.width / 2,
      Math.max(VIEWPORT_PADDING_PX + tooltipRect.width / 2, triggerRect.left + triggerRect.width / 2),
    )

    setPosition({
      left,
      top: placement === 'bottom'
        ? triggerRect.bottom + TOOLTIP_GAP_PX
        : triggerRect.top - TOOLTIP_GAP_PX,
      placement,
    })
  }, [])

  useEffect(() => {
    setMounted(true)
    return () => {
      clearOpenTimeout()
      clearCloseTimeout()
    }
  }, [clearCloseTimeout, clearOpenTimeout])

  useLayoutEffect(() => {
    if (!open) return

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [open])

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={0}
        aria-describedby={open ? tooltipId : undefined}
        onPointerEnter={() => show()}
        onPointerLeave={hide}
        onFocus={() => show(true)}
        onBlur={hide}
        className={cn('inline-flex cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2', className)}
      >
        {children}
      </span>
      {mounted && open
        ? createPortal(
          <span
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            className={cn(
              'pointer-events-none fixed z-[70] max-w-xs rounded-lg bg-slate-950 px-3 py-2 text-left text-xs leading-relaxed text-white shadow-xl',
              !position && 'invisible',
              tooltipClassName,
            )}
            style={{
              left: position?.left ?? 0,
              top: position?.top ?? 0,
              transform: position?.placement === 'bottom'
                ? 'translateX(-50%)'
                : 'translate(-50%, -100%)',
            }}
          >
            {content}
          </span>,
          document.body,
        )
        : null}
    </>
  )
}
