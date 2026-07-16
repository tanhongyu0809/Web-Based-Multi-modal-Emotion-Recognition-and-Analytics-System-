"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { createClient } from "../utils/supabase/client";

export default function ResetPasswordInterface() {
  const router = useRouter();
  const supabase = createClient();

  const [theme, setTheme] = useState("light");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // State to track password visibility
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("app-theme");
      if (savedTheme === "dark") {
        setTheme("dark");
      }
    } catch (e) { }
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!password || !confirmPassword) {
      setErrorMessage("Please fill in both fields.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Your passwords do not match.");
      return;
    }

    setIsLoading(true);

    try {
      // Supabase securely updates the password for the user who clicked the email link
      const { error } = await supabase.auth.updateUser({ password: password });

      if (error) throw error;

      setSuccessMessage("Password successfully updated! Redirecting to login...");
      
      // Send them back to the login screen after 3 seconds
      setTimeout(() => {
        supabase.auth.signOut(); // Log them out so they can test their new password
        router.push("/login");
      }, 3000);

    } catch (error: any) {
      setErrorMessage(error.message || "Failed to reset password.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`min-h-screen w-full flex flex-col items-center justify-center font-sans px-6 py-12 transition-colors duration-500 ${theme === "dark" ? "bg-[#0F172A]" : "bg-[#F7FAFB]"}`}>
      <div className={`w-full max-w-[480px] flex flex-col p-8 rounded-[24px] shadow-sm border transition-colors duration-500 ${theme === "dark" ? "bg-[#1E293B] border-[#334155]" : "bg-white border-[#E9EFF1]"}`}>
        
        {/* Back Link */}
        <button
          type="button"
          onClick={() => router.back()}
          className={`flex items-center gap-2 text-sm font-semibold mb-6 self-start transition-colors ${theme === "dark" ? "text-gray-400 hover:text-white" : "text-[#586163] hover:text-[#28667B]"}`}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Settings
        </button>

        <div className="flex flex-col gap-2 mb-8 text-center">
          <h2 className={`text-[30px] font-extrabold leading-[36px] font-['Manrope',_sans-serif] ${theme === "dark" ? "text-white" : "text-[#2B3436]"}`}>
            Set New Password
          </h2>
          <p className={`text-[16px] leading-[24px] font-medium ${theme === "dark" ? "text-gray-400" : "text-[#586163]"}`}>
            Please enter your new password below.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm font-semibold text-red-600">{errorMessage}</p>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            <p className="text-sm font-semibold text-green-700">{successMessage}</p>
          </div>
        )}

        <form onSubmit={handleResetPassword} className="flex flex-col gap-6 mb-2">
          
          {/* New Password Field */}
          <div className="flex flex-col gap-2">
            <label className={`text-[14px] font-semibold leading-[20px] ${theme === "dark" ? "text-gray-300" : "text-[#586163]"}`}>
              New Password
            </label>
            <div className={`w-full h-[55px] rounded-[16px] flex items-center px-5 border-2 transition-colors ${theme === "dark" ? "bg-[#0F172A] border-[#334155] focus-within:border-[#A0F3F5]" : "bg-[#E2E9EB] border-transparent focus-within:border-[#28667B]"}`}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`w-full bg-transparent text-[16px] placeholder-[#737C7F] outline-none ${theme === "dark" ? "text-white" : "text-[#2B3436]"} ${showPassword || password.length === 0 ? "" : "tracking-widest"}`}
              />
              {password.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`ml-2 focus:outline-none transition-colors shrink-0 animate-in fade-in zoom-in duration-200 ${theme === "dark" ? "text-gray-400 hover:text-white" : "text-[#737C7F] hover:text-[#28667B]"}`}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              )}
            </div>
          </div>

          {/* Confirm Password Field */}
          <div className="flex flex-col gap-2">
            <label className={`text-[14px] font-semibold leading-[20px] ${theme === "dark" ? "text-gray-300" : "text-[#586163]"}`}>
              Confirm New Password
            </label>
            <div className={`w-full h-[55px] rounded-[16px] flex items-center px-5 border-2 transition-colors ${theme === "dark" ? "bg-[#0F172A] border-[#334155] focus-within:border-[#A0F3F5]" : "bg-[#E2E9EB] border-transparent focus-within:border-[#28667B]"}`}>
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className={`w-full bg-transparent text-[16px] placeholder-[#737C7F] outline-none ${theme === "dark" ? "text-white" : "text-[#2B3436]"} ${showConfirmPassword || confirmPassword.length === 0 ? "" : "tracking-widest"}`}
              />
              {confirmPassword.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className={`ml-2 focus:outline-none transition-colors shrink-0 animate-in fade-in zoom-in duration-200 ${theme === "dark" ? "text-gray-400 hover:text-white" : "text-[#737C7F] hover:text-[#28667B]"}`}
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !!successMessage || !password || !confirmPassword}
            className="w-full h-[60px] bg-[#28667B] text-[#F2FAFF] rounded-[16px] font-['Inter'] font-bold text-[18px] shadow-[0_10px_15px_-3px_rgba(40,102,123,0.1)] hover:bg-[#1f5061] disabled:opacity-50 transition duration-300 mt-2"
          >
            {isLoading ? "Saving..." : "Reset Password"}
          </button>
        </form>

      </div>
    </div>
  );
}