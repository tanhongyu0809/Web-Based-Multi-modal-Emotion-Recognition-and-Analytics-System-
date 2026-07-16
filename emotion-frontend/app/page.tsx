"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Mic, LineChart, Camera, Image as ImageIcon } from "lucide-react";

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

export default function FigmaLandingPage() {
  const [currentEmojiIndex, setCurrentEmojiIndex] = useState(0);

  // Cycle through the emojis every 2.5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentEmojiIndex((prev) => (prev + 1) % EMOTIONS.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#F7FAFB] font-sans text-[#586163] overflow-x-hidden">
      
      {/* 1. TOP NAVIGATION / HEADER */}
      <header className="w-full flex items-center justify-between px-12 py-6 max-w-[1536px] mx-auto relative z-20">
        <h1 className="text-2xl font-semibold tracking-tight text-[#134E4A]">
          Web-Based Multi-modal Emotion Recognition and Analytics System
        </h1>
        <Link href="/register">
          <button className="bg-[#28667B] text-[#F2FAFF] px-6 py-2.5 rounded-2xl font-medium text-base hover:bg-[#1f5061] transition">
            Get Started
          </button>
        </Link>
      </header>

      {/* 2. HERO SECTION */}
      <section className="relative w-full max-w-[1536px] mx-auto px-12 pt-16 pb-24 flex items-center min-h-[600px]">
        <div className="flex flex-col gap-8 max-w-[576px] z-10">
          <div className="inline-flex items-center gap-2 bg-[#A0F3F5] px-4 py-2 rounded-full w-fit shadow-sm">
            <div className="w-3 h-3 bg-[#00686A] rounded-full animate-pulse" />
            <span className="text-sm font-semibold text-[#00686A] tracking-wide">
              SYSTEM ONLINE
            </span>
          </div>
          <h1 className="text-[#2B3436] text-[96px] leading-[1] font-extrabold tracking-[-4.8px] font-['Manrope',_sans-serif]">
            The Future of Emotional Intelligence
          </h1>
          <p className="text-[24px] leading-[32px] font-light text-[#586163]">
            Advanced multi-modal emotion recognition for clinical and professional environments.
          </p>
          <div className="mt-8">
            <Link href="/register">
              <button className="flex items-center gap-4 text-[#28667B] font-bold text-[18px] group">
                Explore Platform Features
                <span className="w-8 h-8 rounded-full bg-[#28667B] flex items-center justify-center text-white group-hover:translate-x-1 transition-transform">
                  →
                </span>
              </button>
            </Link>
          </div>
        </div>
        
        {/* Dynamic Rotating Emoji Display (Replaces empty space) */}
        <div className="absolute right-12 lg:right-[10%] top-1/2 -translate-y-1/2 hidden md:flex flex-col items-center justify-center w-[500px] h-[500px] z-0 pointer-events-none">
          {/* Animated glowing backdrop */}
          <div className="absolute inset-0 bg-gradient-to-tr from-[#A0F3F5]/30 to-[#28667B]/10 rounded-full blur-[80px] animate-pulse" />
          
          <div className="relative z-10 flex flex-col items-center justify-center">
            {/* The Emoji */}
            <span 
              key={currentEmojiIndex} // Key forces React to re-trigger the animation on change
              className="text-[220px] leading-none drop-shadow-2xl animate-[bounce_2.5s_infinite]"
              style={{ textShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}
            >
              {EMOTIONS[currentEmojiIndex].icon}
            </span>
            
            {/* The Text Label */}
            <div className="h-[40px] mt-8 flex items-center overflow-hidden">
              <span 
                key={`text-${currentEmojiIndex}`} 
                className={`text-3xl font-black uppercase tracking-[0.3em] animate-[pulse_2.5s_infinite] ${EMOTIONS[currentEmojiIndex].color}`}
              >
                {EMOTIONS[currentEmojiIndex].label}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. OUR SOLUTION SECTION (BENTO GRID) */}
      <section className="bg-[#EFF4F6] w-full py-[128px] px-12 md:px-[144px]">
        <div className="max-w-[1536px] mx-auto flex flex-col gap-[64px]">
          
          {/* Section Header */}
          <div className="flex flex-col gap-6 max-w-[1440px]">
            <h2 className="text-[#2B3436] text-[48px] leading-[48px] font-extrabold tracking-[-2.4px] font-['Manrope',_sans-serif]">
              Our Solution
            </h2>
            <p className="text-[20px] leading-[32px] max-w-[750px]">
              A comprehensive suite of affective computing tools designed to capture, analyze, and visualize human emotion across multiple modalities.
            </p>
          </div>

          {/* Figma Bento Grid Auto Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-auto lg:h-[700px]">
            
            {/* Box 1: Voice Recognition (Large Left) */}
            <div className="col-span-1 lg:col-span-7 bg-white rounded-[20px] p-[40px] flex flex-col justify-between shadow-sm">
              <div className="flex flex-col gap-4">
                <div className="w-12 h-12 bg-[#28667B] rounded-lg flex items-center justify-center text-white mb-2 shadow-md">
                  <Mic className="w-6 h-6" />
                </div>
                <h3 className="text-[#2B3436] text-[24px] font-extrabold font-['Manrope',_sans-serif]">
                  Voice Recognition
                </h3>
                <p className="text-[16px] leading-[24px]">
                  Passive acoustic monitoring to detect shifts in emotional cadence and vocal fatigue.
                </p>
              </div>
              <div className="mt-[54px]">
                <p className="text-[#28667B] text-[14px] font-bold tracking-[1.4px] uppercase">
                  Explore Audio
                </p>
              </div>
            </div>

            {/* Box 2: Real-Time Camera (Top Right) */}
            <div className="col-span-1 lg:col-span-5 bg-[#E9EFF1] rounded-[20px] p-[40px] flex flex-col gap-4 shadow-inner">
              <div className="w-10 h-10 bg-[#28667B] rounded-lg flex items-center justify-center text-white mb-2 shadow-md">
                <Camera className="w-5 h-5" />
              </div>
              <h3 className="text-[#2B3436] text-[20px] font-extrabold font-['Manrope',_sans-serif]">
                Real-Time Camera
              </h3>
              <p className="text-[14px] leading-[20px]">
                Leverage live camera input for instantaneous emotion recognition and streaming telemetry via WebSockets.
              </p>
            </div>

            {/* Box 3: Static Image Analysis (Bottom Left) */}
            <div className="col-span-1 lg:col-span-6 bg-[#A0F3F5] rounded-[20px] p-[40px] flex flex-col md:flex-row gap-[48px] items-center relative overflow-hidden shadow-sm">
              <div className="flex flex-col gap-4 z-10 w-full md:w-[288px]">
                <div className="w-10 h-10 bg-[#00686A] rounded-lg flex items-center justify-center text-white mb-2 shadow-md">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <h3 className="text-[#00686A] text-[24px] font-extrabold font-['Manrope',_sans-serif]">
                  Static Image Analysis
                </h3>
                <p className="text-[#00686A] opacity-80 text-[16px] leading-[24px]">
                  Upload high-resolution patient imagery to detect nuanced emotional micro-expressions using our calibrated neural engine.
                </p>
              </div>
              
              {/* Abstract UI overlay represented in Figma */}
              <div className="hidden md:flex flex-col gap-2 p-4 bg-white/50 rounded-2xl w-[291px] h-[258px] border border-white/40 shadow-xl">
                <div className="w-[194px] h-2 bg-[#00686A]/30 rounded-full" />
                <div className="w-[129px] h-2 bg-[#00686A]/30 rounded-full" />
                <div className="w-[259px] h-2 bg-[#00686A]/20 rounded-full" />
              </div>
            </div>

            {/* Box 4: Emotion History (Bottom Right) */}
            <div className="col-span-1 lg:col-span-6 bg-[#DBE4E6] rounded-[20px] p-[40px] flex flex-col justify-end relative overflow-hidden shadow-sm">
              {/* Faded Background Icon */}
              <LineChart className="absolute top-10 left-10 w-[183px] h-[100px] text-[#2B3436] opacity-5" />
              
              <div className="flex flex-col gap-4 z-10 w-full md:w-[262px]">
                <div className="w-10 h-10 bg-[#28667B] rounded-lg flex items-center justify-center text-white mb-2 shadow-md">
                  <LineChart className="w-5 h-5" />
                </div>
                <h3 className="text-[#2B3436] text-[24px] font-extrabold font-['Manrope',_sans-serif]">
                  Emotion History
                </h3>
                <p className="text-[16px] leading-[24px]">
                  Longitudinal data visualization that maps the journey of your well-being over weeks, months, and years.
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 4. PLATFORM REACH / STATISTICS */}
      <section className="bg-[#F7FAFB] w-full py-[128px] px-12 md:px-[144px]">
        <div className="max-w-[1536px] mx-auto flex flex-col gap-[80px]">
          
          {/* Header & Faded Text Auto Layout */}
          <div className="flex flex-col md:flex-row justify-between items-end gap-10">
            <div className="flex flex-col gap-4 w-full md:w-[550px]">
              <h2 className="text-[#2B3436] text-[60px] leading-[60px] font-extrabold tracking-[-3px] font-['Manrope',_sans-serif]">
                System Impact
              </h2>
              <p className="text-[20px] leading-[28px]">
                Delivering actionable emotional intelligence at scale.
              </p>
            </div>
            <div className="hidden lg:block text-[#E9EFF1] text-[128px] leading-[1] font-extrabold font-['Manrope',_sans-serif] opacity-50 text-right">
              REACH
            </div>
          </div>

          {/* Statistics Counters Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-auto md:h-[346px]">
            
            {/* Stat Box 1 (Light) */}
            <div className="bg-[#EFF4F6] border border-[#AAB3B6]/10 rounded-2xl flex flex-col items-center justify-center p-12 text-center">
              <h3 className="text-[#28667B] text-[60px] leading-[60px] font-extrabold tracking-[-3px] font-['Manrope',_sans-serif] mb-2">
                28.7k
              </h3>
              <p className="text-[#586163] text-[18px] font-medium leading-[28px]">
                Training Samples
              </p>
              <p className="text-[#586163]/70 text-[14px] font-light italic leading-[23px] mt-1">
                FER2013 Base
              </p>
            </div>

            {/* Stat Box 2 (Dark Teal - Elevated) */}
            <div className="bg-[#28667B] rounded-2xl flex flex-col items-center justify-center p-12 text-center shadow-[0_25px_50px_-12px_rgba(40,102,123,0.2)] relative -translate-y-2">
              <h3 className="text-[#F2FAFF] text-[60px] leading-[60px] font-extrabold tracking-[-3px] font-['Manrope',_sans-serif] mb-2">
                70.87%
              </h3>
              <p className="text-[#F2FAFF]/80 text-[18px] font-medium leading-[28px]">
                Model Precision
              </p>
              <p className="text-[#F2FAFF]/60 text-[14px] font-light italic leading-[23px] mt-1">
                ResNet152 Architecture
              </p>
            </div>

            {/* Stat Box 3 (Light) */}
            <div className="bg-[#EFF4F6] border border-[#AAB3B6]/10 rounded-2xl flex flex-col items-center justify-center p-12 text-center">
              <h3 className="text-[#28667B] text-[60px] leading-[60px] font-extrabold tracking-[-3px] font-['Manrope',_sans-serif] mb-2">
                &lt; 50ms
              </h3>
              <p className="text-[#586163] text-[18px] font-medium leading-[28px]">
                Inference Speed
              </p>
              <p className="text-[#586163]/70 text-[14px] font-light italic leading-[23px] mt-1">
                Real-time processing
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* 5. FOOTER */}
      <footer className="w-full bg-[#F1F5F9] border-t border-[#E2E8F0] px-12 md:px-[144px] py-[64px]">
        <div className="max-w-[1536px] mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <div className="flex flex-col gap-6">
            <h4 className="text-[#134E4A] text-[18px] font-semibold leading-[28px]">
              Web-Based Multi-modal Emotion Recognition and Analytics System.
            </h4>
            <p className="text-[#737C7F] text-[12px] font-semibold tracking-[2.4px] uppercase">
              © 2026 WEB-BASED MULTI-MODAL EMOTION RECOGNITION AND ANALYTICS SYSTEM.
            </p>
          </div>
          
          <div className="flex items-center gap-8 text-[#64748B] text-[14px]">
            <a href="#" className="hover:text-[#134E4A] transition">Privacy Policy</a>
            <a href="#" className="hover:text-[#134E4A] transition">Terms of Service</a>
            <a href="#" className="hover:text-[#134E4A] transition">Clinical Disclaimer</a>
          </div>
        </div>
      </footer>

    </div>
  );
}