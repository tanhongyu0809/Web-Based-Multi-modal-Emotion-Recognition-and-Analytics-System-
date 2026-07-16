"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  User,
  FileText,
  Search,
  Bell,
  Filter,
  MoreVertical,
  Trash2,
  Shield,
  ShieldCheck,
  Edit,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  Eye,
  LogOut,
  HelpCircle,
  Settings,
  Download,
  ChevronDown,
  Moon,
  Sun,
  Headset,
  Activity // <--- Added Activity icon
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/utils/supabase/client";

export default function UserManagementAdmin() {
  const router = useRouter();
  const supabase = createClient();

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

  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // --- GLOBAL UNREAD NOTIFICATIONS ---
  const [totalUnread, setTotalUnread] = useState(0);

  useEffect(() => {
    if (!profile) return;

    const calculateUnread = async () => {
      const { data: messages } = await supabase
        .from('support_messages')
        .select('user_id, created_at')
        .eq('sender', 'user');

      if (messages) {
        // Group messages by user_id and find the latest message time for each
        const userLatestMsg: Record<string, number> = {};
        messages.forEach(msg => {
          const msgTime = new Date(msg.created_at).getTime();
          if (!userLatestMsg[msg.user_id] || msgTime > userLatestMsg[msg.user_id]) {
            userLatestMsg[msg.user_id] = msgTime;
          }
        });

        // One-time initialization: mark all existing messages as read on first admin visit
        const isInitialized = localStorage.getItem('admin_unread_initialized');
        if (!isInitialized) {
          Object.entries(userLatestMsg).forEach(([userId, latestMsgTime]) => {
            if (!localStorage.getItem(`admin_read_${userId}`)) {
              localStorage.setItem(`admin_read_${userId}`, String(latestMsgTime));
            }
          });
          localStorage.setItem('admin_unread_initialized', 'true');
        }

        const unreadSet = new Set();
        Object.entries(userLatestMsg).forEach(([userId, latestMsgTime]) => {
          const lastRead = Number(localStorage.getItem(`admin_read_${userId}`) || 0);
          if (latestMsgTime > lastRead) {
            unreadSet.add(userId);
          }
        });
        setTotalUnread(unreadSet.size);
      }
    };

    calculateUnread();

    // Listen for new incoming tickets while on the user management page
    const channel = supabase.channel('admin-global-bell-users')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: "sender=eq.user" }, () => {
        calculateUnread();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile, supabase]);

  // States to hold live table data and statistics
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, activeToday: 0, newReg: 0, regGrowth: 0 });

  // NEW: Search and Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL"); // Can be 'ALL', 'ACTIVE', or 'INACTIVE'
  const [isStatusFilterOpen, setIsStatusFilterOpen] = useState(false);
  const [tierFilter, setTierFilter] = useState("ALL"); // Can be 'ALL', 'FREE', 'PLUS', or 'ENTERPRISE'
  const [isTierFilterOpen, setIsTierFilterOpen] = useState(false); // Controls the custom tier dropdown menu

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  // NEW: Admin "Add User" Modal States
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    username: "",
    email: "",
    password: "",
    subscription_tier: "FREE",
    subscription_start_date: "", // NEW
    subscription_end_date: "" // NEW
  });

  // NEW: View, Edit, & Delete Modal States
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    username: "",
    subscription_tier: "FREE",
    is_active: true,
    address: "",
    subscription_start_date: "", // NEW
    subscription_end_date: "" // NEW
  });

  // ==========================================
  // 1. ADMIN SECURITY CHECK & FETCH ALL USERS
  // ==========================================
  useEffect(() => {
    async function fetchAdminData() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/login");
          return;
        }

        // Check if the current user is an admin
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

        // FETCH LIVE USER DATA FOR THE TABLE
        const { data: usersList, error: usersError } = await supabase
          .from("users")
          .select("*, subscription_start_date, subscription_end_date") // <-- ADDED
          .eq("role", "USER")
          .order("created_at", { ascending: false });

        if (usersList) {
          setAllUsers(usersList);

          // Calculate Live Stats
          const today = new Date().toDateString();
          const currentMonth = new Date().getMonth();
          const currentYear = new Date().getFullYear();

          const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
          const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

          // Count this month's registrations
          const currentMonthReg = usersList.filter(u => {
            const d = new Date(u.created_at);
            return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
          }).length;

          // Count last month's registrations to calculate growth
          const lastMonthReg = usersList.filter(u => {
            const d = new Date(u.created_at);
            return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
          }).length;

          const regGrowth = lastMonthReg === 0
            ? (currentMonthReg > 0 ? 100 : 0)
            : Math.round(((currentMonthReg - lastMonthReg) / lastMonthReg) * 100);

          setStats({
            total: usersList.length,
            activeToday: usersList.filter(u => new Date(u.updated_at || u.created_at).toDateString() === today).length,
            newReg: currentMonthReg,
            regGrowth: regGrowth
          });
        }
      } catch (error) {
        console.error("Admin data fetch failed:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchAdminData();
  }, [router, supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const getInitials = (name: string) => {
    if (!name) return "A";
    return name.substring(0, 2).toUpperCase();
  };

  // ==========================================
  // REAL-TIME SEARCH & FILTER LOGIC
  // ==========================================
  const filteredUsers = allUsers.filter((u) => {
    // 1. Check Search (Matches username OR email)
    const searchString = searchQuery.toLowerCase();
    const matchesSearch =
      (u.username || "").toLowerCase().includes(searchString) ||
      (u.email || "").toLowerCase().includes(searchString);

    // 2. Check Status Filter
    const isActive = u.is_active !== false;
    let matchesStatus = true;
    if (statusFilter === "ACTIVE") matchesStatus = isActive === true;
    if (statusFilter === "INACTIVE") matchesStatus = isActive === false;

    // 3. Check Tier Filter
    const userTier = u.subscription_tier || "FREE";
    let matchesTier = true;
    if (tierFilter !== "ALL") matchesTier = userTier === tierFilter;

    return matchesSearch && matchesStatus && matchesTier;
  });

  // ==========================================
  // PAGINATION LOGIC
  // ==========================================
  // Reset to page 1 whenever the user types a search or changes a filter
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, tierFilter]); // <-- Added tierFilter here

  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

  // ==========================================
  // BUTTON ACTIONS
  // ==========================================
  const handleExportPDF = () => {
    if (filteredUsers.length === 0) return alert("No data to export.");

    const currentDate = new Date().toLocaleString();
    const adminName = profile?.username || "Admin";

    const tableRows = filteredUsers.map(u => {
      const status = u.is_active !== false ? 'Active' : 'Inactive';
      const statusColor = status === 'Active' ? '#006A6C' : '#A83836';
      const lastActive = new Date(u.updated_at || u.created_at).toLocaleString();
      const tier = u.subscription_tier || 'FREE';

      return `
        <tr>
          <td>
            <strong>${u.username}</strong><br/>
            <span style="color: #586163; font-size: 12px;">${u.email}</span>
          </td>
          <td>${lastActive}</td>
          <td style="color: ${statusColor}; font-weight: bold;">${status}</td>
          <td>${tier}</td>
          <td>${u.role}</td>
        </tr>
      `;
    }).join('');

    const reportHTML = `
      <html>
        <head>
          <title>User Management Report</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #2B3436; padding: 40px; line-height: 1.6; }
            .header { text-align: center; border-bottom: 3px solid #28667B; padding-bottom: 20px; margin-bottom: 30px; }
            .header h1 { margin: 0; font-size: 22px; color: #28667B; text-transform: uppercase; letter-spacing: 1px;}
            .header h2 { margin: 5px 0 0 0; font-size: 16px; color: #586163; font-weight: normal; }
            .meta-box { background-color: #F7FAFB; border: 1px solid #E2E9EB; padding: 15px; border-radius: 8px; margin-bottom: 30px; }
            .meta-box p { margin: 5px 0; font-size: 14px; }
            .meta-box strong { color: #28667B; display: inline-block; width: 140px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 40px; }
            th, td { border: 1px solid #DBE4E6; padding: 12px 15px; text-align: left; font-size: 14px; }
            th { background-color: #28667B; color: white; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px; }
            tr:nth-child(even) { background-color: #F7FAFB; }
            .footer { position: fixed; bottom: 30px; left: 40px; right: 40px; text-align: center; font-size: 10px; color: #737C7F; border-top: 1px solid #E2E9EB; padding-top: 15px; text-transform: uppercase; letter-spacing: 1px; }
            @media print { body { -webkit-print-color-adjust: exact; } .footer { position: fixed; bottom: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Web-Based Multi-Modal Emotion Recognition System</h1>
            <h2>User Management Report</h2>
          </div>
          <div class="meta-box">
            <p><strong>Generated By:</strong> ${adminName}</p>
            <p><strong>Date Generated:</strong> ${currentDate}</p>
            <p><strong>Total Records:</strong> ${filteredUsers.length}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>User Profile</th>
                <th>Last Active</th>
                <th>Status</th>
                <th>Tier</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <div class="footer">
            &copy; 2026 Web-Based Multi-Modal Emotion Recognition and Analytics System. <br/>
            Strictly Confidential. Generated automatically via secure admin dashboard.
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(reportHTML);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 250);
    }
  };

  const handleAddUser = () => {
    setIsAddUserModalOpen(true);
  };

  const submitNewUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingUser(true);

    try {
      // 1. Save the current Admin session before doing anything
      const { data: currentSession } = await supabase.auth.getSession();

      // 2. Create the user in Supabase Auth (This temporarily swaps the session)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newUserForm.email,
        password: newUserForm.password,
      });

      if (authError) throw authError;

      if (authData.user) {
        // Prepare user data
        const userData: any = {
          user_id: authData.user.id,
          username: newUserForm.username,
          email: newUserForm.email,
          role: 'USER',
          subscription_tier: newUserForm.subscription_tier,
          is_active: true
        };

        // Add dates if not FREE
        if (newUserForm.subscription_tier !== 'FREE') {
          if (newUserForm.subscription_start_date) {
            userData.subscription_start_date = new Date(newUserForm.subscription_start_date).toISOString();
          }
          if (newUserForm.subscription_end_date) {
            userData.subscription_end_date = new Date(newUserForm.subscription_end_date).toISOString();
          }
        }

        const { error: dbError } = await supabase.from('users').upsert(userData);
        if (dbError) throw dbError;
      }

      // 4. INSTANTLY RESTORE THE ADMIN SESSION
      if (currentSession.session) {
        await supabase.auth.setSession({
          access_token: currentSession.session.access_token,
          refresh_token: currentSession.session.refresh_token
        });
      }

      alert(`Success! ${newUserForm.username} has been granted ${newUserForm.subscription_tier} access.`);

      // Close modal and reset form
      setIsAddUserModalOpen(false);
      setNewUserForm({
        username: "",
        email: "",
        password: "",
        subscription_tier: "FREE",
        subscription_start_date: "",
        subscription_end_date: ""
      });

      // Refresh the page to show the new user in the table while keeping Admin logged in
      window.location.reload();

    } catch (error: any) {
      alert(error.message || "Failed to create user.");
    } finally {
      setIsCreatingUser(false);
    }
  };

  // ==========================================
  // TABLE ACTIONS: VIEW, EDIT, DELETE
  // ==========================================
  const handleViewUser = (user: any) => {
    console.log("Viewing user:", user); // Check the browser console!
    setSelectedUser(user);
    setIsViewModalOpen(true);
  };

  const handleEditUser = (user: any) => {
    setSelectedUser(user);
    setEditForm({
      username: user.username || "",
      subscription_tier: user.subscription_tier || "FREE",
      is_active: user.is_active !== false,
      address: user.address || "",
      subscription_start_date: user.subscription_start_date || "", // NEW
      subscription_end_date: user.subscription_end_date || "" // NEW
    });
    setIsEditModalOpen(true);
  };

  const submitEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setIsSavingEdit(true);

    try {
      // Prepare update data
      const updateData: any = {
        username: editForm.username,
        subscription_tier: editForm.subscription_tier,
        is_active: editForm.is_active,
        address: editForm.address,
        updated_at: new Date().toISOString()
      };

      // Only include dates if not FREE
      if (editForm.subscription_tier !== 'FREE') {
        if (editForm.subscription_start_date) {
          updateData.subscription_start_date = new Date(editForm.subscription_start_date).toISOString();
        }
        if (editForm.subscription_end_date) {
          updateData.subscription_end_date = new Date(editForm.subscription_end_date).toISOString();
        }
      } else {
        // If FREE, clear the dates
        updateData.subscription_start_date = null;
        updateData.subscription_end_date = null;
      }

      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('user_id', selectedUser.user_id);

      // FORCE ERROR CATCHING: If Supabase blocks it, we throw the error!
      if (error) {
        console.error("Supabase Blocked the Update:", error);
        throw error;
      }

      alert(`Success! Profile for ${editForm.username} has been updated.`);
      setIsEditModalOpen(false);
      window.location.reload(); // Refresh to reflect changes

    } catch (error: any) {
      console.error("Full Error Output:", error);
      alert(`DATABASE ERROR: ${error.message}\n\nIf this says "violates row-level security", you need to go to your Supabase Dashboard -> Table Editor -> users -> and turn off RLS (or add an Admin Policy) so you can edit other accounts!`);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteUser = async (user: any) => {
    if (!confirm(`⚠️ Are you sure you want to permanently delete ${user.username}'s profile and authentication account?\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      // TRIGGER THE SECURE BACKEND FUNCTION
      // This wipes their email, password, and profile out of existence
      const { error } = await supabase.rpc('admin_delete_user', {
        target_user_id: user.user_id
      });

      if (error) {
        console.error("Delete Error:", error);
        throw error;
      }

      alert('User fully eradicated from Authentication and Database records.');
      window.location.reload();

    } catch (error: any) {
      alert(error.message || "Failed to delete user. Check database logs.");
    }
  };

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
            {/* ACTIVE: User Management */}
            <Link
              href="/admin/users"
              className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] ${theme === 'dark' ? 'bg-[#0F172A] border border-[#334155]' : 'bg-white'
                }`}
            >
              <Users className={`w-5 h-5 ${theme === 'dark' ? 'text-white' : 'text-[#28667B]'}`} />
              <span className={`font-bold text-[14px] ${theme === 'dark' ? 'text-white' : 'text-[#28667B]'}`}>User Management</span>
            </Link>

            {/* INACTIVE: Emotion Reports */}
            <Link
              href="/admin/reports"
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/10 transition"
            >
              <FileText className={`w-[18px] h-[18px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`} />
              <span className={`font-normal text-[14px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Emotion Reports</span>
            </Link>

            {/* NEW INACTIVE: Performance Dashboard */}
            <Link
              href="/admin/performance"
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/10 transition"
            >
              <Activity className={`w-[18px] h-[18px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`} />
              <span className={`font-normal text-[14px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Performance</span>
            </Link>

            {/* INACTIVE: Live Support */}
            <Link
              href="/admin/support"
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/10 transition"
            >
              <Headset className={`w-[18px] h-[18px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`} />
              <span className={`font-normal text-[14px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Live Support</span>
            </Link>
          </nav>
        </div>

        <div className="flex flex-col gap-1 px-6 pt-4 border-t border-[#AAB3B6]/15 mt-8">
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

            {/* Global Notification Bell */}
            <button
              onClick={() => router.push('/admin/support')}
              className={`relative p-2 rounded-full transition ${theme === 'dark' ? 'hover:bg-[#334155] text-gray-400' : 'hover:bg-gray-100 text-[#586163]'}`}
              title="View Support Tickets"
            >
              <Bell className="w-5 h-5" />
              {totalUnread > 0 && (
                <div className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-[#1E293B]"></div>
              )}
            </button>

            {/* Admin Profile Cluster */}
            <div className={`flex items-center gap-3 pl-4 border-l transition-colors ${theme === 'dark' ? 'border-[#334155]' : 'border-[#E9EFF1]'}`}>
              <div className="flex flex-col items-end">
                <span className={`text-[14px] font-bold ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>{profile?.username || "Admin"}</span>
                <span className="text-[11px] text-[#586163] font-bold tracking-[1px]">ADMIN</span>
              </div>
              <div className="w-10 h-10 rounded-full bg-[#DBE4E6] border-2 border-[#ABE5FE] flex items-center justify-center text-[#28667B] font-bold overflow-hidden shadow-sm">
                {profile?.profile_picture ? (
                  <img src={profile.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  getInitials(profile?.username)
                )}
              </div>
            </div>

            {/* THEME TOGGLE BUTTON */}
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

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8 flex flex-col items-center">
          <div className="w-full max-w-[1024px] flex flex-col gap-8 pb-12">
            <h2 className={`text-[36px] font-['Manrope'] font-bold tracking-[-0.9px] ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>
              User Management
            </h2>

            {/* ============================================================ */}
            {/* SUMMARY STATS BENTO GRID                                     */}
            {/* ============================================================ */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              {/* Card 1: Total Users */}
              <div className={`p-6 rounded-[20px] border shadow-sm flex flex-col justify-between h-[152px] transition ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#AAB3B6]/20'}`}>
                <div className="flex items-center justify-between">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${theme === 'dark' ? 'bg-[#28667B]/20 text-[#38BDF8]' : 'bg-[#28667B]/10 text-[#28667B]'}`}>
                    <Users className="w-5 h-5" />
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${theme === 'dark' ? 'bg-[#334155] text-gray-300' : 'bg-[#E2E9EB] text-[#586163]'}`}>Overall</span>
                </div>
                <div>
                  <span className={`text-[13px] font-medium block mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Total Users</span>
                  <h3 className={`text-[36px] font-['Manrope'] font-extrabold leading-none tracking-[-0.9px] ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>{stats.total.toLocaleString()}</h3>
                </div>
              </div>

              {/* Card 2: Active Today */}
              <div className={`p-6 rounded-[20px] border shadow-sm flex flex-col justify-between h-[152px] transition ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#AAB3B6]/20'}`}>
                <div className="flex items-center justify-between">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${theme === 'dark' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[#A0F3F5]/30 text-[#006A6C]'}`}>
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${theme === 'dark' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white border border-[#AAB3B6]/20'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${theme === 'dark' ? 'bg-emerald-400' : 'bg-[#006A6C]'}`}></span>
                    <span className={`text-[10px] font-bold ${theme === 'dark' ? 'text-emerald-400' : 'text-[#2B3436]'}`}>Live</span>
                  </div>
                </div>
                <div>
                  <span className={`text-[13px] font-medium block mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Active Today</span>
                  <h3 className={`text-[36px] font-['Manrope'] font-extrabold leading-none tracking-[-0.9px] ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>{stats.activeToday.toLocaleString()}</h3>
                </div>
              </div>

              {/* Card 3: New Registrations */}
              <div className={`p-6 rounded-[20px] border shadow-sm flex flex-col justify-between h-[152px] transition ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#AAB3B6]/20'}`}>
                <div className="flex items-center justify-between">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${theme === 'dark' ? 'bg-[#14B8A6]/20 text-[#5EEAD4]' : 'bg-[#A0F3F5]/30 text-[#006A6C]'}`}>
                    <UserPlus className="w-5 h-5" />
                  </div>
                  {stats.regGrowth !== 0 && (
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${stats.regGrowth > 0 ? (theme === 'dark' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700') : (theme === 'dark' ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700')}`}>
                      {stats.regGrowth > 0 ? '+' : ''}{stats.regGrowth}%
                    </span>
                  )}
                </div>
                <div>
                  <span className={`text-[13px] font-medium block mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>New Registrations</span>
                  <h3 className={`text-[36px] font-['Manrope'] font-extrabold leading-none tracking-[-0.9px] ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>{stats.newReg.toLocaleString()}</h3>
                </div>
              </div>

            </div>

            {/* ============================================================ */}
            {/* USER TABLE SECTION                                           */}
            {/* ============================================================ */}
            <div className={`border rounded-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex flex-col transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#E9EFF1]'}`}>

              {/* Filters & Actions Header */}
              <div className={`px-6 py-6 border-b flex flex-col md:flex-row justify-between items-center gap-4 ${theme === 'dark' ? 'border-[#334155]' : 'border-[#E9EFF1]'}`}>
                <div className="flex items-center gap-3 w-full md:w-auto">
                  {/* Live Search Bar */}
                  <div className={`flex items-center gap-2 rounded-lg px-4 py-2 w-full md:w-[220px] focus-within:ring-2 focus-within:ring-[#28667B] transition ${theme === 'dark' ? 'bg-[#0F172A] border border-[#334155]' : 'bg-[#E2E9EB]'}`}>
                    <Search className={`w-4 h-4 ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`} />
                    <input
                      type="text"
                      placeholder="Search users..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={`bg-transparent text-[14px] font-medium outline-none w-full placeholder:text-[#586163]/70 ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}
                    />
                  </div>

                  {/* 1. Live Status Filter Dropdown */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setIsStatusFilterOpen(!isStatusFilterOpen);
                        setIsTierFilterOpen(false); // Close other if open
                      }}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 transition cursor-pointer ${theme === 'dark'
                        ? 'bg-[#1E293B] border border-[#334155] hover:bg-[#334155] text-gray-300'
                        : 'bg-[#E2E9EB] hover:bg-[#d5e0e3]'
                        }`}
                    >
                      <Filter className={`w-4 h-4 ${theme === 'dark' ? 'text-gray-400' : 'text-[#28667B]'}`} />
                      <span className={`text-[12px] font-bold select-none pr-1 ${theme === 'dark' ? 'text-gray-300' : 'text-[#28667B]'
                        }`}>
                        {statusFilter === "ALL" ? "All Status" : statusFilter === "ACTIVE" ? "Active" : "Inactive"}
                      </span>
                      <ChevronDown className={`w-3 h-3 ${theme === 'dark' ? 'text-gray-400' : 'text-[#28667B]'}`} />
                    </button>

                    {isStatusFilterOpen && (
                      <div className={`absolute left-0 mt-2 min-w-[150px] rounded-lg shadow-xl border overflow-hidden z-50 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-gray-200'
                        }`}>
                        {[
                          { value: "ALL", label: "All Status" },
                          { value: "ACTIVE", label: "Active Only" },
                          { value: "INACTIVE", label: "Inactive Only" }
                        ].map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setStatusFilter(opt.value);
                              setIsStatusFilterOpen(false);
                            }}
                            className={`block w-full text-left px-4 py-2.5 text-[12px] font-bold transition-colors ${statusFilter === opt.value
                              ? theme === 'dark'
                                ? 'bg-[#334155] text-white'
                                : 'bg-[#E9EFF1] text-[#28667B]'
                              : theme === 'dark'
                                ? 'text-gray-400 hover:bg-[#334155] hover:text-white'
                                : 'text-[#586163] hover:bg-gray-50'
                              }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 2. Live Tier Filter Dropdown */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setIsTierFilterOpen(!isTierFilterOpen);
                        setIsStatusFilterOpen(false); // Close other if open
                      }}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 transition cursor-pointer ${theme === 'dark'
                        ? 'bg-[#1E293B] border border-[#334155] hover:bg-[#334155] text-gray-300'
                        : 'bg-[#E2E9EB] hover:bg-[#d5e0e3]'
                        }`}
                    >
                      <Shield className={`w-4 h-4 ${theme === 'dark' ? 'text-gray-400' : 'text-[#28667B]'}`} />
                      <span className={`text-[12px] font-bold select-none pr-1 ${theme === 'dark' ? 'text-gray-300' : 'text-[#28667B]'
                        }`}>
                        {tierFilter === "ALL" ? "All Tiers" : tierFilter === "FREE" ? "Free Tier" : tierFilter === "PLUS" ? "Plus Tier" : "Enterprise"}
                      </span>
                      <ChevronDown className={`w-3 h-3 ${theme === 'dark' ? 'text-gray-400' : 'text-[#28667B]'}`} />
                    </button>

                    {isTierFilterOpen && (
                      <div className={`absolute left-0 mt-2 min-w-[160px] rounded-lg shadow-xl border overflow-hidden z-50 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-gray-200'
                        }`}>
                        {[
                          { value: "ALL", label: "All Tiers" },
                          { value: "FREE", label: "Free Plan" },
                          { value: "PLUS", label: "Plus Plan" },
                          { value: "ENTERPRISE", label: "Enterprise" }
                        ].map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setTierFilter(opt.value);
                              setIsTierFilterOpen(false);
                            }}
                            className={`block w-full text-left px-4 py-2.5 text-[12px] font-bold transition-colors ${tierFilter === opt.value
                              ? theme === 'dark'
                                ? 'bg-[#334155] text-white'
                                : 'bg-[#E9EFF1] text-[#28667B]'
                              : theme === 'dark'
                                ? 'text-gray-400 hover:bg-[#334155] hover:text-white'
                                : 'text-[#586163] hover:bg-gray-50'
                              }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                  {/* Export Button connected to handleExportCSV */}
                  <button onClick={handleExportPDF} className="flex items-center justify-center px-4 py-2 border border-[#AAB3B6]/30 rounded-lg text-[#586163] text-[14px] font-semibold hover:bg-gray-50 transition gap-2">
                    <Download className="w-4 h-4" /> Export
                  </button>
                  {/* Add User Button connected to handleAddUser */}
                  <button onClick={handleAddUser} className="flex items-center justify-center px-4 py-2 bg-[#28667B] rounded-lg text-[#F2FAFF] text-[14px] font-semibold shadow-sm hover:bg-[#1f5061] transition gap-2">
                    <UserPlus className="w-4 h-4" /> Add User
                  </button>
                </div>
              </div>

              {/* Table Data */}
              <div className="w-full overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className={`${theme === 'dark' ? 'bg-[#0F172A]/80' : 'bg-[#EFF4F6]/50'}`}>
                    <tr>
                      <th className={`px-8 py-4 text-[12px] font-bold uppercase tracking-[0.6px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>User Profile</th>
                      <th className={`px-6 py-4 text-[12px] font-bold uppercase tracking-[0.6px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Last Active</th>
                      <th className={`px-6 py-4 text-[12px] font-bold uppercase tracking-[0.6px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Status</th>
                      <th className={`px-6 py-4 text-[12px] font-bold uppercase tracking-[0.6px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Tier</th>
                      <th className={`px-8 py-4 text-[12px] font-bold uppercase tracking-[0.6px] text-right ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Actions</th>
                    </tr>
                  </thead>

                  <tbody className={`divide-y ${theme === 'dark' ? 'divide-[#334155]' : 'divide-[#E9EFF1]'}`}>
                    {paginatedUsers.length > 0 ? paginatedUsers.map((u) => {
                      const lastActiveDate = new Date(u.updated_at || u.created_at);
                      const isActive = u.is_active !== false; // Default to true if null

                      return (
                        <tr key={u.user_id} className={`transition ${theme === 'dark' ? 'hover:bg-[#334155]/50' : 'hover:bg-gray-50'} ${!isActive ? 'border-l-4 border-l-[#A83836] bg-[#FA746F]/5' : ''}`}>
                          <td className="px-8 py-4 flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center overflow-hidden shrink-0 ${theme === 'dark' ? 'bg-[#0F172A]' : 'bg-[#E2E9EB]'}`}>
                              {u.profile_picture ? (
                                <img src={u.profile_picture} alt="Avatar" className="w-full h-full object-cover" />
                              ) : (
                                <span className={`font-bold ${theme === 'dark' ? 'text-[#A0F3F5]' : 'text-[#28667B]'}`}>{getInitials(u.username)}</span>
                              )}
                            </div>
                            <div className="flex flex-col">
                              <span className={`font-bold text-[14px] ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>{u.username}</span>
                              <span className={`text-[12px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>{u.email}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className={`text-[14px] ${theme === 'dark' ? 'text-gray-300' : 'text-[#586163]'}`}>{lastActiveDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                              <span className={`text-[10px] ${theme === 'dark' ? 'text-gray-500' : 'text-[#586163]'}`}>{lastActiveDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {isActive ? (
                              <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.5px] flex items-center gap-1.5 w-fit ${theme === 'dark'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-[#A0F3F5]/30 text-[#005D5F]'
                                }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${theme === 'dark' ? 'bg-emerald-400' : 'bg-[#006A6C]'}`} /> Active
                              </span>
                            ) : (
                              <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.5px] flex items-center gap-1.5 w-fit ${theme === 'dark'
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-[#FA746F]/20 text-[#A83836]'
                                }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${theme === 'dark' ? 'bg-red-400' : 'bg-[#A83836]'}`} /> Inactive
                              </span>
                            )}
                          </td>
                          {/* NEW TIER COLUMN */}
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.5px] w-fit ${u.subscription_tier === 'ENTERPRISE'
                              ? (theme === 'dark' ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-100 text-purple-700') :
                              u.subscription_tier === 'PLUS'
                                ? (theme === 'dark' ? 'bg-[#14B8A6]/20 text-[#5EEAD4]' : 'bg-[#14B8A6]/20 text-[#006A6C]') :
                                (theme === 'dark' ? 'bg-[#334155] text-gray-300' : 'bg-gray-100 text-gray-600')
                              }`}>
                              {u.subscription_tier || 'FREE'}
                            </span>
                          </td>
                          <td className="px-8 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => handleViewUser(u)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${theme === 'dark' ? 'bg-[#0F172A] text-gray-400 hover:bg-[#28667B]/30 hover:text-[#38BDF8]' : 'bg-gray-50 text-[#586163] hover:bg-[#28667B]/10 hover:text-[#28667B]'}`} title="View Details">
                                <Eye className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleEditUser(u)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${theme === 'dark' ? 'bg-[#0F172A] text-gray-400 hover:bg-yellow-500/20 hover:text-yellow-500' : 'bg-gray-50 text-[#586163] hover:bg-yellow-500/10 hover:text-yellow-600'}`} title="Edit User">
                                <Edit className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDeleteUser(u)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${theme === 'dark' ? 'bg-[#0F172A] text-gray-400 hover:bg-red-500/20 hover:text-red-400' : 'bg-gray-50 text-[#586163] hover:bg-red-500/10 hover:text-red-600'}`} title="Deactivate User">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={4} className="text-center py-8 text-[#586163]">No users found.</td>
                      </tr>
                    )}

                  </tbody>
                </table>
              </div>

              {/* Live Pagination Section */}
              <div className={`px-8 py-6 border-t flex justify-between items-center rounded-b-[12px] transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#E9EFF1]'}`}>
                <span className="text-[12px] font-medium text-[#586163]">
                  Showing {filteredUsers.length > 0 ? startIndex + 1 : 0} to {Math.min(endIndex, filteredUsers.length)} of {filteredUsers.length} entries
                </span>

                <div className="flex items-center gap-1">
                  {/* Previous Button */}
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100 cursor-pointer'}`}
                  >
                    <ChevronLeft className="w-4 h-4 text-[#586163]" />
                  </button>

                  {/* Dynamic Page Numbers with Ellipsis */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .map((page, index, array) => {
                      const showEllipsis = index > 0 && page - array[index - 1] > 1;
                      return (
                        <React.Fragment key={page}>
                          {showEllipsis && <span className="px-2 text-[#586163] text-[16px]">...</span>}
                          <button
                            onClick={() => setCurrentPage(page)}
                            className={`w-8 h-8 rounded-lg text-[12px] flex items-center justify-center transition ${currentPage === page
                              ? 'bg-[#28667B] text-[#F2FAFF] font-bold'
                              : 'hover:bg-gray-100 text-[#586163] font-medium'
                              }`}
                          >
                            {page}
                          </button>
                        </React.Fragment>
                      );
                    })
                  }

                  {/* Next Button */}
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages || totalPages === 0}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${currentPage === totalPages || totalPages === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100 cursor-pointer'}`}
                  >
                    <ChevronRight className="w-4 h-4 text-[#586163]" />
                  </button>
                </div>
              </div>

            </div>

            {/* Footer */}
            <footer className="w-full py-8 mt-8 border-t border-[#E2E8F0] flex justify-center">
              <p className="text-[#737C7F] text-[12px] font-semibold tracking-[2.4px] uppercase text-center">
                © 2026 WEB-BASED MULTI-MODAL EMOTION RECOGNITION AND ANALYTICS SYSTEM.
              </p>
            </footer>

          </div>
        </div>
        {/* ============================================================ */}
        {/* SECURE ADMIN ADD USER MODAL                                  */}
        {/* ============================================================ */}
        {isAddUserModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={`relative w-full max-w-[500px] rounded-[24px] shadow-2xl overflow-hidden flex flex-col transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0F172A] border border-[#334155]' : 'bg-white'}`}>

              <div className={`px-8 py-6 border-b flex justify-between items-center transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-[#F7FAFB] border-[#E9EFF1]'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#28667B]/10 rounded-full flex items-center justify-center">
                    <Shield className="w-5 h-5 text-[#28667B]" />
                  </div>
                  <div>
                    <h3 className={`font-['Manrope'] font-bold text-[20px] ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>
                      Create New Account
                    </h3>
                    <p className={`text-[12px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>
                      Grant access and assign subscription tiers.
                    </p>
                  </div>
                </div>
              </div>

              <form onSubmit={submitNewUser} className="p-8 flex flex-col gap-5">

                <div className="flex flex-col gap-2">
                  <label className="text-[12px] font-bold text-[#586163] uppercase tracking-[1px]">Full Name</label>
                  <input
                    type="text"
                    required
                    value={newUserForm.username}
                    onChange={(e) => setNewUserForm({ ...newUserForm, username: e.target.value })}
                    className={`w-full h-[48px] px-4 rounded-xl border outline-none transition-all font-medium focus:border-[#28667B] focus:ring-2 focus:ring-[#28667B]/20 ${theme === 'dark' ? 'bg-[#0F172A] border-[#334155] text-white focus:bg-[#1E293B]' : 'bg-[#F7FAFB] border-[#E2E9EB] text-[#2B3436] focus:bg-white'}`}
                    placeholder="e.g. John Doe"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[12px] font-bold text-[#586163] uppercase tracking-[1px]">Email Address</label>
                  <input
                    type="email"
                    required
                    value={newUserForm.email}
                    onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                    className={`w-full h-[48px] px-4 rounded-xl border outline-none transition-all font-medium focus:border-[#28667B] focus:ring-2 focus:ring-[#28667B]/20 ${theme === 'dark' ? 'bg-[#0F172A] border-[#334155] text-white focus:bg-[#1E293B]' : 'bg-[#F7FAFB] border-[#E2E9EB] text-[#2B3436] focus:bg-white'}`}
                    placeholder="name@example.com"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[12px] font-bold text-[#737C7F] uppercase tracking-[1px]">Temporary Password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newUserForm.password}
                    onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                    className={`w-full h-[48px] px-4 rounded-xl border outline-none transition-all font-medium focus:border-[#28667B] focus:ring-2 focus:ring-[#28667B]/20 tracking-widest ${theme === 'dark'
                        ? 'bg-[#1E293B] border-[#334155] text-white focus:bg-[#0F172A]'
                        : 'bg-[#F7FAFB] border-[#E2E9EB] text-[#2B3436] focus:bg-white'
                      }`}
                    placeholder="••••••••"
                  />
                </div>

                {/* THE SUBSCRIPTION TIER SELECTOR */}
                <div className="flex flex-col gap-2 pt-2">
                  <label className="text-[12px] font-bold text-[#737C7F] uppercase tracking-[1px]">Access Level / Plan</label>
                  <div className="relative">
                    <select
                      value={newUserForm.subscription_tier}
                      onChange={(e) => setNewUserForm({ ...newUserForm, subscription_tier: e.target.value })}
                      className={`w-full h-[48px] px-4 rounded-xl border outline-none transition-all font-bold appearance-none cursor-pointer ${theme === 'dark'
                          ? 'bg-[#1E293B] border-[#334155] text-white focus:bg-[#0F172A]'
                          : 'bg-[#F7FAFB] border-[#E2E9EB] text-[#2B3436] focus:bg-white'
                        }`}
                    >
                      <option value="FREE">Basic (Free Plan)</option>
                      <option value="PLUS">Plus (RM 2/mo Level)</option>
                      <option value="ENTERPRISE">Clinical Enterprise</option>
                    </select>
                    <ChevronDown className={`w-4 h-4 absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`} />
                  </div>
                </div>

                {/* ✅ ADD THIS: Subscription Duration - Only show if not FREE */}
                {newUserForm.subscription_tier !== 'FREE' && (
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="flex flex-col gap-2">
                      <label className="text-[12px] font-bold text-[#586163] uppercase tracking-[1px]">Start Date</label>
                      <input
                        type="date"
                        value={newUserForm.subscription_start_date || ''}
                        onChange={(e) => setNewUserForm({ ...newUserForm, subscription_start_date: e.target.value })}
                        className={`w-full h-[48px] px-4 rounded-xl border outline-none transition-all font-medium ${theme === 'dark'
                          ? 'bg-[#0F172A] border-[#334155] text-white focus:bg-[#1E293B]'
                          : 'bg-[#F7FAFB] border-[#E2E9EB] text-[#2B3436] focus:bg-white'
                          }`}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-[12px] font-bold text-[#586163] uppercase tracking-[1px]">End Date</label>
                      <input
                        type="date"
                        value={newUserForm.subscription_end_date || ''}
                        onChange={(e) => setNewUserForm({ ...newUserForm, subscription_end_date: e.target.value })}
                        className={`w-full h-[48px] px-4 rounded-xl border outline-none transition-all font-medium ${theme === 'dark'
                          ? 'bg-[#0F172A] border-[#334155] text-white focus:bg-[#1E293B]'
                          : 'bg-[#F7FAFB] border-[#E2E9EB] text-[#2B3436] focus:bg-white'
                          }`}
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 mt-4 pt-6 border-t border-[#E9EFF1]">
                  <button
                    type="button"
                    onClick={() => setIsAddUserModalOpen(false)}
                    className="px-6 py-2.5 rounded-xl text-[#586163] font-bold text-[14px] hover:bg-gray-100 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingUser}
                    className="px-6 py-2.5 rounded-xl bg-[#28667B] text-white font-bold text-[14px] hover:bg-[#1f5061] shadow-md transition disabled:opacity-50"
                  >
                    {isCreatingUser ? "Creating..." : "Create Account"}
                  </button>
                </div>

              </form>
            </div>
          </div>
        )}
        {/* ============================================================ */}
        {/* SECURE ADMIN VIEW USER MODAL                                 */}
        {/* ============================================================ */}
        {isViewModalOpen && selectedUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-[500px] bg-white rounded-[24px] shadow-2xl overflow-hidden flex flex-col">

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
                    <h3 className={`font-['Manrope'] font-bold text-[20px] ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>
                      {selectedUser.username}
                    </h3>
                    <p className={`text-[12px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>
                      {selectedUser.email}
                    </p>
                  </div>
                </div>
                <button onClick={() => setIsViewModalOpen(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition">
                  <span className="font-bold text-gray-500 px-1">✕</span>
                </button>
              </div>

              <div className={`p-8 flex flex-col gap-6 transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0F172A]' : 'bg-white'}`}>
                <div className="grid grid-cols-2 gap-4">
                  {/* Status Box */}
                  <div className={`flex flex-col p-4 rounded-xl border transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-[#F7FAFB] border-[#E9EFF1]'}`}>
                    <span className="text-[10px] font-bold text-[#737C7F] uppercase tracking-[1px] mb-1">Status</span>
                    <span className={`text-[14px] font-bold ${selectedUser.is_active !== false ? (theme === 'dark' ? 'text-emerald-400' : 'text-[#006A6C]') : 'text-[#A83836]'}`}>
                      {selectedUser.is_active !== false ? 'Active Account' : 'Deactivated'}
                    </span>
                  </div>

                  {/* Access Tier Box - Updated to show dates clearly */}
                  <div className={`flex flex-col p-4 rounded-xl border transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-[#F7FAFB] border-[#E9EFF1]'}`}>
                    <span className="text-[10px] font-bold text-[#737C7F] uppercase tracking-[1px] mb-1">Access Tier</span>
                    <span className={`text-[14px] font-bold ${theme === 'dark' ? 'text-gray-200' : 'text-[#2B3436]'}`}>
                      {selectedUser.subscription_tier || 'FREE'}
                    </span>

                    {/* Debugging: Check if dates exist */}
                    {selectedUser.subscription_tier !== 'FREE' && (
                      <div className="mt-2 text-[10px] text-[#586163]">
                        {selectedUser.subscription_start_date ? (
                          <div>From: {new Date(selectedUser.subscription_start_date).toLocaleDateString()}</div>
                        ) : null}
                        {selectedUser.subscription_end_date ? (
                          <div>To: {new Date(selectedUser.subscription_end_date).toLocaleDateString()}</div>
                        ) : null}
                      </div>
                    )}
                  </div>
                  {/* System Role Box */}
                  <div className={`flex flex-col p-4 rounded-xl border transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-[#F7FAFB] border-[#E9EFF1]'}`}>
                    <span className="text-[10px] font-bold text-[#737C7F] uppercase tracking-[1px] mb-1">System Role</span>
                    <span className={`text-[14px] font-bold ${theme === 'dark' ? 'text-gray-200' : 'text-[#2B3436]'}`}>{selectedUser.role}</span>
                  </div>

                  {/* Member Since Box */}
                  <div className={`flex flex-col p-4 rounded-xl border transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-[#F7FAFB] border-[#E9EFF1]'}`}>
                    <span className="text-[10px] font-bold text-[#737C7F] uppercase tracking-[1px] mb-1">Member Since</span>
                    <span className={`text-[14px] font-bold ${theme === 'dark' ? 'text-gray-200' : 'text-[#2B3436]'}`}>{new Date(selectedUser.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Address Box */}
                <div className="flex flex-col gap-1 w-full mt-2">
                  <label className="text-[10px] font-bold text-[#586163] uppercase tracking-[1px]">Physical Address</label>
                  <div className={`w-full rounded-xl px-4 py-3 text-[14px] font-medium transition-colors duration-500 border ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155] text-gray-200' : 'bg-[#F7FAFB] border-[#E9EFF1] text-[#2B3436]'}`}>
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

        {/* ============================================================ */}
        {/* SECURE ADMIN EDIT USER MODAL                                 */}
        {/* ============================================================ */}
        {isEditModalOpen && selectedUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-[500px] bg-white rounded-[24px] shadow-2xl overflow-hidden flex flex-col">

              <div className={`px-8 py-6 border-b flex justify-between items-center transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-[#F7FAFB] border-[#E9EFF1]'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-yellow-500/10 rounded-full flex items-center justify-center">
                    <Edit className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div>
                    <h3 className={`font-['Manrope'] font-bold text-[20px] ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>
                      Edit User Profile
                    </h3>
                    <p className={`text-[12px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>
                      {selectedUser.email}
                    </p>
                  </div>
                </div>
              </div>

              <form onSubmit={submitEditUser} className={`p-8 flex flex-col gap-5 transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0F172A]' : 'bg-white'}`}>

                {/* Full Name */}
                <div className="flex flex-col gap-2">
                  <label className="text-[12px] font-bold text-[#737C7F] uppercase tracking-[1px]">Full Name</label>
                  <input
                    type="text"
                    required
                    value={editForm.username}
                    onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                    className={`w-full h-[48px] px-4 rounded-xl border outline-none transition-all font-medium focus:border-[#28667B] focus:ring-2 focus:ring-[#28667B]/20 ${theme === 'dark'
                      ? 'bg-[#1E293B] border-[#334155] text-white focus:bg-[#0F172A]'
                      : 'bg-[#F7FAFB] border-[#E2E9EB] text-[#2B3436] focus:bg-white'
                      }`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Account Status */}
                  <div className="flex flex-col gap-2 pt-2">
                    <label className="text-[12px] font-bold text-[#737C7F] uppercase tracking-[1px]">Account Status</label>
                    <div className="relative">
                      <select
                        value={editForm.is_active ? "TRUE" : "FALSE"}
                        onChange={(e) => setEditForm({ ...editForm, is_active: e.target.value === "TRUE" })}
                        className={`w-full h-[48px] px-4 rounded-xl border outline-none transition-all font-bold appearance-none cursor-pointer ${theme === 'dark'
                          ? 'bg-[#1E293B] border-[#334155] text-white'
                          : 'bg-[#F7FAFB] border-[#E2E9EB] text-[#2B3436]'
                          }`}
                      >
                        <option value="TRUE">Active</option>
                        <option value="FALSE">Deactivated</option>
                      </select>
                      <ChevronDown className={`w-4 h-4 absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`} />
                    </div>
                  </div>

                  {/* Access Tier */}
                  <div className="flex flex-col gap-2 pt-2">
                    <label className="text-[12px] font-bold text-[#737C7F] uppercase tracking-[1px]">Access Tier</label>
                    <div className="relative">
                      <select
                        value={editForm.subscription_tier}
                        onChange={(e) => setEditForm({ ...editForm, subscription_tier: e.target.value })}
                        className={`w-full h-[48px] px-4 rounded-xl border outline-none transition-all font-bold appearance-none cursor-pointer ${theme === 'dark'
                          ? 'bg-[#1E293B] border-[#334155] text-white'
                          : 'bg-[#F7FAFB] border-[#E2E9EB] text-[#2B3436]'
                          }`}
                      >
                        <option value="FREE">Basic (Free)</option>
                        <option value="PLUS">Plus Level</option>
                        <option value="ENTERPRISE">Enterprise</option>
                      </select>
                      <ChevronDown className={`w-4 h-4 absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`} />
                    </div>
                  </div>
                </div>

                {/* ✅ ADD THIS: Subscription Duration - Only show if not FREE */}
                {editForm.subscription_tier !== 'FREE' && (
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="flex flex-col gap-2">
                      <label className="text-[12px] font-bold text-[#737C7F] uppercase tracking-[1px]">Start Date</label>
                      <input
                        type="date"
                        value={editForm.subscription_start_date ? new Date(editForm.subscription_start_date).toISOString().split('T')[0] : ''}
                        onChange={(e) => setEditForm({ ...editForm, subscription_start_date: e.target.value })}
                        className={`w-full h-[48px] px-4 rounded-xl border outline-none transition-all font-medium ${theme === 'dark'
                          ? 'bg-[#1E293B] border-[#334155] text-white'
                          : 'bg-[#F7FAFB] border-[#E2E9EB] text-[#2B3436]'
                          }`}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-[12px] font-bold text-[#737C7F] uppercase tracking-[1px]">End Date</label>
                      <input
                        type="date"
                        value={editForm.subscription_end_date ? new Date(editForm.subscription_end_date).toISOString().split('T')[0] : ''}
                        onChange={(e) => setEditForm({ ...editForm, subscription_end_date: e.target.value })}
                        className={`w-full h-[48px] px-4 rounded-xl border outline-none transition-all font-medium ${theme === 'dark'
                          ? 'bg-[#1E293B] border-[#334155] text-white'
                          : 'bg-[#F7FAFB] border-[#E2E9EB] text-[#2B3436]'
                          }`}
                      />
                    </div>
                  </div>
                )}

                {/* Physical Address */}
                <div className="flex flex-col gap-2 pt-2">
                  <label className="text-[12px] font-bold text-[#737C7F] uppercase tracking-[1px]">Physical Address</label>
                  <input
                    type="text"
                    value={editForm.address}
                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                    className={`w-full h-[48px] px-4 rounded-xl border outline-none transition-all font-medium focus:border-[#28667B] focus:ring-2 focus:ring-[#28667B]/20 ${theme === 'dark'
                      ? 'bg-[#1E293B] border-[#334155] text-white focus:bg-[#0F172A]'
                      : 'bg-[#F7FAFB] border-[#E2E9EB] text-[#2B3436] focus:bg-white'
                      }`}
                    placeholder="Enter full address"
                  />
                </div>

                {/* Buttons */}
                <div className={`flex items-center justify-end gap-3 mt-4 pt-6 border-t ${theme === 'dark' ? 'border-[#334155]' : 'border-[#E9EFF1]'}`}>
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className={`px-6 py-2.5 rounded-xl font-bold text-[14px] transition ${theme === 'dark' ? 'text-gray-400 hover:bg-[#334155]' : 'text-[#586163] hover:bg-gray-100'}`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEdit}
                    className="px-6 py-2.5 rounded-xl bg-yellow-500 text-white font-bold text-[14px] hover:bg-yellow-600 shadow-md transition disabled:opacity-50"
                  >
                    {isSavingEdit ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}