import { RegistrationForm } from "@/components/RegistrationForm";
import { CountdownTimer } from "@/components/CountdownTimer";
import { Benefits } from "@/components/Benefits";
import { Testimonials } from "@/components/Testimonials";
import { Speakers } from "@/components/Speakers";
import { GraduationCap, Users, Target, BookOpen } from "lucide-react";

const Index = () => {
  const handleFormSubmit = () => {
    const form = document.querySelector('form');
    if (form) {
      form.requestSubmit();
    }
  };

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-12">
        {/* Hero Section */}
        <div className="text-center space-y-6 animate-fade-in">
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight text-[#1A1F2C]">
            <span className="gradient-text">TechTrack Career Accelerator</span>
            <br />
            התוכנית שמביאה אותך לקריירה בהייטק
          </h1>
          <div className="space-y-4">
            <p className="text-xl glass-card inline-block px-6 py-3 text-[#1A1F2C]">מובילים אותך להצלחה עם מומחים מהתעשייה</p>
            <p className="text-xl glass-card inline-block px-6 py-3 text-[#1A1F2C]">ליווי אישי + אסטרטגיות מוכחות שמביאות תוצאות</p>
            <p className="text-xl glass-card inline-block px-6 py-3 text-[#1A1F2C]">כל הכלים והידע כדי להפוך אותך למועמד המוביל בתעשייה</p>
          </div>
        </div>

        {/* Program Description */}
        <div className="glass-card p-8 space-y-6 animate-fade-in">
          <h2 className="text-3xl font-bold text-center mb-6 text-[#1A1F2C]">תשכחו מקורסים תיאורטיים – כאן לומדים מה שבאמת עובד!</h2>
          <p className="text-xl text-center text-[#1A1F2C]">
            אם אתם רוצים להיכנס להייטק, <strong>אתם צריכים יותר ממידע – אתם צריכים אסטרטגיה מנצחת!</strong>
          </p>
          <p className="text-xl text-center text-[#1A1F2C]">
            <strong>TechTrack Career Accelerator</strong> היא תוכנית פרקטית שבנויה כדי לתת לכם <strong>יתרון אמיתי</strong> בשוק העבודה ולהכניס אתכם לתפקיד הראשון שלכם בהייטק – גם בלי ניסיון קודם!
          </p>
        </div>

        {/* What You'll Get Section */}
        <div className="glass-card p-8">
          <h2 className="text-3xl font-bold text-center mb-8 text-[#1A1F2C]">מה תקבלו בתוכנית?</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-6">
              <div className="glass-card p-6 hover:scale-105 transition-all duration-300">
                <div className="flex items-start gap-4">
                  <Target className="w-8 h-8 text-accent shrink-0" />
                  <div>
                    <h3 className="text-xl font-bold mb-2 text-[#1A1F2C]">מיתוג אישי מנצח</h3>
                    <p className="text-[#1A1F2C]">נלמד אתכם איך לבנות נוכחות דיגיטלית חזקה שתגרום למגייסים לרצות אתכם</p>
                  </div>
                </div>
              </div>
              <div className="glass-card p-6 hover:scale-105 transition-all duration-300">
                <div className="flex items-start gap-4">
                  <BookOpen className="w-8 h-8 text-primary shrink-0" />
                  <div>
                    <h3 className="text-xl font-bold mb-2 text-[#1A1F2C]">הכנה מקיפה לראיונות</h3>
                    <p className="text-[#1A1F2C]">סימולציות ראיונות, טיפים מעשיים והכנה מקצועית שתעזור לכם להתקבל</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-6">
              <div className="glass-card p-6 hover:scale-105 transition-all duration-300">
                <div className="flex items-start gap-4">
                  <Users className="w-8 h-8 text-secondary shrink-0" />
                  <div>
                    <h3 className="text-xl font-bold mb-2 text-[#1A1F2C]">נטוורקינג מקצועי</h3>
                    <p className="text-[#1A1F2C]">גישה לקהילה תומכת וקשרים שיפתחו לכם דלתות בתעשייה</p>
                  </div>
                </div>
              </div>
              <div className="glass-card p-6 hover:scale-105 transition-all duration-300">
                <div className="flex items-start gap-4">
                  <GraduationCap className="w-8 h-8 text-accent shrink-0" />
                  <div>
                    <h3 className="text-xl font-bold mb-2 text-[#1A1F2C]">ליווי אישי צמוד</h3>
                    <p className="text-[#1A1F2C]">מנטורים מנוסים שילוו אתכם בכל שלב בדרך להצלחה</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Countdown and Registration */}
        <CountdownTimer />

        {/* Experts Section */}
        <Speakers />

        {/* Success Stories */}
        <Testimonials />

        {/* Registration Form */}
        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-8">
            <Benefits />
          </div>
          <div>
            <RegistrationForm />
          </div>
        </div>
      </div>
      
      {/* Floating CTA Button */}
      <button 
        onClick={handleFormSubmit}
        className="fixed bottom-8 left-4 right-4 md:w-auto md:left-8 bg-gradient-to-r from-primary via-secondary to-accent text-[#1A1F2C] font-bold py-3 px-6 rounded-full shadow-2xl hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-sm z-50 transition-all duration-300 ease-in-out transform hover:-translate-y-1"
      >
        {"כן! אני רוצה להבין איך לפרוץ להייטק ←"}
      </button>
    </div>
  );
};

export default Index;