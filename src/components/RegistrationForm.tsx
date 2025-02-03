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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: "תודה על ההרשמה! 🎉",
      description: (
        <div className="space-y-2">
          <p>שלחנו לך מייל עם כל הפרטים לוובינר.</p>
          <a 
            href="https://chat.whatsapp.com/invite-link" 
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
  };

  return (
    <form onSubmit={handleSubmit} className="glass-card p-6 space-y-6 sticky top-4">
      <div className="text-center space-y-4 mb-6">
        <h3 className="text-2xl font-bold gradient-text">
          הירשמו עכשיו לוובינר החינמי!
        </h3>
        <div className="flex items-center justify-center space-x-2 space-x-reverse">
          <span className="text-2xl">🎯</span>
          <p className="text-lg font-medium">גלו איך להתקבל להייטק ב-2024</p>
        </div>
        <div className="p-3 bg-white/10 rounded-lg">
          <p className="text-sm">
            ⭐ הצטרפו ל-500+ בוגרים שכבר עובדים בהייטק!
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <input
            type="text"
            placeholder="שם מלא"
            required
            className="form-input"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>
        <div>
          <input
            type="email"
            placeholder="אימייל"
            required
            className="form-input"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </div>
        <div>
          <input
            type="tel"
            placeholder="טלפון"
            required
            className="form-input"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
        </div>
        <div className="flex items-center space-x-2 space-x-reverse">
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

      <Button 
        type="submit"
        className="w-full py-6 text-lg font-bold bg-gradient-to-r from-primary via-secondary to-accent hover:opacity-90 transition-all duration-300 hover:scale-105"
      >
        הבטיחו את מקומכם בוובינר! 🚀
      </Button>

      <div className="space-y-3 text-center text-sm">
        <div className="flex items-center justify-center space-x-2 space-x-reverse">
          <span>🔒</span>
          <p>המידע שלכם מאובטח ולא יועבר לגורמים שלישיים</p>
        </div>
        <div className="flex items-center justify-center space-x-2 space-x-reverse">
          <span>⚡</span>
          <p>ההרשמה לוקחת פחות מדקה</p>
        </div>
        <div className="flex items-center justify-center space-x-2 space-x-reverse">
          <span>💯</span>
          <p>100% חינם וללא התחייבות</p>
        </div>
      </div>
    </form>
  );
};