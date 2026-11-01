"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";

const scenes = [
  { name: "거래처", kind: "customer" },
  { name: "납품사진", kind: "delivery" },
  { name: "재고", kind: "inventory" },
] as const;

/** Original vector artwork. All geometry, lighting and motion are rendered locally. */
function SceneArtwork({ kind }: { kind: typeof scenes[number]["kind"] }) {
  return <svg className={`motion-art motion-art--${kind}`} viewBox="0 0 240 190" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id={`${kind}-porcelain`} x1="45" y1="20" x2="170" y2="180" gradientUnits="userSpaceOnUse"><stop stopColor="#fff" /><stop offset=".48" stopColor="#e3eae7" /><stop offset="1" stopColor="#a4b9b5" /></linearGradient>
      <linearGradient id={`${kind}-edge`} x1="80" y1="50" x2="170" y2="170" gradientUnits="userSpaceOnUse"><stop stopColor="#c7d6d1" /><stop offset="1" stopColor="#71938e" /></linearGradient>
      <linearGradient id={`${kind}-teal`} x1="70" y1="35" x2="170" y2="150" gradientUnits="userSpaceOnUse"><stop stopColor="#69bfae" /><stop offset=".5" stopColor="#328c80" /><stop offset="1" stopColor="#194e4e" /></linearGradient>
      <radialGradient id={`${kind}-lens`}><stop stopColor="#9ddccc" /><stop offset=".22" stopColor="#3b7d79" /><stop offset=".46" stopColor="#172f3d" /><stop offset=".74" stopColor="#2b535a" /><stop offset="1" stopColor="#102b38" /></radialGradient>
      <filter id={`${kind}-shadow`} x="-40%" y="-40%" width="180%" height="200%"><feDropShadow dx="0" dy="10" stdDeviation="7" floodColor="#214e48" floodOpacity=".18" /></filter>
      <filter id={`${kind}-small-shadow`} x="-40%" y="-40%" width="180%" height="200%"><feDropShadow dx="0" dy="3" stdDeviation="2" floodColor="#244d48" floodOpacity=".2" /></filter>
    </defs>
    {kind === "customer" ? <>
      <g className="motion-directory" filter="url(#customer-shadow)">
        <rect x="56" y="24" width="138" height="138" rx="18" fill="url(#customer-edge)" />
        <rect x="50" y="18" width="138" height="138" rx="18" fill="url(#customer-porcelain)" stroke="#fff" />
        <path d="M74 43H120" stroke="#345f59" strokeWidth="5" strokeLinecap="round" />
        {[0, 1, 2].map(i => <g key={i} className="motion-directory__row" style={{ "--row": i } as CSSProperties}>
          <rect x="69" y={62 + i * 26} width="20" height="18" rx="5" fill={i === 0 ? "#438b7c" : "#bccdc7"} />
          <path d={`M101 ${68 + i * 26}H165`} stroke={i === 0 ? "#477769" : "#93aaa1"} strokeWidth="4" strokeLinecap="round" />
          <path d={`M101 ${76 + i * 26}H143`} stroke="#b4c5be" strokeWidth="3" strokeLinecap="round" />
        </g>)}
      </g>
      <g className="motion-magnifier" filter="url(#customer-small-shadow)">
        <path d="M80 130L58 155" stroke="#709c93" strokeWidth="13" strokeLinecap="round" />
        <path d="M77 128L55 153" stroke="url(#customer-porcelain)" strokeWidth="10" strokeLinecap="round" />
        <circle cx="99" cy="106" r="31" fill="#5b9b8c" fillOpacity=".12" stroke="#8cafa3" strokeWidth="9" />
        <circle cx="97" cy="104" r="31" stroke="#fff" strokeWidth="6" />
        <path d="M77 97C80 87 88 82 97 82" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".8" />
      </g>
    </> : kind === "delivery" ? <>
      <g className="motion-receipt" filter="url(#delivery-small-shadow)"><rect x="132" y="15" width="62" height="86" rx="8" fill="#fafcf8" stroke="#d4e1da" /><path d="M146 37H179M146 48H176M146 59H162" stroke="#adc3b8" strokeWidth="3" strokeLinecap="round" /><circle cx="165" cy="78" r="11" fill="#4d9e86" /><path d="M160 78L164 82L171 74" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></g>
      <g className="motion-camera" filter="url(#delivery-shadow)">
        <path d="M43 75Q43 64 55 64H80L90 49H133L144 64H182Q194 64 194 76V139Q194 153 180 153H57Q43 153 43 139Z" fill="url(#delivery-edge)" />
        <path d="M38 69Q38 58 50 58H75L85 43H128L139 58H177Q189 58 189 70V133Q189 147 175 147H52Q38 147 38 133Z" fill="url(#delivery-porcelain)" stroke="#fff" />
        <rect x="147" y="70" width="23" height="12" rx="4" fill="#eff9ee" stroke="#a3c5b3" />
        <rect x="52" y="72" width="13" height="5" rx="2.5" fill="#86a89c" />
        <circle cx="114" cy="103" r="40" fill="#759b93" />
        <circle cx="111" cy="100" r="39" fill="url(#delivery-porcelain)" stroke="#fff" strokeWidth="2" />
        <circle cx="111" cy="100" r="30" fill="url(#delivery-lens)" stroke="#527a74" strokeWidth="2" />
        <g className="motion-camera__iris" transform="translate(111 100)">
          <path d="M0 -22L17 -9L20 10L0 22L-18 10L-18 -9Z" stroke="#a6d8c8" strokeOpacity=".55" strokeWidth="1.2" />
          <path d="M0 -22L-7 -1L-18 10M17 -9L-5 -7L-18 -9M20 10L4 -7L0 -22M0 22L8 0L17 -9M-18 10L6 7L20 10M-18 -9L-3 8L0 22" stroke="#a6d8c8" strokeOpacity=".4" />
        </g>
        <ellipse cx="102" cy="88" rx="11" ry="6" transform="rotate(-32 102 88)" fill="#e5fff4" opacity=".25" />
        <rect className="motion-camera__flash" x="147" y="70" width="23" height="12" rx="4" fill="white" />
      </g>
    </> : <>
      <ellipse cx="120" cy="160" rx="79" ry="13" fill="#345b4a" opacity=".08" />
      {[{ x: 46, y: 83, n: 0 }, { x: 116, y: 83, n: 1 }, { x: 81, y: 23, n: 2 }].map(({ x, y, n }) => <g key={n} className="motion-carton" style={{ "--carton": n } as CSSProperties} filter="url(#inventory-small-shadow)">
        <path d={`M${x} ${y + 21}L${x + 34} ${y + 3}L${x + 68} ${y + 21}L${x + 34} ${y + 41}Z`} fill={n === 2 ? "#80b8a2" : "#fafbf6"} stroke="#fff" strokeOpacity=".8" />
        <path d={`M${x} ${y + 21}L${x + 34} ${y + 41}V${y + 78}L${x} ${y + 58}Z`} fill={n === 2 ? "#3d8b71" : "#d6e1d7"} />
        <path d={`M${x + 34} ${y + 41}L${x + 68} ${y + 21}V${y + 58}L${x + 34} ${y + 78}Z`} fill={n === 2 ? "#286451" : "#a1b9a8"} />
        <path d={`M${x + 16} ${y + 12}L${x + 51} ${y + 31}V${y + 43}L${x + 43} ${y + 48}V${y + 36}L${x + 8} ${y + 17}Z`} fill={n === 2 ? "#d0e6d4" : "#89b49d"} />
        <path d={`M${x + 9} ${y + 46}L${x + 23} ${y + 54}M${x + 9} ${y + 51}L${x + 19} ${y + 57}`} stroke={n === 2 ? "#b1d6c1" : "#819b88"} strokeWidth="2" strokeLinecap="round" />
      </g>)}
    </>}
  </svg>;
}

