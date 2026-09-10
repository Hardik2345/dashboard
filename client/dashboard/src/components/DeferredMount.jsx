import { Suspense, useEffect, useRef, useState } from "react";
import { Skeleton } from "@mui/material";

// Mounts `children` only once the placeholder scrolls near the viewport, so
// widgets below the fold don't fetch their data until the user approaches them.
// Once visible, it stays mounted permanently (no unmount/refetch on scroll-away).
//
// Layout-stability rules this component enforces:
//
//  1. The outer wrapper div is never removed and always carries a `minHeight`,
//     so the slot reserves vertical space before, during and after loading.
//     Scroll anchoring has a stable node to anchor to and the page can't
//     collapse when the skeleton is swapped for real content.
//
//  2. Each slot gets its OWN Suspense boundary whose fallback is the exact
//     same skeleton (same reserved height) shown before it was visible. A lazy
//     chunk resolving is therefore invisible: skeleton -> content, in place,
//     with nothing else on the page moving. Without a local boundary the
//     suspension bubbles to the nearest ancestor <Suspense> and blows away the
//     entire dashboard (every already-loaded widget included) for a generic
//     full-height fallback, then swaps back -- a double full-page reflow for
//     every widget the user scrolls to.
//
//  3. A grow-only height floor: once real content has occupied N px, the slot
//     never shrinks below N again. A later in-place refresh that briefly
//     renders a shorter loading state can't collapse the slot and shove every
//     widget below it up, then down.
//
// `rootMargin` mounts the widget a little before it enters the viewport so the
// skeleton -> content swap usually lands off-screen, while still keeping the
// "don't load the whole dashboard up front" behaviour.
export default function DeferredMount({
  children,
  minHeight = 280,
  rootMargin = "400px 0px",
}) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [reservedHeight, setReservedHeight] = useState(minHeight);

  useEffect(() => {
    if (isVisible) return undefined;

    const node = containerRef.current;
    if (!node) return undefined;

    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [isVisible, rootMargin]);

  // Pin the slot to the tallest the real content has ever been, so an in-place
  // data refresh can't make it briefly collapse.
  useEffect(() => {
    if (!isVisible) return undefined;

    const node = contentRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(() => {
      const measured = node.offsetHeight;
      if (measured > 0) {
        setReservedHeight((prev) => (measured > prev ? measured : prev));
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [isVisible]);

  return (
    <div ref={containerRef} style={{ minHeight: reservedHeight, width: "100%" }}>
      {isVisible ? (
        <Suspense
          fallback={
            <Skeleton
              variant="rounded"
              width="100%"
              height={reservedHeight}
            />
          }
        >
          <div ref={contentRef} style={{ width: "100%" }}>
            {children}
          </div>
        </Suspense>
      ) : (
        <Skeleton variant="rounded" width="100%" height={reservedHeight} />
      )}
    </div>
  );
}
