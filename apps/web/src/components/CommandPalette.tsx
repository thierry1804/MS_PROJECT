import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { NAV_ITEMS } from "../Shell";
import { useStore } from "../store";

interface Entry {
  key: string;
  label: string;
  sub?: string;
  to: string;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const projects = useStore((s) => s.portfolio.projects);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries = useMemo<Entry[]>(
    () => [
      ...NAV_ITEMS.map((n) => ({ key: n.to, label: n.label, to: n.to })),
      ...projects.map((p) => ({ key: p.id, label: p.name, sub: p.code, to: `/projets/${p.id}` })),
    ],
    [projects],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) => e.label.toLowerCase().includes(q) || e.sub?.toLowerCase().includes(q),
    );
  }, [entries, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  function select(entry: Entry) {
    navigate(entry.to);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (filtered.length ? (i + 1) % filtered.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = filtered[activeIndex];
      if (entry) select(entry);
    }
  }

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Palette de commandes"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="palette-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Aller à une vue ou un projet…"
          aria-label="Rechercher"
        />
        <div className="palette-list">
          {filtered.length === 0 && <div className="palette-empty">Aucun résultat.</div>}
          {filtered.map((entry, i) => (
            <div
              key={entry.key}
              className={`palette-item${i === activeIndex ? " active" : ""}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => select(entry)}
            >
              {entry.label}
              {entry.sub && <span className="code">{entry.sub}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
