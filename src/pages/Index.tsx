import { RegistrationForm } from "@/components/RegistrationForm";
import { CountdownTimer } from "@/components/CountdownTimer";
import { Benefits } from "@/components/Benefits";
import { Testimonials } from "@/components/Testimonials";
import { Speakers } from "@/components/Speakers";
import { ExclusiveOffer } from "@/components/ExclusiveOffer";
import { RunningRibbon } from "@/components/RunningRibbon";
import { Partners } from "@/components/Partners";
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
            <h1 className="text-4xl sm:text-5xl font-bold leading-tight font-mono">
              <span className="gradient-text">TechTrack Online Career Accelerator</span>
              <br />
              <span className="text-2xl sm:text-3xl text-white/90 mt-4 block">
                Your Fast Track to a Tech Career
              </span>
            </h1>
            
            <div className="glass-card p-8 transform hover:scale-105 transition-all duration-300 bg-gradient-to-br from-primary/20 via-secondary/20 to-accent/20">
              <div className="space-y-6">
                <h3 className="text-3xl font-bold text-white mb-6 border-b border-white/20 pb-4">
                  תכנית ההתמחות המעשית שלנו 🚀
                </h3>
                <div className="text-right space-y-4">
                  <p className="text-lg text-white/90 font-bold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
                    למשתתפים הבולטים ביותר בתכנית - הזדמנות ייחודית להתמחות מעשית בחברות הייטק מובילות
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-4 bg-primary/10 rounded-lg border border-primary/30 hover:border-primary/50 transition-all">
                      <h4 className="text-xl font-bold text-white mb-2">התנסות מעשית</h4>
                      <p className="text-white/80">עבודה על פרויקטים אמיתיים תחת הנחיה מקצועית</p>
                    </div>
                    <div className="p-4 bg-secondary/10 rounded-lg border border-secondary/30 hover:border-secondary/50 transition-all">
                      <h4 className="text-xl font-bold text-white mb-2">רשת קשרים</h4>
                      <p className="text-white/80">הזדמנות ליצור קשרים מקצועיים בתעשייה</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Partners />

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
