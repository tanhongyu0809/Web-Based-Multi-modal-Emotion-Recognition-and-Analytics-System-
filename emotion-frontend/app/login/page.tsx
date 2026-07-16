"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HelpCircle, AlertCircle, Eye, EyeOff, Mail } from "lucide-react";
// 1. Import your Supabase client
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

export default function LoginInterface() {
  const router = useRouter();
  const supabase = createClient(); // Initialize Supabase

  // 2. Set up our state variables
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false); // Track loading state

  // NEW: State to track password visibility
  const [showPassword, setShowPassword] = useState(false);
  
  // State for the animated emoji
  const [currentEmojiIndex, setCurrentEmojiIndex] = useState(0);

  // Cycle through the emojis every 2.5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentEmojiIndex((prev) => (prev + 1) % EMOTIONS.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!email || !password) {
      setErrorMessage("Please enter both your email and password.");
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) {
        throw error; 
      }

      // Inside LoginInterface.tsx -> handleLogin function

      if (data.user) {
        // 1. Fetch the user's role AND active status from the database
        const { data: profile } = await supabase
          .from("users")
          .select("role, is_active") 
          .eq("user_id", data.user.id)
          .single();

        // 2. 🛑 BLOCK DEACTIVATED USERS 🛑
        if (profile && profile.is_active === false) {
          await supabase.auth.signOut(); // Instantly kill the session
          throw new Error("This account has been deactivated. Please contact support.");
        }

        // 3. STAMP THE 'updated_at' TIME AND SYNC LATEST EMAIL INTO PUBLIC.USERS TABLE
        await supabase
          .from("users")
          .update({ 
            updated_at: new Date().toISOString(),
            email: data.user.email 
          })
          .eq("user_id", data.user.id);

        // 4. Redirect based on role
        if (profile?.role === 'ADMIN') {
          router.push("/admin/users"); 
        } else {
          router.push("/dashboard/live"); 
        }
      }

    } catch (error: any) {
      const errMsg = error?.message || error?.error_description || (typeof error === 'object' ? JSON.stringify(error) : String(error));
      setErrorMessage(errMsg !== '{}' ? errMsg : "Failed to sign in. Please check your email or password.");
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================
  // FORGOT PASSWORD ACTION
  // ==========================================
  const handleForgotPassword = async (e: React.MouseEvent) => {
    e.preventDefault();
    setErrorMessage("");

    const targetEmail = email || prompt("Please enter your registered email address to reset your password:");
    if (!targetEmail) return;

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: `${window.location.origin}/reset-password`, 
      });

      if (error) throw error;
      alert(`A password reset link has been sent to ${targetEmail}`);
    } catch (error: any) {
      setErrorMessage(error.message || "Failed to send reset email.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-[#F7FAFB] font-sans overflow-x-hidden">

      {/* ================================================================= */}
      {/* SECTION - LEFT COLUMN: BRANDING & ATMOSPHERE                      */}
      {/* ================================================================= */}
      <section className="relative w-full md:w-1/2 bg-[#EFF4F6] p-12 lg:p-24 flex flex-col justify-center items-start overflow-hidden border-b md:border-b-0 md:border-r border-gray-200/30 shrink-0">

        {/* Figma Decorative Background Blurs */}
        <div className="absolute w-[384px] h-[384px] -left-[96px] -top-[96px] bg-[#BDEAFA] filter blur-[60px] rounded-full opacity-40 pointer-events-none" />
        <div className="absolute w-[256px] h-[256px] -right-[96px] top-1/2 bg-[#A0F3F5] filter blur-[50px] rounded-full opacity-40 pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-12 w-full max-w-[448px]">
          <div className="flex flex-col">
            <h2 className="text-[24px] font-extrabold tracking-[-0.6px] text-[#28667B] leading-[32px] font-['Manrope',_sans-serif]">
              Web-Based Multi-modal Emotion Recognition and Analytics System
            </h2>
          </div>

          {/* Dynamic Rotating Emoji Display (Replaces static User icon) */}
          <div className="w-[240px] h-[240px] bg-white/60 border border-white backdrop-blur-sm rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex items-center justify-center p-4">
            <div className="w-full h-full rounded-full bg-gradient-to-tr from-[#28667B]/20 to-[#A0F3F5]/30 flex items-center justify-center relative overflow-hidden">
              <span 
                key={currentEmojiIndex} 
                className="text-[100px] leading-none drop-shadow-xl animate-[bounce_2.5s_infinite] relative z-10"
              >
                {EMOTIONS[currentEmojiIndex].icon}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <h1 className="text-[#2B3436] text-[52px] xl:text-[72px] font-extrabold leading-[1] tracking-[-1.8px] font-['Manrope',_sans-serif]">
              The Future of Emotional Intelligence
            </h1>
            <p className="text-[18px] xl:text-[20px] font-medium leading-[28px] text-[#586163]">
              Leveraging advanced multi-modal analysis to decode the subtle nuances of human well-being. Precision meets empathy.
            </p>
          </div>
        </div>
      </section>

      {/* ================================================================= */}
      {/* SECTION - RIGHT COLUMN: LOGIN FORM                                */}
      {/* ================================================================= */}
      <section className="flex-1 bg-[#F7FAFB] px-6 py-16 md:px-16 lg:p-24 flex flex-col items-center justify-center overflow-y-auto">

        <div className="w-full max-w-[448px] flex flex-col">

          <div className="flex flex-col gap-2 mb-8">
            <h2 className="text-[#2B3436] text-[30px] font-bold leading-[36px] font-['Manrope',_sans-serif]">
              Sign In
            </h2>
            <p className="text-[16px] leading-[24px] text-[#586163] font-medium">
              Continue your path to mindfulness
            </p>
          </div>

          {/* Error Message Display block */}
          {errorMessage && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 animate-pulse">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm font-semibold text-red-600">{errorMessage}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-6 mb-8">

            {/* Email Field */}
            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-semibold text-[#586163] leading-[20px]">
                Email Address
              </label>
              <div className="w-full h-[55px] bg-[#E2E9EB] rounded-[16px] flex items-center px-5 border-2 border-transparent focus-within:border-[#28667B] transition-colors">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-transparent text-[16px] text-[#2B3436] placeholder-[#737C7F] outline-none font-normal"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-semibold text-[#586163] leading-[20px]">
                Password
              </label>
              <div className="w-full h-[55px] bg-[#E2E9EB] rounded-[16px] flex items-center px-5 border-2 border-transparent focus-within:border-[#28667B] transition-colors">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full bg-transparent text-[16px] text-[#2B3436] placeholder-[#737C7F] outline-none ${showPassword || password.length === 0 ? "" : "tracking-widest"}`}
                />
                {/* Only show the icon button if there is text in the password field */}
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

            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="remember"
                  className="w-5 h-5 rounded border-[#AAB3B6] accent-[#28667B] bg-[#E2E9EB] cursor-pointer"
                />
                <label htmlFor="remember" className="text-[14px] font-medium text-[#586163] cursor-pointer select-none">
                  Remember me
                </label>
              </div>
              <button 
                type="button"
                onClick={handleForgotPassword} 
                className="text-[14px] font-bold text-[#28667B] hover:underline bg-transparent border-none p-0 cursor-pointer"
              >
                Forgot Password?
              </button>
            </div>

            <button
              type="submit"
              // Disable if loading, or if either email or password fields are empty
              disabled={isLoading || !email || !password}
              className="w-full h-[60px] bg-[#28667B] text-[#F2FAFF] rounded-[16px] font-['Inter'] font-bold text-[18px] shadow-[0_10px_15px_-3px_rgba(40,102,123,0.1),_0_4px_6px_-4px_rgba(40,102,123,0.1)] hover:bg-[#1f5061] disabled:opacity-50 transition duration-300"
            >
              {isLoading ? "Signing In..." : "Sign In"}
            </button>
          </form>

          <div className="flex justify-center items-center pt-8 border-t border-[#AAB3B6]/15 gap-1 mb-2">
            <p className="text-[16px] font-medium text-[#586163]">
              Don't have an account?
            </p>
            <Link href="/register" className="text-[16px] font-bold text-[#28667B] hover:underline">
              Create Account
            </Link>
          </div>

          <div className="flex justify-center items-center py-2 mb-10">
            <button 
              type="button"
              onClick={() => {
                const email = "ngjx-wp23@student.tarc.edu.my";
                const subject = encodeURIComponent("Technical Support Request - Emotion Recognition System");
                window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${email}&su=${subject}`, '_blank');
              }}
              className="flex items-center gap-2 px-6 py-2.5 bg-white border border-[#28667B]/20 rounded-full hover:bg-[#28667B]/5 transition shadow-sm"
            >
              <Mail className="w-[16px] h-[16px] text-[#28667B]" />
              <span className="text-[12px] font-bold text-[#28667B] tracking-[1.2px] uppercase">
                Email Technical Team
              </span>
            </button>
          </div>

          <footer className="w-full pt-10 border-t border-[#AAB3B6]/10 flex justify-center">
            <p className="text-[12px] font-bold text-[#737C7F] tracking-[2.4px] uppercase leading-[18px] text-center max-w-[356px]">
              © 2026 WEB-BASED MULTI-MODAL EMOTION RECOGNITION AND ANALYTICS SYSTEM.
            </p>
          </footer>

        </div>
      </section>

    </div>
  );
}