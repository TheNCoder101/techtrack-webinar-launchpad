import { RegistrationForm } from "@/components/RegistrationForm";
import { CountdownTimer } from "@/components/CountdownTimer";
import { Benefits } from "@/components/Benefits";
import { Testimonials } from "@/components/Testimonials";
import { Speakers } from "@/components/Speakers";

const Index = () => {
  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-12">
        {/* Hero Section */}
        <div className="text-center space-y-6 animate-fade-in">
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
            <span className="gradient-text">TechTrack Accelerator</span>
            <br />
            קריירה בהייטק? הצעד הראשון שלך מתחיל כאן!
          </h1>
          <h2 className="text-2xl sm:text-3xl glass-card inline-block px-6 py-3">
            וובינר אחרון לפני סגירת ההרשמה לתוכנית!
          </h2>
          <p className="text-xl tech-card inline-block">
            📅 חמישי | 6.2 | 20:00 | אונליין
          </p>
          <p className="text-xl font-bold glass-card p-4">
            ⏳ תוכנית TechTrack Career Accelerator יוצאת לדרך ב-9.2!
          </p>
        </div>

        {/* Countdown Timer */}
        <CountdownTimer />

        {/* Main Content */}
        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-8">
            <div className="tech-card">
              <h3 className="text-xl font-bold mb-6 gradient-text">מה נלמד בוובינר?</h3>
              <Benefits />
            </div>
            <Speakers />
            <Testimonials />
          </div>
          <div className="sticky top-4">
            <RegistrationForm />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;