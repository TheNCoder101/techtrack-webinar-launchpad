import { User, Code, LineChart, Users2 } from "lucide-react";

export const Speakers = () => {
  const speakers = [
    {
      name: "עמית",
      title: "מומחה בכיר לפיתוח קריירה בהייטק",
      icon: <Users2 className="w-8 h-8 text-primary" />,
      points: [
        "15+ שנות ניסיון בגיוס והכוונת קריירה בחברות הייטק מובילות",
        "מומחה לבניית מותג אישי ופרופילים מקצועיים",
        "ליווה מאות מועמדים במעבר מוצלח להייטק"
      ]
    },
    {
      name: "נאור",
      title: "מומחה לתפקידי Customer Success",
      icon: <LineChart className="w-8 h-8 text-secondary" />,
      points: [
        "מנהל Customer Success בחברת Enterprise",
        "מוביל צוותי תמיכה ושירות בחברות גלובליות",
        "מומחה לפיתוח מיומנויות תקשורת ומכירות"
      ]
    },
    {
      name: "גל",
      title: "ארכיטקט פתרונות Cloud",
      icon: <Code className="w-8 h-8 text-accent" />,
      points: [
        "ארכיטקט פתרונות בכיר ב-AWS",
        "מוביל פרויקטי ענן בחברות אנטרפרייז",
        "מרצה ומנטור בתחומי הענן והתשתיות"
      ]
    }
  ];

  return (
    <div className="glass-card p-6 animate-fade-in">
      <h3 className="text-2xl font-bold mb-6">המומחים שילוו אתכם להצלחה</h3>
      <div className="grid md:grid-cols-3 gap-6">
        {speakers.map((speaker, index) => (
          <div key={index} className="glass-card p-6 hover:scale-105 transition-all duration-300">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mb-4">
                {speaker.icon}
              </div>
              <div>
                <h4 className="text-xl font-bold">{speaker.name}</h4>
                <p className="text-white/80 mb-4">{speaker.title}</p>
              </div>
              <ul className="space-y-2 text-right w-full">
                {speaker.points.map((point, idx) => (
                  <li key={idx} className="flex items-start space-x-2 space-x-reverse">
                    <span className="text-white/90">✦</span>
                    <span className="text-white/90">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};