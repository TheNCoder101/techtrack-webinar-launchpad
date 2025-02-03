import { useState, useEffect } from "react";

export const CountdownTimer = () => {
  const registrationEndDate = new Date("2025-02-06T18:00:00");
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().getTime();
      const registrationDistance = registrationEndDate.getTime() - now;

      if (registrationDistance < 0) {
        setTimeLeft({
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
        });
        clearInterval(timer);
        return;
      }

      setTimeLeft({
        days: Math.floor(registrationDistance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((registrationDistance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((registrationDistance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((registrationDistance % (1000 * 60)) / 1000),
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-4">
      <div className="glass-card p-6">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center space-x-2 space-x-reverse text-red-400">
            <span className="text-2xl">⚡️</span>
            <h3 className="text-xl font-bold">זמן ההרשמה לוובינר מתקרב לסיומו!</h3>
          </div>
          
          <div className="glass-card p-4 inline-block">
            <div className="text-lg space-y-2">
              <p className="font-bold">📅 מועד הוובינר:</p>
              <p className="text-xl">יום חמישי | 6.2.2025 | 20:00</p>
            </div>
          </div>

          <div className="bg-white/20 p-4 rounded-lg">
            <p className="text-lg mb-4">⏱️ הזמן שנותר להרשמה:</p>
            <div className="flex justify-between items-center gap-4">
              <div className="glass-card p-2 flex-1">
                <div className="text-2xl font-bold">{timeLeft.days}</div>
                <div className="text-sm">ימים</div>
              </div>
              <div className="flex gap-2 flex-[3]">
                <div className="glass-card p-2 flex-1">
                  <div className="text-2xl font-bold">{timeLeft.hours}</div>
                  <div className="text-sm">שעות</div>
                </div>
                <div className="glass-card p-2 flex-1">
                  <div className="text-2xl font-bold">{timeLeft.minutes}</div>
                  <div className="text-sm">דקות</div>
                </div>
                <div className="glass-card p-2 flex-1">
                  <div className="text-2xl font-bold">{timeLeft.seconds}</div>
                  <div className="text-sm">שניות</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};