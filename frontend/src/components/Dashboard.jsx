/**
 * ============================================================================
 *  DRISHTICHECK | Dashboard (React state controller)
 * ============================================================================
 *  Smart India Hackathon 2026 | Idea ID 146687 | Team ID 156249
 *  Team Name      : Drishti Check
 *  Architecture   : Team Drishti Check
 *  Lead developer : Tanmay Vijay More
 *  Institute      : Government College of Engineering and Research, Avasari Khurd
 * ============================================================================
 *
 *  Owns every piece of state that more than one panel needs:
 *
 *    selectedImage      { id, name, src }  what the central canvas is showing
 *    isAnalyzing        boolean            true during the OpenCV + OCR stage
 *    inspectionResults  analysis JSON      bounding boxes + PASS/FAIL per rule
 *    queue              [item]             the current upload batch
 *    liveRecords        [record]           this session's inspections, which are
 *                                          prepended to the search history table
 *
 *  Data flow
 *    BatchUpload        -> onAnalysisStart / onBatchComplete / onAnalysisError
 *    queue + history    -> onSelect(item)   (one handler, one source of truth)
 *    InspectionResults  <- selectedImage, inspectionResults, isAnalyzing
 *
 *  `item` shape used by queue and history selection:
 *    { id, name, src, result }
 * ============================================================================
 */
import { useCallback, useEffect, useState } from 'react';
import BatchUpload from './BatchUpload.jsx';
import InspectionResults from './InspectionResults.jsx';
import SmartSearchHistory from './SmartSearchHistory.jsx';
import { pingHealth } from '../api.js';

/** Converts a freshly analyzed queue item into a row for the history table. */
function toHistoryRecord(item) {
  const { product, compliance, checks } = item.result;
  return {
    id: item.id,
    product_id: product.id,
    product_name: product.name,
    category: product.category,
    channel: 'Live upload',
    inspected_at: new Date().toISOString(),
    status: compliance.overall_pass ? 'PASS' : 'FAIL',
    violations: checks.filter((check) => !check.compliant).map((check) => check.rule_id),
    file_name: item.name,
    image_src: item.src,
    result: item.result,
  };
}

function EyeMark() {
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10 shrink-0" aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="#101a3a" stroke="rgba(255,255,255,0.16)" />
      <path
        d="M6 20c4-6.5 9-9.5 14-9.5S30 13.5 34 20c-4 6.5-9 9.5-14 9.5S10 26.5 6 20z"
        fill="none"
        stroke="#ff9933"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="20" r="5.2" fill="none" stroke="#ffffff" strokeWidth="2" />
      <circle cx="20" cy="20" r="1.9" fill="#138808" />
    </svg>
  );
}

function ApiStatus({ online }) {
  const tone =
    online === null ? 'bg-slate-400' : online ? 'bg-pass shadow-[0_0_8px_rgba(52,211,153,0.9)]' : 'bg-fail';
  const label = online === null ? 'Checking API' : online ? 'API online' : 'API offline';
  return (
    <span className="chip" role="status">
      <span className={`h-2 w-2 rounded-full ${tone}`} aria-hidden="true" />
      {label}
    </span>
  );
}

export default function Dashboard() {
  const [queue, setQueue] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [inspectionResults, setInspectionResults] = useState(null);
  const [liveRecords, setLiveRecords] = useState([]);
  const [uploadError, setUploadError] = useState(null);
  const [apiOnline, setApiOnline] = useState(null);

  // Poll the backend so the header shows whether the demo API is reachable.
  useEffect(() => {
    const controller = new AbortController();
    const check = async () => {
      const ok = await pingHealth(controller.signal);
      if (!controller.signal.aborted) setApiOnline(ok);
    };
    check();
    const timer = setInterval(check, 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  // Single selection path: clicking a queue item or a history row lands here,
  // so the central canvas and the rule panel always change together.
  const handleSelect = useCallback((item) => {
    setSelectedImage({ id: item.id, name: item.name, src: item.src });
    setInspectionResults(item.result);
  }, []);

  const handleAnalysisStart = useCallback(() => {
    setUploadError(null);
    setIsAnalyzing(true);
  }, []);

  // Receives the whole analyzed batch, then auto-selects the first image.
  const handleBatchComplete = useCallback(
    (items) => {
      setQueue(items);
      setLiveRecords((previous) => [...items.map(toHistoryRecord), ...previous]);
      if (items.length > 0) handleSelect(items[0]);
      setIsAnalyzing(false);
    },
    [handleSelect],
  );

  const handleAnalysisError = useCallback((message) => {
    setUploadError(message);
    setIsAnalyzing(false);
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-ink-950/75 backdrop-blur-xl">
        <div className="h-[3px] bg-gradient-to-r from-[#ff9933] via-white to-[#138808]" aria-hidden="true" />
        <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-3">
          <div className="flex items-center gap-3">
            <EyeMark />
            <div>
              <h1 className="font-display font-wide text-xl font-extrabold leading-none tracking-tight text-white">
                DrishtiCheck
              </h1>
              <p className="mt-1 text-xs text-slate-400">Legal Metrology label inspector</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip border-saffron/40 text-saffron-soft">Smart India Hackathon 2026</span>
            <span className="chip">Idea ID 146687</span>
            <span className="chip">Team ID 156249</span>
            <span className="chip">Team Drishti Check</span>
            <ApiStatus online={apiOnline} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1560px] flex-1 px-5 py-6">
        <div className="mb-5 max-w-3xl">
          <h2 className="font-display font-wide text-2xl font-bold tracking-tight text-white">
            Inspect a packaged-food label
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
            Add pack photos and DrishtiCheck reads the label, then marks each of the five mandatory declarations
            under the Legal Metrology (Packaged Commodities) Rules, 2011 as verified or violated, directly on the
            image.
          </p>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
          <BatchUpload
            queue={queue}
            selectedId={selectedImage?.id ?? null}
            isAnalyzing={isAnalyzing}
            error={uploadError}
            onAnalysisStart={handleAnalysisStart}
            onBatchComplete={handleBatchComplete}
            onAnalysisError={handleAnalysisError}
            onSelect={handleSelect}
          />
          <InspectionResults
            selectedImage={selectedImage}
            inspectionResults={inspectionResults}
            isAnalyzing={isAnalyzing}
          />
        </div>

        <div className="mt-5">
          <SmartSearchHistory
            liveRecords={liveRecords}
            selectedId={selectedImage?.id ?? null}
            onSelect={handleSelect}
          />
        </div>
      </main>

      <footer className="border-t border-white/10 px-5 py-5 text-xs leading-relaxed text-slate-500">
        <div className="mx-auto max-w-[1560px]">
          <p>
            Architected by Team Drishti Check. Lead developer: Tanmay Vijay More, Government College of Engineering
            and Research, Avasari Khurd.
          </p>
          <p className="mt-1">
            Prototype notice: demo labels are synthetic and OCR results are simulated. No real product has been
            audited.
          </p>
        </div>
      </footer>
    </div>
  );
}
