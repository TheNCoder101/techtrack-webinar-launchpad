import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface RegistrationFormProps {
  hideSubmitButton?: boolean;
}

export const RegistrationForm = ({ hideSubmitButton = false }: RegistrationFormProps) => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
  });
  const [marketingConsent, setMarketingConsent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!marketingConsent) {
      toast({
        title: "שגיאה",
        description: "יש לאשר קבלת מידע שיווקי כדי להירשם",
        variant: "destructive",
      });
      return;
    }

    try {
      console.log("Form submitted:", formData);
      
      toast({
        title: "תודה על ההרשמה! 🎉",
        description: (
          <div className="space-y-2">
            <p>שלחנו לך מייל עם פרטי הוובינר ומידע נוסף על התכנית.</p>
            <a 
              href="https://chat.whatsapp.com/techtrack-group" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline block"
            >
              👉 לחץ כאן להצטרפות לקבוצת הווטסאפ של המחזור הקרוב
            </a>
          </div>
        ),
      });

      setFormData({ name: "", email: "", phone: "" });
      setMarketingConsent(false);
      
    } catch (error) {
      toast({
        title: "שגיאה בהרשמה",
        description: "אירעה שגיאה בתהליך ההרשמה. אנא נסו שוב מאוחר יותר.",
        variant: "destructive",
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-card p-6 space-y-6 sticky top-4 transform hover:scale-[1.01] transition-all duration-300">
      <div className="text-center space-y-4 mb-6">
        <div className="bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20 p-4 rounded-lg mb-4">
          <h3 className="text-2xl font-bold gradient-text">
            הירשמו עכשיו לוובינר החינמי!
          </h3>
          <p className="text-lg font-medium mt-2">גלו איך להתקבל להייטק ב-2025</p>
        </div>
        <div className="p-3 bg-white/10 rounded-lg border border-white/20">
          <p className="text-sm font-bold">
            הצטרפו ל-500+ בוגרים שכבר עובדים בהייטק!
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <input
            type="text"
            placeholder="שם מלא"
            required
            className="form-input text-right w-full"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>
        <div>
          <input
            type="email"
            placeholder="אימייל"
            required
            className="form-input text-right w-full"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </div>
        <div>
          <input
            type="tel"
            placeholder="טלפון"
            required
            className="form-input text-right w-full"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
        </div>
        <div className="flex items-center space-x-2 space-x-reverse bg-white/5 p-3 rounded-lg">
          <Checkbox
            id="marketing"
            checked={marketingConsent}
            onCheckedChange={(checked) => setMarketingConsent(checked as boolean)}
          />
          <label
            htmlFor="marketing"
            className="text-sm text-gray-200 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            אני מאשר/ת קבלת טיפים, תכנים ומידע שיווקי מצוות Tech Track
          </label>
        </div>
      </div>

      {!hideSubmitButton && (
        <Button 
          type="submit"
          className="w-full py-6 text-lg font-bold bg-gradient-to-r from-primary via-secondary to-accent hover:opacity-90 transition-all duration-300 shadow-lg hover:shadow-xl"
        >
          הבטיחו את מקומכם בוובינר! 🚀
        </Button>
      )}

      <div className="space-y-4 text-center text-sm">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-center gap-2">
            <span>🔒</span>
            <p>המידע שלכם מאובטח</p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <span>✨</span>
            <p>מאות בוגרים כבר מצאו עבודה בהייטק</p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <span>💯</span>
            <p>100% החזר כספי מובטח</p>
          </div>
        </div>
      </div>
    </form>
  );
};
