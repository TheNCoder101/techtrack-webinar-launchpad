import { RegistrationForm } from "@/components/RegistrationForm";
import { CountdownTimer } from "@/components/CountdownTimer";
import { Benefits } from "@/components/Benefits";

const Index = () => {
  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-12">
        {/* Hero Section */}
        <div className="text-center space-y-6 animate-fade-in">
          <h1 className="text-4xl sm:text-5xl font-bold">
            קריירה בהייטק? הצעד הראשון שלך מתחיל כאן!
          </h1>
          <h2 className="text-2xl sm:text-3xl">
            וובינר אחרון לפני סגירת ההרשמה לתוכנית!
          </h2>
          <p className="text-xl">
            📅 חמישי | 6.2 | 20:00 | אונליין
          </p>
          <p className="text-xl font-bold">
            ⏳ תוכנית TechTrack Career Accelerator יוצאת לדרך ב-9.2!
          </p>
        </div>

        {/* Countdown Timer */}
        <CountdownTimer />

        {/* Main Content */}
        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-8">
            <div className="glass-card p-6">
              <h3 className="text-xl font-bold mb-6">מה נלמד בוובינר?</h3>
              <Benefits />
            </div>
          </div>
          <div>
            <RegistrationForm />
          </div>
        </div>

        {/* Sticky CTA */}
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:bottom-8 z-50">
          <button className="cta-button w-full md:w-auto">
            🔴 הבטיחו את מקומכם עכשיו - חינם!
          </button>
        </div>
      </div>
    </div>
  );
};

export default Index;