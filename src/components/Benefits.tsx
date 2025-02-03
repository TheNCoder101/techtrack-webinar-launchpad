import { CheckCircle } from "lucide-react";

export const Benefits = () => {
  const benefits = [
    {
      title: "מיתוג אישי מנצח",
      description: "איך לגרום למגייסים להבין שאתם בדיוק מה שהם מחפשים"
    },
    {
      title: "שדרוג קורות חיים ולינקדאין",
      description: "כדי שתבלטו בין מאות מועמדים"
    },
    {
      title: "שיפור מיומנויות והסבת קריירה",
      description: "התאמת הכישורים שלכם לתפקידים בהייטק"
    },
    {
      title: "הכנה לראיונות עבודה",
      description: "כולל סימולציות כדי שתגיעו מוכנים ותשאירו רושם מעולה"
    },
    {
      title: "שיפור הנוכחות הדיגיטלית",
      description: "כדי שימצאו אתכם במקום הנכון ובצורה הנכונה"
    },
    {
      title: "בניית נטוורקינג מקצועי",
      description: "כי בהייטק הקשרים האישיים עושים את ההבדל"
    }
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
          <div className="mr-3 text-right">
            <h4 className="font-bold">{benefit.title}</h4>
            <p className="text-white/80 text-sm">{benefit.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
};