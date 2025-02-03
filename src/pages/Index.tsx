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
            <span className="text-2xl sm:text-3xl text-white/90 mt-4 block">
              התוכנית שמביאה אותך לקריירה בהייטק
            </span>
          </h1>
          
          <div className="glass-card p-6 space-y-4">
            <h2 className="text-2xl font-bold">
              תשכחו מקורסים תיאורטיים – כאן לומדים מה שבאמת עובד!
            </h2>
            <p className="text-lg text-white/90">
              אם אתם רוצים להיכנס להייטק, <strong>אתם צריכים יותר ממידע – אתם צריכים אסטרטגיה מנצחת!</strong>
            </p>
            <p className="text-lg text-white/90">
              <strong>TechTrack Career Accelerator</strong> היא תוכנית פרקטית שבנויה כדי לתת לכם <strong>יתרון אמיתי</strong> בשוק העבודה ולהכניס אתכם לתפקיד הראשון שלכם בהייטק – גם בלי ניסיון קודם!
            </p>
          </div>

          <div className="glass-card p-4 inline-block">
            <p className="text-xl">📅 חמישי | 6.2 | 20:00 | אונליין</p>
          </div>
        </div>

        {/* Countdown Timer */}
        <CountdownTimer />

        {/* Main Content */}
        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-8">
            <div className="glass-card p-6">
              <h3 className="text-2xl font-bold mb-6">מה תקבלו בתוכנית?</h3>
              <Benefits />
              <div className="mt-8 p-4 glass-card text-center">
                <p className="text-xl font-bold">
                  🚀 85% מבוגרי התוכנית התקבלו לעבודה בהייטק תוך 3 חודשים!
                </p>
              </div>
            </div>
            <Speakers />
            <Testimonials />
          </div>
          <div className="sticky top-4">
            <RegistrationForm />
          </div>
        </div>
      </div>
      
      {/* Floating CTA Button */}
      <button 
        onClick={handleFormSubmit}
        className="fixed bottom-8 left-4 right-4 md:left-8 md:right-8 z-50 glass-card py-4 px-6 text-white font-bold rounded-full shadow-xl hover:shadow-2xl transition-all duration-300 bg-gradient-to-r from-primary via-secondary to-accent hover:scale-105"
      >
        כן! אני רוצה להבין איך לפרוץ להייטק &gt;
      </button>
    </div>
  );
};

export default Index;