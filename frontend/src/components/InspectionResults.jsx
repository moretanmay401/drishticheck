/**
 * ============================================================================
 *  DRISHTICHECK | InspectionResults
 * ============================================================================
 *  Smart India Hackathon 2026 | Idea ID 146687 | Team ID 156249
 *  Team Name      : Drishti Check
 *  Architecture   : Team Drishti Check
 *  Lead developer : Tanmay Vijay More
 *  Institute      : Government College of Engineering and Research, Avasari Khurd
 * ============================================================================
 *
 *  Left  : image canvas with CSS bounding boxes overlaid on the label.
 *  Right : one rule card per Legal Metrology declaration.
 *
 *  Box placement
 *    The backend returns boxes as {x, y, w, h} in `coordinate_space`
 *    (800 x 1000). Each box is positioned with percentages of that space, so it
 *    stays aligned with the image at any rendered size. The overlay is an
 *    absolutely positioned layer that exactly covers the <img>.
 *
 *  Linking boxes and cards (explainability)
 *    hover or focus a card  -> its box is highlighted, the others dim
 *    hover or focus a box   -> its card is highlighted
 *    click either           -> pin the highlight so it survives mouse-out
 * ============================================================================
 */
import { useEffect, useState } from 'react';

const DEFAULT_SPACE = { width: 800, height: 1000 };

const FIELD_LABELS = {
  amount: 'Amount',
  tax_inclusive: 'Incl. of all taxes',
  quantity: 'Quantity',
  si_unit: 'SI unit',
  month: 'Month',
  year: 'Year',
  name: 'Name',
  full_address: 'Full address',
  address: 'Address',
  phone: 'Phone',
  email: 'E-mail',
};

function CheckIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </svg>
  );
}

function CrossIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
    </svg>
  );
}

/** Converts a backend box into percentage-based CSS placement. */
function boxStyle(bbox, space) {
  return {
    left: `${(bbox.x / space.width) * 100}%`,
    top: `${(bbox.y / space.height) * 100}%`,
    width: `${(bbox.w / space.width) * 100}%`,
    height: `${(bbox.h / space.height) * 100}%`,
  };
}

function ComplianceRing({ passed, total }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const allPassed = passed === total;
  return (
    <div className="relative h-16 w-16 shrink-0" role="img" aria-label={`${passed} of ${total} declarations verified`}>
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" strokeWidth="6" stroke={allPassed ? 'rgba(52,211,153,0.2)' : 'rgba(251,74,106,0.55)'} />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          stroke="#34d399"
          strokeDasharray={`${circumference * (total ? passed / total : 0)} ${circumference}`}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-display text-sm font-bold text-white">
        {passed}/{total}
      </span>
    </div>
  );
}

function AnalyzingOverlay() {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center overflow-hidden bg-ink-950/65 backdrop-blur-[2px]" role="status">
      <div className="scanline" aria-hidden="true" />
      <p className="rounded-full border border-white/15 bg-ink-900/90 px-4 py-2 text-sm font-medium text-white">
        Analyzing with OpenCV &amp; OCR...
      </p>
    </div>
  );
}

function BoundingBox({ check, space, active, dimmed, onEnter, onLeave, onToggle }) {
  const ok = check.compliant;
  const tone = ok
    ? 'border-pass bg-pass/10'
    : 'border-fail bg-fail/10';
  const glow = ok
    ? 'bg-pass/25 shadow-[0_0_0_3px_rgba(52,211,153,0.25),0_0_28px_rgba(52,211,153,0.65)]'
    : 'bg-fail/25 shadow-[0_0_0_3px_rgba(251,74,106,0.25),0_0_28px_rgba(251,74,106,0.65)]';
  const labelBelow = check.bbox.y / space.height < 0.05;
  return (
    <button
      type="button"
      style={boxStyle(check.bbox, space)}
      aria-label={`${check.title}: ${ok ? 'verified' : 'violation'}`}
      aria-pressed={active}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={onToggle}
      className={`absolute rounded-[3px] border-2 transition-all duration-150 ${tone} ${
        check.present ? '' : 'border-dashed'
      } ${active ? `z-20 ${glow}` : 'z-10'} ${dimmed ? 'opacity-30' : ''}`}
    >
      <span
        className={`pointer-events-none absolute left-[-2px] flex items-center gap-1 whitespace-nowrap rounded px-1.5 text-[10px] font-semibold leading-5 ${
          labelBelow ? 'top-full' : '-top-5'
        } ${ok ? 'bg-pass text-ink-950' : 'bg-fail text-white'}`}
      >
        {ok ? <CheckIcon className="h-3 w-3" /> : <CrossIcon className="h-3 w-3" />}
        {ok ? check.short : check.present ? `${check.short} invalid` : `${check.short} missing`}
      </span>
    </button>
  );
}

