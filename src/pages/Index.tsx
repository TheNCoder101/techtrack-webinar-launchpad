import { RegistrationForm } from "@/components/RegistrationForm";
import { CountdownTimer } from "@/components/CountdownTimer";
import { Benefits } from "@/components/Benefits";
import { Testimonials } from "@/components/Testimonials";
import { Speakers } from "@/components/Speakers";

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
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
            <span className="gradient-text">TechTrack Online Career Accelerator</span>
            <br />
            התוכנית שמביאה אותך לקריירה בהייטק
          </h1>
          <div className="space-y-4">
            <p className="text-xl glass-card inline-block px-6 py-3">מובילים אותך להצלחה עם מומחים מהתעשייה</p>
            <p className="text-xl glass-card inline-block px-6 py-3">ליווי אישי + אסטרטגיות מוכחות שמביאות תוצאות</p>
            <p className="text-xl glass-card inline-block px-6 py-3">כל הכלים והידע כדי להפוך אותך למועמד המוביל בתעשייה</p>
          </div>
        </div>

        {/* Program Description */}
        <div className="glass-card p-8 space-y-6 animate-fade-in">
          <h2 className="text-3xl font-bold text-center mb-6">תשכחו מקורסים תיאורטיים – כאן לומדים מה שבאמת עובד!</h2>
          <p className="text-xl text-center">
            אם אתם רוצים להיכנס להייטק, <strong>אתם צריכים יותר ממידע – אתם צריכים אסטרטגיה מנצחת!</strong>
          </p>
          <p className="text-xl text-center">
            <strong>TechTrack Career Accelerator</strong> היא תוכנית פרקטית שבנויה כדי לתת לכם <strong>יתרון אמיתי</strong> בשוק העבודה ולהכניס אתכם לתפקיד הראשון שלכם בהייטק – גם בלי ניסיון קודם!
          </p>
        </div>

        {/* Program Benefits */}
        <div className="glass-card p-8 space-y-6">
          <h2 className="text-2xl font-bold text-center mb-6">מה תקבלו בתוכנית?</h2>
          <div className="space-y-4">
            <div className="benefit-item">
              <span className="text-xl">🔹 מיתוג אישי מנצח</span>
              <p className="text-lg opacity-90">איך לגרום למגייסים להבין שאתם בדיוק מה שהם מחפשים</p>
            </div>
            <div className="benefit-item">
              <span className="text-xl">🔹 שדרוג קורות חיים, לינקדאין ומכתב מקדים</span>
              <p className="text-lg opacity-90">כדי שתבלטו בין מאות מועמדים</p>
            </div>
            <div className="benefit-item">
              <span className="text-xl">🔹 הכנה לראיונות עבודה</span>
              <p className="text-lg opacity-90">כולל סימולציות כדי שתגיעו מוכנים ותשאירו רושם מעולה</p>
            </div>
            <div className="benefit-item">
              <span className="text-xl">🔹 בניית נטוורקינג מקצועי</span>
              <p className="text-lg opacity-90">כי בהייטק הקשרים האישיים עושים את ההבדל</p>
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
        className="cta-button fixed bottom-4 left-4 right-4 md:relative md:bottom-auto z-50"
      >
        כן! אני רוצה להבין איך לפרוץ להייטק >>
      </button>
    </div>
  );
};

export default Index;