
import { RegistrationForm } from "@/components/RegistrationForm";
import { CountdownTimer } from "@/components/CountdownTimer";
import { Benefits } from "@/components/Benefits";
import { Testimonials } from "@/components/Testimonials";
import { Speakers } from "@/components/Speakers";
import { ExclusiveOffer } from "@/components/ExclusiveOffer";
import { RunningRibbon } from "@/components/RunningRibbon";
import { ArrowLeft, Rocket, Star, Users, Target } from "lucide-react";
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
    <div className="min-h-screen bg-gradient-to-br from-tech-dark via-[#1A1F2C] to-[#2C1A2F]">
      <RunningRibbon />
      <div className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto space-y-12">
          <div className="text-center space-y-8 animate-fade-in">
            <div className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-4">
              <Rocket className="w-4 h-4 text-accent" />
              <span className="text-white/90">הוובינר הבא מתחיל בקרוב!</span>
            </div>
            <h1 className="brand-title inline-block">
              איך להתקבל להייטק ב-2025?
            </h1>
            <div className="brand-subtitle">
              וובינר חינמי שיחשוף בפניך את השיטה המוכחת
            </div>
            <div className="max-w-2xl mx-auto space-y-4 text-right">
              <p className="text-xl text-white/90 font-bold">
                מרגישים תקועים בחיפוש עבודה בהייטק? 
              </p>
              <div className="glass-card p-6 space-y-4 bg-gradient-to-r from-primary/10 to-secondary/10">
                <p className="text-lg leading-relaxed">
                  <span className="text-accent font-bold">⚡️ הגיע הזמן לשנות את הגישה:</span> במקום לשלוח עוד ועוד קורות חיים ולקוות לתשובה, 
                  בואו תגלו איך להפוך לבולטים בשוק העבודה ולקבל הצעות עבודה תוך שבועות ספורים.
                </p>
              </div>
            </div>
          </div>
          
          <div className="glass-card p-6 space-y-4 bg-gradient-to-br from-accent/20 via-primary/10 to-secondary/20">
            <h2 className="text-2xl font-bold text-center mb-6">
              למה דווקא עכשיו זה הזמן המושלם להיכנס להייטק?
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="highlight-box text-right">
                <Star className="w-5 h-5 text-accent mb-2" />
                <p className="text-lg">
                  <span className="text-accent font-bold">שוק העבודה משתנה:</span> חברות מחפשות כישרונות חדשים עם גישה רעננה
                </p>
              </div>
              <div className="highlight-box text-right">
                <Users className="w-5 h-5 text-primary mb-2" />
                <p className="text-lg">
                  <span className="text-primary font-bold">הזדמנויות חדשות:</span> תפקידים חדשים נפתחים בתחומי ה-AI וה-Data
                </p>
              </div>
            </div>
          </div>

          <div className="glass-card p-8 transform hover:scale-105 transition-all duration-300">
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-white/20 pb-4">
                <h3 className="text-3xl font-bold text-white">
                  למה ליווי קבוצתי הוא המפתח להצלחה שלך?
                </h3>
                <Target className="w-8 h-8 text-accent" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-right">
                <div className="benefit-item bg-gradient-to-r from-primary/10 to-transparent">
                  <div className="w-2 h-2 bg-primary rounded-full mr-2 mt-2"></div>
                  <p className="text-lg text-white/90">
                    <strong className="text-primary">כוח הקבוצה:</strong> תמיכה הדדית ומוטיבציה גבוהה שתדחוף אותך קדימה
                  </p>
                </div>
                <div className="benefit-item bg-gradient-to-r from-secondary/10 to-transparent">
                  <div className="w-2 h-2 bg-secondary rounded-full mr-2 mt-2"></div>
                  <p className="text-lg text-white/90">
                    <strong className="text-secondary">למידה מהירה יותר:</strong> למידה מניסיון של אחרים במקום ללמוד על בשרך
                  </p>
                </div>
                <div className="benefit-item bg-gradient-to-r from-accent/10 to-transparent">
                  <div className="w-2 h-2 bg-accent rounded-full mr-2 mt-2"></div>
                  <p className="text-lg text-white/90">
                    <strong className="text-accent">נטוורקינג אפקטיבי:</strong> קשרים שיפתחו בפניך דלתות בתעשייה
                  </p>
                </div>
                <div className="benefit-item bg-gradient-to-r from-white/10 to-transparent">
                  <div className="w-2 h-2 bg-white rounded-full mr-2 mt-2"></div>
                  <p className="text-lg text-white/90">
                    <strong className="text-white">מיקוד מקצועי:</strong> קיצור דרך להצלחה עם מנטורים שכבר עשו את הדרך
                  </p>
                </div>
              </div>
              <div className="p-4 bg-gradient-to-r from-accent/20 to-primary/20 rounded-lg border border-white/20">
                <p className="text-lg font-bold text-white text-center">
                  🎯 83% מבוגרי התכנית השתלבו בהייטק תוך פחות מ-3 חודשים!
                </p>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-8">
              <CountdownTimer />
              <div className="glass-card p-6">
                <h3 className="text-2xl font-bold mb-6">מה תקבלו בוובינר?</h3>
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
              <span>הבטיחו את מקומכם בוובינר! 🎯</span>
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