function RuleCard({ check, active, dimmed, onEnter, onLeave, onToggle }) {
  const ok = check.compliant;
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-pressed={active}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggle();
          }
        }}
        className={`cursor-pointer rounded-xl border p-3.5 transition-all duration-150 ${
          ok ? 'border-pass/25 hover:border-pass/60' : 'border-fail/35 hover:border-fail/70'
        } ${
          active ? (ok ? 'bg-pass/10 ring-2 ring-pass/50' : 'bg-fail/10 ring-2 ring-fail/50') : 'bg-white/[0.03]'
        } ${dimmed ? 'opacity-60' : ''}`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${
              ok ? 'bg-pass text-ink-950' : 'bg-fail text-white'
            }`}
          >
            {ok ? <CheckIcon /> : <CrossIcon />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
              <h3 className="text-sm font-semibold leading-snug text-white">{check.title}</h3>
              <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-400">
                {check.clause}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{check.requirement}</p>

            <p className="mt-2.5 break-words rounded-md bg-black/30 px-2 py-1.5 font-mono text-[11.5px] leading-relaxed text-slate-200">
              {check.detected_text ?? 'Nothing detected in the expected region'}
            </p>

            <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Sub-requirements">
              {Object.entries(check.fields).map(([field, passed]) => (
                <li
                  key={field}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                    passed ? 'bg-pass/15 text-pass' : 'bg-fail/15 text-rose-300'
                  }`}
                >
                  {passed ? <CheckIcon className="h-3 w-3" /> : <CrossIcon className="h-3 w-3" />}
                  {FIELD_LABELS[field] ?? field}
                </li>
              ))}
            </ul>

            <p className={`mt-2.5 text-xs leading-relaxed ${ok ? 'text-slate-400' : 'font-medium text-rose-300'}`}>
              {check.reason}
            </p>
            <p className="mt-1.5 text-[11px] text-slate-500">
              {check.present ? 'OCR' : 'Region'} confidence {Math.round(check.confidence * 100)}%
            </p>
          </div>
        </div>
      </div>
    </li>
  );
}

