import { useState } from "react";
import { useToast } from "@/components/ui/use-toast";

export const RegistrationForm = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
  });
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: "תודה על ההרשמה!",
      description: "פרטי ההתחברות לוובינר ישלחו אליך במייל",
    });
  };

  return (
    <form onSubmit={handleSubmit} className="glass-card p-6 space-y-4 sticky bottom-4 md:relative md:bottom-auto">
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
      <button type="submit" className="cta-button w-full">
        הבטיחו את מקומכם בוובינר &gt;
      </button>
    </form>
  );
};