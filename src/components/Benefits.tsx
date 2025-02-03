import { CheckCircle } from "lucide-react";

export const Benefits = () => {
  const benefits = [
    "איך להיכנס להייטק גם בלי ניסיון קודם",
    "הטעויות שהורגות את הסיכוי שלך להתקבל – ואיך להימנע מהן",
    "המפתחות לקריירה מצליחה ולשכר גבוה יותר",
  ];

  return (
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
  );
};