export default function InspectionResults({ selectedImage, inspectionResults, isAnalyzing }) {
  const [hoveredRule, setHoveredRule] = useState(null);
  const [pinnedRule, setPinnedRule] = useState(null);
  const [showOcrRegions, setShowOcrRegions] = useState(false);

  // A different label starts with a clean highlight state.
  useEffect(() => {
    setHoveredRule(null);
    setPinnedRule(null);
  }, [selectedImage?.id]);

  const activeRule = hoveredRule ?? pinnedRule;
  const space = inspectionResults?.coordinate_space ?? DEFAULT_SPACE;
  const checks = inspectionResults?.checks ?? [];
  const compliance = inspectionResults?.compliance;
  const togglePin = (ruleId) => setPinnedRule((current) => (current === ruleId ? null : ruleId));

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]" aria-label="Inspection results">
      {/* ------------------------------ Canvas ------------------------------ */}
      <div className="glass p-4 xl:sticky xl:top-24 xl:self-start">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display font-wide text-base font-bold text-white">Label canvas</h2>
            <p className="truncate text-xs text-slate-400">
              {selectedImage ? selectedImage.name : 'No label selected'}
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={showOcrRegions}
              onChange={(event) => setShowOcrRegions(event.target.checked)}
            />
            <span className="relative h-5 w-9 rounded-full bg-white/15 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-saffron peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-saffron" />
            Show every OCR region
          </label>
        </div>

        <div className="mt-3">
          {selectedImage ? (
            <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-xl border border-white/10 bg-black/40">
              <img
                src={selectedImage.src}
                alt={`Product label: ${selectedImage.name}`}
                draggable={false}
                className="block max-h-[72vh] w-auto max-w-full select-none"
              />
              {inspectionResults && (
                <div className="absolute inset-0">
                  {showOcrRegions &&
                    inspectionResults.ocr_blocks
                      .filter((block) => !block.rule_id)
                      .map((block) => (
                        <div
                          key={block.id}
                          style={boxStyle(block.bbox, space)}
                          title={`${block.text} (${Math.round(block.confidence * 100)}%)`}
                          className="pointer-events-none absolute rounded-[2px] border border-dashed border-cyan-300/80 bg-cyan-300/10"
                        />
                      ))}
                  {checks.map((check) => (
                    <BoundingBox
                      key={check.rule_id}
                      check={check}
                      space={space}
                      active={activeRule === check.rule_id}
                      dimmed={activeRule !== null && activeRule !== check.rule_id}
                      onEnter={() => setHoveredRule(check.rule_id)}
                      onLeave={() => setHoveredRule(null)}
                      onToggle={() => togglePin(check.rule_id)}
                    />
                  ))}
                </div>
              )}
              {isAnalyzing && <AnalyzingOverlay />}
            </div>
          ) : (
            <div className="relative grid min-h-[420px] place-items-center overflow-hidden rounded-xl border border-dashed border-white/15 p-8 text-center">
              <div>
                <p className="font-display font-wide text-lg font-bold text-white">No label selected</p>
                <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-slate-400">
                  Drop pack photos in the upload panel, load the demo set, or reopen a past inspection from the
                  history table.
                </p>
              </div>
              {isAnalyzing && <AnalyzingOverlay />}
            </div>
          )}
        </div>

        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-400" aria-label="Legend">
          <li className="flex items-center gap-2">
            <span className="h-3 w-5 rounded-[2px] border-2 border-pass bg-pass/10" aria-hidden="true" />
            Declaration verified
          </li>
          <li className="flex items-center gap-2">
            <span className="h-3 w-5 rounded-[2px] border-2 border-fail bg-fail/10" aria-hidden="true" />
            Declaration invalid
          </li>
          <li className="flex items-center gap-2">
            <span className="h-3 w-5 rounded-[2px] border-2 border-dashed border-fail bg-fail/10" aria-hidden="true" />
            Declaration missing
          </li>
        </ul>
      </div>

      {/* ---------------------------- Rules panel ---------------------------- */}
      <div className="glass p-4" aria-busy={isAnalyzing}>
        {!inspectionResults ? (
          <>
            <h2 className="font-display font-wide text-base font-bold text-white">What gets checked</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">
              Every label is tested against these five mandatory declarations.
            </p>
            <ul className="mt-4 space-y-2.5">
              {[
                'MRP, inclusive of all taxes, must be clearly indicated.',
                'Net quantity must be furnished in SI units.',
                'The month and year of manufacture or packing must be present.',
                'Name and complete address of the manufacturer or packer must be conspicuous.',
                'Consumer care name, address, telephone number and e-mail address must be provided.',
              ].map((text) => (
                <li key={text} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-slate-300">
                  {text}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <ComplianceRing passed={compliance.passed} total={compliance.total} />
              <div className="min-w-0">
                <p className={`font-display font-wide text-lg font-extrabold ${compliance.overall_pass ? 'text-pass' : 'text-rose-300'}`}>
                  {compliance.overall_pass ? 'Compliant' : 'Non-compliant'}
                </p>
                <p className="text-sm text-slate-300">
                  {compliance.overall_pass
                    ? 'All five declarations verified'
                    : `${compliance.failed} of ${compliance.total} declarations need correction`}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-400">
                  {inspectionResults.product.name}, {inspectionResults.product.pack_size}
                </p>
              </div>
            </div>

            <ul className="mt-4 space-y-3">
              {checks.map((check) => (
                <RuleCard
                  key={check.rule_id}
                  check={check}
                  active={activeRule === check.rule_id}
                  dimmed={activeRule !== null && activeRule !== check.rule_id}
                  onEnter={() => setHoveredRule(check.rule_id)}
                  onLeave={() => setHoveredRule(null)}
                  onToggle={() => togglePin(check.rule_id)}
                />
              ))}
            </ul>

            <details className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
              <summary className="cursor-pointer font-medium text-white">How this result was produced</summary>
              <ol className="mt-3 space-y-2">
                {inspectionResults.pipeline.stages.map((stage) => (
                  <li key={stage.name} className="flex items-start justify-between gap-3 text-xs">
                    <span>
                      <span className="block font-medium text-slate-200">{stage.name}</span>
                      <span className="block text-slate-400">
                        {stage.engine}. {stage.detail}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-slate-400">{stage.ms} ms</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-[11px] text-slate-500">
                Prototype: OCR output is simulated.
                {inspectionResults.image.decoded_with_opencv &&
                  ` Image decoded by OpenCV (${inspectionResults.image.width} x ${inspectionResults.image.height}px, sharpness ${inspectionResults.image.sharpness}).`}
              </p>
            </details>

            <details className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
              <summary className="cursor-pointer font-medium text-white">Raw OCR text</summary>
              <pre className="thin-scroll mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-black/30 p-2.5 font-mono text-[11.5px] leading-relaxed text-slate-300">
                {inspectionResults.ocr_text}
              </pre>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
