/**
 * ============================================================================
 *  DRISHTICHECK | SmartSearchHistory
 * ============================================================================
 *  Smart India Hackathon 2026 | Idea ID 146687 | Team ID 156249
 *  Team Name      : Drishti Check
 *  Architecture   : Team Drishti Check
 *  Lead developer : Tanmay Vijay More
 *  Institute      : Government College of Engineering and Research, Avasari Khurd
 * ============================================================================
 *
 *  Past inspections, modelled as a Milvus collection (`drishti_inspections`,
 *  HNSW index, COSINE metric, 384-dim embeddings of product + violation text).
 *
 *  In production a keystroke would trigger collection.search() with the query
 *  embedding. In this prototype the same experience is simulated client-side:
 *
 *    1. the query is tokenised, lightly stemmed, and stop words are dropped
 *    2. each row is expanded into a "document" of product, category, channel,
 *       status and violation vocabulary (e.g. an MRP violation also matches
 *       "price", "retail", "tax")
 *    3. a row matches when EVERY query token matches a document token (prefix
 *       matches count, so "sal" finds "salt" while typing)
 *    4. matches are ranked by a similarity score in the 0.86 to 0.99 range
 *
 *  So "missing MRP on edible oil" narrows to edible-oil labels with an MRP
 *  violation, and "net quantity non-SI" finds non-metric declarations.
 *
 *  Clicking a row calls onSelect({ id, name, src, result }), which the
 *  Dashboard uses to update the central canvas immediately.
 * ============================================================================
 */
import { useEffect, useMemo, useState } from 'react';
import { assetUrl, fetchHistory } from '../api.js';

const RULE_SHORT = {
  MRP: 'MRP',
  NET_QTY: 'Net quantity',
  MFG_DATE: 'Mfg date',
  MFR_ADDR: 'Manufacturer',
  CONSUMER_CARE: 'Consumer care',
};

// Vocabulary a violation contributes to a row's searchable document.
const RULE_TERMS = {
  MRP: ['mrp', 'price', 'retail', 'maximum', 'tax', 'taxes', 'amount'],
  NET_QTY: ['net', 'quantity', 'qty', 'weight', 'volume', 'unit', 'units', 'si', 'metric', 'non'],
  MFG_DATE: ['manufacture', 'manufacturing', 'mfg', 'packing', 'packed', 'pkd', 'date', 'month', 'year'],
  MFR_ADDR: ['manufacturer', 'packer', 'address', 'mfr', 'pin', 'pincode'],
  CONSUMER_CARE: ['consumer', 'care', 'complaint', 'grievance', 'helpline', 'phone', 'telephone', 'email', 'mail', 'contact'],
};

const STOP_WORDS = new Set(['a', 'an', 'the', 'on', 'in', 'of', 'for', 'with', 'and', 'or', 'to', 'is', 'are', 'at', 'by', 'from', 'show', 'find', 'me', 'all']);

const EXAMPLE_QUERIES = ['missing MRP on edible oil', 'net quantity non-SI', 'consumer care email', 'manufacturing date', 'pass salt'];

const stem = (token) => (token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token);

const tokenize = (text, dropStopWords) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !(dropStopWords && STOP_WORDS.has(token)))
    .map(stem);

/** Expands a history row into the vocabulary the query is matched against. */
function buildDocument(row) {
  const terms = new Set();
  const add = (text) => tokenize(text, false).forEach((token) => terms.add(token));
  add(row.product_name);
  add(row.category);
  add(row.channel);
  add(row.id);
  add(row.status === 'PASS' ? 'pass passed compliant clean' : 'fail failed non-compliant violation missing invalid');
  row.violations.forEach((ruleId) => (RULE_TERMS[ruleId] ?? []).forEach((term) => terms.add(stem(term))));
  return [...terms];
}

const hashString = (text) => [...text].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);

/** Returns null (no query), 0 (no match) or a similarity score in (0.86, 0.999]. */
function scoreRow(documentTerms, queryTokens, rowId) {
  if (queryTokens.length === 0) return null;
  let total = 0;
  for (const queryToken of queryTokens) {
    let best = 0;
    for (const term of documentTerms) {
      if (term === queryToken) {
        best = 1;
        break;
      }
      if (queryToken.length >= 3 && term.startsWith(queryToken)) best = Math.max(best, 0.88);
    }
    if (best === 0) return 0;
    total += best;
  }
  const jitter = (hashString(rowId) % 20) / 1000; // deterministic, so scores do not flicker
  return Math.min(0.999, 0.86 + 0.12 * (total / queryTokens.length) + jitter);
}

const formatWhen = (iso) =>
  new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
      <circle cx="9" cy="9" r="5.5" />
      <path d="M13.5 13.5L17 17" />
    </svg>
  );
}

function SimilarityCell({ score }) {
  if (score === null) return <span className="text-slate-600">-</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
        <div className="h-full rounded-full bg-gradient-to-r from-chakra to-saffron" style={{ width: `${Math.round(score * 100)}%` }} />
      </div>
      <span className="font-mono text-xs text-slate-300">{score.toFixed(3)}</span>
    </div>
  );
}

