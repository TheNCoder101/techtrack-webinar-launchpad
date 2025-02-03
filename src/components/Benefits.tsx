import { CheckCircle } from "lucide-react";

export const Benefits = () => {
  const benefits = [
    "איך להיכנס להייטק גם בלי ניסיון קודם",
    "הטעויות שהורגות את הסיכוי שלך להתקבל – ואיך להימנע מהן",
    "המפתחות לקריירה מצליחה ולשכר גבוה יותר",
    "איך למכור את עצמך בראיון עבודה",
    "איך להפוך את הפרופיל שלך למגנט הצעות עבודה",
  ];

  return (
    <div className="glass-card p-6 space-y-4">
      <h3 className="text-2xl font-bold mb-6">למה כדאי להצטרף לוובינר?</h3>
      <div className="space-y-4">
        {benefits.map((benefit, index) => (
          <div
            key={index}
            className="benefit-item"
            style={{ animationDelay: `${index * 0.2}s` }}
          >
            <CheckCircle className="text-white flex-shrink-0" />
            <span className="mr-3">{benefit}</span>
          </div>
        ))}
      </div>
    </div>
  );
};