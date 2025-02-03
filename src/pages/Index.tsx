import { RegistrationForm } from "@/components/RegistrationForm";
import { CountdownTimer } from "@/components/CountdownTimer";
import { Benefits } from "@/components/Benefits";
import { Testimonials } from "@/components/Testimonials";
import { Speakers } from "@/components/Speakers";

const Index = () => {
  return (
    <div className="relative min-h-screen py-12 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <div className="tech-pattern" />
      <div className="max-w-4xl mx-auto space-y-12">
        {/* Hero Section */}
        <div className="text-center space-y-6 animate-fade-in relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl" />
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
            קריירה ב<span className="gradient-text">הייטק</span>? הצעד הראשון שלך מתחיל כאן!
          </h1>
          <h2 className="text-2xl sm:text-3xl">
            וובינר אחרון לפני סגירת ההרשמה לתוכנית!
          </h2>
          <p className="text-xl">
            📅 חמישי | 6.2 | 20:00 | אונליין
          </p>
          <p className="text-xl font-bold">
            ⏳ תוכנית <span className="gradient-text">TechTrack Career Accelerator</span> יוצאת לדרך ב-9.2!
          </p>
        </div>

        {/* Countdown Timer */}
        <CountdownTimer />

        {/* Main Content */}
        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-8">
            <div className="glass-card p-6 hover:scale-105 transition-transform duration-300">
              <h3 className="text-xl font-bold mb-6">מה נלמד בוובינר?</h3>
              <Benefits />
            </div>
            <Speakers />
            <Testimonials />
          </div>
          <div className="sticky top-4">
            <RegistrationForm />
          </div>
        </div>

        {/* Sticky CTA for Mobile */}
        <div className="fixed bottom-4 left-4 right-4 md:hidden z-50 animate-fade-in">
          <button 
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="cta-button w-full"
          >
            הבטיחו את מקומכם בוובינר &gt;
          </button>
        </div>
      </div>
    </div>
  );
};

export default Index;