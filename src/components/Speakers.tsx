import { User, BookOpen, Users, Cloud, CheckCircle } from "lucide-react";

export const Speakers = () => {
  const speakers = [
    {
      name: "עמית",
      title: "מגייס בכיר ובעלים של חברת השמה להייטק",
      description: "מומחה בעל ניסיון עשיר בגיוס והשמה בהייטק, מלווה חברות וסטארטאפים בתהליכי גיוס ומייעץ למועמדים בבניית קריירה",
      expertise: [
        "איך לכתוב קורות חיים שמבליטים אותך מול מגייסים?",
        "איך להפוך את הפרופיל שלך בלינקדאין למגנט הצעות עבודה?",
        "מהם המשפטים שיגרמו למעסיקים להבין שאתה הטאלנט הבא שלהם?"
      ],
      icon: BookOpen,
      testimonial: "עזר לי להגדיל את כמות הפניות ב-LinkedIn ב-300% תוך חודש!"
    },
    {
      name: "נאור",
      title: "מומחה לחוויית עובד וניהול אופרציה בהייטק",
      description: "מגיע מרקע עשיר בניהול חוויית עובד ואופרציה בחברות הייטק מובילות, מתמחה בהכנה לראיונות ותהליכי גיוס",
      expertise: [
        "איך למכור את עצמך בראיון עבודה גם בלי ניסיון ישיר?",
        'מה אומרים כששואלים "למה דווקא אותך?"',
        "איך להבליט את היכולות שלך בתפקידים תפעוליים בהייטק?"
      ],
      icon: Users,
      testimonial: "הטכניקות של נאור עזרו לי לעבור 3 ראיונות ולקבל הצעת עבודה תוך שבועיים!"
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
      icon: Cloud,
      testimonial: "בזכות ההכוונה של גל התקבלתי לתפקיד Cloud Support ב-AWS!"
    }
  ];

  return (
    <div className="glass-card p-6 animate-fade-in space-y-8">
      <h3 className="text-2xl font-bold mb-8 text-center">
        <span className="gradient-text">המומחים שילוו אותך להצלחה</span>
      </h3>
      <div className="space-y-12">
        {speakers.map((speaker, index) => (
          <div key={index} className="glass-card p-6 hover:scale-105 transition-all duration-300">
            <div className="flex items-start space-x-4 space-x-reverse mb-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-r from-primary via-secondary to-accent flex-shrink-0 flex items-center justify-center">
                {<speaker.icon className="w-8 h-8 text-white" />}
              </div>
              <div className="text-right">
                <h4 className="text-xl font-bold gradient-text">{speaker.name}</h4>
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
            <div className="mt-6 p-4 glass-card">
              <div className="flex items-center space-x-2 space-x-reverse">
                <div className="text-yellow-400 text-xl">⭐</div>
                <p className="text-white/90 italic">{speaker.testimonial}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="text-center mt-8 p-4 glass-card">
        <p className="text-xl font-bold text-white">
          🎓 יותר מ-500 בוגרים כבר מצאו עבודה בהייטק בעזרת המומחים שלנו!
        </p>
      </div>
    </div>
  );
};