"use client";
import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/utils/supabase/client";
import {
  Users,
  FileText,
  Search,
  LogOut,
  Moon,
  Sun,
  Headset,
  Send,
  CheckCircle,
  MoreVertical,
  User,
  Trash2,
  X as CloseIcon,
  Bell,
  Activity
} from "lucide-react";

export default function LiveSupportAdmin() {
  const router = useRouter();
  const supabase = createClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- THEME STATE & TOGGLE ---
  const [theme, setTheme] = useState('light');
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const savedTheme = localStorage.getItem('app-theme');
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('app-theme', newTheme);
  };

  // --- ADMIN AUTH STATE ---
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // --- REAL-TIME CHAT STATES ---
  const [searchQuery, setSearchQuery] = useState("");
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [allMessages, setAllMessages] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  // --- FEATURE STATES ---
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const activeUserIdRef = useRef<string | null>(null);

  // --- MODAL STATES ---
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  // Keep ref synced with state & clear unreads when clicking a user
  useEffect(() => {
    activeUserIdRef.current = activeUserId;
    if (activeUserId) {
      // Save the exact time we opened this chat
      localStorage.setItem(`admin_read_${activeUserId}`, Date.now().toString());
      setUnreadCounts(prev => ({ ...prev, [activeUserId]: 0 }));
    }
  }, [activeUserId]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeUserId, allMessages]);

  // ==========================================
  // FETCH ALL TICKETS & LISTEN IN REAL-TIME
  // ==========================================
  useEffect(() => {
    if (!profile) return;

    const fetchData = async () => {
      const { data: usersData } = await supabase.from('users').select('user_id, username, email, profile_picture, is_active, created_at, subscription_tier, role, address, subscription_start_date, subscription_end_date');
      if (usersData) setAllUsers(usersData);

      const { data: messagesData } = await supabase.from('support_messages').select('*').order('created_at', { ascending: true });

      if (messagesData && usersData) {
        setAllMessages(messagesData);

        // Calculate persistent unread counts on initial load
        const initialUnread: Record<string, number> = {};
        const now = Date.now().toString();
        usersData.forEach(u => {
          const lastReadTime = Number(localStorage.getItem(`admin_read_${u.user_id}`) || 0);
          const userMsgs = messagesData.filter(m => m.user_id === u.user_id && m.sender === 'user');
          const unreadMsgs = userMsgs.filter(m => new Date(m.created_at).getTime() > lastReadTime);
          if (unreadMsgs.length > 0) {
            initialUnread[u.user_id] = unreadMsgs.length;
          }
          // Always sync localStorage: set admin_read_ to latest message time for users with no unread
          // This ensures reports/users pages don't show stale red dots after visiting support
          if (unreadMsgs.length === 0 && userMsgs.length > 0) {
            const latestTime = Math.max(...userMsgs.map(m => new Date(m.created_at).getTime()));
            localStorage.setItem(`admin_read_${u.user_id}`, String(latestTime));
          }
        });
        setUnreadCounts(initialUnread);
      }
    };
    fetchData();

    // Subscribe to ALL incoming messages
    const channel = supabase.channel('admin-support')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, (payload) => {
        setAllMessages(prev => {
          if (prev.find(msg => msg.id === payload.new.id)) return prev;

          // Increment unread count if we receive a message from someone we AREN'T looking at
          if (payload.new.sender === 'user' && payload.new.user_id !== activeUserIdRef.current) {
            setUnreadCounts(counts => ({
              ...counts,
              [payload.new.user_id]: (counts[payload.new.user_id] || 0) + 1
            }));
          } else if (payload.new.sender === 'user' && payload.new.user_id === activeUserIdRef.current) {
            // Update read receipt if we are looking right at it
            localStorage.setItem(`admin_read_${payload.new.user_id}`, Date.now().toString());
          }

          return [...prev, payload.new];
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile, supabase]);

  // Handle Admin Sending Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !activeUserId) return;

    const msgText = messageInput;
    setMessageInput("");

    const tempMessage = {
      id: "temp-" + Date.now(),
      user_id: activeUserId,
      sender: 'admin',
      text: msgText,
      created_at: new Date().toISOString()
    };
    setAllMessages(prev => [...prev, tempMessage]);

    const { error, data } = await supabase.from('support_messages').insert({
      user_id: activeUserId,
      sender: 'admin',
      text: msgText
    }).select().single();

    if (error) {
      console.error("Error sending admin message:", error);
      alert("Failed to send message.");
      setAllMessages(prev => prev.filter(msg => msg.id !== tempMessage.id));
    } else if (data) {
      setAllMessages(prev => prev.map(msg => msg.id === tempMessage.id ? data : msg));
    }
  };

  // Resolve Ticket Feature
  const handleResolveTicket = async () => {
    if (!activeUserId) return;

    // Optimistic UI for Resolution
    const resolveMsg = {
      id: "temp-res-" + Date.now(),
      user_id: activeUserId,
      sender: 'admin',
      text: "✅ Ticket has been marked as resolved by Administrator.",
      created_at: new Date().toISOString()
    };

    setAllMessages(prev => [...prev, resolveMsg]);
    setIsMenuOpen(false);

    const { data } = await supabase.from('support_messages').insert({
      user_id: activeUserId,
      sender: 'admin',
      text: resolveMsg.text
    }).select().single();

    if (data) {
      setAllMessages(prev => prev.map(msg => msg.id === resolveMsg.id ? data : msg));
    }
  };

  // Clear Chat Feature
  const handleClearChat = async () => {
    if (!activeUserId) return;
    const confirm = window.confirm("Are you sure you want to delete this conversation history?");
    if (!confirm) return;

    await supabase.from('support_messages').delete().eq('user_id', activeUserId);
    setAllMessages(prev => prev.filter(m => m.user_id !== activeUserId));
    setIsMenuOpen(false);
    setActiveUserId(null);
  };

  // Open User Profile Modal
  const handleViewUser = (user: any) => {
    setSelectedUser(user);
    setIsViewModalOpen(true);
    setIsMenuOpen(false);
  };

  // ADMIN SECURITY CHECK
  useEffect(() => {
    async function checkAdminAccess() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/login");
          return;
        }

        const { data: userProfile } = await supabase
          .from("users")
          .select("username, role, profile_picture")
          .eq("user_id", user.id)
          .single();

        if (!userProfile || userProfile.role !== 'ADMIN') {
          alert("Access Denied: Administrator privileges required.");
          router.push("/dashboard/live");
          return;
        }

        setProfile(userProfile);
      } catch (error) {
        console.error("Admin check failed:", error);
        router.push("/login");
      } finally {
        setIsLoading(false);
      }
    }
    checkAdminAccess();
  }, [router, supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const getInitials = (name: string) => {
    if (!name) return "A";
    return name.substring(0, 2).toUpperCase();
  };

  // Dynamically build the "Active Tickets" sidebar list
  const activeTickets = allUsers.map(user => {
    const userMsgs = allMessages.filter(m => m.user_id === user.user_id);
    const lastMsg = userMsgs.length > 0 ? userMsgs[userMsgs.length - 1] : null;
    return {
      ...user,
      hasMessages: userMsgs.length > 0,
      lastMessage: lastMsg ? lastMsg.text : "",
      lastMessageTime: lastMsg ? new Date(lastMsg.created_at).getTime() : 0,
      timeDisplay: lastMsg ? new Date(lastMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""
    };
  })
    .filter(u => u.hasMessages)
    .filter(u =>
      (u.username || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => b.lastMessageTime - a.lastMessageTime);

  const activeChatData = allUsers.find(u => u.user_id === activeUserId);
  const activeMessages = allMessages.filter(m => m.user_id === activeUserId);

  // NEW: Calculate total unread across all tickets
  const totalUnreadNotifications = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);

  // NEW: Check if the very last message in the chat is the resolution message
  const isTicketResolved = activeMessages.length > 0 &&
    activeMessages[activeMessages.length - 1].text === "✅ Ticket has been marked as resolved by Administrator.";

  if (!isClient) return null;

  if (isLoading) {
    return (
      <div className={`flex h-screen w-full items-center justify-center font-bold transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0F172A] text-[#38BDF8]' : 'bg-[#F7FAFB] text-[#28667B]'}`}>
        Verifying Administrator Access...
        <div className="ml-3 w-5 h-5 border-2 border-t-transparent rounded-full animate-spin border-current" />
      </div>
    );
  }

  return (
    <div className={`flex h-screen w-full font-sans overflow-hidden transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0F172A] text-[#94A3B8]' : 'bg-[#F7FAFB] text-[#586163]'}`}>

      {/* ================================================================= */}
      {/* SIDEBAR NAVIGATION (ADMIN)                                        */}
      {/* ================================================================= */}
      <aside className={`w-[256px] lg:w-[288px] border-r flex flex-col justify-between py-6 shrink-0 h-full z-20 transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-[#EFF4F6] border-[#AAB3B6]/15'}`}>
        <div className="flex flex-col gap-8 px-6">
          <h1 className="text-[#28667B] font-['Manrope'] font-extrabold text-[20px] leading-[25px]">
            Web-Based Multi-modal Emotion Recognition and Analytics System
          </h1>

          <nav className="flex flex-col gap-2">
            <Link href="/admin/users" className={`flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/10 transition`}>
              <Users className={`w-5 h-5 ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`} />
              <span className={`font-normal text-[14px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>User Management</span>
            </Link>

            <Link href="/admin/reports" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/10 transition">
              <FileText className={`w-[18px] h-[18px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`} />
              <span className={`font-normal text-[14px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Emotion Reports</span>
            </Link>

            {/* NEW INACTIVE: Performance Dashboard */}
            <Link href="/admin/performance" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/10 transition">
              <Activity className={`w-[18px] h-[18px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`} />
              <span className={`font-normal text-[14px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Performance</span>
            </Link>

            <Link href="/admin/support" className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] ${theme === 'dark' ? 'bg-[#0F172A] border border-[#334155]' : 'bg-white'}`}>
              <Headset className={`w-[18px] h-[18px] ${theme === 'dark' ? 'text-white' : 'text-[#28667B]'}`} />
              <span className={`font-bold text-[14px] ${theme === 'dark' ? 'text-white' : 'text-[#28667B]'}`}>Live Support</span>
            </Link>
          </nav>
        </div>

        <div className={`flex flex-col gap-1 px-6 pt-4 border-t mt-8 ${theme === 'dark' ? 'border-[#334155]' : 'border-[#AAB3B6]/15'}`}>
          <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-2 rounded-xl hover:bg-red-500/10 hover:text-red-500 transition w-full text-left mt-2">
            <LogOut className={`w-[14px] h-[14px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`} />
            <span className={`font-medium text-[12px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Log Out</span>
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

            {/* NEW: Notification Bell Widget */}
            <button className={`relative p-2 rounded-full transition ${theme === 'dark' ? 'hover:bg-[#334155] text-gray-400' : 'hover:bg-gray-100 text-[#586163]'}`}>
              <Bell className="w-5 h-5" />
              {totalUnreadNotifications > 0 && (
                <div className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-[#1E293B]"></div>
              )}
            </button>

            <div className={`flex items-center gap-3 pl-4 border-l transition-colors ${theme === 'dark' ? 'border-[#334155]' : 'border-[#E9EFF1]'}`}>
              <div className="flex flex-col items-end">
                <span className={`text-[14px] font-bold ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>{profile?.username || "Admin"}</span>
                <span className={`text-[11px] font-bold tracking-[1px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>ADMIN</span>
              </div>
              <div className="w-10 h-10 rounded-full bg-[#DBE4E6] border-2 border-[#ABE5FE] flex items-center justify-center text-[#28667B] font-bold overflow-hidden shadow-sm">
                {profile?.profile_picture ? (
                  <img src={profile.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  getInitials(profile?.username)
                )}
              </div>
            </div>

            <button
              onClick={toggleTheme}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition shadow-sm border ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155] text-yellow-400 hover:bg-[#334155]' : 'bg-white border-[#E2E9EB] text-[#28667B] hover:bg-[#F7FAFB]'
                }`}
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {/* ================================================================= */}
        {/* SPLIT SCREEN SUPPORT LAYOUT                                       */}
        {/* ================================================================= */}
        <div className="flex-1 flex overflow-hidden">

          {/* LEFT PANEL: Chat List */}
          <div className={`w-[320px] lg:w-[380px] flex flex-col shrink-0 border-r transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#E9EFF1]'}`}>

            {/* Search Header */}
            <div className={`p-6 border-b shrink-0 transition-colors duration-500 ${theme === 'dark' ? 'border-[#334155]' : 'border-[#E9EFF1]'}`}>
              <h2 className={`text-[24px] font-['Manrope'] font-bold tracking-[-0.5px] mb-4 ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>
                Active Tickets
              </h2>
              <div className={`flex items-center gap-2 rounded-lg px-4 py-2 w-full focus-within:ring-2 focus-within:ring-[#28667B] transition ${theme === 'dark' ? 'bg-[#0F172A] border border-[#334155]' : 'bg-[#E2E9EB]'}`}>
                <Search className="w-4 h-4 text-[#586163]" />
                <input
                  type="text"
                  placeholder="Search user or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`bg-transparent text-[14px] font-medium outline-none w-full placeholder:text-[#586163]/70 ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}
                />
              </div>
            </div>

            {/* User Chat List */}
            <div className="flex-1 overflow-y-auto">
              {activeTickets.length === 0 && (
                <div className={`p-8 text-center text-[13px] ${theme === 'dark' ? 'text-gray-500' : 'text-[#AAB3B6]'}`}>
                  No active support tickets found.
                </div>
              )}
              {activeTickets.map((ticket) => {
                const isActive = activeUserId === ticket.user_id;
                const unreadCount = unreadCounts[ticket.user_id] || 0;

                return (
                  <div
                    key={ticket.user_id}
                    onClick={() => setActiveUserId(ticket.user_id)}
                    className={`p-4 border-b border-l-4 cursor-pointer transition-colors duration-200 ${isActive
                      ? (theme === 'dark' ? 'bg-[#0F172A] border-l-[#38BDF8] border-b-[#334155]' : 'bg-[#F7FAFB] border-l-[#28667B] border-b-[#E9EFF1]')
                      : (theme === 'dark' ? 'border-l-transparent border-b-[#334155] hover:bg-[#0F172A]/50' : 'border-l-transparent border-b-[#E9EFF1] hover:bg-gray-50')
                      }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full bg-[#E2E9EB] overflow-hidden flex items-center justify-center font-bold text-[#28667B]">
                            {ticket.profile_picture ? (
                              <img src={ticket.profile_picture} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                              getInitials(ticket.username)
                            )}
                          </div>
                          {/* Online Status Dot */}
                          <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 ${theme === 'dark' ? 'border-[#1E293B]' : 'border-white'} ${ticket.is_active !== false ? 'bg-green-500' : 'bg-gray-400'}`} />
                        </div>
                        <div className="flex flex-col">
                          <span className={`font-bold text-[14px] ${theme === 'dark' ? 'text-gray-200' : 'text-[#2B3436]'}`}>{ticket.username}</span>
                          <span className={`text-[12px] truncate max-w-[140px] ${isActive ? (theme === 'dark' ? 'text-gray-400' : 'text-[#28667B]') : 'text-[#586163]'}`}>
                            {ticket.lastMessage}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end justify-between h-full">
                        <span className="text-[10px] font-bold text-[#AAB3B6]">{ticket.timeDisplay}</span>
                        {/* UNREAD BADGE DISPLAY */}
                        {unreadCount > 0 && (
                          <div className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center mt-1 shadow-sm">
                            {unreadCount}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT PANEL: Chat Window */}
          <div className="flex-1 flex flex-col relative h-full">
            {activeChatData ? (
              <>
                {/* Chat Header */}
                <div className={`px-8 py-6 border-b shrink-0 flex justify-between items-center transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#E9EFF1]'}`}>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-[#E2E9EB] overflow-hidden flex items-center justify-center font-bold text-[#28667B] text-[18px]">
                      {activeChatData.profile_picture ? (
                        <img src={activeChatData.profile_picture} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        getInitials(activeChatData.username)
                      )}
                    </div>
                    <div className="flex flex-col">
                      <h3 className={`font-['Manrope'] font-bold text-[18px] ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>{activeChatData.username}</h3>
                      <p className="text-[12px] text-[#586163] flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${activeChatData.is_active !== false ? 'bg-green-500' : 'bg-gray-400'}`} />
                        {activeChatData.is_active !== false ? 'Active Account' : 'Deactivated'} • {activeChatData.email}
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons & Dropdown */}
                  <div className="flex items-center gap-3 relative">
                    <button
                      onClick={handleResolveTicket}
                      disabled={isTicketResolved}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-[12px] transition ${isTicketResolved
                        ? (theme === 'dark' ? 'bg-[#0F172A]/50 text-gray-600 cursor-not-allowed' : 'bg-gray-100 text-gray-400 cursor-not-allowed')
                        : (theme === 'dark' ? 'bg-[#0F172A] text-green-400 hover:bg-[#334155]' : 'bg-[#E9EFF1] text-[#006A6C] hover:bg-[#d5e0e3]')
                        }`}
                    >
                      <CheckCircle className="w-4 h-4" />
                      {isTicketResolved ? 'Ticket Resolved' : 'Resolve Ticket'}
                    </button>

                    <button
                      onClick={() => setIsMenuOpen(!isMenuOpen)}
                      className={`p-2 rounded-lg transition ${theme === 'dark' ? 'hover:bg-[#334155] text-gray-400' : 'hover:bg-gray-100 text-[#586163]'}`}
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>

                    {isMenuOpen && (
                      <div className={`absolute right-0 top-[110%] w-[180px] rounded-lg shadow-xl border overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-gray-200'}`}>
                        <button
                          onClick={() => handleViewUser(activeChatData)}
                          className={`w-full text-left px-4 py-3 text-[13px] font-bold flex items-center gap-2 transition ${theme === 'dark' ? 'text-white hover:bg-[#334155]' : 'text-[#2B3436] hover:bg-gray-50'}`}
                        >
                          <User className="w-4 h-4" /> View Profile
                        </button>
                        <div className={`w-full h-px ${theme === 'dark' ? 'bg-[#334155]' : 'bg-gray-100'}`} />
                        <button
                          onClick={handleClearChat}
                          className={`w-full text-left px-4 py-3 text-[13px] font-bold flex items-center gap-2 transition hover:bg-red-500/10 text-red-500`}
                        >
                          <Trash2 className="w-4 h-4" /> Clear Chat
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6" onClick={() => setIsMenuOpen(false)}>
                  {activeMessages.map((msg: any) => {
                    const isAdmin = msg.sender === "admin";
                    const isSystem = msg.text.includes("✅");
                    const timeString = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    if (isSystem) {
                      return (
                        <div key={msg.id} className="w-full flex justify-center my-4">
                          <span className={`px-4 py-1.5 rounded-full text-[11px] font-bold tracking-[0.5px] uppercase ${theme === 'dark' ? 'bg-[#0F172A] text-green-400 border border-[#334155]' : 'bg-green-50 text-green-700 border border-green-100'}`}>
                            {msg.text}
                          </span>
                        </div>
                      )
                    }

                    return (
                      <div key={msg.id} className={`flex w-full ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                        <div className="flex flex-col max-w-[70%]">
                          <div className={`px-5 py-3 rounded-2xl text-[14px] leading-relaxed shadow-sm ${isAdmin
                            ? 'bg-[#28667B] text-white rounded-br-sm'
                            : (theme === 'dark' ? 'bg-[#1E293B] text-gray-200 rounded-bl-sm border border-[#334155]' : 'bg-white text-[#2B3436] rounded-bl-sm border border-[#E9EFF1]')
                            }`}>
                            {msg.text}
                          </div>
                          <span className={`text-[10px] font-bold mt-1.5 flex items-center gap-1 ${isAdmin ? 'self-end text-[#28667B]' : 'self-start text-[#AAB3B6]'}`}>
                            {isAdmin && <CheckCircle className="w-3 h-3" />} {timeString}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Input Box */}
                <div className={`p-6 border-t shrink-0 transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#E9EFF1]'}`}>
                  <form onSubmit={handleSendMessage} className={`flex items-center gap-3 p-2 rounded-xl transition focus-within:ring-2 focus-within:ring-[#28667B] ${theme === 'dark' ? 'bg-[#0F172A] border border-[#334155]' : 'bg-[#F7FAFB] border border-[#E2E9EB]'}`}>
                    <input
                      type="text"
                      placeholder="Type a message to the user..."
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      className={`flex-1 bg-transparent border-none outline-none text-[14px] font-medium placeholder:text-[#AAB3B6] ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}
                    />
                    <button
                      type="submit"
                      disabled={!messageInput.trim()}
                      className="w-10 h-10 rounded-lg bg-[#28667B] flex items-center justify-center text-white hover:bg-[#1f5061] transition disabled:opacity-50 shadow-sm"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center opacity-60">
                <Headset className={`w-16 h-16 mb-4 ${theme === 'dark' ? 'text-gray-500' : 'text-[#AAB3B6]'}`} />
                <p className={`text-[16px] font-bold ${theme === 'dark' ? 'text-gray-300' : 'text-[#586163]'}`}>Select a conversation</p>
                <p className={`text-[14px] max-w-[300px] text-center mt-2 ${theme === 'dark' ? 'text-gray-400' : 'text-[#737C7F]'}`}>Choose a ticket from the left panel to view message history and respond.</p>
              </div>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* SECURE ADMIN VIEW USER MODAL                                 */}
        {/* ============================================================ */}
        {isViewModalOpen && selectedUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={`relative w-full max-w-[500px] rounded-[24px] shadow-2xl overflow-hidden flex flex-col transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0F172A] border border-[#334155]' : 'bg-white'}`}>

              <div className={`px-8 py-6 border-b flex justify-between items-center transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-[#F7FAFB] border-[#E9EFF1]'}`}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#E2E9EB] rounded-full flex items-center justify-center overflow-hidden border-2 border-white shadow-sm">
                    {selectedUser.profile_picture ? (
                      <img src={selectedUser.profile_picture} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span className="font-bold text-[#28667B] text-[16px]">{getInitials(selectedUser.username)}</span>
                    )}
                  </div>
                  <div>
                    <h3 className={`font-['Manrope'] font-bold text-[20px] ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>{selectedUser.username}</h3>
                    <p className={`text-[12px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>{selectedUser.email}</p>
                  </div>
                </div>
                <button onClick={() => setIsViewModalOpen(false)} className={`p-2 rounded-full transition ${theme === 'dark' ? 'bg-[#334155] hover:bg-[#475569]' : 'bg-gray-100 hover:bg-gray-200'}`}>
                  <CloseIcon className={`w-5 h-5 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}`} />
                </button>
              </div>

              <div className={`p-8 flex flex-col gap-6 ${theme === 'dark' ? 'bg-[#0F172A]' : 'bg-white'}`}>
                <div className="grid grid-cols-2 gap-4">
                  <div className={`flex flex-col p-4 rounded-xl border transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-[#F7FAFB] border-[#E9EFF1]'}`}>
                    <span className="text-[10px] font-bold text-[#737C7F] uppercase tracking-[1px] mb-1">Status</span>
                    <span className={`text-[14px] font-bold ${selectedUser.is_active !== false ? 'text-green-500' : 'text-[#A83836]'}`}>
                      {selectedUser.is_active !== false ? 'Active Account' : 'Deactivated'}
                    </span>
                  </div>
                  {/* Access Tier Box - Updated to show dates clearly */}
                  <div className={`flex flex-col p-4 rounded-xl border transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-[#F7FAFB] border-[#E9EFF1]'}`}>
                    <span className="text-[10px] font-bold text-[#737C7F] uppercase tracking-[1px] mb-1">Access Tier</span>
                    <span className={`text-[14px] font-bold ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>
                      {selectedUser.subscription_tier || 'FREE'}
                    </span>

                    {/* Only show dates if the tier is not FREE */}
                    {selectedUser.subscription_tier !== 'FREE' && (selectedUser.subscription_start_date || selectedUser.subscription_end_date) && (
                      <div className="mt-2 text-[10px] text-[#586163]">
                        {selectedUser.subscription_start_date ? (
                          <div>From: {new Date(selectedUser.subscription_start_date).toLocaleDateString('en-GB')}</div>
                        ) : null}
                        {selectedUser.subscription_end_date ? (
                          <div>To: {new Date(selectedUser.subscription_end_date).toLocaleDateString('en-GB')}</div>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div className={`flex flex-col p-4 rounded-xl border transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-[#F7FAFB] border-[#E9EFF1]'}`}>
                    <span className="text-[10px] font-bold text-[#737C7F] uppercase tracking-[1px] mb-1">System Role</span>
                    <span className={`text-[14px] font-bold ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>{selectedUser.role}</span>
                  </div>
                  <div className={`flex flex-col p-4 rounded-xl border transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-[#F7FAFB] border-[#E9EFF1]'}`}>
                    <span className="text-[10px] font-bold text-[#737C7F] uppercase tracking-[1px] mb-1">Member Since</span>
                    <span className={`text-[14px] font-bold ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>{new Date(selectedUser.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1 w-full mt-2">
                  <label className="text-[10px] font-bold text-[#586163] uppercase tracking-[1px]">Physical Address</label>
                  <div className={`w-full border rounded-xl px-4 py-3 text-[14px] font-medium transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155] text-white' : 'bg-[#F7FAFB] border-[#E9EFF1] text-[#2B3436]'}`}>
                    {selectedUser.address || 'No address provided by user.'}
                  </div>
                </div>

                <button onClick={() => setIsViewModalOpen(false)} className="w-full mt-4 py-3 rounded-xl bg-[#28667B] text-white font-bold text-[14px] hover:bg-[#1f5061] transition">
                  Close Profile
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}