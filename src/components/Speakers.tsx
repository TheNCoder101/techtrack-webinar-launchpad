import { User } from "lucide-react";

export const Speakers = () => {
  const speakers = [
    {
      name: "Amit Bakshi",
      title: "Recruiter & Resume Writer",
      description: "מומחה בעל ניסיון עשיר בגיוס והכוונת קריירה, עם track record מוכח בהכנת מועמדים להצלחה בראיונות עבודה ובניית קורות חיים שמושכים תשומת לב"
    },
    {
      name: "Gal Moshkovits",
      title: "Senior Cloud Security Engineer & Career Mentor",
      description: "מהנדס בכיר עם התמחות באבטחת ענן, מלווה מתחילים בדרכם להייטק ומשתף מניסיונו העשיר בתעשייה כדי לעזור לאחרים להצליח"
    },
    {
      name: "Naor Lavi",
      title: "Employee Experience Specialist and Career Mentor",
      description: "מומחה בחווית עובד ופיתוח קריירה, עם יכולת ייחודית לזהות ולטפח את הפוטנציאל של כל מועמד ולהתאים אותו למשרה המושלמת"
    }
  ];

  return (
    <div className="glass-card p-6 animate-fade-in">
      <h3 className="text-2xl font-bold mb-6">המרצים שלנו</h3>
      <div className="space-y-8">
        {speakers.map((speaker, index) => (
          <div key={index} className="flex items-start space-x-4 space-x-reverse">
            <div className="w-16 h-16 rounded-full bg-white/20 flex-shrink-0 flex items-center justify-center">
              <User className="w-8 h-8 text-white" />
            </div>
            <div className="text-right">
              <h4 className="text-xl font-bold">{speaker.name}</h4>
              <p className="text-white/80 mb-2">{speaker.title}</p>
              <p className="text-white/70 text-sm leading-relaxed">{speaker.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};