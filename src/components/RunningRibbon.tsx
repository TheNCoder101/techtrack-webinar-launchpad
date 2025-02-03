import { useEffect, useRef } from 'react';

export const RunningRibbon = () => {
  const ribbonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ribbonRef.current;
    if (!element) return;

    const scroll = () => {
      element.style.transform = `translateX(${(Date.now() / 50) % 100}%)`;
      requestAnimationFrame(scroll);
    };

    const animation = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(animation);
  }, []);

  return (
    <div className="bg-primary overflow-hidden py-2 relative">
      <div 
        ref={ribbonRef}
        className="whitespace-nowrap font-mono text-white/90 text-sm"
        style={{ width: "200%" }}
      >
        <span className="inline-block px-4">
          🚀 TECH TRACK ACCELERATOR - תכנית האצת הקריירה המובילה בישראל 
        </span>
        <span className="inline-block px-4">
          💼 יותר מ-500 בוגרים כבר עובדים בהייטק תוך פחות מ-3 חודשים! 
        </span>
        <span className="inline-block px-4">
          🎯 הצטרפו לוובינר והתחילו את המסע המהיר שלכם להייטק 
        </span>
      </div>
    </div>
  );
};