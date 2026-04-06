"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type FloatingTooltipProps = {
  children: ReactNode;
  content: ReactNode;
  className?: string;
  offset?: number;
};

const VIEWPORT_MARGIN = 12;

export function FloatingTooltip({
  children,
  content,
  className = "floating-tooltip",
  offset = 10
}: FloatingTooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !mounted) {
      return;
    }

    function updatePosition() {
      if (!triggerRef.current || !tooltipRef.current) {
        return;
      }

      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const centeredLeft = triggerRect.left + triggerRect.width / 2;
      const clampedLeft = Math.min(
        Math.max(centeredLeft, VIEWPORT_MARGIN + tooltipRect.width / 2),
        window.innerWidth - VIEWPORT_MARGIN - tooltipRect.width / 2
      );

      setPosition({
        left: clampedLeft,
        top: triggerRect.top - offset
      });
    }

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [mounted, offset, open]);

  return (
    <>
      <span
        ref={triggerRef}
        className="floating-tooltip-anchor"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setOpen(false);
          }
        }}
      >
        {children}
      </span>

      {mounted && open
        ? createPortal(
            <span
              ref={tooltipRef}
              aria-hidden="true"
              className={className}
              style={{
                left: `${position.left}px`,
                top: `${position.top}px`
              }}
            >
              {content}
            </span>,
            document.body
          )
        : null}
    </>
  );
}