export function LoginMotion() {
  const [active, setActive] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [visible, setVisible] = useState(true);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReducedMotion(preference.matches);
    const syncVisibility = () => setVisible(!document.hidden);
    syncMotion(); syncVisibility();
    preference.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => { preference.removeEventListener("change", syncMotion); document.removeEventListener("visibilitychange", syncVisibility); };
  }, []);

  const running = !reducedMotion && visible;
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setActive(value => (value + 1) % scenes.length), 4200);
    return () => window.clearInterval(timer);
  }, [running, active]);

  const trackPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!running || event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    stageRef.current?.style.setProperty("--pointer-x", `${(event.clientX - rect.left - rect.width / 2) / rect.width * 8}deg`);
    stageRef.current?.style.setProperty("--pointer-y", `${-(event.clientY - rect.top - rect.height / 2) / rect.height * 5}deg`);
  };
  const resetPointer = () => {
    stageRef.current?.style.setProperty("--pointer-x", "0deg");
    stageRef.current?.style.setProperty("--pointer-y", "0deg");
  };

  return <div className="login-motion" data-running={running} onPointerMove={trackPointer} onPointerLeave={resetPointer}>
    <div className="login-motion__stage" ref={stageRef} aria-hidden="true">
      <div className="login-motion__floor" />
      <div className="login-motion__rig">
        {scenes.map((scene, index) => {
          const position = (index - active + scenes.length) % scenes.length;
          return <div key={scene.kind} className="motion-panel" data-position={position} data-kind={scene.kind}>
            <div className="motion-panel__face">
              <SceneArtwork kind={scene.kind} />
              <div className="motion-panel__bottom"><strong>{scene.name}</strong><span className="motion-panel__check"><svg viewBox="0 0 16 16"><path d="m4 8 3 3 5-6" /></svg></span></div>
              <div className="motion-panel__sheen" />
            </div>
          </div>;
        })}
      </div>
    </div>
  </div>;
}
