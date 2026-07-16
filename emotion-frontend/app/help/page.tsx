"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../utils/supabase/client"; // Adjust path if necessary
import {
  Camera,
  Image as ImageIcon,
  Mic,
  History,
  Settings,
  HelpCircle,
  Bell,
  Search,
  LogOut,
  BookOpen,
  Video,
  ShieldAlert,
  Mail,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Check, X as CloseIcon,
  Sparkles,
  User,
  Moon,
  Sun
} from "lucide-react";

export default function HelpAndSupportInterface() {
  const router = useRouter();
  const supabase = createClient();

  // STATE MANAGEMENT
  const [profile, setProfile] = useState<any>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(1); // Defaults first FAQ to open
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Theme and Loading States
  const [theme, setTheme] = useState('light');
  const [isLoading, setIsLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);

  // --- ADD THIS MISSING FUNCTION ---
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('app-theme', newTheme);
  };

  // NEW: Search & Chat States
  const [searchTerm, setSearchTerm] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [totalUnread, setTotalUnread] = useState(0); // <-- NEW BELL STATE
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Clear unread count & stamp read receipt when opening the chat window
  useEffect(() => {
    if (isChatOpen && profile?.user_id) {
      setTotalUnread(0);
      localStorage.setItem(`user_read_${profile.user_id}`, Date.now().toString());
    }
  }, [isChatOpen, profile?.user_id]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, isChatOpen]);

  // Add this helper function near your other helpers (around line 150)
  const getDaysRemaining = () => {
    if (!profile?.subscription_end_date || profile?.subscription_tier === 'FREE') return null;

    const now = new Date();
    const endDate = new Date(profile.subscription_end_date);
    const diffTime = endDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  };

  // Fetch History and Listen for New Messages
  useEffect(() => {
    if (!profile?.user_id) return;

    // 1. Fetch initial message history
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('support_messages')
        .select('*')
        .eq('user_id', profile.user_id)
        .order('created_at', { ascending: true });
      
      if (data) {
        setChatHistory(data);
        
        // NEW: Calculate initial unread messages from Admin on page load
        const lastRead = Number(localStorage.getItem(`user_read_${profile.user_id}`) || 0);
        const unreadCount = data.filter(msg => 
          msg.sender === 'admin' && new Date(msg.created_at).getTime() > lastRead
        ).length;
        
        setTotalUnread(unreadCount);
      }
    };
    fetchMessages();

    // 2. Subscribe to LIVE incoming messages
    const channel = supabase.channel('realtime-support-user')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'support_messages', 
        filter: `user_id=eq.${profile.user_id}` 
      }, (payload) => {
        setChatHistory(prev => {
          if (prev.find(msg => msg.id === payload.new.id)) return prev;
          
          // If the admin sends a message, trigger the Bell or update the read receipt
          if (payload.new.sender === 'admin') {
            if (!isChatOpen) {
              setTotalUnread(count => count + 1);
            } else {
              localStorage.setItem(`user_read_${profile.user_id}`, Date.now().toString());
            }
          }

          return [...prev, payload.new];
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.user_id, supabase, isChatOpen]);

  // Send Message to Database
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim() || !profile?.user_id) return;

    const msgText = chatMessage;
    setChatMessage(""); // Clear input instantly for snappy UI

    // --- NEW: OPTIMISTIC UI UPDATE ---
    // Instantly put the message on the screen so it feels fast
    const tempMessage = {
      id: "temp-" + Date.now(), 
      user_id: profile.user_id,
      sender: 'user',
      text: msgText,
      created_at: new Date().toISOString()
    };
    setChatHistory(prev => [...prev, tempMessage]);
    // ---------------------------------

    const { error, data } = await supabase.from('support_messages').insert({
      user_id: profile.user_id,
      sender: 'user',
      text: msgText
    }).select().single();

    if (error) {
      console.error("Error sending message:", error);
      alert("Failed to send message. Please try again.");
      // Remove the fake message if it failed to send
      setChatHistory(prev => prev.filter(msg => msg.id !== tempMessage.id)); 
    } else if (data) {
      // Replace the temp ID with the real Database UUID
      setChatHistory(prev => prev.map(msg => msg.id === tempMessage.id ? data : msg));
    }
  };

  // 1. LOAD THEME INSTANTLY
  useEffect(() => {
    setIsClient(true);
    const savedTheme = localStorage.getItem('app-theme');
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  // 2. LOAD DATABASE PROFILE
  useEffect(() => {
    async function loadUserProfile() {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        console.log("Auth check - User:", user);
        console.log("Auth check - Error:", userError);

        if (!user) {
          console.log("No user found, redirecting to login");
          router.push("/login");
          return;
        }

        const { data, error } = await supabase
          .from("users")
          .select("username, role, profile_picture, subscription_tier, is_active, subscription_end_date") // <-- ADDED subscription_end_date
          .eq("user_id", user.id)
          .maybeSingle();

        console.log("Profile data:", data);
        console.log("Profile error:", error);

        // 🛑 KICK DEACTIVATED USERS
        if (data && data.is_active === false) {
          alert("This account has been deactivated by an Administrator. Logging out.");
          await supabase.auth.signOut();
          router.push("/login");
          return;
        }

        // 🆕 CHECK SUBSCRIPTION EXPIRY
        if (data && data.subscription_tier !== 'FREE' && data.subscription_end_date) {
          const now = new Date();
          const endDate = new Date(data.subscription_end_date);

          if (now > endDate) {
            // Subscription expired - downgrade to FREE
            await supabase.from('users').update({
              subscription_tier: 'FREE',
              subscription_end_date: null
            }).eq('user_id', user.id);

            data.subscription_tier = 'FREE';
            data.subscription_end_date = null;

            alert('Your Plus subscription has expired. Please renew to continue using expert features.');

            // Force reload to refresh the UI
            window.location.reload();
          }
        }

        if (data) {
          setProfile({ ...data, user_id: user.id });
        } else {
          console.log("No profile found in database");
          const username = user.user_metadata?.username || user.email?.split('@')[0] || "User";
          setProfile({ username: username, role: "USER", user_id: user.id });
        }
      } catch (error) {
        console.error("Failed to load user:", error);
        setProfile({ username: "User", role: "USER", user_id: null });
      } finally {
        setIsLoading(false);
      }
    }
    loadUserProfile();
  }, [router]);

  // Auto-open chat if redirected from the bell
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('openChat') === 'true') {
      setIsChatOpen(true);
    }
  }, []);

  // LOGOUT FUNCTION
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  // Helper for Profile Avatar Initials
  const getInitials = (name: string) => {
    if (!name) return "U";
    return name.substring(0, 2).toUpperCase();
  };

  // FAQ Toggle Function
  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  // ==========================================
  // CHECK FOR SUCCESSFUL PAYMENT REDIRECT
  // ==========================================
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);

    if (query.get("upgrade") === "success") {
      const upgradeUser = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // --- CALCULATE EXACTLY 1 MONTH FROM TODAY ---
          const expiryDate = new Date();
          expiryDate.setMonth(expiryDate.getMonth() + 1);

          // Format date as DD/MM/YYYY
          const formattedDate = expiryDate.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          });

          // Update database with the new tier AND the expiration date
          await supabase.from('users').update({
            subscription_tier: 'PLUS',
            subscription_end_date: expiryDate.toISOString()
          }).eq('user_id', user.id);

          setProfile((prev: any) => ({
            ...prev,
            subscription_tier: 'PLUS',
            subscription_end_date: expiryDate.toISOString()
          }));

          alert(`Payment Successful! Expert features are now unlocked until ${formattedDate}.`);

          // Force a hard browser reload to refresh all components and the database session!
          window.location.href = '/dashboard/help';
        }
      };
      upgradeUser();
    }

    if (query.get("upgrade") === "cancelled") {
      alert("Checkout was cancelled.");
      window.location.href = '/dashboard/help';
    }
  }, [supabase, router]);

  // ==========================================
  // STRIPE CHECKOUT HANDLER
  // ==========================================
  const handleUpgradePayment = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return alert("Please log in to upgrade.");

      const btn = document.getElementById('upgrade-btn');
      if (btn) btn.innerText = "Redirecting to Secure Checkout...";

      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, email: user.email }),
      });

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url; 
      } else {
        alert("Failed to create checkout session.");
      }
    } catch (error) {
      console.error("Payment error:", error);
    }
  };

  // 1. Wait until the component mounts to check the user's actual theme
  if (!isClient) {
    return null; // Renders a transparent blank screen for 1 millisecond to prevent flashing
  }

  // 2. Once the theme is loaded, show the correctly colored loading screen
  if (isLoading) {
    return (
      <div className={`flex h-screen w-full items-center justify-center font-bold transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0F172A] text-[#28667B]' : 'bg-[#F7FAFB] text-[#28667B]'}`}>
        Loading...
      </div>
    );
  }

  // FAQ Data Array
  const faqs = [
    {
      question: "Why isn't my camera turning on for Real-Time Analysis?",
      answer: "Your browser might be blocking camera access. Look for a camera icon in the right side of your browser's address bar. Click it and select 'Always allow'. If the issue persists, ensure no other applications (like Zoom or Teams) are currently using your webcam."
    },
    {
      question: "How accurate is the multi-modal emotion recognition?",
      answer: "Our neural engine is calibrated to detect subtle micro-expressions with an average confidence score of 87-94% under optimal lighting conditions. However, clinical diagnoses should always involve secondary review by certified medical staff."
    },
    {
      question: "Is my patient data and uploaded imagery secure?",
      answer: "Yes. All uploaded data, including static images and voice clips, are processed transiently and are never permanently stored without explicit consent. Our system complies with baseline privacy protocols and utilizes end-to-end encryption."
    },
    {
      question: "How do I export the Analytics PDF for external clinical tools?",
      answer: "After running an analysis on the Static Image or Voice Detection pages, a button labeled 'Export Analytics PDF' will appear at the bottom of the Inference Matrix. Clicking this will download the raw vector data directly to your device."
    }
  ];

  return (
    <div className={`flex h-screen w-full font-sans overflow-hidden transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0F172A] text-[#94A3B8]' : 'bg-[#F7FAFB] text-[#586163]'}`}>

      {/* ================================================================= */}
      {/* ASIDE - SIDE NAVIGATION                                           */}
      {/* ================================================================= */}
      <aside className={`w-[256px] lg:w-[288px] border-r flex flex-col justify-between py-6 shrink-0 h-full z-20 transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-[#EFF4F6] border-[#AAB3B6]/15'}`}>

        <div className="flex flex-col gap-8 px-6">
          <h1 className="text-[#28667B] font-['Manrope'] font-extrabold text-[20px] leading-[25px]">
            Web-Based Multi-modal Emotion Recognition and Analytics System
          </h1>

          <nav className="flex flex-col gap-2">
            <Link href="/dashboard/live" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/10 transition">
              <Camera className={`w-[18px] h-[18px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`} />
              <span className={`font-normal text-[14px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Real-Time Camera</span>
            </Link>

            <Link href="/dashboard/static" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/10 transition">
              <ImageIcon className={`w-[18px] h-[18px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`} />
              <span className={`font-normal text-[14px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Static Image Analysis</span>
            </Link>

            <Link href="/dashboard/voice" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/10 transition">
              <Mic className={`w-[18px] h-[18px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`} />
              <span className={`font-normal text-[14px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Voice Emotion Detection</span>
            </Link>

            <Link href="/dashboard/history" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/10 transition">
              <History className={`w-[18px] h-[18px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`} />
              <span className={`font-normal text-[14px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Emotion History Dashboard</span>
            </Link>

            <Link href="/dashboard/settings" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/10 transition">
              <Settings className={`w-[18px] h-[18px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`} />
              <span className={`font-normal text-[14px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Profile & Settings</span>
            </Link>
          </nav>
        </div>

        <div className="flex flex-col gap-1 px-6 pt-4 border-t border-[#AAB3B6]/15 mt-8">

          {/* ACTIVE LINK: Help & Support */}
          <Link href="/help" className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] w-full ${theme === 'dark' ? 'bg-[#0F172A] border border-[#334155]' : 'bg-white'}`}>
            <HelpCircle className={`w-[14px] h-[14px] ${theme === 'dark' ? 'text-white' : 'text-[#28667B]'}`} />
            <span className={`font-bold text-[12px] ${theme === 'dark' ? 'text-white' : 'text-[#28667B]'}`}>Help & Support</span>
          </Link>

          <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-2 rounded-xl hover:bg-red-500/10 hover:text-red-500 transition w-full text-left mt-2">
            <LogOut className="w-[14px] h-[14px]" />
            <span className="font-medium text-[12px]">
              {profile?.role === "Unregistered" ? "Return to Login" : "Log Out"}
            </span>
          </button>

        </div>
      </aside>

      {/* ================================================================= */}
      {/* MAIN CONTENT STAGE                                                */}
      {/* ================================================================= */}
      <main className={`flex-1 flex flex-col h-full overflow-hidden relative transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0F172A]' : 'bg-[#F7FAFB]'}`}>

        {/* Top App Bar Navigation */}
        <header className={`h-[72px] backdrop-blur-md flex items-center justify-between px-8 shrink-0 z-10 border-b transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B]/80 border-[#334155]' : 'bg-white/80 border-[#E9EFF1]'}`}>
          <div className="flex-1" />

          <div className="flex items-center gap-6">
            
            {/* 1. Notification Bell */}
            <button 
              onClick={() => setIsChatOpen(true)}
              className={`relative p-2 rounded-full transition ${theme === 'dark' ? 'hover:bg-[#334155] text-gray-400' : 'hover:bg-gray-100 text-[#586163]'}`}
              title="Open Live Chat"
            >
              <Bell className="w-5 h-5" />
              {totalUnread > 0 && (
                <div className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-[#1E293B]"></div>
              )}
            </button>

            {/* Vertical Divider */}
            <div className={`h-8 w-px transition-colors duration-500 ${theme === 'dark' ? 'bg-[#334155]' : 'bg-[#E9EFF1]'}`}></div>

            {/* Right Cluster: Sub Badge, Profile, and Theme Toggle */}
            <div className="flex items-center gap-4">
              
              {/* 2. Dynamic Subscription Badge - COMPLETE FIX with days remaining */}
              <div className={`px-3 py-1.5 rounded-md font-bold text-[11px] uppercase tracking-wider border flex items-center gap-1.5 ${profile?.subscription_tier !== 'FREE'
                  ? 'bg-[#14B8A6]/10 text-[#14B8A6] border-[#14B8A6]/20'
                  : theme === 'dark' ? 'bg-[#1E293B] text-gray-400 border-gray-700' : 'bg-[#E2E9EB] text-[#586163] border-[#AAB3B6]/30'
                }`}>
                {profile?.subscription_tier !== 'FREE' && <Sparkles className="w-3 h-3" />}
                {(() => {
                  if (profile?.subscription_tier === 'FREE') return 'Free Plan';

                  const daysLeft = getDaysRemaining();
                  if (daysLeft === null) return `${profile?.subscription_tier} PLAN`;
                  if (daysLeft <= 0) return `${profile?.subscription_tier} PLAN (EXPIRED)`;
                  if (daysLeft <= 3) return `${profile?.subscription_tier} PLAN (${daysLeft} days left ⚠️)`;
                  return `${profile?.subscription_tier} PLAN (${daysLeft} days left)`;
                })()}
              </div>

              {/* 3. Upgrade / Manage Button */}
              <button 
                onClick={() => setShowUpgradeModal(true)}
                className={`px-4 py-2 rounded-lg font-bold text-[12px] shadow-sm transition-colors ${
                  profile?.subscription_tier !== 'FREE'
                    ? theme === 'dark' ? 'bg-[#334155] text-white hover:bg-[#475569]' : 'bg-[#DBE4E6] text-[#28667B] hover:bg-[#c9d6d9]'
                    : 'bg-[#14B8A6] text-white hover:bg-[#0D9488]'
                }`}>
                {profile?.subscription_tier !== 'FREE' ? 'Manage Plan' : 'Upgrade Now'}
              </button>

              {/* 4. User Profile Info */}
              <Link href="/dashboard/settings" className="flex items-center gap-3 pl-2 hover:opacity-80 transition cursor-pointer">
                <div className="flex flex-col items-end">
                  <span className={`text-[14px] font-bold ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>{profile?.username || "Loading..."}</span>
                  <span className="text-[11px] text-[#586163] capitalize opacity-80">{profile?.role || "Patient"}</span>
                </div>
                <div className="w-10 h-10 rounded-full bg-[#DBE4E6] border-2 border-[#28667B]/20 flex items-center justify-center text-[#28667B] font-bold overflow-hidden">
                  {profile?.profile_picture ? (
                    <img src={profile.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    getInitials(profile?.username)
                  )}
                </div>
              </Link>

              {/* 5. THEME TOGGLE BUTTON (Moved to the far right!) */}
              <button
                onClick={toggleTheme}
                className={`ml-2 w-10 h-10 rounded-full flex items-center justify-center transition shadow-sm border ${
                  theme === 'dark' ? 'bg-[#1E293B] border-[#334155] text-yellow-400 hover:bg-[#334155]' : 'bg-white border-[#E2E9EB] text-[#28667B] hover:bg-[#F7FAFB]'
                }`}
                title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
              >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

            </div>
          </div>
        </header>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-12 xl:p-16 flex flex-col items-start xl:items-center">
          <div className="w-full max-w-[1024px] flex flex-col gap-12 pb-12">

            {/* Header & Search Hero */}
            <div className="flex flex-col gap-8 w-full bg-[#28667B] rounded-[24px] p-10 lg:p-16 relative overflow-hidden shadow-lg">
              {/* Decorative Blur Elements */}
              <div className="absolute w-[300px] h-[300px] bg-[#A0F3F5] rounded-full blur-[80px] opacity-20 -top-20 -right-20 pointer-events-none" />
              <div className="absolute w-[200px] h-[200px] bg-white rounded-full blur-[60px] opacity-10 -bottom-10 left-10 pointer-events-none" />

              <div className="relative z-10 flex flex-col gap-4 max-w-[600px]">
                <h2 className="text-white font-['Manrope'] font-bold text-[40px] leading-[48px] tracking-[-1px]">
                  How can we help you today?
                </h2>
                <p className="text-[#A0F3F5] text-[18px] leading-[28px]">
                  Search our knowledge base or browse categories below to find answers to common questions and technical guides.
                </p>
              </div>

              <div className="relative z-10 w-full max-w-[600px] h-[60px] bg-white rounded-[16px] flex items-center px-6 shadow-md focus-within:ring-4 focus-within:ring-[#A0F3F5]/30 transition-all">
                <Search className="w-6 h-6 text-[#737C7F]" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Ask a question (e.g., 'How to export PDF report')"
                  className={`w-full h-full bg-transparent border-none outline-none px-4 text-[16px] ${theme === 'dark' ? 'text-[#2B3436] placeholder-[#737C7F]' : 'text-[#2B3436] placeholder-[#AAB3B6]'}`}
                />
              </div>
            </div>

            {/* Quick Categories Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
              <div className={`rounded-[20px] p-6 border shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-md transition cursor-pointer flex flex-col gap-4 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-gray-200'}`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${theme === 'dark' ? 'bg-[#0F172A]' : 'bg-[#E9EFF1]'}`}>
                  <BookOpen className="w-6 h-6 text-[#28667B]" />
                </div>
                <div>
                  <h3 className={`font-bold text-[18px] mb-1 ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>Documentation</h3>
                  <p className={`text-[14px] leading-[22px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Detailed guides on understanding metrics and system capabilities.</p>
                </div>
              </div>

              <div className={`rounded-[20px] p-6 border shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-md transition cursor-pointer flex flex-col gap-4 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-gray-200'}`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${theme === 'dark' ? 'bg-[#0F172A]' : 'bg-[#E9EFF1]'}`}>
                  <Video className="w-6 h-6 text-[#28667B]" />
                </div>
                <div>
                  <h3 className={`font-bold text-[18px] mb-1 ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>Video Tutorials</h3>
                  <p className={`text-[14px] leading-[22px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Step-by-step walkthroughs for real-time analysis and history tracking.</p>
                </div>
              </div>

              <div className={`rounded-[20px] p-6 border shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-md transition cursor-pointer flex flex-col gap-4 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-gray-200'}`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${theme === 'dark' ? 'bg-[#0F172A]' : 'bg-[#E9EFF1]'}`}>
                  <ShieldAlert className="w-6 h-6 text-[#28667B]" />
                </div>
                <div>
                  <h3 className={`font-bold text-[18px] mb-1 ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>Privacy & Security</h3>
                  <p className={`text-[14px] leading-[22px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Learn how we handle patient data, compliance, and end-to-end encryption.</p>
                </div>
              </div>
            </div>

            {/* Layout Split: FAQs & Contact Support */}
            <div className="flex flex-col lg:flex-row gap-12 w-full">

              {/* Left Column: FAQs */}
              <div className="flex-[2] flex flex-col gap-6">
                <h3 className={`font-['Manrope'] font-bold text-[24px] ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>
                  Frequently Asked Questions
                </h3>

                <div className="flex flex-col gap-4">
                  {faqs.filter(faq => 
                    faq.question.toLowerCase().includes(searchTerm.toLowerCase()) || 
                    faq.answer.toLowerCase().includes(searchTerm.toLowerCase())
                  ).length > 0 ? (
                    faqs.filter(faq => 
                      faq.question.toLowerCase().includes(searchTerm.toLowerCase()) || 
                      faq.answer.toLowerCase().includes(searchTerm.toLowerCase())
                    ).map((faq, index) => (
                      <div
                        key={index}
                        className={`rounded-[16px] border transition-all overflow-hidden ${theme === 'dark' ? (openFaq === index ? 'bg-[#1E293B] border-[#28667B]/50 shadow-md' : 'bg-[#1E293B] border-[#334155]') : (openFaq === index ? 'bg-white border-[#28667B]/30 shadow-md' : 'bg-white border-gray-200')}`}
                      >
                        <button
                          onClick={() => toggleFaq(index)}
                          className={`w-full px-6 py-5 flex items-center justify-between text-left transition-colors ${theme === 'dark' ? 'hover:bg-[#334155]/50' : 'hover:bg-[#F7FAFB]'}`}
                        >
                          <span className={`font-bold text-[16px] ${openFaq === index ? 'text-[#28667B]' : (theme === 'dark' ? 'text-white' : 'text-[#2B3436]')}`}>
                            {faq.question}
                          </span>
                          {openFaq === index ? (
                            <ChevronUp className="w-5 h-5 text-[#28667B] shrink-0 ml-4" />
                          ) : (
                            <ChevronDown className={`w-5 h-5 shrink-0 ml-4 ${theme === 'dark' ? 'text-gray-400' : 'text-[#737C7F]'}`} />
                          )}
                        </button>

                        {openFaq === index && (
                          <div className={`px-6 pb-6 pt-0 text-[15px] leading-[26px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>
                            {faq.answer}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className={`text-center py-8 ${theme === 'dark' ? 'text-gray-400' : 'text-[#737C7F]'}`}>
                      No answers found for "{searchTerm}". Try checking the documentation or contacting support.
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Contact Support */}
              <div className="flex-1 flex flex-col gap-6">
                <div className={`rounded-[24px] p-8 flex flex-col gap-6 relative overflow-hidden ${theme === 'dark' ? 'bg-[#1E293B]' : 'bg-[#E9EFF1]'}`}>
                  <div className="flex flex-col gap-2 relative z-10">
                    <h3 className={`font-['Manrope'] font-bold text-[24px] ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>
                      Still need help?
                    </h3>
                    <p className={`text-[14px] leading-[22px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>
                      Our clinical engineering team is available on working hours to assist with technical difficulties or system calibrations.
                    </p>
                  </div>

                  <div className="flex flex-col gap-4 relative z-10 mt-2">
                    <button 
                      onClick={() => setIsChatOpen(true)}
                      className="w-full h-[52px] bg-[#28667B] text-white rounded-[12px] font-bold text-[15px] shadow-lg hover:bg-[#1f5061] transition flex items-center justify-center gap-2"
                    >
                      <MessageSquare className="w-5 h-5" />
                      Live Chat Support
                    </button>

                    <button 
                      onClick={() => {
                        const email = "ngjx-wp23@student.tarc.edu.my";
                        const subject = encodeURIComponent("Technical Support Request - Emotion Recognition System");
                        window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${email}&su=${subject}`, '_blank');
                      }}
                      className={`w-full h-[52px] border rounded-[12px] font-bold text-[15px] transition flex items-center justify-center gap-2 ${theme === 'dark' ? 'bg-[#0F172A] text-white border-[#334155] hover:bg-[#334155]' : 'bg-white text-[#28667B] border-[#28667B]/20 hover:bg-[#28667B]/5'}`}
                    >
                      <Mail className="w-5 h-5" />
                      Email Technical Team
                    </button>
                  </div>

                  <p className={`text-[12px] text-center mt-2 font-medium ${theme === 'dark' ? 'text-gray-500' : 'text-[#737C7F]'}`}>
                    Working Hour: 10:00a.m. - 6:00p.m.
                  </p>
                </div>
              </div>

            </div>

            {/* Footer */}
            <footer className="w-full max-w-[992px] py-8 border-t border-[#E2E8F0]/20 flex justify-center">
              <p className="text-[#737C7F] text-[12px] font-semibold tracking-[2.4px] uppercase text-center">
                © 2026 WEB-BASED MULTI-MODAL EMOTION RECOGNITION AND ANALYTICS SYSTEM.
              </p>
            </footer>

          </div>
        </div>

        {/* ============================================================ */}
        {/* UPGRADE MODAL OVERLAY                                        */}
        {/* ============================================================ */}
        {showUpgradeModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={`relative w-full max-w-[900px] rounded-[24px] shadow-2xl overflow-hidden flex flex-col ${theme === 'dark' ? 'bg-[#0F172A] border border-[#334155]' : 'bg-white'}`}>
              
              {/* Close Button */}
              <button 
                onClick={() => setShowUpgradeModal(false)}
                className="absolute top-6 right-6 p-2 bg-gray-500/10 rounded-full hover:bg-gray-500/20 transition z-10"
              >
                <CloseIcon className={`w-5 h-5 ${theme === 'dark' ? 'text-gray-300' : 'text-[#586163]'}`} />
              </button>

              {/* Modal Header */}
              <div className="flex flex-col items-center text-center pt-12 pb-8 px-8">
                <div className="inline-flex items-center gap-2 bg-[#14B8A6]/10 px-3 py-1 rounded-full mb-4">
                  <Sparkles className="w-4 h-4 text-[#14B8A6]" />
                  <span className="text-[#14B8A6] text-[12px] font-bold uppercase tracking-widest">Unlock True Precision</span>
                </div>
                <h2 className={`font-['Manrope'] font-extrabold text-[32px] md:text-[40px] leading-tight mb-4 ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>
                  Choose Your Analytics Plan
                </h2>
                <p className={`text-[16px] max-w-[500px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>
                  Upgrade your multi-modal processing capabilities to access our highest-tier neural networks and AI-driven clinical insights.
                </p>
              </div>

              {/* Pricing Cards */}
              <div className="flex flex-col md:flex-row gap-6 px-8 pb-12 items-stretch">
                
                {/* 1. Free Plan */}
                <div className={`flex-1 flex flex-col rounded-[20px] p-6 border transition-transform hover:-translate-y-1 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-[#F7FAFB] border-[#E2E9EB]'}`}>
                  <h3 className={`font-bold text-[20px] mb-2 ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>Basic</h3>
                  <div className="flex items-end gap-1 mb-6">
                    <span className={`font-extrabold text-[36px] leading-none ${theme === 'dark' ? 'text-white' : 'text-[#28667B]'}`}>Free</span>
                  </div>
                  {/* flex-1 pushes the button down */}
                  <ul className="flex flex-col gap-3 mb-8 flex-1">
                    <li className="flex items-center gap-3 text-[14px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0" /> Standard ResNet-34 Engine</li>
                    <li className="flex items-center gap-3 text-[14px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0" /> 7-Day History Retention</li>
                    <li className="flex items-center gap-3 text-[14px] text-gray-400 opacity-50"><CloseIcon className="w-4 h-4 shrink-0" /> No Gemini AI Insights</li>
                    <li className="flex items-center gap-3 text-[14px] text-gray-400 opacity-50"><CloseIcon className="w-4 h-4 shrink-0" /> No PDF Export</li>
                  </ul>
                  {profile?.subscription_tier === 'FREE' ? (
                    <button disabled className="w-full py-3 rounded-xl font-bold text-[14px] mt-auto bg-gray-500 text-white cursor-not-allowed opacity-50">
                      Current Plan
                    </button>
                  ) : (
                    <button onClick={() => setShowUpgradeModal(false)} className={`w-full py-3 rounded-xl font-bold text-[14px] mt-auto transition ${theme === 'dark' ? 'bg-[#334155] text-white hover:bg-[#475569]' : 'bg-[#E2E9EB] text-[#28667B] hover:bg-[#d1dcde]'}`}>
                      Downgrade to Basic
                    </button>
                  )}
                </div>

                {/* 2. RM 2 Plan (Highlighted) */}
                <div className="flex-1 flex flex-col rounded-[20px] p-6 border-2 border-[#14B8A6] bg-gradient-to-b from-[#14B8A6]/10 to-transparent relative transition-transform hover:-translate-y-1 shadow-[0_0_30px_-5px_rgba(20,184,166,0.3)]">
                  <div className="absolute top-0 inset-x-0 transform -translate-y-1/2 flex justify-center">
                    <span className="bg-[#14B8A6] text-white text-[10px] font-bold uppercase tracking-wider py-1 px-3 rounded-full">Most Popular</span>
                  </div>
                  <h3 className={`font-bold text-[20px] mb-2 ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>Plus</h3>
                  <div className="flex items-end gap-1 mb-6">
                    <span className={`font-extrabold text-[36px] leading-none ${theme === 'dark' ? 'text-white' : 'text-[#28667B]'}`}>RM 2</span>
                    <span className="text-[14px] text-[#586163] mb-1">/mo</span>
                  </div>
                  {/* flex-1 pushes the button down */}
                  <ul className="flex flex-col gap-3 mb-8 flex-1">
                    <li className="flex items-start gap-3 text-[14px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0 mt-0.5" /> <span className="font-bold text-[#14B8A6]">Expert ResNet-152 Engine</span></li>
                    <li className="flex items-start gap-3 text-[14px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0 mt-0.5" /> 60s Live / 5 Static Analysis daily</li>
                    <li className="flex items-start gap-3 text-[14px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0 mt-0.5" /> Gemini AI Assistant (5 uses)</li>
                    <li className="flex items-start gap-3 text-[14px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0 mt-0.5" /> Full PDF Report Exports</li>
                  </ul>
                  {profile?.subscription_tier === 'PLUS' ? (
                    <button disabled className="w-full py-3 rounded-xl font-bold text-[14px] mt-auto bg-gray-500 text-white cursor-not-allowed opacity-50">
                      Current Plan
                    </button>
                  ) : profile?.subscription_tier === 'ENTERPRISE' ? (
                    <button disabled className="w-full py-3 rounded-xl font-bold text-[14px] mt-auto bg-[#14B8A6]/50 text-white cursor-not-allowed opacity-70">
                      Included in Enterprise
                    </button>
                  ) : (
                    <button id="upgrade-btn" onClick={handleUpgradePayment} className="w-full py-3 rounded-xl font-bold text-[14px] mt-auto bg-[#14B8A6] text-white hover:bg-[#0D9488] shadow-lg transition">
                      Upgrade to Plus
                    </button>
                  )}
                </div>

                {/* 3. Enterprise Plan */}
                <div className={`flex-1 flex flex-col rounded-[20px] p-6 border transition-transform hover:-translate-y-1 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-[#F7FAFB] border-[#E2E9EB]'}`}>
                  <h3 className={`font-bold text-[20px] mb-2 ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>Clinical Enterprise</h3>
                  <div className="flex items-end gap-1 mb-6">
                    <span className={`font-extrabold text-[36px] leading-none ${theme === 'dark' ? 'text-white' : 'text-[#28667B]'}`}>RM 50</span>
                    <span className="text-[14px] text-[#586163] mb-1">/mo</span>
                  </div>
                  {/* flex-1 pushes the button down */}
                  <ul className="flex flex-col gap-3 mb-8 flex-1">
                    <li className="flex items-start gap-3 text-[14px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0 mt-0.5" /> Unlimited Expert Engine</li>
                    <li className="flex items-start gap-3 text-[14px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0 mt-0.5" /> Unlimited Gemini Insights</li>
                    <li className="flex items-start gap-3 text-[14px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0 mt-0.5" /> Multi-Patient Admin Dashboard</li>
                    <li className="flex items-start gap-3 text-[14px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0 mt-0.5" /> Longitudinal Predictive Metrics</li>
                  </ul>
                  {profile?.subscription_tier === 'ENTERPRISE' ? (
                    <button disabled className="w-full py-3 rounded-xl font-bold text-[14px] mt-auto bg-gray-500 text-white cursor-not-allowed opacity-50">
                      Current Plan
                    </button>
                  ) : (
                    <button 
                      onClick={() => {
                          const email = "ngjx-wp23@student.tarc.edu.my";
                          const subject = encodeURIComponent("Enterprise Plan Inquiry - Emotion Recognition System");
                          window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${email}&su=${subject}`, '_blank');
                      }}
                      className={`w-full py-3 rounded-xl font-bold text-[14px] mt-auto transition ${theme === 'dark' ? 'bg-[#334155] text-white hover:bg-[#475569]' : 'bg-[#E2E9EB] text-[#28667B] hover:bg-[#d1dcde]'}`}
                    >
                      Contact Sales
                    </button>
                  )}
                </div>

              </div>
            </div>
          </div>
        )}
        {/* ============================================================ */}
        {/* FLOATING LIVE CHAT WIDGET                                    */}
        {/* ============================================================ */}
        {isChatOpen && (
          <div className={`fixed bottom-6 right-6 w-[350px] sm:w-[400px] h-[500px] rounded-2xl shadow-2xl border flex flex-col z-[150] overflow-hidden animate-in slide-in-from-bottom-5 ${theme === 'dark' ? 'bg-[#0F172A] border-[#334155]' : 'bg-white border-[#E2E9EB]'}`}>
            
            <div className="bg-[#28667B] text-white px-4 py-3 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-white" />
                  </div>
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 border-2 border-[#28667B] rounded-full" />
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-[14px] leading-tight">Clinical Support Admin</span>
                  <span className="text-[10px] text-white/80">Typical response time: Under 10 minutes.</span>
                </div>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="hover:bg-white/20 p-1.5 rounded-full transition">
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>

            <div className={`flex-1 overflow-y-auto p-4 flex flex-col gap-4 ${theme === 'dark' ? 'bg-[#1E293B]' : 'bg-[#F7FAFB]'}`}>
              {chatHistory.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-center opacity-50 text-[12px] px-4">
                  Send a message below to start a live chat with our support team.
                </div>
              )}
              {chatHistory.map(msg => {
                const isUser = msg.sender === 'user';
                const timeString = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={msg.id} className={`flex flex-col max-w-[85%] ${isUser ? 'self-end items-end' : 'self-start items-start'}`}>
                    <div className={`px-3 py-2.5 rounded-2xl text-[13px] shadow-sm ${isUser ? 'bg-[#14B8A6] text-white rounded-br-sm' : (theme === 'dark' ? 'bg-[#334155] text-white rounded-bl-sm' : 'bg-white border text-[#2B3436] rounded-bl-sm')}`}>
                      {msg.text}
                    </div>
                    <span className={`text-[9px] mt-1 px-1 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>{timeString}</span>
                  </div>
                );
              })}
              {/* This invisible div forces the chat to auto-scroll to the bottom! */}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className={`p-3 border-t flex gap-2 shrink-0 ${theme === 'dark' ? 'bg-[#0F172A] border-[#334155]' : 'bg-white border-[#E2E9EB]'}`}>
              <input
                type="text"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="Type your message..."
                className={`flex-1 border rounded-xl px-4 py-2.5 text-[13px] outline-none transition ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155] text-white focus:border-[#14B8A6]' : 'bg-[#F7FAFB] border-[#E2E9EB] text-[#2B3436] focus:border-[#28667B]'}`}
              />
              <button type="submit" disabled={!chatMessage.trim()} className="bg-[#14B8A6] text-white px-4 py-2.5 rounded-xl disabled:opacity-50 transition hover:bg-[#0D9488] shadow-sm">
                Send
              </button>
            </form>
          </div>
        )}        
      </main>
    </div>
  );
}