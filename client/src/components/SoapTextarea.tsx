import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { appointments as apptApi, icdCodes as icdApi } from "@/lib/api";
import { SOAP_PHRASES, type SoapField } from "@/lib/soapPhrases";
import { cn } from "@/lib/utils";

const MIN_HEIGHT = 96;   // ≈ 4 rows of text-xs
const MAX_HEIGHT = 400;  // scroll beyond this
const MAX_ITEMS  = 8;
const ICD_SERVER_LIMIT = 10;  // GET /api/icd-codes?search= returns at most this many
const ICD_DEBOUNCE_MS  = 300;

interface Suggestion { label: string; insert: string; code?: string; favourite?: boolean; start: number; matched: string }

interface Props {
  field: SoapField;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

// Text typed since the last clause break (newline , ; or sentence-ending ". ") up to the
// cursor. A "." with no space after it is kept so codes like "E11.9" stay one fragment.
const CLAUSE_BREAK = /[\n,;]|\.(?=\s)/g;
function currentFragment(text: string, caret: number) {
  const before = text.slice(0, caret);
  let breakAt = -1;
  for (const m of before.matchAll(CLAUSE_BREAK)) breakAt = m.index!;
  let start = breakAt + 1;
  while (start < caret && /\s/.test(before[start])) start++;
  return { start, text: before.slice(start) };
}

// Trailing word runs of the fragment, longest first: "known case of hyper" →
// ["known case of hyper", "case of hyper", "of hyper", "hyper"]. Lets "hyper" match
// "Hypertension" without replacing the words typed before it.
function wordSuffixes(text: string, start: number) {
  const out: { start: number; text: string }[] = [];
  const re = /\S+/g;
  for (let m; (m = re.exec(text)); ) {
    const t = text.slice(m.index).trimEnd().toLowerCase();
    if (t.length >= 2) out.push({ start: start + m.index, text: t });
  }
  return out;
}

function wordMatch(c: string, frag: string) {
  return c.startsWith(frag) || c.includes(" " + frag) || c.includes("(" + frag);
}

const undot = (s: string) => s.toLowerCase().replace(/\./g, "");

// ICD rows: longest suffix whose every word starts a word of the description
// ("fracture fem" ↔ "Fracture of femur"), or that the code starts with ("e119" ↔ "E11.9").
function matchIcd(description: string, code: string, suffixes: { start: number; text: string }[]) {
  const descWords = description.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (const sfx of suffixes) {
    if (undot(code).startsWith(undot(sfx.text))) return sfx;
    if (sfx.text.split(/[^a-z0-9]+/).filter(Boolean).every((w) => descWords.some((d) => d.startsWith(w)))) return sfx;
  }
  return null;
}

// Longest suffix the candidate matches; null if none, or if it is already typed in full.
function matchSuffix(candidate: string, suffixes: { start: number; text: string }[]) {
  const c = candidate.toLowerCase();
  for (const sfx of suffixes) {
    if (c === sfx.text) return null;
    if (wordMatch(c, sfx.text)) return sfx;
  }
  return null;
}

function Highlight({ text, frag }: { text: string; frag: string }) {
  const i = text.toLowerCase().indexOf(frag);
  if (!frag || i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<b className="font-semibold text-foreground">{text.slice(i, i + frag.length)}</b>{text.slice(i + frag.length)}</>;
}

// SOAP note textarea that grows with its content and suggests phrases while typing:
// learned phrases from past notes + built-in ones, and for Assessment the tenant's ICD codes.
export default function SoapTextarea({ field, value, onChange, placeholder, className }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret]   = useState(0);
  const [open, setOpen]     = useState(false);
  const [active, setActive] = useState(0);

  // ── Auto-grow (also runs when AI scribe / appointment load sets the value) ──
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const h = Math.min(Math.max(el.scrollHeight, MIN_HEIGHT), MAX_HEIGHT);
    el.style.height = `${h}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  }, [value]);

  const frag = currentFragment(value, caret);
  const fragLc = frag.text.trim().toLowerCase();
  const searching = open && fragLc.length >= 2;
  const suffixes = useMemo(() => wordSuffixes(frag.text, frag.start), [frag.text, frag.start]);
  // ICD search sends the last few words; the server drops leading words until it finds
  // matches, and each row then replaces exactly the words it matched (matchIcd).
  const icdQuery = suffixes.length ? suffixes[Math.max(0, suffixes.length - 4)].text : "";

  // ── Sources ──
  const { data: learned = [] } = useQuery({
    queryKey: ["soap-phrases", field],
    queryFn:  () => apptApi.soapPhrases(field),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const [icdTerm, setIcdTerm] = useState("");
  const { data: icdRows = [], isSuccess: icdLoaded, isPlaceholderData: icdStale } = useQuery({
    queryKey: ["icd-search", icdTerm],
    queryFn:  () => icdApi.search(icdTerm),
    enabled:  icdTerm.length >= 2,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
    retry: false,
  });

  // Requests count against the per-user API rate limit, so keep them few:
  // wait for a typing pause, and when the last answer was complete (fewer rows than
  // the server's limit) and the user only typed more, filter it locally instead —
  // matches for "hyper" are always a subset of those for "hype". Empty answers aren't
  // reused: "known case of" returns nothing until a real word is typed.
  const icdComplete = icdLoaded && !icdStale && icdRows.length > 0 && icdRows.length < ICD_SERVER_LIMIT;
  useEffect(() => {
    const next = field === "assessment" && searching ? icdQuery : "";
    if (next && icdComplete && next.startsWith(icdTerm)) return;
    const t = setTimeout(() => setIcdTerm(next), ICD_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [field, searching, icdQuery, icdTerm, icdComplete]);

  const phrases = useMemo(() => {
    const seen = new Set<string>();
    return [...learned, ...SOAP_PHRASES[field]].filter((p) => {
      const k = p.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [learned, field]);

  const items: Suggestion[] = useMemo(() => {
    if (!searching) return [];
    const out: Suggestion[] = [];
    if (field === "assessment" && icdTerm) {
      for (const r of icdRows) {
        const sfx = matchIcd(r.description, r.code, suffixes);
        if (sfx) out.push({
          label: r.description, code: r.code, favourite: r.source === "hospital",
          insert: `${r.description} (${r.code})`, start: sfx.start, matched: sfx.text,
        });
      }
    }
    for (const p of phrases) {
      if (out.length >= MAX_ITEMS) break;
      const sfx = matchSuffix(p, suffixes);
      if (sfx && !out.some((o) => o.insert.toLowerCase() === p.toLowerCase())) {
        out.push({ label: p, insert: p, start: sfx.start, matched: sfx.text });
      }
    }
    return out.slice(0, MAX_ITEMS);
  }, [searching, field, icdTerm, icdRows, phrases, suffixes]);

  useEffect(() => setActive(0), [fragLc]);

  const showList = open && items.length > 0;

  const pick = (s: Suggestion) => {
    const next = value.slice(0, s.start) + s.insert + value.slice(caret);
    const pos  = s.start + s.insert.length;
    onChange(next);
    setOpen(false);
    setCaret(pos);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showList) return;
    if (e.key === "ArrowDown")      { e.preventDefault(); setActive((i) => (i + 1) % items.length); }
    else if (e.key === "ArrowUp")   { e.preventDefault(); setActive((i) => (i - 1 + items.length) % items.length); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(items[active]); }
    else if (e.key === "Escape")    { e.preventDefault(); setOpen(false); }
  };

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        placeholder={placeholder}
        rows={4}
        className={cn("text-xs resize-none", className)}
        onChange={(e) => {
          onChange(e.target.value);
          setCaret(e.target.selectionStart);
          setOpen(true);
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      {showList && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-20 max-h-64 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md py-1"
        >
          {items.map((s, i) => (
            <li
              key={s.insert}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer text-muted-foreground",
                i === active && "bg-teal-50 text-foreground dark:bg-teal-950",
              )}
            >
              {s.code && (
                <span className={cn(
                  "font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0",
                  i === active ? "bg-teal-700 text-white" : "bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
                )}>{s.code}</span>
              )}
              <span className="truncate"><Highlight text={s.label} frag={s.matched} /></span>
              {s.favourite && <span className="ml-auto text-[10px] text-teal-600 shrink-0" title="On this hospital's ICD list">★</span>}
            </li>
          ))}
          <li className="px-3 pt-1 text-[10px] text-muted-foreground/70 border-t mt-1">↑↓ to choose · Enter/Tab to insert · Esc to close</li>
        </ul>
      )}
    </div>
  );
}
