import { User, BookOpen, Users, Cloud } from "lucide-react";

export const Speakers = () => {
  const speakers = [
    {
      name: "עמית בכשי",
      englishTitle: "Amit Bakshi",
      title: "מגייס בכיר ובעלים של חברת השמה להייטק",
      description: "מומחה בגיוס והשמה בהייטק עם ניסיון של למעלה מעשור בליווי חברות וסטארטאפים. מתמחה בבניית אסטרטגיות גיוס ופיתוח קריירה",
      expertise: [
        "✨ בניית קורות חיים אפקטיביים שמושכים תשומת לב",
        "🔍 אופטימיזציה של פרופיל LinkedIn למקסום הזדמנויות",
        "💼 פיתוח נרטיב מקצועי משכנע למעסיקים"
      ],
      icon: BookOpen,
      testimonial: "הגישה המקצועית של עמית עזרה לי להבין איך מגייסים חושבים ולהתאים את עצמי בהתאם"
    },
    {
      name: "נאור לביא",
      englishTitle: "Naor Lavi",
      title: "מומחה לחוויית עובד וניהול תפעול בהייטק",
      description: "מביא ניסיון עשיר בניהול תפעולי בחברות הייטק מובילות, עם התמחות בתהליכי גיוס והכנה לראיונות",
      expertise: [
        "🎯 טכניקות להצגת ניסיון קודם בצורה אפקטיבית",
        "🎓 הכנה מעמיקה לראיונות עבודה",
        "📈 בניית מסלול קריירה בתפקידים תפעוליים"
      ],
      icon: Users,
      testimonial: "השיטות של נאור לראיונות עבודה הובילו אותי להצעת עבודה תוך שבועיים"
    },
    {
      name: "גל מושקוביץ",
      englishTitle: "Gal Moskowitz",
      title: "מומחה לטכנולוגיות ענן ותשתיות",
      description: "מהנדס בכיר עם התמחות בענן ותשתיות, מלווה מועמדים בתחילת דרכם בהייטק",
      expertise: [
        "☁️ הכרת עולם הענן והתשתיות ללא רקע טכני קודם",
        "📊 זיהוי והשלמת פערי ידע קריטיים",
        "🔄 הבנת הטרנדים העדכניים בתעשייה"
      ],
      icon: Cloud,
      testimonial: "בזכות ההכוונה של גל הצלחתי להשתלב בתפקיד Cloud Support"
    }
  ];

  return (
    <div className="glass-card p-6 animate-fade-in space-y-8">
      <h3 className="text-2xl font-bold mb-8 text-center">
        <span className="gradient-text">✨ המומחים שילוו אותך להצלחה</span>
      </h3>
      <div className="space-y-12">
        {speakers.map((speaker, index) => (
          <div key={index} className="glass-card p-6 hover:scale-105 transition-all duration-300">
            <div className="flex items-start space-x-4 space-x-reverse mb-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-r from-primary via-secondary to-accent flex-shrink-0 flex items-center justify-center">
                {<speaker.icon className="w-8 h-8 text-white" />}
              </div>
              <div className="text-right flex-grow">
                <h4 className="text-xl font-bold gradient-text">{speaker.name}</h4>
                <p className="text-sm text-white/80 mb-1">{speaker.englishTitle}</p>
                <p className="text-white/90 mb-2">{speaker.title}</p>
                <p className="text-white/80 text-sm leading-relaxed">{speaker.description}</p>
              </div>
            </div>
            <div className="space-y-2 mt-4">
              {speaker.expertise.map((item, i) => (
                <div key={i} className="flex items-start space-x-2 space-x-reverse">
                  <p className="text-white/90">{item}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 p-4 bg-white/10 rounded-lg">
              <p className="text-white/90 italic">💬 {speaker.testimonial}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};