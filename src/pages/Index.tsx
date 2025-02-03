import { RegistrationForm } from "@/components/RegistrationForm";
import { CountdownTimer } from "@/components/CountdownTimer";
import { Benefits } from "@/components/Benefits";
import { Testimonials } from "@/components/Testimonials";
import { Speakers } from "@/components/Speakers";
import { ExclusiveOffer } from "@/components/ExclusiveOffer";
import { RunningRibbon } from "@/components/RunningRibbon";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";

const Index = () => {
  const [showFloatingButton, setShowFloatingButton] = useState(true);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPercentage = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
      setShowFloatingButton(scrollPercentage < 80);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleFormSubmit = () => {
    const form = document.querySelector('form');
    if (form) {
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="min-h-screen">
      <RunningRibbon />
      <div className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto space-y-12">
          <div className="text-center space-y-6 animate-fade-in">
            <h1 className="text-4xl sm:text-5xl font-bold leading-tight font-mono">
              <span className="gradient-text">TechTrack Online Career Accelerator</span>
              <br />
              <span className="text-2xl sm:text-3xl text-white/90 mt-4 block">
                Your Fast Track to a Tech Career
              </span>
            </h1>
            
            <div className="glass-card p-6 space-y-4">
              <h2 className="text-2xl font-bold">
                הפכו חודשים של חיפוש עבודה לשבועות ספורים
              </h2>
              <p className="text-lg text-white/90">
                במקום לבזבז זמן וכסף על קורסים ארוכים, קבלו ליווי ממוקד שיביא אתכם מהר יותר למשרה הראשונה בהייטק
              </p>
            </div>

            <div className="glass-card p-4 inline-block">
              <p className="text-xl">
                וובינר הדרכה על התוכנית
                <br />
                6.2 | 20:00 | אונליין
                <br />
                יום חמישי
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-8">
              <div className="glass-card p-6">
                <h3 className="text-2xl font-bold mb-6">מה תקבלו בתוכנית?</h3>
                <Benefits />
              </div>
              <Speakers />
              <Testimonials />
              <ExclusiveOffer />
            </div>
            <div className="sticky top-4">
              <RegistrationForm hideSubmitButton={!showFloatingButton} />
            </div>
          </div>
      
          {showFloatingButton && (
            <button 
              onClick={handleFormSubmit}
              className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 glass-card py-4 px-8 text-white font-bold rounded-full shadow-xl hover:shadow-2xl transition-all duration-300 bg-gradient-to-r from-primary via-secondary to-accent hover:scale-105 flex items-center justify-center gap-2 animate-fade-in max-w-xl w-[90%] mx-auto"
            >
              <span>להרשמה לוובינר - לחצו כאן</span>
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
      <footer className="max-w-4xl mx-auto px-4 py-8 text-center text-sm text-white/70">
        <p className="mb-2">© 2024 Tech Track. כל הזכויות שמורות.</p>
        <p className="mb-2">
          התכנים המוצגים באתר זה הם למטרות מידע בלבד ואינם מהווים ייעוץ מקצועי, משפטי או פיננסי.
          התוצאות המוצגות הן של בוגרים ספציפיים ואינן מבטיחות תוצאות דומות לכל המשתתפים.
        </p>
        <p>
          ההשתתפות בוובינר אינה מבטיחה קבלה לעבודה בהייטק. ההצלחה תלויה במגוון גורמים אישיים ומקצועיים.
        </p>
      </footer>
    </div>
  );
};

export default Index;
