import { useState, useEffect } from "react";

export const CountdownTimer = () => {
  const targetDate = new Date("2025-02-06T20:00:00");
  const registrationEndDate = new Date("2025-02-06T18:00:00");
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const [registrationTimeLeft, setRegistrationTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().getTime();
      const webinarDistance = targetDate.getTime() - now;
      const registrationDistance = registrationEndDate.getTime() - now;

      setTimeLeft({
        days: Math.floor(webinarDistance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((webinarDistance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((webinarDistance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((webinarDistance % (1000 * 60)) / 1000),
      });

      setRegistrationTimeLeft({
        days: Math.floor(registrationDistance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((registrationDistance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((registrationDistance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((registrationDistance % (1000 * 60)) / 1000),
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-center space-x-2 space-x-reverse text-red-400">
          <span className="text-2xl">🔥</span>
          <h3 className="text-xl font-bold">זהו הוובינר האחרון לפני שהתוכנית נסגרת!</h3>
        </div>
        
        <div className="text-center space-y-2">
          <p className="text-lg">⏳ נותרו רק 20 מקומות פנויים – ההרשמה נסגרת בקרוב!</p>
          <p className="text-lg">📌 ההרשמה לוובינר נסגרת ב-6.2 בשעה 18:00!</p>
        </div>

        <div className="bg-white/20 p-4 rounded-lg">
          <p className="text-lg mb-2">⏱️ ההרשמה נסגרת בעוד:</p>
          <div className="grid grid-cols-4 gap-2">
            <div className="glass-card p-2">
              <div className="text-2xl font-bold">{registrationTimeLeft.days}</div>
              <div className="text-sm">ימים</div>
            </div>
            <div className="glass-card p-2">
              <div className="text-2xl font-bold">{registrationTimeLeft.hours}</div>
              <div className="text-sm">שעות</div>
            </div>
            <div className="glass-card p-2">
              <div className="text-2xl font-bold">{registrationTimeLeft.minutes}</div>
              <div className="text-sm">דקות</div>
            </div>
            <div className="glass-card p-2">
              <div className="text-2xl font-bold">{registrationTimeLeft.seconds}</div>
              <div className="text-sm">שניות</div>
            </div>
          </div>
        </div>

        <div className="bg-white/20 p-4 rounded-lg">
          <p className="text-lg mb-2">📅 הוובינר מתקיים בעוד:</p>
          <div className="grid grid-cols-4 gap-2">
            <div className="glass-card p-2">
              <div className="text-2xl font-bold">{timeLeft.days}</div>
              <div className="text-sm">ימים</div>
            </div>
            <div className="glass-card p-2">
              <div className="text-2xl font-bold">{timeLeft.hours}</div>
              <div className="text-sm">שעות</div>
            </div>
            <div className="glass-card p-2">
              <div className="text-2xl font-bold">{timeLeft.minutes}</div>
              <div className="text-sm">דקות</div>
            </div>
            <div className="glass-card p-2">
              <div className="text-2xl font-bold">{timeLeft.seconds}</div>
              <div className="text-sm">שניות</div>
            </div>
          </div>
        </div>

        <p className="text-lg font-bold">📅 תחילת התוכנית: 9.2.2025 – אל תישארו מאחור!</p>
      </div>
    </div>
  );
};