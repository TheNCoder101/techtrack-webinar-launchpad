import { motion } from "framer-motion";

export const Partners = () => {
  const partners = [
    {
      name: "Google",
      logo: "https://www.google.com/images/branding/googlelogo/2x/googlelogo_light_color_92x30dp.png",
      alt: "Google Logo"
    },
    {
      name: "Microsoft",
      logo: "https://img-prod-cms-rt-microsoft-com.akamaized.net/cms/api/am/imageFileData/RE1Mu3b?ver=5c31",
      alt: "Microsoft Logo"
    },
    {
      name: "Apple",
      logo: "https://www.apple.com/ac/globalnav/7/en_US/images/be15095f-5a20-57d0-ad14-cf4c638e223a/globalnav_apple_image__b5er5ngrzxqq_large.svg",
      alt: "Apple Logo"
    },
    {
      name: "Amazon",
      logo: "https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg",
      alt: "Amazon Logo"
    },
    {
      name: "Meta",
      logo: "https://upload.wikimedia.org/wikipedia/commons/7/7b/Meta_Platforms_Inc._logo.svg",
      alt: "Meta Logo"
    },
    {
      name: "Intel",
      logo: "https://upload.wikimedia.org/wikipedia/commons/8/85/Intel_logo_2023.svg",
      alt: "Intel Logo"
    }
  ];

  return (
    <div className="glass-card p-8 space-y-6 bg-gradient-to-br from-[#222226]/80 via-[#403E43]/80 to-[#221F26]/80">
      <h3 className="text-2xl font-bold text-center mb-8 text-white">
        השותפים שלנו להצלחה שלכם
      </h3>
      
      <div className="overflow-hidden relative">
        <div className="flex animate-[slide_30s_linear_infinite] space-x-8">
          {[...partners, ...partners].map((partner, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.2 }}
              className="flex items-center justify-center min-w-[200px]"
            >
              <img
                src={partner.logo}
                alt={partner.alt}
                className="h-12 w-auto object-contain filter grayscale opacity-70 hover:opacity-100 hover:grayscale-0 transition-all duration-300"
              />
            </motion.div>
          ))}
        </div>
      </div>
      
      <style jsx>{`
        @keyframes slide {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
      `}</style>
      
      <p className="text-center text-sm text-white/60 mt-6">
        אנחנו גאים לשתף פעולה עם החברות המובילות בתעשייה
      </p>
    </div>
  );
};