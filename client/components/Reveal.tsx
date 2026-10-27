import { ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
};

export default function Reveal({
  children,
  className,
  delay = 0,
}: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [offsetY, setOffsetY] = useState(36);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const viewportHeight =
          entry.rootBounds?.height ?? window.innerHeight;

        setOffsetY(entry.boundingClientRect.top < viewportHeight / 2 ? -36 : 36);
        setIsVisible(entry.isIntersecting);
      },
      { rootMargin: "0px 0px -80px", threshold: 0.12 },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("scroll-reveal", isVisible && "is-visible", className)}
      style={{
        "--reveal-y": `${offsetY}px`,
        transitionDelay: `${delay}ms`,
      } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
