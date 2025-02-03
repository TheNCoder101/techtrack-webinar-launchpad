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
    const calculateTimeLeft = () => {
      const difference = registrationEndDate.getTime() - new Date().getTime();
      
      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        });
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

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
            <h2 className="text-3xl font-bold mb-4">תכנית Tech Track - המסלול המהיר להייטק 🚀</h2>
            <p className="text-xl text-white/90 mb-6">
              וובינר מקיף שיחשוף בפניכם את כל הפרטים על התכנית, כולל עלויות והטבות מיוחדות
            </p>
          </motion.div>

          <motion.div variants={container} className="grid md:grid-cols-2 gap-6 text-right">
            <motion.div variants={item} className="glass-card p-4 hover:scale-105 transition-transform duration-300">
              <h3 className="text-lg font-bold mb-2">💰 עלויות ומימון</h3>
              <p className="text-white/90">פירוט מלא של עלויות התכנית, אפשרויות מימון והנחות מיוחדות למשרתי צו 8</p>
            </motion.div>

            <motion.div variants={item} className="glass-card p-4 hover:scale-105 transition-transform duration-300">
              <h3 className="text-lg font-bold mb-2">📚 מבנה התכנית</h3>
              <p className="text-white/90">סקירה מקיפה של שלבי התכנית, משך הלימודים ותכני הקורס</p>
            </motion.div>

            <motion.div variants={item} className="glass-card p-4 hover:scale-105 transition-transform duration-300">
              <h3 className="text-lg font-bold mb-2">👥 ליווי אישי</h3>
              <p className="text-white/90">פירוט על מערך הליווי האישי והמנטורינג לאורך כל הדרך</p>
            </motion.div>

            <motion.div variants={item} className="glass-card p-4 hover:scale-105 transition-transform duration-300">
              <h3 className="text-lg font-bold mb-2">✅ תנאי קבלה</h3>
              <p className="text-white/90">דרישות הקבלה לתכנית ותהליך המיון המלא</p>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>

      <div className="glass-card p-6">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center space-x-2 space-x-reverse text-red-400">
            <span>⏰</span>
            <h3 className="text-xl font-bold">הוובינר מתחיל בעוד:</h3>
          </div>
          
          <div className="flex justify-center items-center gap-4 text-2xl font-mono">
            <div className="flex items-center gap-1">
              <span>{timeLeft.days}</span>
              <span className="text-sm">ימים</span>
            </div>
            <span>:</span>
            <div className="flex items-center gap-1">
              <span>{String(timeLeft.hours).padStart(2, '0')}</span>
              <span className="text-sm">שעות</span>
            </div>
            <span>:</span>
            <div className="flex items-center gap-1">
              <span>{String(timeLeft.minutes).padStart(2, '0')}</span>
              <span className="text-sm">דקות</span>
            </div>
            <span>:</span>
            <div className="flex items-center gap-1">
              <span>{String(timeLeft.seconds).padStart(2, '0')}</span>
              <span className="text-sm">שניות</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};