/**
 * ============================================================================
 *  DRISHTICHECK | BatchUpload
 * ============================================================================
 *  Smart India Hackathon 2026 | Idea ID 146687 | Team ID 156249
 *  Team Name      : Drishti Check
 *  Architecture   : Team Drishti Check
 *  Lead developer : Tanmay Vijay More
 *  Institute      : Government College of Engineering and Research, Avasari Khurd
 * ============================================================================
 *
 *  Drag-and-drop zone + upload queue.
 *
 *  Upload flow
 *    1. onAnalysisStart()          -> Dashboard sets isAnalyzing = true
 *    2. POST /api/analyze AND a 1.5 s minimum "Analyzing with OpenCV & OCR..."
 *       state run in parallel (so the demo never flashes by too quickly)
 *    3. onBatchComplete(items)     -> Dashboard stores the queue and
 *                                     auto-selects items[0] on the canvas
 *    4. any failure                -> onAnalysisError(message)
 * ============================================================================
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { analyzeFiles, fetchSampleFile, fetchSamples } from '../api.js';

const PROCESSING_MS = 1500;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isImageFile = (file) => file.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp|svg)$/i.test(file.name);

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden="true">
      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
      <path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
    </svg>
  );
}

function QueueItem({ item, selected, onSelect }) {
  const { compliance, product } = item.result;
  const ok = compliance.overall_pass;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(item)}
        aria-pressed={selected}
        className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors ${
          selected
            ? 'border-saffron/70 bg-saffron/10 ring-1 ring-saffron/40'
            : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]'
        }`}
      >
        <img src={item.src} alt="" className="h-14 w-11 shrink-0 rounded-md border border-white/10 object-cover" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-white">{product.name}</span>
          <span className="block truncate text-xs text-slate-400">{item.name}</span>
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
            ok ? 'bg-pass/15 text-pass' : 'bg-fail/15 text-rose-300'
          }`}
        >
          {compliance.passed}/{compliance.total}
        </span>
      </button>
    </li>
  );
}

export default function BatchUpload({
  queue,
  selectedId,
  isAnalyzing,
  error,
  onAnalysisStart,
  onBatchComplete,
  onAnalysisError,
  onSelect,
}) {
  const inputRef = useRef(null);
  const dragDepth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);

  // Drives the progress bar for the 1.5 s processing state.
  useEffect(() => {
    if (!isAnalyzing) {
      setProgress(0);
      return undefined;
    }
    const startedAt = performance.now();
    const timer = setInterval(() => {
      setProgress(Math.min(100, ((performance.now() - startedAt) / PROCESSING_MS) * 100));
    }, 40);
    return () => clearInterval(timer);
  }, [isAnalyzing]);

  const processFiles = useCallback(
    async (fileList) => {
      const files = Array.from(fileList).filter(isImageFile);
      if (files.length === 0) {
        onAnalysisError('No images found. Add JPG, PNG, WebP or SVG photos of a product label.');
        return;
      }
      onAnalysisStart();
      try {
        const [payload] = await Promise.all([analyzeFiles(files), wait(PROCESSING_MS)]);
        if (!payload || !Array.isArray(payload.results) || payload.results.length === 0) {
          throw new Error('Analysis response did not contain detection results.');
        }
        const stamp = Date.now().toString(36).toUpperCase();
        // Object URLs live for the whole session so history rows can reopen these images.
        const items = files.map((file, index) => {
          const result = payload.results[index] || payload.results[0];
          return {
            id: `LIVE-${stamp}-${index + 1}`,
            name: file.name,
            src: URL.createObjectURL(file),
            result,
          };
        });
        onBatchComplete(items);
      } catch (err) {
        // Prevent silently substituting demo labels on failure; surface the exact error to user
        onAnalysisError(err.message || 'Analysis failed. Please check network or file format.');
      }
    },
    [onAnalysisStart, onBatchComplete, onAnalysisError],
  );

  const loadDemoLabels = async () => {
    if (isAnalyzing) return;
    try {
      const samples = await fetchSamples();
      const files = await Promise.all(samples.map(fetchSampleFile));
      await processFiles(files);
    } catch (err) {
      onAnalysisError(err.message);
    }
  };

  const openPicker = () => {
    if (!isAnalyzing) inputRef.current?.click();
  };

  const handleDragEnter = (event) => {
    event.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  };
  const handleDragLeave = (event) => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  };
  const handleDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };
  const handleDrop = (event) => {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    if (!isAnalyzing) processFiles(event.dataTransfer.files);
  };

  const flagged = queue.filter((item) => !item.result.compliance.overall_pass).length;

  return (
    <aside className="glass p-4" aria-label="Batch upload">
      <h2 className="font-display font-wide text-base font-bold text-white">Upload labels</h2>

      <div
        role="button"
        tabIndex={0}
        aria-busy={isAnalyzing}
        aria-label="Drop label images here or press Enter to browse"
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPicker();
          }
        }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`relative mt-3 flex min-h-[176px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
          isDragging
            ? 'border-saffron bg-saffron/10'
            : 'border-white/20 bg-white/[0.02] hover:border-white/40 hover:bg-white/[0.05]'
        } ${isAnalyzing ? 'pointer-events-none' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.svg"
          multiple
          className="hidden"
          onChange={(event) => {
            processFiles(event.target.files);
            event.target.value = '';
          }}
        />

        {isAnalyzing ? (
          <div className="w-full" aria-live="polite">
            <div className="scanline" aria-hidden="true" />
            <p className="text-sm font-semibold text-white">Analyzing with OpenCV &amp; OCR...</p>
            <p className="mt-1 text-xs text-slate-400">Detecting text regions and checking each declaration</p>
            <div className="mx-auto mt-4 h-1.5 w-full max-w-[240px] overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-saffron via-white to-india transition-[width] duration-75"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            <span className={isDragging ? 'text-saffron' : 'text-slate-400'}>
              <UploadIcon />
            </span>
            <p className="mt-2 text-sm font-semibold text-white">
              {isDragging ? 'Release to start the inspection' : 'Drop label photos here'}
            </p>
            <p className="mt-1 text-xs text-slate-400">or click to browse. JPG, PNG, WebP or SVG, up to 20 at once.</p>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={loadDemoLabels}
        disabled={isAnalyzing}
        className="mt-3 w-full rounded-xl bg-saffron px-4 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-saffron-soft disabled:cursor-not-allowed disabled:opacity-50"
      >
        Load 5 demo labels
      </button>

      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-fail/40 bg-fail/10 px-3 py-2 text-xs leading-relaxed text-rose-200">
          {error}
        </p>
      )}

      <div className="mt-5 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-white">Upload queue</h3>
        {queue.length > 0 && (
          <span className="text-xs text-slate-400">
            {queue.length} scanned, {flagged} flagged
          </span>
        )}
      </div>

      {queue.length === 0 ? (
        <p className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-4 text-sm text-slate-400">
          Nothing queued yet. Drop labels above, or load the demo set to see every kind of violation.
        </p>
      ) : (
        <ul className="thin-scroll mt-2 max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {queue.map((item) => (
            <QueueItem key={item.id} item={item} selected={item.id === selectedId} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </aside>
  );
}
