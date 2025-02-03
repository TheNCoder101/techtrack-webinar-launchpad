export const ExclusiveOffer = () => {
  const scrollToRegistration = () => {
    const form = document.querySelector('form');
    if (form) {
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="glass-card p-8 space-y-6 animate-fade-in">
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center space-x-2 space-x-reverse">
          <span className="text-3xl">🎁</span>
          <h2 className="text-2xl font-bold gradient-text">מתנה בלעדית ל-50 הנרשמים הראשונים!</h2>
        </div>
        
        <div className="bg-white/10 p-6 rounded-lg space-y-4">
          <h3 className="text-xl font-bold">
            קבלו גישה חינמית ל-Hub של Tech Track
          </h3>
          
          <div className="space-y-3">
            <div className="flex items-start space-x-3 space-x-reverse">
              <span className="text-xl">📚</span>
              <p className="text-right">מאגר תכנים מקצועיים לחיפוש עבודה בהייטק</p>
            </div>
            <div className="flex items-start space-x-3 space-x-reverse">
              <span className="text-xl">📝</span>
              <p className="text-right">טמפלטים לקורות חיים ומכתבי מוטיבציה</p>
            </div>
            <div className="flex items-start space-x-3 space-x-reverse">
              <span className="text-xl">💡</span>
              <p className="text-right">טיפים והכוונה מקצועית מצוות המומחים שלנו</p>
            </div>
            <div className="flex items-start space-x-3 space-x-reverse">
              <span className="text-xl">🎯</span>
              <p className="text-right">כלים פרקטיים להצלחה בראיונות עבודה</p>
            </div>
          </div>
        </div>
        
        <div className="space-y-2">
          <p className="text-lg font-bold text-primary">
            שווי ההטבה: 997₪ | חינם ל-50 הנרשמים הראשונים! 🎉
          </p>
          <p className="text-sm text-white/80">
            ⚡️ מהרו להירשם - המקומות מוגבלים!
          </p>
        </div>

        <button
          onClick={scrollToRegistration}
          className="cta-button mt-6"
        >
          להרשמה לוובינר 👇
        </button>
      </div>
    </div>
  );
};