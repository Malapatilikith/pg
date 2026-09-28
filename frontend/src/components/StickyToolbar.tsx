import { ReactNode, useEffect, useRef, useState } from "react";

const findScrollParent = (element: HTMLElement | null): HTMLElement | null => {
  if (!element) {
    return null;
  }

  let parent = element.parentElement;
  while (parent) {
    const styles = window.getComputedStyle(parent);
    const overflowY = styles.overflowY;
    if (overflowY === "auto" || overflowY === "scroll") {
      return parent;
    }
    parent = parent.parentElement;
  }

  return null;
};

const StickyToolbar = ({
  children,
  threshold = 16,
  className
}: {
  children: ReactNode;
  threshold?: number;
  className?: string;
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const scrollParent = findScrollParent(wrapperRef.current);
    if (scrollParent) {
      const syncScrolledState = () => {
        setIsScrolled(scrollParent.scrollTop > threshold);
      };

      syncScrolledState();
      scrollParent.addEventListener("scroll", syncScrolledState, { passive: true });

      return () => {
        scrollParent.removeEventListener("scroll", syncScrolledState);
      };
    }

    const syncWindowState = () => {
      setIsScrolled(window.scrollY > threshold);
    };

    syncWindowState();
    window.addEventListener("scroll", syncWindowState, { passive: true });

    return () => {
      window.removeEventListener("scroll", syncWindowState);
    };
  }, [threshold]);

  return (
    <div
      ref={wrapperRef}
      className={[
        "sticky-toolbar",
        isScrolled ? "sticky-toolbar-scrolled" : "",
        className || ""
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
};

export default StickyToolbar;
