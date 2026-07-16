"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import {
  Camera,
  Image as ImageIcon,
  Mic,
  History,
  Settings,
  HelpCircle,
  User,
  Mail,
  Lock,
  MapPin,
  AlertTriangle,
  LogOut,
  Check, X as CloseIcon,
  Bell,
  Moon,
  Sun,
  Sparkles
} from "lucide-react";

export default function ProfileSettingsInterface() {
  const router = useRouter();
  const supabase = createClient();

  const [theme, setTheme] = useState('light');
  const [profile, setProfile] = useState<any>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // NEW: Account Edit States
  const [isEditingAccount, setIsEditingAccount] = useState(false);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [accountForm, setAccountForm] = useState({
    email: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });

  // NEW: Personal Details Edit States
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [isSavingPersonal, setIsSavingPersonal] = useState(false);
  const [personalForm, setPersonalForm] = useState({
    username: "",
    address: ""
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);

  const [totalUnread, setTotalUnread] = useState(0);

  useEffect(() => {
    setIsClient(true);
    const savedTheme = localStorage.getItem('app-theme');
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    localStorage.setItem('app-theme', newTheme);
  };

  // Add this helper function
  const getDaysRemaining = () => {
    if (!profile?.subscription_end_date || profile?.subscription_tier === 'FREE') return null;

    const now = new Date();
    const endDate = new Date(profile.subscription_end_date);
    const diffTime = endDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  };

  useEffect(() => {
    async function loadUserProfile() {
      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          router.push("/login");
          return;
        }

        const { data, error } = await supabase
          .from("users")
          .select("*, subscription_end_date") // <-- ADDED subscription_end_date
          .eq("user_id", user.id)
          .maybeSingle();

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
            window.location.reload();
          }
        }

        if (data) {
          // If auth user email (user.email) has been verified and updated in Authentication (e.g. ngjingxu11@gmail.com),
          // automatically sync it into public.users table so the database table catches up right away!
          if (user.email && data.email !== user.email) {
            await supabase.from('users').update({ email: user.email }).or(`user_id.eq.${user.id},email.eq.${data.email}`);
            data.email = user.email;
          }
          setProfile({
            ...data,
            email: user.email || data.email
          });
        } else if (error) {
          console.error("Database error:", error.message);
          setProfile({
            username: "New User",
            email: user.email,
            role: "USER",
            created_at: new Date().toISOString()
          });
        } else {
          setProfile({
            username: "New User",
            email: user.email,
            role: "USER",
            created_at: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error("Failed to load user:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadUserProfile();
  }, [router]);

  // ==========================================
  // GLOBAL NOTIFICATION LISTENER (USER SIDE)
  // ==========================================
  useEffect(() => {
    if (!profile?.user_id) return;

    const calculateUnread = async () => {
      const { data: messages } = await supabase
        .from('support_messages')
        .select('created_at')
        .eq('user_id', profile.user_id)
        .eq('sender', 'admin');

      if (messages) {
        const lastRead = Number(localStorage.getItem(`user_read_${profile.user_id}`) || 0);
        const unreadCount = messages.filter(msg => new Date(msg.created_at).getTime() > lastRead).length;
        setTotalUnread(unreadCount);
      }
    };
    calculateUnread();

    const channel = supabase.channel('user-global-bell-settings')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'support_messages',
        filter: `user_id=eq.${profile.user_id}`
      }, (payload) => {
        if (payload.new.sender === 'admin') {
          setTotalUnread(count => count + 1);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.user_id, supabase]);

  const [isUploading, setIsUploading] = useState(false);

  // Calculate if the user is allowed to upload based on a 1-year cooldown
  const canUploadAvatar = () => {
    if (!profile?.last_avatar_update) return true; // Never uploaded before

    const lastUpdateDate = new Date(profile.last_avatar_update);
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    return lastUpdateDate <= oneYearAgo;
  };

  const isUploadAllowed = canUploadAvatar();

  // ==========================================
  // RECORD ACTIONS: UPLOAD PROFILE IMAGE
  // ==========================================
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setIsUploading(true);
      const file = event.target.files?.[0];
      if (!file) return;

      // Check if upload is allowed
      if (!isUploadAllowed) {
        const nextAvailableDate = new Date(profile.last_avatar_update);
        nextAvailableDate.setFullYear(nextAvailableDate.getFullYear() + 1);
        alert(`You can only change your profile picture once a year. Next available: ${nextAvailableDate.toLocaleDateString()}`);
        setIsUploading(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}-${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const now = new Date().toISOString();

      // ✅ FIXED: Save BOTH profile_picture AND last_avatar_update
      const { error: updateError } = await supabase
        .from('users')
        .update({
          profile_picture: publicUrl,
          last_avatar_update: now  // ← THIS IS THE KEY - save the timestamp!
        })
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      // ✅ FIXED: Update local state with BOTH values
      setProfile({
        ...profile,
        profile_picture: publicUrl,
        last_avatar_update: now
      });

      alert("Profile picture updated successfully! You can change it again in one year.");

    } catch (error: any) {
      console.error("Error uploading image:", error);
      alert(error.message || "An error occurred while uploading the image.");
    } finally {
      setIsUploading(false);
    }
  };

  // ==========================================
  // ACCOUNT ACTIONS: UPDATE EMAIL
  // ==========================================
  const handleSaveAccount = async () => {
    setIsSavingAccount(true);
    try {
      if (!accountForm.email || accountForm.email === profile.email) {
        setIsEditingAccount(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No authenticated user found");

      // First, explicitly find the user ID from the database table to guarantee exact match
      const { data: foundUser } = await supabase
        .from('users')
        .select('user_id')
        .or(`user_id.eq.${user.id},email.eq.${profile?.email || user.email}`)
        .maybeSingle();

      const targetUserId = foundUser?.user_id || profile?.user_id || user.id;

      // Update auth.email
      const { error: emailError } = await supabase.auth.updateUser({
        email: accountForm.email
      });
      if (emailError) throw emailError;

      // Immediately sync into public.users table using the explicitly found user_id
      const { data: updatedRows, error: dbError } = await supabase
        .from('users')
        .update({ email: accountForm.email })
        .eq('user_id', targetUserId)
        .select();

      if (dbError) {
        console.error("Database update error:", dbError);
        alert(`Authentication updated, but database table update failed: ${dbError.message}`);
      } else if (!updatedRows || updatedRows.length === 0) {
        console.warn("RLS policy blocked database table update or user_id did not match.");
        alert(`Authentication updated to ${accountForm.email}, but your 'users' table did not update (Row Level Security blocked it). Please make sure your RLS UPDATE policy is active.`);
      } else {
        alert(`Email successfully updated to ${accountForm.email} in both Authentication and your Database table! Please check your inbox for a confirmation link if prompted.`);
      }

      setProfile({ ...profile, email: accountForm.email });
      setIsEditingAccount(false);
    } catch (error: any) {
      const errMsg = error?.message || error?.error_description || (typeof error === 'object' ? JSON.stringify(error) : String(error));
      alert(`Failed to update email: ${errMsg !== '{}' ? errMsg : 'Invalid email or already in use.'}`);
    } finally {
      setIsSavingAccount(false);
    }
  };

  // ==========================================
  // PERSONAL DETAILS: UPDATE NAME & ADDRESS
  // ==========================================
  const handleSavePersonal = async () => {
    setIsSavingPersonal(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // First, explicitly find the user ID from the database table
      const { data: foundUser } = await supabase
        .from('users')
        .select('user_id')
        .or(`user_id.eq.${user.id},email.eq.${profile?.email || user.email}`)
        .maybeSingle();

      const targetUserId = foundUser?.user_id || profile?.user_id || user.id;

      // Update database using explicitly found user ID
      const { error } = await supabase
        .from('users')
        .update({
          username: personalForm.username,
          address: personalForm.address
        })
        .eq('user_id', targetUserId);

      if (error) throw error;

      // Also update auth metadata so other pages get the updated username
      await supabase.auth.updateUser({
        data: { username: personalForm.username }
      });

      setProfile({ ...profile, username: personalForm.username, address: personalForm.address });
      setIsEditingPersonal(false);
      alert("Personal details updated successfully!");
    } catch (error: any) {
      alert(error.message || "Failed to update personal details.");
    } finally {
      setIsSavingPersonal(false);
    }
  };

  // ==========================================
  // DANGER ZONE: DEACTIVATE ACCOUNT
  // ==========================================
  const handleDeactivateAccount = async () => {
    if (!confirm("⚠️ Are you sure you want to deactivate your account?\n\nYour profile will be suspended and you will be signed out right now, but your historical data and account records will be safely preserved.")) {
      return;
    }

    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found.");

      // Just flip the is_active switch to false without deleting any records or auth
      const { error: updateError } = await supabase
        .from('users')
        .update({ is_active: false })
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      // Sign out the user and redirect to login
      await supabase.auth.signOut();
      alert("Your account has been deactivated successfully.");
      router.push("/login");

    } catch (error: any) {
      console.error("Error deactivating account:", error);
      alert(error.message || "Failed to deactivate account.");
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const getInitials = (name: string) => {
    if (!name) return "U";
    return name.substring(0, 2).toUpperCase();
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "Recently";
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
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
          router.replace('/dashboard/settings');
          setShowUpgradeModal(false);
        }
      };
      upgradeUser();
    }

    if (query.get("upgrade") === "cancelled") {
      alert("Checkout was cancelled.");
      router.replace('/dashboard/settings');
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

  return (
    <div className={`flex h-screen w-full font-sans overflow-hidden transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0F172A] text-[#94A3B8]' : 'bg-[#F7FAFB] text-[#586163]'}`}>

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

            <Link href="/dashboard/settings" className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] ${theme === 'dark' ? 'bg-[#0F172A] border border-[#334155]' : 'bg-white'}`}>
              <Settings className={`w-5 h-5 ${theme === 'dark' ? 'text-white' : 'text-[#28667B]'}`} />
              <span className={`font-bold text-[14px] ${theme === 'dark' ? 'text-white' : 'text-[#28667B]'}`}>Profile & Settings</span>
            </Link>
          </nav>
        </div>

        <div className="flex flex-col gap-1 px-6 pt-4 border-t border-[#AAB3B6]/15 mt-8">
          <Link href="/help" className="flex items-center gap-3 px-4 py-2 rounded-xl hover:bg-white/10 transition w-full text-left">
            <HelpCircle className={`w-[14px] h-[14px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`} />
            <span className={`font-medium text-[12px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Help & Support</span>
          </Link>

          <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-2 rounded-xl hover:bg-red-500/10 hover:text-red-500 transition w-full text-left mt-2">
            <LogOut className="w-[14px] h-[14px]" />
            <span className="font-medium text-[12px]">Log Out</span>
          </button>
        </div>
      </aside>

      <main className={`flex-1 flex flex-col h-full overflow-hidden relative transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0F172A]' : 'bg-[#F7FAFB]'}`}>

        <header className={`h-[72px] backdrop-blur-md flex items-center justify-between px-8 shrink-0 z-10 border-b transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B]/80 border-[#334155]' : 'bg-white/80 border-[#E9EFF1]'}`}>
          <div className="flex-1" />

          <div className="flex items-center gap-6">

            {/* 1. Notification Bell - Opens chat directly */}
            <button
              onClick={() => {
                // Check if we're on the help page, if not navigate with openChat param
                if (window.location.pathname === '/help') {
                  // If already on help page, we need to trigger the chat to open
                  // We'll use a custom event or just reload with the param
                  window.location.href = '/help?openChat=true';
                } else {
                  router.push('/help?openChat=true');
                }
              }}
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

              {/* 2. Dynamic Subscription Badge */}
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
                className={`px-4 py-2 rounded-lg font-bold text-[12px] shadow-sm transition-colors ${profile?.subscription_tier !== 'FREE'
                  ? theme === 'dark' ? 'bg-[#334155] text-white hover:bg-[#475569]' : 'bg-[#DBE4E6] text-[#28667B] hover:bg-[#c9d6d9]'
                  : 'bg-[#14B8A6] text-white hover:bg-[#0D9488]'
                  }`}>
                {profile?.subscription_tier !== 'FREE' ? 'Manage Plan' : 'Upgrade Now'}
              </button>

              {/* 4. User Profile Info */}
              <Link href="/dashboard/settings" className="flex items-center gap-3 pl-2 hover:opacity-80 transition cursor-pointer">
                <div className="flex flex-col items-end">
                  <span className={`text-[14px] font-bold ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>{profile?.username || "Loading..."}</span>
                  <span className="text-[11px] text-[#586163] capitalize opacity-80">{profile?.role === 'ADMIN' ? 'Admin' : 'User'}</span>
                </div>
                <div className="w-10 h-10 rounded-full bg-[#DBE4E6] border-2 border-[#28667B]/20 flex items-center justify-center text-[#28667B] font-bold overflow-hidden">
                  {profile?.profile_picture ? (
                    <img src={profile.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    getInitials(profile?.username)
                  )}
                </div>
              </Link>

              {/* 5. THEME TOGGLE BUTTON (Far right) */}
              <button
                onClick={handleThemeChange.bind(null, theme === 'light' ? 'dark' : 'light')}
                className={`ml-2 w-10 h-10 rounded-full flex items-center justify-center transition shadow-sm border ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155] text-yellow-400 hover:bg-[#334155]' : 'bg-white border-[#E2E9EB] text-[#28667B] hover:bg-[#F7FAFB]'
                  }`}
                title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
              >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-12 flex flex-col items-center">
          <div className="w-full max-w-[1024px] flex flex-col gap-12 pb-12">

            <div className={`w-full shadow-[0_1px_2px_rgba(0,0,0,0.05)] rounded-[12px] p-8 flex items-center gap-8 transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B]' : 'bg-white'}`}>
              <div className="relative w-[128px] h-[128px]">
                <div className="w-full h-full bg-[#DBE4E6] rounded-[24px] shadow-[0_0_0_4px_rgba(40,102,123,0.1)] flex items-center justify-center text-[#28667B] text-4xl font-extrabold overflow-hidden">
                  {/* Show the uploaded image if it exists, otherwise fallback to initials */}
                  {profile?.profile_picture ? (
                    <img src={profile.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    getInitials(profile?.username)
                  )}
                </div>

                {/* Hidden File Input */}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id="avatar-upload"
                  onChange={handleImageUpload}
                  disabled={isUploading}
                />

                {/* Clickable Camera Button triggers the hidden input */}
                <button
                  onClick={() => {
                    if (!isUploadAllowed) {
                      const nextAvailableDate = new Date(profile.last_avatar_update);
                      nextAvailableDate.setFullYear(nextAvailableDate.getFullYear() + 1);
                      alert(`You can update your picture again on ${nextAvailableDate.toLocaleDateString()}`);
                      return;
                    }
                    document.getElementById('avatar-upload')?.click();
                  }}
                  disabled={isUploading || !isUploadAllowed}
                  title={!isUploadAllowed ? "Changes locked for 1 year" : "Update Profile Picture"}
                  className={`absolute -right-2 -bottom-2 w-[36px] h-[36px] rounded-[12px] flex items-center justify-center shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1)] border-2 border-white transition ${(isUploading || !isUploadAllowed) ? 'bg-gray-400 cursor-not-allowed opacity-60' : 'bg-[#28667B] hover:bg-[#1f5061]'}`}
                >
                  {isUploading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Camera className="w-[16px] h-[16px] text-white" />
                  )}
                </button>
              </div>

              <div className="flex flex-col gap-1">
                <h1 className={`font-['Manrope'] font-extrabold text-[30px] tracking-[-0.75px] ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>
                  {profile?.username || "Loading..."}
                </h1>
                <p className="text-[#586163] text-[16px] font-medium">
                  User since {formatDate(profile?.created_at)}
                </p>
                {/* 1-YEAR COOLDOWN MESSAGE */}
                {isUploadAllowed ? (
                  <p className="text-[#14B8A6] text-[12px] font-bold mt-1">✨ You can change your profile picture once a year.</p>
                ) : (
                  <p className="text-[#DC2626] text-[12px] font-bold mt-1">
                    🔒 Profile picture unchangeable until {new Date(new Date(profile.last_avatar_update).setFullYear(new Date(profile.last_avatar_update).getFullYear() + 1)).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8 w-full">

              <div className="flex-[2] flex flex-col gap-8">

                <div className={`rounded-[12px] p-8 flex flex-col gap-6 transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B]' : 'bg-[#EFF4F6]'}`}>
                  <div className="flex items-center justify-between border-b border-[#AAB3B6]/20 pb-4">
                    <div className="flex items-center gap-3">
                      <User className="w-5 h-5 text-[#28667B]" />
                      <h3 className={`font-['Manrope'] font-bold text-[20px] tracking-[-0.5px] ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>Account Overview</h3>
                    </div>
                    {!isEditingAccount ? (
                      <button
                        onClick={() => {
                          setAccountForm({ ...accountForm, email: profile?.email || "" });
                          setIsEditingAccount(true);
                        }}
                        className="text-[#28667B] font-semibold text-[14px] hover:underline"
                      >
                        Edit
                      </button>
                    ) : (
                      <div className="flex gap-3">
                        <button onClick={() => setIsEditingAccount(false)} className="text-[#586163] font-semibold text-[14px] hover:underline">Cancel</button>
                        <button onClick={handleSaveAccount} disabled={isSavingAccount} className="bg-[#28667B] text-white px-4 py-1.5 rounded-lg text-[13px] font-bold hover:bg-[#1f5061] transition disabled:opacity-50">
                          {isSavingAccount ? "Saving..." : "Save Changes"}
                        </button>
                      </div>
                    )}
                  </div>

                  {!isEditingAccount ? (
                    <div className="flex flex-col gap-2">
                      <label className="text-[12px] font-bold text-[#586163] uppercase tracking-[1.2px]">Email Address</label>
                      <div className={`rounded-xl h-[56px] px-4 flex items-center justify-between ${theme === 'dark' ? 'bg-[#0F172A]' : 'bg-white'}`}>
                        <span className={`font-medium text-[16px] truncate max-w-[180px] ${theme === 'dark' ? 'text-gray-300' : 'text-[#2B3436]'}`}>{profile?.email || "Loading..."}</span>
                        <Mail className="w-4 h-4 text-[#28667B] shrink-0" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4 animate-in fade-in duration-300">
                      <div className="flex flex-col gap-2">
                        <label className="text-[12px] font-bold text-[#586163] uppercase tracking-[1.2px]">New Email Address</label>
                        <input
                          type="email"
                          value={accountForm.email}
                          onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })}
                          className={`rounded-xl h-[48px] px-4 outline-none border focus:border-[#28667B] text-[14px] font-medium ${theme === 'dark' ? 'bg-[#0F172A] border-[#334155] text-white' : 'bg-white border-[#E2E8F0] text-[#2B3436]'}`}
                        />
                      </div>
                    </div>
                  )}

                  {/* Password section stays permanently visible below the email section */}
                  <div className="flex flex-col gap-2 w-full pt-2 border-t border-[#AAB3B6]/20">
                    <label className="text-[12px] font-bold text-[#586163] uppercase tracking-[1.2px]">Password</label>
                    <div className={`rounded-xl h-[64px] px-5 flex items-center justify-between ${theme === 'dark' ? 'bg-[#0F172A]' : 'bg-white'}`}>
                      <span className={`font-medium text-[24px] tracking-widest leading-none mt-2 ${theme === 'dark' ? 'text-gray-300' : 'text-[#2B3436]'}`}>••••••••</span>
                      <button
                        onClick={() => router.push('/reset-password')}
                        className="bg-[#28667B] text-[#F2FAFF] font-bold text-[12px] px-4 py-2 rounded-lg hover:bg-[#1f5061] transition"
                      >
                        Update
                      </button>
                    </div>
                  </div>
                </div>

                <div className={`rounded-[12px] p-8 flex flex-col gap-6 transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B]' : 'bg-[#EFF4F6]'}`}>
                  <div className="flex items-center justify-between border-b border-[#AAB3B6]/20 pb-4">
                    <div className="flex items-center gap-3">
                      <Settings className="w-5 h-5 text-[#28667B]" />
                      <h3 className={`font-['Manrope'] font-bold text-[20px] tracking-[-0.5px] ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>Personal Details</h3>
                    </div>
                    {!isEditingPersonal ? (
                      <button
                        onClick={() => {
                          setPersonalForm({ username: profile?.username || "", address: profile?.address || "" });
                          setIsEditingPersonal(true);
                        }}
                        className="text-[#28667B] font-semibold text-[14px] hover:underline"
                      >
                        Edit
                      </button>
                    ) : (
                      <div className="flex gap-3">
                        <button onClick={() => setIsEditingPersonal(false)} className="text-[#586163] font-semibold text-[14px] hover:underline">Cancel</button>
                        <button onClick={handleSavePersonal} disabled={isSavingPersonal} className="bg-[#28667B] text-white px-4 py-1.5 rounded-lg text-[13px] font-bold hover:bg-[#1f5061] transition disabled:opacity-50">
                          {isSavingPersonal ? "Saving..." : "Save Changes"}
                        </button>
                      </div>
                    )}
                  </div>

                  {!isEditingPersonal ? (
                    <>
                      <div className="flex flex-col gap-2">
                        <label className="text-[12px] font-bold text-[#586163] uppercase tracking-[1.2px]">Full Name</label>
                        <div className={`rounded-xl h-[56px] px-4 flex items-center justify-between ${theme === 'dark' ? 'bg-[#0F172A]' : 'bg-white'}`}>
                          <span className={`font-medium text-[16px] truncate ${theme === 'dark' ? 'text-gray-300' : 'text-[#2B3436]'}`}>{profile?.username || "Loading..."}</span>
                          <User className="w-4 h-4 text-[#737C7F] shrink-0" />
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 w-full">
                        <label className="text-[12px] font-bold text-[#586163] uppercase tracking-[1.2px]">Address</label>
                        <div className={`rounded-xl h-[56px] px-4 flex items-center justify-between ${theme === 'dark' ? 'bg-[#0F172A]' : 'bg-white'}`}>
                          <span className={`font-medium text-[16px] truncate max-w-[300px] ${theme === 'dark' ? 'text-gray-300' : 'text-[#2B3436]'}`}>{profile?.address || "Not Specified"}</span>
                          <MapPin className="w-4 h-4 text-[#737C7F] shrink-0" />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col gap-4 animate-in fade-in duration-300">
                      <div className="flex flex-col gap-2">
                        <label className="text-[12px] font-bold text-[#586163] uppercase tracking-[1.2px]">Full Name</label>
                        <input
                          type="text"
                          value={personalForm.username}
                          onChange={(e) => setPersonalForm({ ...personalForm, username: e.target.value })}
                          className={`rounded-xl h-[48px] px-4 outline-none border focus:border-[#28667B] text-[14px] font-medium ${theme === 'dark' ? 'bg-[#0F172A] border-[#334155] text-white' : 'bg-white border-[#E2E8F0] text-[#2B3436]'}`}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[12px] font-bold text-[#586163] uppercase tracking-[1.2px]">Address</label>
                        <input
                          type="text"
                          value={personalForm.address}
                          onChange={(e) => setPersonalForm({ ...personalForm, address: e.target.value })}
                          className={`rounded-xl h-[48px] px-4 outline-none border focus:border-[#28667B] text-[14px] font-medium ${theme === 'dark' ? 'bg-[#0F172A] border-[#334155] text-white' : 'bg-white border-[#E2E8F0] text-[#2B3436]'}`}
                        />
                      </div>
                    </div>
                  )}

                  {/* UNCHANGEABLE DATE OF BIRTH - Severely dimmed to show it's locked */}
                  <div className="flex flex-col gap-2 w-full opacity-40 select-none">
                    <label className="text-[12px] font-bold text-[#586163] uppercase tracking-[1.2px]">Date of Birth <span className="text-[#A83836] ml-1 lowercase tracking-normal">(unchangeable)</span></label>
                    <div className={`rounded-xl h-[56px] px-4 flex items-center justify-between cursor-not-allowed ${theme === 'dark' ? 'bg-[#0F172A]/50' : 'bg-[#DBE4E6]/50'}`}>
                      <span className={`font-medium text-[16px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>{profile?.date_of_birth || "Not Specified"}</span>
                      <Lock className="w-4 h-4 text-[#737C7F] shrink-0" />
                    </div>
                  </div>
                </div>

                <div className={`rounded-[12px] p-8 flex flex-col gap-6 transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B]' : 'bg-[#EFF4F6]'}`}>
                  <div className="flex items-center gap-3 border-b border-[#AAB3B6]/20 pb-4">
                    <Sun className="w-5 h-5 text-[#28667B]" />
                    <h3 className={`font-['Manrope'] font-bold text-[20px] tracking-[-0.5px] ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>App Theme Preferences</h3>
                  </div>

                  <div className="flex gap-6">
                    <div
                      onClick={() => handleThemeChange('light')}
                      className={`flex-1 max-w-[150px] h-[216px] rounded-xl flex flex-col items-center justify-center gap-4 cursor-pointer relative transition-all ${theme === 'light' ? 'bg-white border-2 border-[#28667B] shadow-[0_0_0_4px_rgba(40,102,123,0.05)]' : 'bg-[#0F172A] border-2 border-transparent hover:border-gray-500'}`}
                    >
                      <div className="w-[96px] h-[96px] bg-[#F7FAFB] border border-[#AAB3B6]/30 rounded-lg flex flex-col p-2 gap-2">
                        <div className="w-full h-2 bg-[#E9EFF1] rounded-full" />
                        <div className="w-3/4 h-6 bg-[#28667B]/20 rounded-md" />
                        <div className="w-full h-2 bg-[#E9EFF1] rounded-full mt-auto" />
                      </div>
                      <span className={`font-bold text-[16px] ${theme === 'light' ? 'text-[#2B3436]' : 'text-gray-400'}`}>Light</span>
                      {theme === 'light' && <div className="absolute right-3 top-3 w-5 h-5 bg-[#28667B] rounded-full flex items-center justify-center text-white text-xs">✓</div>}
                    </div>

                    <div
                      onClick={() => handleThemeChange('dark')}
                      className={`flex-1 max-w-[150px] h-[216px] rounded-xl flex flex-col items-center justify-center gap-4 cursor-pointer relative transition-all ${theme === 'dark' ? 'bg-[#0F172A] border-2 border-[#28667B] shadow-[0_0_0_4px_rgba(40,102,123,0.05)]' : 'bg-white border-2 border-transparent hover:border-gray-300'}`}
                    >
                      <div className="w-[96px] h-[96px] bg-[#0F172A] border border-[#334155] rounded-lg flex flex-col p-2 gap-2">
                        <div className="w-full h-2 bg-[#1E293B] rounded-full" />
                        <div className="w-3/4 h-6 bg-[#28667B]/40 rounded-md" />
                        <div className="w-full h-2 bg-[#1E293B] rounded-full mt-auto" />
                      </div>
                      <span className={`font-bold text-[16px] ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>Dark</span>
                      {theme === 'dark' && <div className="absolute right-3 top-3 w-5 h-5 bg-[#28667B] rounded-full flex items-center justify-center text-white text-xs">✓</div>}
                    </div>
                  </div>
                </div>

              </div>

              <div className="flex-1 flex flex-col gap-8">

                <div className="bg-[#FA746F]/10 border border-[#A83836]/20 rounded-[12px] p-6 flex flex-col gap-6 relative overflow-hidden">
                  <div className="absolute -right-8 -bottom-8 w-64 h-64 bg-[#28667B]/10 blur-[32px] rounded-full pointer-events-none" />

                  <div className="flex items-center gap-3 relative z-10">
                    <AlertTriangle className="w-5 h-5 text-[#A83836]" />
                    <h3 className="text-[#A83836] font-['Manrope'] font-bold text-[18px]">Danger Zone</h3>
                  </div>

                  <div className="flex flex-col gap-4 relative z-10">
                    <p className="text-[#586163] text-[12px] leading-[20px]">
                      Deactivating your account will suspend your access and hide your profile. Your clinical emotional history and baseline data will be preserved but marked as inactive.
                    </p>
                    <button
                      onClick={handleDeactivateAccount}
                      className="w-full h-[48px] bg-[#DC2626] text-white font-bold text-[16px] rounded-xl shadow-[0_10px_15px_-3px_rgba(220,38,38,0.2)] hover:bg-[#b91c1c] transition"
                    >
                      Deactivate Account
                    </button>
                  </div>
                </div>

              </div>
            </div>

            <footer className="w-full py-8 mt-4 border-t border-[#E2E8F0]/20 flex justify-center">
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
      </main>
    </div>
  );
}
