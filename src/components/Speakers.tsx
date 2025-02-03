import { User } from "lucide-react";

export const Speakers = () => {
  const speakers = [
    {
      name: "עמית",
      title: "מומחה לכתיבת קורות חיים ופרופילי לינקדאין",
      points: [
        "איך לכתוב קורות חיים שמבליטים אותך מול מגייסים?",
        "איך להפוך את הפרופיל שלך בלינקדאין למגנט הצעות עבודה?",
        "מהם המשפטים שיגרמו למעסיקים להבין שאתה הטאלנט הבא שלהם?"
      ]
    },
    {
      name: "נאור",
      title: "מומחה לתפקידים Customer-Facing וחוויית מועמד",
      points: [
        "איך למכור את עצמך בראיון עבודה גם בלי ניסיון ישיר?",
        "מה אומרים כששואלים \"למה דווקא אותך?\"",
        "איך להבליט את היכולות שלך לתפקידים שדורשים תקשורת עם לקוחות?"
      ]
    },
    {
      name: "גל",
      title: "מומחה לעולם ה-Cloud ותפקידים טכנולוגיים בהייטק",
      points: [
        "איך להיכנס לעולמות הענן גם אם אין לך רקע בפיתוח?",
        "אילו מיומנויות הכי מבוקשות כיום, ואיך לרכוש אותן במהירות?",
        "מהם הטרנדים הכי חמים בתחום ואיך להתאים את עצמך אליהם?"
      ]
    }
  ];

  return (
    <div className="glass-card p-6 animate-fade-in">
      <h3 className="text-2xl font-bold mb-6">המומחים שילוו אתכם להצלחה</h3>
      <div className="space-y-8">
        {speakers.map((speaker, index) => (
          <div key={index} className="glass-card p-6">
            <div className="flex items-start space-x-4 space-x-reverse">
              <div className="w-16 h-16 rounded-full bg-white/20 flex-shrink-0 flex items-center justify-center">
                <User className="w-8 h-8 text-white" />
              </div>
              <div className="text-right space-y-4">
                <div>
                  <h4 className="text-xl font-bold">{speaker.name}</h4>
                  <p className="text-white/80 mb-2">{speaker.title}</p>
                </div>
                <ul className="space-y-2">
                  {speaker.points.map((point, idx) => (
                    <li key={idx} className="flex items-start space-x-2 space-x-reverse">
                      <span className="text-white/90">✔️</span>
                      <span className="text-white/90">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};