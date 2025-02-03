import { User } from "lucide-react";

export const Testimonials = () => {
  const testimonials = [
    {
      text: "אחרי שנה של חיפוש עבודה עצמאי והשקעה בקורסים יקרים, כמעט התייאשתי. התוכנית של Tech Track פתחה לי את העיניים - תוך חודשיים התקבלתי לתפקיד QA.",
      author: "רוני כהן, בוגרת התוכנית",
    },
    {
      text: "ניסיתי המון תוכניות הכנה לפני כן, אבל אף אחת לא הייתה מספיק פרקטית. פה סוף סוף הבנתי איך באמת עובד תהליך הגיוס בהייטק. תוך 3 חודשים התקבלתי למשרת Data Analyst.",
      author: "עומר לוי, בוגר התוכנית",
    },
    {
      text: "בהתחלה הייתי סקפטי לגבי עוד תוכנית הכנה, אבל ההבדל היה עצום. במקום תיאוריה, קיבלתי כלים מעשיים וליווי אישי שעזרו לי להבין בדיוק מה המעסיקים מחפשים.",
      author: "מיכל ברק, בוגרת התוכנית",
    },
    {
      text: "הגעתי מרקע של שיווק ולא האמנתי שאוכל להשתלב בהייטק. התוכנית לימדה אותי איך להציג את הניסיון שלי בצורה שמתאימה לתעשייה. היום אני Product Marketing Manager.",
      author: "דניאל אברהם, בוגר התוכנית",
    }
  ];

  return (
    <div className="glass-card p-8 space-y-8">
      <h3 className="text-2xl font-bold mb-6 text-center">
        הסיפורים של הבוגרים שלנו
      </h3>
      
      <div className="grid md:grid-cols-2 gap-6">
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
                <p className="text-lg leading-relaxed">{testimonial.text}</p>
                <p className="text-sm opacity-80">– {testimonial.author}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 text-center glass-card p-4">
        <p className="text-xl font-bold">
          85% מבוגרי התוכנית השתלבו בהייטק תוך 3 חודשים
        </p>
      </div>
    </div>
  );
};