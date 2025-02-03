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
          <div className="text-center space-y-6 animate-fade-in">
            <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
              <span className="text-white">תכנית הליווי המקצועית</span>
              <br />
              <span className="text-2xl sm:text-3xl text-white/90 mt-4 block">
                שתעזור לך להשתלב בהייטק בתוך 90 יום
              </span>
            </h1>
            
            <div className="glass-card p-6 space-y-4 hover:scale-105 transition-all duration-300">
              <h2 className="text-2xl font-bold text-white">
                למה לבזבז זמן יקר על חיפוש עבודה לבד? 
              </h2>
              <p className="text-lg text-white/90">
                בואו תצטרפו לקהילה שלנו ותקבלו את כל הכלים והליווי שאתם צריכים להצלחה 🚀
              </p>
            </div>

            <div className="glass-card p-8 transform hover:scale-105 transition-all duration-300">
              <div className="space-y-6">
                <h3 className="text-2xl font-bold text-white mb-4">
                  4 סיבות למה ליווי קבוצתי הוא המפתח להצלחה שלך
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-right">
                  <div className="benefit-item">
                    <span className="text-2xl">✨</span>
                    <p className="text-lg">
                      <strong className="text-white">כוח הקבוצה:</strong> תמיכה הדדית ומוטיבציה גבוהה לאורך כל הדרך
                    </p>
                  </div>
                  <div className="benefit-item">
                    <span className="text-2xl">🎯</span>
                    <p className="text-lg">
                      <strong className="text-white">מיקוד מקצועי:</strong> תכנית מובנית עם מנטורים מנוסים מההייטק
                    </p>
                  </div>
                  <div className="benefit-item">
                    <span className="text-2xl">🌟</span>
                    <p className="text-lg">
                      <strong className="text-white">למידה מהירה:</strong> שיתוף ידע וניסיון בין המשתתפים
                    </p>
                  </div>
                  <div className="benefit-item">
                    <span className="text-2xl">🤝</span>
                    <p className="text-lg">
                      <strong className="text-white">נטוורקינג חזק:</strong> חיבור ישיר למשרות ולאנשי מפתח בתעשייה
                    </p>
                  </div>
                </div>
                <div className="mt-6 p-4 bg-white/10 rounded-lg">
                  <p className="text-lg font-bold text-white">
                    83% מבוגרי התכנית השתלבו בהייטק תוך פחות מ-3 חודשים! ⭐️
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
              className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 glass-card py-4 px-8 text-white font-bold rounded-full shadow-xl hover:shadow-2xl transition-all duration-300 bg-gradient-to-r from-primary via-secondary to-accent hover:scale-105 flex items-center justify-center gap-2 animate-fade-in max-w-xl w-[90%] mx-auto"
            >
              <span>מתנה בלעדית ל-50 נרשמים הראשונים! 🎁</span>
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