export default function SmartSearchHistory({ liveRecords, selectedId, onSelect }) {
  const [seedRows, setSeedRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    fetchHistory(controller.signal)
      .then((payload) => {
        if (controller.signal.aborted) return;
        setSeedRows(payload.rows);
        setMeta(payload.meta);
        setStatus('ready');
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setLoadError(err.message);
        setStatus('error');
      });
    return () => controller.abort();
  }, [reloadKey]);

  // Session inspections first, then the seeded Milvus rows.
  const rows = useMemo(() => [...liveRecords, ...seedRows], [liveRecords, seedRows]);
  const documents = useMemo(() => new Map(rows.map((row) => [row.id, buildDocument(row)])), [rows]);

  const results = useMemo(() => {
    const queryTokens = tokenize(query, true);
    if (queryTokens.length === 0) return rows.map((row) => ({ row, score: null }));
    return rows
      .map((row) => ({ row, score: scoreRow(documents.get(row.id), queryTokens, row.id) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [rows, documents, query]);

  const hasQuery = query.trim().length > 0;
  const entities = (meta?.entities ?? 0) + liveRecords.length;

  return (
    <section className="glass p-5" aria-labelledby="history-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="history-heading" className="font-display font-wide text-lg font-bold text-white">
            Inspection history
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-400">
            Search past inspections by product or by the kind of violation. Selecting a row reopens that label on
            the canvas.
          </p>
        </div>
        {meta && (
          <ul className="flex flex-wrap gap-2" aria-label="Vector database details">
            <li className="chip border-chakra/40 text-chakra">Milvus</li>
            <li className="chip font-mono">{meta.collection}</li>
            <li className="chip">{meta.index_type} index</li>
            <li className="chip">{meta.metric_type} metric</li>
            <li className="chip">{meta.dim}-dim embeddings</li>
            <li className="chip">{entities} entities</li>
          </ul>
        )}
      </div>

      <div className="relative mt-4">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
          <SearchIcon />
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try: missing MRP on edible oil"
          aria-label="Search inspections by product name or violation type"
          className="w-full rounded-xl border border-white/15 bg-black/30 py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-saffron/70 focus:outline-none focus:ring-2 focus:ring-saffron/30"
        />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Examples</span>
        {EXAMPLE_QUERIES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => setQuery(example)}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300 transition-colors hover:border-saffron/50 hover:text-white"
          >
            {example}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs text-slate-400" aria-live="polite">
        {status === 'ready' &&
          (hasQuery
            ? `${results.length} of ${rows.length} inspections match, ranked by simulated vector similarity`
            : `${rows.length} inspections, newest first`)}
        {status === 'loading' && 'Loading the inspection index...'}
      </p>

      {status === 'error' && (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-fail/40 bg-fail/10 px-4 py-3 text-sm text-rose-200">
          <span className="min-w-0 flex-1">{loadError}</span>
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            className="rounded-lg border border-white/20 px-3 py-1 text-xs font-medium text-white hover:bg-white/10"
          >
            Retry
          </button>
        </div>
      )}

      <div className="thin-scroll mt-2 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[860px] border-collapse text-left text-sm">
          <thead className="bg-white/[0.05] text-xs text-slate-400">
            <tr>
              {['Inspection', 'Product', 'Category', 'Source', 'When', 'Violations', 'Result', 'Similarity'].map((heading) => (
                <th key={heading} scope="col" className="whitespace-nowrap px-3 py-2.5 font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.length === 0 && status !== 'loading' && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">
                  {hasQuery
                    ? `No inspections match "${query.trim()}". Try "net quantity", "consumer care email" or "salt".`
                    : 'No inspections yet.'}
                </td>
              </tr>
            )}
            {results.map(({ row, score }) => {
              const selected = row.id === selectedId;
              const open = () =>
                onSelect({
                  id: row.id,
                  name: row.file_name ?? row.product_name,
                  src: row.image_src ?? assetUrl(row.image_url),
                  result: row.result,
                });
              return (
                <tr
                  key={row.id}
                  tabIndex={0}
                  aria-selected={selected}
                  onClick={open}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      open();
                    }
                  }}
                  className={`cursor-pointer border-t border-white/5 transition-colors ${
                    selected ? 'bg-saffron/10 shadow-[inset_3px_0_0_#ff9933]' : 'hover:bg-white/[0.05]'
                  }`}
                >
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-300">{row.id}</td>
                  <td className="px-3 py-2.5 font-medium text-white">{row.product_name}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-300">{row.category}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-400">{row.channel}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-400">{formatWhen(row.inspected_at)}</td>
                  <td className="px-3 py-2.5">
                    {row.violations.length === 0 ? (
                      <span className="text-xs text-slate-500">None</span>
                    ) : (
                      <span className="flex flex-wrap gap-1.5">
                        {row.violations.map((ruleId) => (
                          <span key={ruleId} className="rounded-full bg-fail/15 px-2 py-0.5 text-[11px] text-rose-300">
                            {RULE_SHORT[ruleId] ?? ruleId}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        row.status === 'PASS' ? 'bg-pass/15 text-pass' : 'bg-fail/15 text-rose-300'
                      }`}
                    >
                      {row.status === 'PASS' ? 'Pass' : 'Fail'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <SimilarityCell score={score} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
