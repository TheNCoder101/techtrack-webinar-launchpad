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

  const handleOfferClick = () => {
    const offerSection = document.querySelector('.exclusive-offer-section');
    if (offerSection) {
      offerSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="min-h-screen">
      <RunningRibbon />
      <div className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto space-y-12">
          <div className="text-center space-y-8 animate-fade-in">
              <h1 className="brand-title inline-block">
                TechTrack
              </h1>
              <div className="brand-subtitle">
                Online Career Accelerator
              </div>
              <p className="text-xl text-white/90 max-w-2xl mx-auto">
                Your Fast Track to a Tech Career - Start Your Journey Today
              </p>
            </div>
            
            <div className="glass-card p-6 space-y-4">
              <h2 className="text-2xl font-bold">
                הפכו חודשים של חיפוש עבודה לשבועות ספורים
              </h2>
              <p className="text-lg text-white/90">
                במקום לבזבז זמן וכסף על קורסים ארוכים, קבלו ליווי ממוקד שיביא אתכם מהר יותר למשרה הראשונה בהייטק
              </p>
            </div>

            <div className="glass-card p-8 transform hover:scale-105 transition-all duration-300">
              <div className="space-y-6">
                <h3 className="text-3xl font-bold text-white mb-6 border-b border-white/20 pb-4">
                  למה ליווי קבוצתי הוא המפתח להצלחה שלך?
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-right">
                  <div className="benefit-item">
                    <div className="w-2 h-2 bg-primary rounded-full mr-2 mt-2"></div>
                    <p className="text-lg text-white/90">
                      <strong className="text-primary">כוח הקבוצה:</strong> תמיכה הדדית ומוטיבציה גבוהה לאורך כל הדרך
                    </p>
                  </div>
                  <div className="benefit-item">
                    <div className="w-2 h-2 bg-secondary rounded-full mr-2 mt-2"></div>
                    <p className="text-lg text-white/90">
                      <strong className="text-secondary">למידה מהירה יותר:</strong> שיתוף ידע וניסיון בין המשתתפים
                    </p>
                  </div>
                  <div className="benefit-item">
                    <div className="w-2 h-2 bg-accent rounded-full mr-2 mt-2"></div>
                    <p className="text-lg text-white/90">
                      <strong className="text-accent">נטוורקינג אפקטיבי:</strong> בניית רשת קשרים חזקה בתעשייה
                    </p>
                  </div>
                  <div className="benefit-item">
                    <div className="w-2 h-2 bg-white rounded-full mr-2 mt-2"></div>
                    <p className="text-lg text-white/90">
                      <strong className="text-white">מיקוד מקצועי:</strong> תכנית מובנית עם מנטורים מנוסים מההייטק
                    </p>
                  </div>
                </div>
                <div className="mt-6 p-4 bg-white/10 rounded-lg border border-white/20">
                  <p className="text-lg font-bold text-white">
                    83% מבוגרי התכנית השתלבו בהייטק תוך פחות מ-3 חודשים!
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-8">
              <CountdownTimer />
              <div className="glass-card p-6">
                <h3 className="text-2xl font-bold mb-6">מה תקבלו בתוכנית?</h3>
                <Benefits />
              </div>
              <Speakers />
              <Testimonials />
              <div className="exclusive-offer-section">
                <ExclusiveOffer />
              </div>
            </div>
            <div className="sticky top-4">
              <RegistrationForm />
            </div>
          </div>
      
          {showFloatingButton && (
            <button 
              onClick={handleOfferClick}
              className="floating-cta"
            >
              <span>קחו אותי להרשמה לוובינר!</span>
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
      <footer className="max-w-4xl mx-auto px-4 py-8 text-center text-sm text-white/70">
        <p className="mb-2">© 2025 Tech Track. כל הזכויות שמורות.</p>
        <p className="mb-2">
          התכנים המוצגים באתר זה הם למטרות מידע והכוונה בלבד. 
          ההצלחה בתוכנית תלויה במידת ההשקעה והמחויבות האישית של כל משתתף.
        </p>
      </footer>
    </div>
  );
};

export default Index;
