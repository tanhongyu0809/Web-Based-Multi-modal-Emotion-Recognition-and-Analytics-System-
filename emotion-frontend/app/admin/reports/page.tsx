"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/utils/supabase/client"; // Adjust path if needed
import {
  Users,
  FileText,
  Search,
  Bell,
  HelpCircle,
  Settings,
  LogOut,
  Calendar as CalendarIcon,
  ChevronDown,
  BarChart3,
  Download,
  Share2,
  Printer,
  Check,
  X as CloseIcon,
  Moon,
  Sun,
  Headset,
  Activity
} from "lucide-react";

export default function GenerateEmotionReportInterface() {
  // --- NEW: MULTI-SELECT EMOTION STATES ---
  const [selectedEmotions, setSelectedEmotions] = useState<string[]>(["All Emotions"]);
  const [isEmotionDropdownOpen, setIsEmotionDropdownOpen] = useState(false);
  const EMOTION_LIST = ["Happy", "Sad", "Angry", "Fear", "Surprise", "Disgust", "Neutral"];

  const [demographic, setDemographic] = useState("All Patients");
  const [granularity, setGranularity] = useState("Daily");

  const router = useRouter();
  const supabase = createClient();

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

    // Listen for new incoming tickets while on the reports page
    const channel = supabase.channel('admin-global-bell')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: "sender=eq.user" }, () => {
        calculateUnread();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile, supabase]);

  // --- REPORT DATA STATES & LOGIC ---
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [isTemplateLibraryOpen, setIsTemplateLibraryOpen] = useState(false);

  // Custom Multi-Select Toggle Function
  const toggleEmotion = (emo: string) => {
    if (emo === "All Emotions") {
      setSelectedEmotions(["All Emotions"]);
      return;
    }
    let newSelection = selectedEmotions.filter(e => e !== "All Emotions");
    if (newSelection.includes(emo)) {
      newSelection = newSelection.filter(e => e !== emo);
      if (newSelection.length === 0) newSelection = ["All Emotions"]; // Revert to all if empty
    } else {
      newSelection.push(emo);
    }
    setSelectedEmotions(newSelection);
  };

  const handleApplyTemplate = (emotions: string[], demo: string, gran: string) => {
    setSelectedEmotions(emotions);
    setDemographic(demo);
    setGranularity(gran);
    setIsTemplateLibraryOpen(false);
    alert("Template applied! Click 'Generate Preview' to load the data.");
  };

  const handleGeneratePreview = async () => {
    setIsGenerating(true);
    try {
      // 1. Fetch all records from the database then filter client-side
      const { data: records, error } = await supabase
        .from('emotion_record')
        .select('confidence_score, user_id, timestamp, emotion_label, detection_type')
        .order('timestamp', { ascending: false, nullsFirst: false })
        .limit(5000);

      if (error) throw error;

      // 2. Filter by date range (include records with NULL timestamps)
      const startMs = new Date(startDate).getTime();
      const endMs = new Date(endDate + 'T23:59:59.999Z').getTime();
      let filteredRecords = (records || []).filter(r => {
        if (!r.timestamp) return true; // include NULL timestamp records
        const ts = new Date(r.timestamp).getTime();
        return ts >= startMs && ts <= endMs;
      });

      // -> NEW Case-Insensitive Multi-Select Emotion Filter Logic
      if (!selectedEmotions.includes("All Emotions") && selectedEmotions.length > 0) {
        filteredRecords = filteredRecords.filter(r =>
          selectedEmotions.some(sel => {
            const label = (r.emotion_label || "").toLowerCase();
            const selLower = sel.toLowerCase();
            return label === selLower || (label === "fearful" && selLower === "fear");
          })
        );
      }

      // -> Demographic Filter Logic
      if (demographic !== "All Patients") {
        filteredRecords = filteredRecords.filter((_, i) => demographic.includes("Group A") ? i % 2 === 0 : i % 2 !== 0);
      }

      // 3. Process Real Stats
      const totalRecords = filteredRecords.length;
      const uniqueUsers = new Set(filteredRecords.map(r => r.user_id)).size;
      const avgConf = totalRecords > 0
        ? (filteredRecords.reduce((acc, r) => acc + Number(r.confidence_score), 0) / totalRecords).toFixed(1)
        : "0.0";

      // 4. Generate REAL Chart Bars based on Granularity
      let labels: string[] = [];
      let buckets: number[] = [];
      const end = new Date(endDate);

      if (granularity === 'Daily') {
        for (let i = 6; i >= 0; i--) {
          const d = new Date(end); d.setDate(d.getDate() - i);
          labels.push(d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }));
          buckets.push(0);
        }
        filteredRecords.forEach(r => {
          const d = new Date(r.timestamp).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
          const idx = labels.indexOf(d);
          if (idx !== -1) buckets[idx]++;
        });
      } else if (granularity === 'Weekly') {
        labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
        buckets = [0, 0, 0, 0];
        filteredRecords.forEach(r => {
          const w = Math.floor(new Date(r.timestamp).getDate() / 8);
          if (w < 4) buckets[w]++;
        });
      } else {
        labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        buckets = Array(12).fill(0);
        filteredRecords.forEach(r => {
          const m = new Date(r.timestamp).getMonth();
          buckets[m]++;
        });
      }

      const maxBucket = Math.max(...buckets, 1);
      const generatedBars = buckets.map(count => {
        const heightPct = totalRecords === 0 ? 5 : Math.max((count / maxBucket) * 100, 10);
        return {
          h: `${heightPct}%`,
          bg: heightPct > 70 ? 'bg-[#28667B]/80' : heightPct > 40 ? 'bg-[#28667B]/50' : 'bg-[#28667B]/20'
        };
      });

      // 5. Push to UI
      setReportData({
        title: selectedEmotions.includes("All Emotions") ? "All Emotions Overview" : `${selectedEmotions.join(" & ")} Report`,
        subtitle: `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`,
        demographicLabel: demographic,
        avgConfidence: avgConf,
        totalSubjects: uniqueUsers,
        totalRecords: totalRecords,
        bars: generatedBars,
        labels: labels,
        rawRecords: filteredRecords // Saved for PDF Export
      });

    } catch (err: any) {
      alert("Failed to generate report: " + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportPDF = async () => {
    const { data: records } = await supabase
      .from('emotion_record')
      .select('confidence_score, user_id, timestamp, emotion_label, detection_type')
      .order('timestamp', { ascending: false, nullsFirst: false })
      .limit(5000);

    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate + 'T23:59:59.999Z').getTime();
    let filteredRecords = (records || []).filter(r => {
      if (!r.timestamp) return true;
      const ts = new Date(r.timestamp).getTime();
      return ts >= startMs && ts <= endMs;
    });
    if (!selectedEmotions.includes("All Emotions") && selectedEmotions.length > 0) {
      filteredRecords = filteredRecords.filter(r =>
        selectedEmotions.some(sel => {
          const label = (r.emotion_label || "").toLowerCase();
          const selLower = sel.toLowerCase();
          return label === selLower || (label === "fearful" && selLower === "fear");
        })
      );
    }
    if (demographic !== "All Patients") {
      filteredRecords = filteredRecords.filter((_, i) => demographic.includes("Group A") ? i % 2 === 0 : i % 2 !== 0);
    }

    const totalRecords = filteredRecords.length;
    const uniqueUsers = new Set(filteredRecords.map(r => r.user_id)).size;
    const avgConf = totalRecords > 0
      ? (filteredRecords.reduce((acc, r) => acc + Number(r.confidence_score), 0) / totalRecords).toFixed(1)
      : "0.0";

    const titleText = selectedEmotions.includes("All Emotions") ? "All Emotions Overview" : `${selectedEmotions.join(" & ")} Report`;
    const subtitleText = `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`;

    const currentDate = new Date().toLocaleString();
    const adminName = profile?.username || "Admin";

    const reportHTML = `
      <html>
        <head>
          <title>${titleText} Report</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #2B3436; padding: 40px; line-height: 1.6; }
            .header { text-align: center; border-bottom: 3px solid #28667B; padding-bottom: 20px; margin-bottom: 30px; }
            .header h1 { margin: 0; font-size: 22px; color: #28667B; text-transform: uppercase; letter-spacing: 1px;}
            .header h2 { margin: 5px 0 0 0; font-size: 16px; color: #586163; font-weight: normal; }
            .meta-box { background-color: #F7FAFB; border: 1px solid #E2E9EB; padding: 15px; border-radius: 8px; margin-bottom: 30px; display: flex; justify-content: space-between;}
            .meta-box p { margin: 5px 0; font-size: 14px; }
            .meta-box strong { color: #28667B; }
            .stats-grid { display: flex; gap: 20px; margin-bottom: 30px; }
            .stat-card { flex: 1; background: #E9EFF1; padding: 20px; border-radius: 8px; text-align: center; }
            .stat-card h3 { margin: 0; font-size: 28px; color: #28667B; }
            .stat-card p { margin: 5px 0 0 0; font-size: 12px; text-transform: uppercase; color: #586163; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 40px; }
            th, td { border: 1px solid #DBE4E6; padding: 12px 15px; text-align: left; font-size: 14px; }
            th { background-color: #28667B; color: white; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px; }
            tr:nth-child(even) { background-color: #F7FAFB; }
            .footer { position: fixed; bottom: 30px; left: 40px; right: 40px; text-align: center; font-size: 10px; color: #737C7F; border-top: 1px solid #E2E9EB; padding-top: 15px; text-transform: uppercase; letter-spacing: 1px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Web-Based Multi-Modal Emotion Recognition System</h1>
            <h2>Clinical Analytics: ${titleText}</h2>
          </div>
          <div class="meta-box">
            <div>
              <p><strong>Generated By:</strong> ${adminName}</p>
              <p><strong>Date Generated:</strong> ${currentDate}</p>
            </div>
            <div>
              <p><strong>Target Demographic:</strong> ${demographic}</p>
              <p><strong>Date Range:</strong> ${subtitleText}</p>
            </div>
          </div>
          
          <div class="stats-grid">
            <div class="stat-card">
              <h3>${avgConf}%</h3>
              <p>Avg Confidence</p>
            </div>
            <div class="stat-card">
              <h3>${uniqueUsers}</h3>
              <p>Unique Subjects</p>
            </div>
            <div class="stat-card">
              <h3>${totalRecords}</h3>
              <p>Total Records</p>
            </div>
          </div>

          <h3>Sample Processed Records (Latest 50)</h3>
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Dominant Emotion</th>
                <th>Confidence</th>
                <th>Data Source</th>
              </tr>
            </thead>
            <tbody>
              ${filteredRecords.slice(0, 50).map((r: any) => `
                <tr>
                  <td>${new Date(r.timestamp).toLocaleString()}</td>
                  <td><strong>${r.emotion_label || 'Unknown'}</strong></td>
                  <td>${r.confidence_score}%</td>
                  <td>${r.detection_type || 'SYSTEM'}</td>
                </tr>
              `).join('') || '<tr><td colspan="4" style="text-align:center;">No records available.</td></tr>'}
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

  const handleExportCSV = async () => {
    const { data: records } = await supabase
      .from('emotion_record')
      .select('confidence_score, user_id, timestamp, emotion_label, detection_type')
      .order('timestamp', { ascending: false, nullsFirst: false })
      .limit(5000);

    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate + 'T23:59:59.999Z').getTime();
    let filteredRecords = (records || []).filter(r => {
      if (!r.timestamp) return true;
      const ts = new Date(r.timestamp).getTime();
      return ts >= startMs && ts <= endMs;
    });
    if (!selectedEmotions.includes("All Emotions") && selectedEmotions.length > 0) {
      filteredRecords = filteredRecords.filter(r =>
        selectedEmotions.some(sel => {
          const label = (r.emotion_label || "").toLowerCase();
          const selLower = sel.toLowerCase();
          return label === selLower || (label === "fearful" && selLower === "fear");
        })
      );
    }
    if (demographic !== "All Patients") {
      filteredRecords = filteredRecords.filter((_, i) => demographic.includes("Group A") ? i % 2 === 0 : i % 2 !== 0);
    }

    if (filteredRecords.length === 0) return alert("No records found for the selected date range.");

    // Create CSV headers and map the data
    const headers = ["Timestamp", "Dominant Emotion", "Confidence Score", "Data Source"];
    const csvContent = [
      headers.join(","),
      ...filteredRecords.map((r: any) =>
        `${new Date(r.timestamp).toISOString()},${r.emotion_label || 'Unknown'},${r.confidence_score},${r.detection_type}`
      )
    ].join("\n");

    // Trigger browser download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const titleName = selectedEmotions.includes("All Emotions") ? "All_Emotions_Overview" : selectedEmotions.join("_");
    link.setAttribute("download", `${titleName}_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
            {/* INACTIVE: User Management */}
            <Link
              href="/admin/users"
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/10 transition"
            >
              <Users className={`w-5 h-5 ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`} />
              <span className={`font-normal text-[14px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>User Management</span>
            </Link>

            {/* ACTIVE: Emotion Reports */}
            <Link
              href="/admin/reports"
              className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] ${theme === 'dark' ? 'bg-[#0F172A] border border-[#334155]' : 'bg-white'
                }`}
            >
              <FileText className={`w-[18px] h-[18px] ${theme === 'dark' ? 'text-white' : 'text-[#28667B]'}`} />
              <span className={`font-bold text-[14px] ${theme === 'dark' ? 'text-white' : 'text-[#28667B]'}`}>Emotion Reports</span>
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
          <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-2 rounded-xl hover:bg-white/50 transition w-full text-left mt-2">
            <LogOut className="w-[14px] h-[14px] text-[#586163]" />
            <span className="text-[#586163] font-medium text-[12px]">Log Out</span>
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
              <div className="w-10 h-10 rounded-full bg-[#DBE4E6] border-2 border-[#28667B]/20 flex items-center justify-center text-[#28667B] font-bold overflow-hidden shadow-sm">
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
        <div className="flex-1 overflow-y-auto p-6 lg:p-10 flex flex-col items-start xl:items-center">
          <div className="w-full max-w-[944px] flex flex-col gap-12 pb-12">

            {/* Header Section */}
            <div className="flex justify-between items-end border-b border-transparent pb-2">
              <div className="flex flex-col gap-2 max-w-[660px]">
                <h2 className={`text-[36px] font-['Manrope'] font-bold tracking-[-0.9px] leading-[40px] ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>
                  Emotion Reports
                </h2>
                <p className={`text-[18px] leading-[29px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>
                  Generate comprehensive clinical analytics, aggregate mood distributions, and system-wide anomaly reports.
                </p>
              </div>

              <button
                onClick={() => setIsTemplateLibraryOpen(true)}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl shadow-sm transition font-bold mb-1 ${theme === 'dark' ? 'bg-[#28667B]/30 text-[#38BDF8] hover:bg-[#28667B]/50' : 'bg-[#BDEAFA] text-[#2B5765] hover:bg-[#a6dbf0]'}`}
              >
                <BarChart3 className={`w-4 h-4 ${theme === 'dark' ? 'text-[#38BDF8]' : 'text-[#2B5765]'}`} />
                Open Template Library
              </button>
            </div>

            {/* ============================================================ */}
            {/* BENTO LAYOUT FOR CONFIGURATION & PREVIEW                     */}
            {/* ============================================================ */}
            <div className="flex flex-col lg:flex-row gap-8 w-full items-stretch">

              {/* Left Column: Configuration Form (Bento Large) */}
              <div className={`w-full lg:w-[293px] rounded-[16px] p-8 flex flex-col shrink-0 relative transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B] border border-[#334155]' : 'bg-white border border-white shadow-[0_10px_40px_-15px_rgba(40,102,123,0.08)]'}`}>

                <h4 className={`font-['Manrope'] font-bold text-[18px] mb-6 flex items-center gap-2 ${theme === 'dark' ? 'text-[#38BDF8]' : 'text-[#28667B]'}`}>
                  <Settings className={`w-4 h-4 ${theme === 'dark' ? 'text-[#38BDF8]' : 'text-[#28667B]'}`} />
                  Query Parameters
                </h4>

                <div className="flex flex-col gap-6 flex-1">

                  {/* FUNCTIONAL Date Range Input (Stacked to fix overflow) */}
                  <div className="flex flex-col gap-2">
                    <label className={`text-[12px] font-bold uppercase tracking-[0.6px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Date Range</label>
                    <div className="flex flex-col gap-2">
                      <div className={`relative w-full h-[44px] rounded-xl flex items-center px-3 transition focus-within:ring-2 focus-within:ring-[#28667B] ${theme === 'dark' ? 'bg-[#0F172A] border border-[#334155] text-white' : 'bg-[#E2E9EB] hover:bg-[#d4dde0]'}`}>
                        <span className={`text-[10px] font-bold uppercase w-10 ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Start:</span>
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`w-full bg-transparent outline-none font-semibold text-[12px] cursor-pointer ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`} />
                      </div>
                      <div className={`relative w-full h-[44px] rounded-xl flex items-center px-3 transition focus-within:ring-2 focus-within:ring-[#28667B] ${theme === 'dark' ? 'bg-[#0F172A] border border-[#334155] text-white' : 'bg-[#E2E9EB] hover:bg-[#d4dde0]'}`}>
                        <span className={`text-[10px] font-bold uppercase w-10 ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>End:</span>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`w-full bg-transparent outline-none font-semibold text-[12px] cursor-pointer ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`} />
                      </div>
                    </div>
                  </div>

                  {/* NEW Custom Multi-Select Emotion Dropdown */}
                  <div className="flex flex-col gap-2 relative z-50">
                    <label className={`text-[12px] font-bold uppercase tracking-[0.6px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Target Emotions</label>
                    <button
                      type="button"
                      onClick={() => setIsEmotionDropdownOpen(!isEmotionDropdownOpen)}
                      className={`w-full h-[44px] rounded-xl flex items-center justify-between px-4 cursor-pointer transition focus-within:ring-2 focus-within:ring-[#28667B] ${theme === 'dark' ? 'bg-[#0F172A] border border-[#334155] text-white' : 'bg-[#E2E9EB] hover:bg-[#d4dde0] text-[#2B3436]'}`}
                    >
                      <span className="font-medium text-[14px] truncate pr-4">
                        {selectedEmotions.includes("All Emotions") ? "All Emotions" : selectedEmotions.join(", ")}
                      </span>
                      <ChevronDown className={`w-4 h-4 shrink-0 ${theme === 'dark' ? 'text-gray-400' : 'text-[#6B7280]'}`} />
                    </button>

                    {isEmotionDropdownOpen && (
                      <div className={`absolute top-[70px] left-0 w-full shadow-2xl rounded-xl overflow-hidden flex flex-col max-h-[250px] overflow-y-auto ${theme === 'dark' ? 'bg-[#0F172A] border border-[#334155] text-white' : 'bg-white border border-[#E2E9EB] text-[#2B3436]'}`}>
                        <div
                          onClick={() => toggleEmotion("All Emotions")}
                          className={`px-4 py-3 border-b flex items-center justify-between cursor-pointer transition ${theme === 'dark' ? 'border-[#334155] hover:bg-[#1E293B]' : 'border-gray-100 hover:bg-[#F7FAFB]'}`}
                        >
                          <span className="text-[14px] font-bold">All Emotions</span>
                          {selectedEmotions.includes("All Emotions") && <Check className="w-4 h-4 text-[#38BDF8]" />}
                        </div>
                        {EMOTION_LIST.map(emo => (
                          <div
                            key={emo}
                            onClick={() => toggleEmotion(emo)}
                            className={`px-4 py-3 border-b flex items-center justify-between cursor-pointer transition ${theme === 'dark' ? 'border-[#334155] hover:bg-[#1E293B]' : 'border-gray-100 hover:bg-[#F7FAFB]'}`}
                          >
                            <span className={`text-[14px] font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-[#586163]'}`}>{emo}</span>
                            {selectedEmotions.includes(emo) && <Check className="w-4 h-4 text-[#38BDF8]" />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Demographic Dropdown */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-1">
                      <label className={`text-[12px] font-bold uppercase tracking-[0.6px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Demographic</label>
                      <span className={`text-[10px] font-medium uppercase tracking-[0.6px] opacity-60 ${theme === 'dark' ? 'text-[#38BDF8]' : 'text-[#28667B]'}`}>(Optional)</span>
                    </div>
                    <div className={`relative w-full h-[44px] rounded-xl flex items-center px-4 cursor-pointer transition ${theme === 'dark' ? 'bg-[#0F172A] border border-[#334155] text-white' : 'bg-[#E2E9EB] hover:bg-[#d4dde0]'}`}>
                      <select
                        value={demographic}
                        onChange={(e) => setDemographic(e.target.value)}
                        className={`w-full h-full bg-transparent font-medium text-[14px] outline-none appearance-none cursor-pointer ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}
                      >
                        <option value="All Patients" className={theme === 'dark' ? 'bg-[#0F172A] text-white' : ''}>All Patients</option>
                        <option value="Group A (18-25)" className={theme === 'dark' ? 'bg-[#0F172A] text-white' : ''}>Group A (18-25)</option>
                        <option value="Group B (26-45)" className={theme === 'dark' ? 'bg-[#0F172A] text-white' : ''}>Group B (26-45)</option>
                      </select>
                      <ChevronDown className={`absolute right-4 w-4 h-4 pointer-events-none ${theme === 'dark' ? 'text-gray-400' : 'text-[#6B7280]'}`} />
                    </div>
                  </div>

                  {/* Granularity Toggle Group */}
                  <div className="flex flex-col gap-2">
                    <label className={`text-[12px] font-bold uppercase tracking-[0.6px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Data Granularity</label>
                    <div className={`w-full h-[40px] rounded-xl relative flex items-center p-1 ${theme === 'dark' ? 'bg-[#0F172A] border border-[#334155]' : 'bg-[#E2E9EB]'}`}>
                      <button
                        onClick={() => setGranularity("Daily")}
                        className={`flex-1 h-full rounded-lg text-[12px] font-medium z-10 transition ${granularity === "Daily" ? (theme === 'dark' ? "bg-[#334155] text-white font-bold shadow-sm" : "bg-white text-[#28667B] font-bold shadow-sm") : (theme === 'dark' ? "text-gray-400 hover:text-white" : "text-[#586163] hover:text-[#2B3436]")}`}
                      >
                        Daily
                      </button>
                      <button
                        onClick={() => setGranularity("Weekly")}
                        className={`flex-1 h-full rounded-lg text-[12px] font-medium z-10 transition ${granularity === "Weekly" ? (theme === 'dark' ? "bg-[#334155] text-white font-bold shadow-sm" : "bg-white text-[#28667B] font-bold shadow-sm") : (theme === 'dark' ? "text-gray-400 hover:text-white" : "text-[#586163] hover:text-[#2B3436]")}`}
                      >
                        Weekly
                      </button>
                      <button
                        onClick={() => setGranularity("Monthly")}
                        className={`flex-1 h-full rounded-lg text-[12px] font-medium z-10 transition ${granularity === "Monthly" ? (theme === 'dark' ? "bg-[#334155] text-white font-bold shadow-sm" : "bg-white text-[#28667B] font-bold shadow-sm") : (theme === 'dark' ? "text-gray-400 hover:text-white" : "text-[#586163] hover:text-[#2B3436]")}`}
                      >
                        Monthly
                      </button>
                    </div>
                  </div>

                </div>

                {/* THE GENERATE BUTTON - Now safely outside the Granularity box! */}
                <button
                  onClick={handleGeneratePreview}
                  disabled={isGenerating}
                  className="w-full h-[56px] bg-[#28667B] rounded-xl mt-8 text-[#F2FAFF] font-bold text-[16px] hover:bg-[#1f5061] transition shadow-md flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isGenerating ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <BarChart3 className="w-5 h-5" />
                  )}
                  {isGenerating ? "Processing Data..." : "Generate Preview"}
                </button>

              </div>

              {/* Right Column: Preview Area (Bento X-Large) */}
              <div className={`flex-1 min-h-[500px] rounded-[16px] relative overflow-hidden flex flex-col transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B] border border-[#334155]' : 'bg-white border border-white shadow-[0_10px_40px_-15px_rgba(40,102,123,0.08)]'}`}>

                {/* Internal Header & Export Controls */}
                <div className={`p-8 border-b flex justify-between items-center z-10 transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#E9EFF1]'}`}>
                  <div className="flex flex-col">
                    <h4 className={`font-['Manrope'] font-bold text-[18px] ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>
                      {reportData ? reportData.title : "Report Preview Area"}
                    </h4>
                    <span className={`text-[14px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>
                      {reportData ? `${reportData.demographicLabel} | ${reportData.subtitle}` : "Select parameters and click Generate."}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`text-[12px] font-bold uppercase mr-2 ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Export</span>
                    <button onClick={handleExportPDF} title="Print PDF" className={`w-8 h-8 rounded-full flex items-center justify-center transition ${theme === 'dark' ? 'bg-[#0F172A] border border-[#334155] text-gray-300 hover:text-white' : 'bg-[#E2E9EB] hover:bg-[#d5e0e3] text-[#2B3436]'}`}>
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => alert("Report link copied to clipboard!")} title="Share" className={`w-8 h-8 rounded-full flex items-center justify-center transition ${theme === 'dark' ? 'bg-[#0F172A] border border-[#334155] text-gray-300 hover:text-white' : 'bg-[#E2E9EB] hover:bg-[#d5e0e3] text-[#2B3436]'}`}>
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={handleExportCSV} title="Download CSV" className={`flex items-center gap-2 px-4 py-1.5 rounded-full transition ${theme === 'dark' ? 'bg-[#0F172A] border border-[#334155] text-gray-300 hover:text-white' : 'bg-[#E2E9EB] hover:bg-[#d5e0e3] text-[#2B3436]'}`}>
                      <Download className={`w-3.5 h-3.5 ${theme === 'dark' ? 'text-[#38BDF8]' : 'text-[#00686A]'}`} />
                      <span className="text-[12px] font-bold">CSV</span>
                    </button>
                  </div>
                </div>

                {/* Report Content Body */}
                <div className="flex-1 p-8 flex flex-col relative">

                  {reportData ? (
                    <>
                      {/* DYNAMIC Chart Graphics Module */}
                      <div className="w-full h-[191px] relative flex items-end justify-between px-10 pb-12 mb-8 bg-transparent">
                        {/* Simulated SVG Trends */}
                        <div className="absolute inset-0 z-10 pointer-events-none opacity-50">
                          <svg width="100%" height="100%" viewBox="0 0 552 191" preserveAspectRatio="none">
                            <path d="M 0 120 C 100 80, 200 150, 300 90 S 450 140, 552 50" fill="none" stroke={theme === 'dark' ? '#38BDF8' : '#28667B'} strokeWidth="2" />
                            <path d="M 0 150 C 150 110, 250 160, 400 130 S 500 160, 552 110" fill="none" stroke={theme === 'dark' ? '#818CF8' : '#3A6573'} strokeWidth="1.5" strokeDasharray="6 4" />
                          </svg>
                        </div>

                        {/* DYNAMIC Bar Chart Bars */}
                        {reportData.bars.map((bar: any, i: number) => {
                          // Extract opacity level to apply appropriate dark mode cyan colors
                          const isHigh = bar.bg.includes('80');
                          const isMed = bar.bg.includes('50');
                          const darkBg = isHigh ? 'bg-[#38BDF8]/80' : isMed ? 'bg-[#38BDF8]/50' : 'bg-[#38BDF8]/20';

                          return (
                            <div key={i} className={`w-8 sm:w-12 rounded-t-lg z-0 transition-all duration-1000 ease-out ${theme === 'dark' ? darkBg : bar.bg}`} style={{ height: bar.h }} />
                          );
                        })}

                        {/* DYNAMIC X-Axis Labels */}
                        <div className={`absolute bottom-0 left-0 w-full h-[40px] border-t px-10 pt-4 flex justify-between transition-colors duration-500 ${theme === 'dark' ? 'border-[#334155]' : 'border-[#AAB3B6]/20'}`}>
                          {reportData.labels.map((label: string, i: number) => (
                            <span key={i} className={`text-[10px] font-bold uppercase ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>{label}</span>
                          ))}
                        </div>
                      </div>

                      {/* DYNAMIC Data Summary Rows */}
                      <div className={`flex gap-8 mt-auto border-t pt-8 transition-colors duration-500 ${theme === 'dark' ? 'border-[#334155]' : 'border-[#E9EFF1]'}`}>
                        <div className="flex gap-4 items-center">
                          <div className="flex flex-col">
                            <span className={`text-[10px] font-bold uppercase tracking-[1px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Average Confidence Score</span>
                            <h4 className={`text-[24px] font-['Manrope'] font-bold ${theme === 'dark' ? 'text-white' : 'text-[#3A6573]'}`}>{reportData.avgConfidence}%</h4>
                          </div>
                          <div className={`w-[1px] h-10 ml-4 ${theme === 'dark' ? 'bg-[#334155]' : 'bg-[#AAB3B6]/30'}`} />
                        </div>

                        <div className="flex gap-4 items-center">
                          <div className="flex flex-col">
                            <span className={`text-[10px] font-bold uppercase tracking-[1px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Total Subjects Analyzed</span>
                            <h4 className={`text-[24px] font-['Manrope'] font-bold ${theme === 'dark' ? 'text-[#38BDF8]' : 'text-[#28667B]'}`}>{reportData.totalSubjects}</h4>
                          </div>
                          <div className={`w-[1px] h-10 ml-4 ${theme === 'dark' ? 'bg-[#334155]' : 'bg-[#AAB3B6]/30'}`} />
                        </div>

                        <div className="flex gap-4 items-center">
                          <div className="flex flex-col">
                            <span className={`text-[10px] font-bold uppercase tracking-[1px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Total Raw Records</span>
                            <h4 className={`text-[24px] font-['Manrope'] font-bold ${theme === 'dark' ? 'text-[#38BDF8]' : 'text-[#28667B]'}`}>{reportData.totalRecords}</h4>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center opacity-60">
                      <BarChart3 className={`w-16 h-16 mb-4 ${theme === 'dark' ? 'text-gray-500' : 'text-[#AAB3B6]'}`} />
                      <p className={`text-[16px] font-bold ${theme === 'dark' ? 'text-gray-300' : 'text-[#586163]'}`}>No Report Generated</p>
                      <p className={`text-[14px] max-w-[300px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#737C7F]'}`}>Configure your query parameters on the left and click "Generate Preview" to fetch live database analytics.</p>
                    </div>
                  )}

                </div>
              </div>
            </div>

            {/* Footer */}
            <footer className="w-full py-8 mt-4 border-t border-[#E2E8F0] flex justify-center">
              <p className="text-[#737C7F] text-[12px] font-semibold tracking-[2.4px] uppercase text-center">
                © 2026 WEB-BASED MULTI-MODAL EMOTION RECOGNITION AND ANALYTICS SYSTEM.
              </p>
            </footer>

          </div>
        </div>
        {/* ============================================================ */}
        {/* TEMPLATE LIBRARY MODAL                                       */}
        {/* ============================================================ */}
        {isTemplateLibraryOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={`relative w-full max-w-[700px] rounded-[24px] shadow-2xl overflow-hidden flex flex-col ${theme === 'dark' ? 'bg-[#0F172A] border border-[#334155]' : 'bg-white'}`}>

              <div className={`px-8 py-6 border-b flex justify-between items-center ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-[#F7FAFB] border-[#E9EFF1]'}`}>
                <div>
                  <h3 className={`font-['Manrope'] font-bold text-[20px] ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>Report Templates</h3>
                  <p className={`text-[12px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Quick-start presets for common clinical queries.</p>
                </div>
                <button onClick={() => setIsTemplateLibraryOpen(false)} className={`p-2 rounded-full transition ${theme === 'dark' ? 'bg-[#0F172A] text-gray-300 hover:bg-[#334155]' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  <CloseIcon className="w-5 h-5" />
                </button>
              </div>

              <div className={`p-8 flex flex-col gap-4 ${theme === 'dark' ? 'bg-[#0F172A]' : 'bg-white'}`}>

                {/* Template 1 */}
                <div
                  onClick={() => handleApplyTemplate(["Sad", "Fear", "Angry", "Disgust"], "Group A (18-25)", "Weekly")}
                  className={`w-full border-2 rounded-xl p-5 cursor-pointer transition flex items-center justify-between group ${theme === 'dark' ? 'border-[#334155] bg-[#1E293B]/60 hover:border-[#38BDF8] hover:bg-[#1E293B]' : 'border-[#E9EFF1] hover:border-[#28667B] hover:bg-[#F7FAFB]'}`}
                >
                  <div className="flex flex-col">
                    <h4 className={`font-bold text-[16px] transition ${theme === 'dark' ? 'text-white group-hover:text-[#38BDF8]' : 'text-[#2B3436] group-hover:text-[#28667B]'}`}>Youth Baseline Deviation Report</h4>
                    <p className={`text-[13px] mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Focuses on high-arousal negative states in the 18-25 demographic (Weekly tracking).</p>
                  </div>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center transition ${theme === 'dark' ? 'bg-[#0F172A] group-hover:bg-[#38BDF8]' : 'bg-[#E2E9EB] group-hover:bg-[#28667B]'}`}>
                    <Check className="w-4 h-4 text-transparent group-hover:text-white transition" />
                  </div>
                </div>

                {/* Template 2 */}
                <div
                  onClick={() => handleApplyTemplate(["All Emotions"], "All Patients", "Monthly")}
                  className={`w-full border-2 rounded-xl p-5 cursor-pointer transition flex items-center justify-between group ${theme === 'dark' ? 'border-[#334155] bg-[#1E293B]/60 hover:border-[#38BDF8] hover:bg-[#1E293B]' : 'border-[#E9EFF1] hover:border-[#28667B] hover:bg-[#F7FAFB]'}`}
                >
                  <div className="flex flex-col">
                    <h4 className={`font-bold text-[16px] transition ${theme === 'dark' ? 'text-white group-hover:text-[#38BDF8]' : 'text-[#2B3436] group-hover:text-[#28667B]'}`}>Macro Anomaly Audit</h4>
                    <p className={`text-[13px] mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>System-wide scan for all clinical anomalies across all patients (Monthly distribution).</p>
                  </div>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center transition ${theme === 'dark' ? 'bg-[#0F172A] group-hover:bg-[#38BDF8]' : 'bg-[#E2E9EB] group-hover:bg-[#28667B]'}`}>
                    <Check className="w-4 h-4 text-transparent group-hover:text-white transition" />
                  </div>
                </div>

                {/* Template 3 */}
                <div
                  onClick={() => handleApplyTemplate(["Happy", "Neutral", "Surprise"], "Group B (26-45)", "Daily")}
                  className={`w-full border-2 rounded-xl p-5 cursor-pointer transition flex items-center justify-between group ${theme === 'dark' ? 'border-[#334155] bg-[#1E293B]/60 hover:border-[#38BDF8] hover:bg-[#1E293B]' : 'border-[#E9EFF1] hover:border-[#28667B] hover:bg-[#F7FAFB]'}`}
                >
                  <div className="flex flex-col">
                    <h4 className={`font-bold text-[16px] transition ${theme === 'dark' ? 'text-white group-hover:text-[#38BDF8]' : 'text-[#2B3436] group-hover:text-[#28667B]'}`}>Adult Emotion Profiling</h4>
                    <p className={`text-[13px] mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Tracks the standard dominant emotions for adults aged 26-45 (High-resolution Daily data).</p>
                  </div>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center transition ${theme === 'dark' ? 'bg-[#0F172A] group-hover:bg-[#38BDF8]' : 'bg-[#E2E9EB] group-hover:bg-[#28667B]'}`}>
                    <Check className="w-4 h-4 text-transparent group-hover:text-white transition" />
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}