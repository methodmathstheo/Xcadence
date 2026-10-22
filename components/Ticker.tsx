export default function Ticker({ items, className = "" }: { items: string[]; className?: string }) {
  const row = [...items, ...items];
  return (
    <div className={`overflow-hidden border-y hairline ${className}`} aria-hidden>
      <div className="ticker py-3">
        {row.map((t, i) => (
          <span key={i} className="display flex items-center text-2xl text-bone sm:text-3xl">
            <span className="px-6">{t}</span>
            <span className="h-1.5 w-1.5 rounded-full bg-acid" />
          </span>
        ))}
      </div>
    </div>
  );
}
