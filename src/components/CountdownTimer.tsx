import { useState, useEffect } from "react";
import { motion } from "framer-motion";

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

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <div className="space-y-8">
      <motion.div 
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        className="glass-card p-8"
      >
        <div className="text-center space-y-6">
          <motion.div variants={item} className="mb-8">
            <h2 className="text-3xl font-bold mb-4">מה נלמד בוובינר? 🎯</h2>
            <p className="text-xl text-white/90 mb-6">
              וובינר מעשי שיחשוף בפניכם את הדרך המהירה ביותר להשתלב בהייטק
            </p>
          </motion.div>

          <motion.div variants={container} className="grid md:grid-cols-2 gap-6 text-right">
            <motion.div variants={item} className="glass-card p-4 hover:scale-105 transition-transform duration-300">
              <h3 className="text-lg font-bold mb-2">🚀 אסטרטגיית קריירה</h3>
              <p className="text-white/90">איך לבחור את המסלול הנכון עבורכם בהייטק ולהתקדם בו במהירות</p>
            </motion.div>

            <motion.div variants={item} className="glass-card p-4 hover:scale-105 transition-transform duration-300">
              <h3 className="text-lg font-bold mb-2">💼 טכניקות חיפוש עבודה</h3>
              <p className="text-white/90">שיטות מוכחות למציאת משרות נחשקות ויצירת קשרים בתעשייה</p>
            </motion.div>

            <motion.div variants={item} className="glass-card p-4 hover:scale-105 transition-transform duration-300">
              <h3 className="text-lg font-bold mb-2">📝 קורות חיים שעובדים</h3>
              <p className="text-white/90">איך ליצור קורות חיים שמושכים תשומת לב של מגייסים</p>
            </motion.div>

            <motion.div variants={item} className="glass-card p-4 hover:scale-105 transition-transform duration-300">
              <h3 className="text-lg font-bold mb-2">🎯 ראיונות עבודה</h3>
              <p className="text-white/90">טיפים מעשיים להצלחה בראיונות עבודה טכניים ואישיים</p>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>

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