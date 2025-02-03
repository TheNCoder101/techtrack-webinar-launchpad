import { motion } from "framer-motion";

export const Partners = () => {
  const partners = [
    {
      name: "הטכניון",
      logo: "/placeholder.svg", // יש להחליף בלוגו אמיתי
      alt: "לוגו הטכניון"
    },
    {
      name: "אוניברסיטת תל אביב",
      logo: "/placeholder.svg", // יש להחליף בלוגו אמיתי
      alt: "לוגו אוניברסיטת תל אביב"
    },
    {
      name: "מכון ויצמן",
      logo: "/placeholder.svg", // יש להחליף בלוגו אמיתי
      alt: "לוגו מכון ויצמן"
    },
    {
      name: "האוניברסיטה העברית",
      logo: "/placeholder.svg", // יש להחליף בלוגו אמיתי
      alt: "לוגו האוניברסיטה העברית"
    }
  ];

  return (
    <div className="glass-card p-8 space-y-6">
      <h3 className="text-2xl font-bold text-center mb-8">
        השותפים שלנו להצלחה שלכם 🤝
      </h3>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
        {partners.map((partner, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.2 }}
            className="flex items-center justify-center"
          >
            <img
              src={partner.logo}
              alt={partner.alt}
              className="h-16 w-auto object-contain filter brightness-0 invert opacity-70 hover:opacity-100 transition-opacity duration-300"
            />
          </motion.div>
        ))}
      </div>
      
      <p className="text-center text-sm opacity-80 mt-6">
        אנחנו גאים לשתף פעולה עם המוסדות המובילים בישראל
      </p>
    </div>
  );
};