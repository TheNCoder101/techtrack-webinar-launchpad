import { User } from "lucide-react";

export const Testimonials = () => {
  const testimonials = [
    {
      text: "חשבתי שלהייטק מתקבלים רק עם ניסיון, עד שגיליתי את TechTrack. תוך חודשיים כבר הייתי במשרת QA!",
      author: "רוני, בוגרת התוכנית",
    },
    {
      text: "תהליך ממוקד ועם ליווי צמוד – תוך 3 חודשים התקבלתי למשרת Data Analyst!",
      author: "עומר, בוגר התוכנית",
    },
  ];

  return (
    <div className="glass-card p-8 space-y-8">
      <h3 className="text-2xl font-bold mb-6 flex items-center justify-center gap-2">
        <span>📢</span>
        מה אומרים אלו שכבר עשו את זה?
      </h3>
      
      <div className="space-y-6">
        {testimonials.map((testimonial, index) => (
          <div 
            key={index} 
            className="glass-card p-6 animate-fade-in"
            style={{ animationDelay: `${index * 0.2}s` }}
          >
            <div className="flex items-start gap-4">
              <div className="bg-white/20 p-2 rounded-full">
                <User className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <p className="text-lg">{testimonial.text}</p>
                <p className="text-sm opacity-80">– {testimonial.author}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 text-center glass-card p-4">
        <p className="text-xl font-bold">
          🚀 85% מבוגרי התוכנית התקבלו לעבודה בהייטק תוך 3 חודשים!
        </p>
      </div>
    </div>
  );
};