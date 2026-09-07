import { useEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "@mui/material";

// Mounts `children` only once the placeholder scrolls near the viewport, so
// widgets below the fold don't fetch their data until the user reaches them.
// Once visible, it stays mounted permanently (no unmount/refetch on scroll-away).
//
// The outer wrapper div is never removed and keeps `minHeight` applied for
// its whole lifetime (skeleton and after). That does two things: it stops
// real content that's shorter than its skeleton from collapsing the page and
// yanking the scrollbar up, and it keeps a stable DOM node at this position
// so the browser's scroll anchoring has something reliable to anchor to
// instead of jumping when the skeleton is swapped for real content.
// rootMargin is 0 on purpose — the space is already reserved by `minHeight`
// below, so there's nothing to gain by mounting (and fetching) early. Only
// fire once the widget is actually reached, not while it's still off-screen.
export default function DeferredMount({
  children,
  minHeight = 280,
  rootMargin = "0px",
}) {
  const containerRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

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

  const content = useMemo(
    () =>
      isVisible ? (
        children
      ) : (
        <Skeleton variant="rounded" width="100%" height={minHeight} />
      ),
    [isVisible, children, minHeight],
  );

  return (
    <div ref={containerRef} style={{ minHeight, width: "100%" }}>
      {content}
    </div>
  );
}
