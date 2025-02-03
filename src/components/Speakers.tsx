import { User, BookOpen, Users, Cloud } from "lucide-react";

export const Speakers = () => {
  const speakers = [
    {
      name: "עמית",
      title: "מומחה לכתיבת קורות חיים ופרופילי לינקדאין",
      description: "מומחה בעל ניסיון עשיר בכתיבת קורות חיים ופרופילי לינקדאין שמושכים תשומת לב ומייצרים הזדמנויות",
      expertise: [
        "איך לכתוב קורות חיים שמבליטים אותך מול מגייסים?",
        "איך להפוך את הפרופיל שלך בלינקדאין למגנט הצעות עבודה?",
        "מהם המשפטים שיגרמו למעסיקים להבין שאתה הטאלנט הבא שלהם?"
      ],
      icon: BookOpen
    },
    {
      name: "נאור",
      title: "מומחה לתפקידים Customer-Facing וחוויית מועמד",
      description: "מומחה בחווית עובד ופיתוח קריירה, עם התמחות בהכנה לראיונות ותפקידי שירות לקוחות",
      expertise: [
        "איך למכור את עצמך בראיון עבודה גם בלי ניסיון ישיר?",
        'מה אומרים כששואלים "למה דווקא אותך?"',
        "איך להבליט את היכולות שלך לתפקידים שדורשים תקשורת עם לקוחות?"
      ],
      icon: Users
    },
    {
      name: "גל",
      title: "מומחה לעולם ה-Cloud ותפקידים טכנולוגיים",
      description: "מהנדס בכיר עם התמחות בענן, מלווה מתחילים בדרכם להייטק ומשתף מניסיונו העשיר בתעשייה",
      expertise: [
        "איך להיכנס לעולמות הענן גם אם אין לך רקע בפיתוח?",
        "אילו מיומנויות הכי מבוקשות כיום, ואיך לרכוש אותן במהירות?",
        "מהם הטרנדים הכי חמים בתחום ואיך להתאים את עצמך אליהם?"
      ],
      icon: Cloud
    }
  ];

  return (
    <div className="glass-card p-6 animate-fade-in space-y-8">
      <h3 className="text-2xl font-bold mb-8">המומחים שילוו אותך להצלחה</h3>
      <div className="space-y-12">
        {speakers.map((speaker, index) => (
          <div key={index} className="glass-card p-6">
            <div className="flex items-start space-x-4 space-x-reverse mb-4">
              <div className="w-16 h-16 rounded-full bg-white/20 flex-shrink-0 flex items-center justify-center">
                {<speaker.icon className="w-8 h-8 text-white" />}
              </div>
              <div className="text-right">
                <h4 className="text-xl font-bold">{speaker.name}</h4>
                <p className="text-white/80 mb-2">{speaker.title}</p>
                <p className="text-white/70 text-sm leading-relaxed">{speaker.description}</p>
              </div>
            </div>
            <div className="space-y-2 mt-4">
              {speaker.expertise.map((item, i) => (
                <div key={i} className="flex items-start space-x-2 space-x-reverse">
                  <CheckCircle className="text-white/80 w-5 h-5 flex-shrink-0 mt-1" />
                  <p className="text-white/90">{item}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};