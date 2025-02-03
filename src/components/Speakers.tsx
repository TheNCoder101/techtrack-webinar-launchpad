import { User } from "lucide-react";

export const Speakers = () => {
  return (
    <div className="glass-card p-6 animate-fade-in">
      <h3 className="text-2xl font-bold mb-6">המרצים שלנו</h3>
      <div className="flex items-center space-x-4 space-x-reverse">
        <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
          <User className="w-8 h-8 text-white" />
        </div>
        <div className="text-right">
          <h4 className="text-xl font-bold">Amit Bakshi</h4>
          <p className="text-white/80">Recruiter & Resume Writer</p>
        </div>
      </div>
    </div>
  );
};