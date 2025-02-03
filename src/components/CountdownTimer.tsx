import { useState, useEffect } from "react";

export const CountdownTimer = () => {
  const targetDate = new Date("2024-02-06T20:00:00");
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().getTime();
      const distance = targetDate.getTime() - now;

      setTimeLeft({
        days: Math.floor(distance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000),
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="glass-card p-4 text-center">
      <div className="grid grid-cols-4 gap-2 text-lg">
        <div>
          <div className="font-bold">{timeLeft.days}</div>
          <div className="text-sm">ימים</div>
        </div>
        <div>
          <div className="font-bold">{timeLeft.hours}</div>
          <div className="text-sm">שעות</div>
        </div>
        <div>
          <div className="font-bold">{timeLeft.minutes}</div>
          <div className="text-sm">דקות</div>
        </div>
        <div>
          <div className="font-bold">{timeLeft.seconds}</div>
          <div className="text-sm">שניות</div>
        </div>
      </div>
    </div>
  );
};