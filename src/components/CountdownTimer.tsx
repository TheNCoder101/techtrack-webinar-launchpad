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
    <div className="space-y-6 animate-fade-up">
      <div className="timer-card space-y-4">
        <div className="flex items-center justify-center space-x-2 space-x-reverse">
          <span className="text-2xl">🔥</span>
          <h3 className="text-xl font-bold bg-gradient-to-r from-secondary to-accent bg-clip-text text-transparent">
            הוובינר האחרון לפני סגירת ההרשמה!
          </h3>
        </div>
        
        <div className="text-center space-y-4">
          <div className="timer-card p-6 space-y-4">
            <p className="text-lg mb-2">⏱️ זמן עד לוובינר:</p>
            <div className="flex justify-center gap-4 rtl">
              <div className="text-center">
                <div className="timer-digit">{timeLeft.days}</div>
                <div className="timer-label">ימים</div>
              </div>
              <div className="text-center">
                <div className="timer-digit">{timeLeft.hours}</div>
                <div className="timer-label">שעות</div>
              </div>
              <div className="text-center">
                <div className="timer-digit">{timeLeft.minutes}</div>
                <div className="timer-label">דקות</div>
              </div>
              <div className="text-center">
                <div className="timer-digit">{timeLeft.seconds}</div>
                <div className="timer-label">שניות</div>
              </div>
            </div>
          </div>

          <div className="timer-card p-6 space-y-4">
            <p className="text-lg mb-2">⚡ ההרשמה נסגרת בעוד:</p>
            <div className="flex justify-center gap-4 rtl">
              <div className="text-center">
                <div className="timer-digit">{registrationTimeLeft.days}</div>
                <div className="timer-label">ימים</div>
              </div>
              <div className="text-center">
                <div className="timer-digit">{registrationTimeLeft.hours}</div>
                <div className="timer-label">שעות</div>
              </div>
              <div className="text-center">
                <div className="timer-digit">{registrationTimeLeft.minutes}</div>
                <div className="timer-label">דקות</div>
              </div>
              <div className="text-center">
                <div className="timer-digit">{registrationTimeLeft.seconds}</div>
                <div className="timer-label">שניות</div>
              </div>
            </div>
          </div>
        </div>

        <p className="text-lg font-bold text-center bg-white/10 p-4 rounded-lg">
          📅 תחילת התוכנית: 9.2.2025
        </p>
      </div>
    </div>
  );
};