"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { createClient } from "../utils/supabase/client";

// Array of emotions for the hero animation
const EMOTIONS = [
  { icon: "😄", label: "Happy", color: "text-[#4CAF50]" },
  { icon: "😲", label: "Surprise", color: "text-[#FFC107]" },
  { icon: "😢", label: "Sad", color: "text-[#28667B]" },
  { icon: "😠", label: "Angry", color: "text-[#DC2626]" },
  { icon: "😨", label: "Fear", color: "text-[#614A00]" },
  { icon: "🤢", label: "Disgust", color: "text-[#1f5061]" },
  { icon: "😐", label: "Neutral", color: "text-[#586163]" },
];

export default function RegisterInterface() {
  const router = useRouter();
  const supabase = createClient();

  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [privacyAgreed, setPrivacyAgreed] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [currentEmojiIndex, setCurrentEmojiIndex] = useState(0);

  // Cycle through the emojis every 2.5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentEmojiIndex((prev) => (prev + 1) % EMOTIONS.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // Get today's date in YYYY-MM-DD format for the max attribute
  const today = new Date().toISOString().split('T')[0];

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    
    if (!fullName || !email || !password || !dob) {
      setErrorMessage("Please fill in all required fields.");
      return;
    }

    // Validate date of birth is not in the future
    if (dob > today) {
      setErrorMessage("Date of birth cannot be in the future.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }
    if (!privacyAgreed) {
      setErrorMessage("You must agree to the privacy protocol.");
      return;
    }

    setIsLoading(true);

    try {
      // 1. Sign up - the database trigger auto-creates the profile
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            username: fullName,
          }
        }
      });

      if (authError) throw authError;

      // 2. Update the auto-created profile with additional info
      if (authData.user) {
        const { error: updateError } = await supabase
          .from('users')
          .update({
            username: fullName,
            date_of_birth: dob || null,
            address: address || null
          })
          .eq('user_id', authData.user.id);

        if (updateError) throw updateError;

        router.push("/dashboard/live");
      }
    } catch (error: any) {
      console.error("Registration Error:", error);

      let extractedMessage = "An unexpected error occurred during registration.";

      if (typeof error === "string") {
        extractedMessage = error;
      } else if (error && typeof error.message === "string") {
        extractedMessage = error.message;
      } else if (error && typeof error.details === "string") {
        extractedMessage = error.details;
      }

      setErrorMessage(extractedMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const isFormIncomplete = !fullName || !dob || !email || !password || !confirmPassword || !privacyAgreed;

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-[#F7FAFB] font-sans text-[#586163] overflow-x-hidden">

      <section className="relative w-full md:w-[533px] bg-[#E9EFF1] px-12 lg:px-20 py-12 lg:py-24 flex flex-col justify-center items-start overflow-hidden border-b md:border-b-0 md:border-r border-gray-200/30 shrink-0">
        <div className="absolute w-[384px] h-[384px] -right-[53px] -top-[144px] bg-[#A0F3F5] filter blur-[50px] rounded-full opacity-40 pointer-events-none" />
        <div className="absolute w-[320px] h-[320px] -left-[53px] -bottom-[144px] bg-[#ABE5FE] filter blur-[40px] rounded-full opacity-40 pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-10 w-full max-w-[341px]">
          <div className="flex flex-col gap-2">
            <h2 className="text-[30px] font-extrabold tracking-[-1.5px] text-[#28667B] leading-[36px] font-['Manrope',_sans-serif]">Web-Based Multi-modal Emotion Recognition and Analytics System</h2>
            <p className="text-xs tracking-wider text-[#28667B]/70 font-semibold uppercase">Affective Computing Platform</p>
          </div>

          {/* Dynamic Rotating Emoji Display */}
          <div className="w-[320px] h-[320px] bg-white/60 border border-white backdrop-blur-sm rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex items-center justify-center p-4">
            <div className="w-full h-full rounded-full bg-gradient-to-tr from-[#28667B]/20 to-[#A0F3F5]/30 flex items-center justify-center relative overflow-hidden">
              <span 
                key={currentEmojiIndex} 
                className="text-[140px] leading-none drop-shadow-xl animate-[bounce_2.5s_infinite] relative z-10"
              >
                {EMOTIONS[currentEmojiIndex].icon}
              </span>
            </div>
          </div>

          {/* Adjusted Line Height (leading) and padding to prevent 'e' from clipping */}
          <div className="flex flex-col gap-8 pb-4">
            <h1 className="text-[#2B3436] text-[52px] xl:text-[72px] font-extrabold leading-[1.1] tracking-[-1.8px] font-['Manrope',_sans-serif]">The Future of <br />Emotional Intelligence</h1>
            <p className="text-[20px] xl:text-[24px] font-medium leading-[32px] text-[#586163]">Leveraging advanced multi-modal analysis to decode the subtle nuances of human well-being. Precision meets empathy.</p>
          </div>
        </div>
      </section>

      <section className="flex-1 bg-[#F7FAFB] px-6 py-16 md:px-16 lg:px-24 xl:py-[128px] flex flex-col items-center justify-center overflow-y-auto">

        <div className="w-full max-w-[426px] flex flex-col gap-10">

          <div className="flex flex-col gap-4">
            <h2 className="text-[#2B3436] text-[48px] xl:text-[60px] font-extrabold tracking-[-1.5px] leading-[1] font-['Manrope',_sans-serif]">Join Us</h2>
            <p className="text-[18px] xl:text-[20px] leading-[28px] text-[#586163]">Empowering mental health monitoring through multi-modal emotion recognition.</p>
          </div>

          {errorMessage && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 animate-pulse">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm font-semibold text-red-600">{errorMessage}</p>
            </div>
          )}

          <form onSubmit={handleRegister} className="flex flex-col gap-6">

            <div className="flex flex-col gap-2.5">
              <label className="text-sm font-bold text-[#586163] tracking-wide flex items-center gap-2">Full Name</label>
              <div className="relative w-full h-[55px] bg-[#E2E9EB] rounded-2xl flex items-center px-5 border-2 border-transparent focus-within:border-[#28667B] transition-colors">
                <input
                  type="text"
                  value={fullName} onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full bg-transparent text-base text-[#2B3436] placeholder-[#737C7F]/60 outline-none font-medium"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <label className="text-sm font-bold text-[#586163]">Date of Birth</label>
              <div className="relative h-[55px] bg-[#E2E9EB] rounded-[20px] flex items-center px-4 justify-between border-2 border-transparent focus-within:border-[#28667B] transition-colors">
                <input
                  type="date"
                  value={dob} 
                  onChange={(e) => setDob(e.target.value)}
                  max={today}  // This prevents selecting future dates
                  className="w-full bg-transparent text-sm text-[#2B3436] font-medium outline-none cursor-pointer"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <label className="text-sm font-bold text-[#586163]">Email Address</label>
              <div className="w-full h-[55px] bg-[#E2E9EB] rounded-2xl flex items-center px-5 border-2 border-transparent focus-within:border-[#28667B] transition-colors">
                <input
                  type="email"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full bg-transparent text-base text-[#2B3436] placeholder-[#737C7F]/60 outline-none font-medium"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <label className="text-sm font-bold text-[#586163]">Residential Address</label>
              <div className="w-full h-[140px] bg-[#E2E9EB] rounded-[20px] p-4 flex border-2 border-transparent focus-within:border-[#28667B] transition-colors">
                <textarea
                  value={address} onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Wellness Way, City, Country"
                  className="w-full bg-transparent text-base text-[#2B3436] placeholder-[#737C7F]/60 outline-none font-medium resize-none h-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-5">
              <div className="flex flex-col gap-2.5">
                <label className="text-sm font-bold text-[#586163]">Password</label>
                <div className="h-[55px] bg-[#E2E9EB] rounded-2xl flex items-center px-5 border-2 border-transparent focus-within:border-[#28667B] transition-colors">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`w-full bg-transparent text-base text-[#2B3436] placeholder-[#737C7F]/60 outline-none ${showPassword || password.length === 0 ? "" : "tracking-widest"}`}
                  />
                  {password.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="ml-2 text-[#737C7F] hover:text-[#28667B] focus:outline-none transition-colors shrink-0 animate-in fade-in zoom-in duration-200"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <label className="text-sm font-bold text-[#586163]">Confirm Password</label>
                <div className="h-[55px] bg-[#E2E9EB] rounded-2xl flex items-center px-5 border-2 border-transparent focus-within:border-[#28667B] transition-colors">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`w-full bg-transparent text-base text-[#2B3436] placeholder-[#737C7F]/60 outline-none ${showConfirmPassword || confirmPassword.length === 0 ? "" : "tracking-widest"}`}
                  />
                  {confirmPassword.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="ml-2 text-[#737C7F] hover:text-[#28667B] focus:outline-none transition-colors shrink-0 animate-in fade-in zoom-in duration-200"
                    >
                      {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-4 py-2">
              <input
                type="checkbox"
                id="privacy"
                checked={privacyAgreed} onChange={(e) => setPrivacyAgreed(e.target.checked)}
                className="w-5 h-5 mt-0.5 rounded border-[#AAB3B6] accent-[#28667B] bg-white cursor-pointer"
              />
              <label htmlFor="privacy" className="text-[14px] lg:text-[16px] leading-[24px] text-[#586163] cursor-pointer select-none">
                I agree to the privacy protocol baseline guidelines and authorization terms for processing clinical analytics.
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading || isFormIncomplete}
              className="w-full h-[76px] bg-[#28667B] text-[#F2FAFF] rounded-[20px] font-['Manrope'] font-bold text-[20px] shadow-[0_20px_25px_-5px_rgba(40,102,123,0.2),_0_8_10px_-6px_rgba(40,102,123,0.2)] hover:bg-[#1f5061] disabled:opacity-50 transition duration-300 mt-2"
            >
              {isLoading ? "Creating Profile..." : "Create Account"}
            </button>
          </form>

          <div className="text-center py-2 border-b border-gray-200/50 pb-8">
            <p className="text-[18px] text-[#586163]">
              Already have an account?{" "}
              <Link href="/login" className="text-[#28667B] font-bold hover:underline ml-1">Log in</Link>
            </p>
          </div>

          <footer className="text-center pt-4">
            <p className="text-[11px] font-bold text-[#737C7F] tracking-[2.4px] uppercase leading-[18px]">
              © 2026 WEB-BASED MULTI-MODAL EMOTION RECOGNITION AND ANALYTICS SYSTEM.
            </p>
          </footer>

        </div>
      </section>

    </div>
  );
}