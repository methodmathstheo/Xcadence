"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ResolvedMedia } from "@/lib/content";

type Props = {
  items: ResolvedMedia[];
  index: number | null;
  onClose: () => void;
  onIndex: (i: number) => void;
};

function linkify(text: string) {
  return text.split(/(@[\w.]+)/g).map((part, i) =>
    part.startsWith("@") ? (
      <a
        key={i}
        href={`https://www.instagram.com/${part.slice(1).replace(/\.$/, "")}/`}
        target="_blank"
        rel="noreferrer"
        className="text-acid hover:underline"
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export default function Lightbox({ items, index, onClose, onIndex }: Props) {
  const open = index !== null;
  const item = open ? items[index] : null;
  const touchX = useRef<number | null>(null);
  const [showCaption, setShowCaption] = useState(true);

  const prev = useCallback(() => open && onIndex((index - 1 + items.length) % items.length), [open, index, items.length, onIndex]);
  const next = useCallback(() => open && onIndex((index + 1) % items.length), [open, index, items.length, onIndex]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose, prev, next]);

  if (!item) return null;

  const date = new Date(item.date + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col bg-ink/95 backdrop-blur-sm"
      onClick={onClose}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 50) (dx < 0 ? next : prev)();
        touchX.current = null;
      }}
    >
      <div className="flex items-center justify-between px-5 py-5 sm:px-8">
        <span className="mono">
          {index! + 1} / {items.length}
        </span>
        <button onClick={onClose} className="mono hover:text-bone transition-colors" aria-label="Close">
          Close
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center px-4" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={prev}
          aria-label="Previous"
          className="absolute left-0 top-0 hidden h-full w-1/4 cursor-w-resize sm:block"
        />
        {item.videoSrc ? (
          <video
            key={item.videoSrc}
            src={item.videoSrc}
            poster={item.src}
            controls
            autoPlay
            playsInline
            className="max-h-[70vh] max-w-full object-contain"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={item.src} src={item.src} alt={item.alt} className="max-h-[70vh] max-w-full object-contain" />
        )}
        <button
          onClick={next}
          aria-label="Next"
          className="absolute right-0 top-0 hidden h-full w-1/4 cursor-e-resize sm:block"
        />
      </div>

      <div className="px-5 pb-6 pt-4 sm:px-8" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto max-w-2xl">
          <div className="flex items-baseline justify-between gap-4">
            <p className="mono">
              {date}
              {item.location ? ` · ${item.location}` : ""}
            </p>
            <div className="flex gap-4">
              <button onClick={() => setShowCaption((s) => !s)} className="mono hover:text-bone transition-colors">
                {showCaption ? "Hide caption" : "Caption"}
              </button>
              <a href={item.postUrl} target="_blank" rel="noreferrer" className="mono hover:text-bone transition-colors">
                Instagram ↗
              </a>
            </div>
          </div>
          {showCaption && item.caption && (
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-bone-2">{linkify(item.caption)}</p>
          )}
          {item.video && !item.videoSrc && (
            <p className="mt-3 text-xs text-bone-3">Video plays on Instagram. Open the post to watch.</p>
          )}
        </div>
      </div>
    </div>
  );
}
