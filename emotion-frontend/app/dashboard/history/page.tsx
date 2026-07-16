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
  Search,
  Filter,
  AlertTriangle,
  Video,
  ChevronDown,
  LogOut,
  Download,
  Trash2,
  Check, X as CloseIcon,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Bell,
  Moon,
  Sun
} from "lucide-react";

export default function EmotionHistoryInterface() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState<any>(null);
  const [theme, setTheme] = useState('light');
  const [isLoading, setIsLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // REAL DATA STATES
  const [historyRecords, setHistoryRecords] = useState<any[]>([]);
  const [emotionBreakdown, setEmotionBreakdown] = useState<any[]>([]);
  const [latestAnomaly, setLatestAnomaly] = useState<any>(null);

  // UI STATES
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [timeFilter, setTimeFilter] = useState("This Week");

  // TABLE SPECIFIC STATES
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isTableFilterOpen, setIsTableFilterOpen] = useState(false);
  const [tableEmotionFilter, setTableEmotionFilter] = useState("All Emotions");

  // NEW: Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  const [totalUnread, setTotalUnread] = useState(0);

  // 1. LOAD THEME INSTANTLY
  useEffect(() => {
    setIsClient(true);
    const savedTheme = localStorage.getItem('app-theme');
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  // 2. LOAD DATABASE PROFILE & HISTORY RECORDS
  useEffect(() => {
    async function loadUserData() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/login");
          return;
        }

        // Fetch Profile with subscription_end_date
        const { data: userProfile, error: profileError } = await supabase
          .from("users")
          .select("username, role, profile_picture, subscription_tier, subscription_end_date")
          .eq("user_id", user.id)
          .maybeSingle();

        // 🆕 CHECK SUBSCRIPTION EXPIRY
        if (userProfile && userProfile.subscription_tier !== 'FREE' && userProfile.subscription_end_date) {
          const now = new Date();
          const endDate = new Date(userProfile.subscription_end_date);

          if (now > endDate) {
            await supabase.from('users').update({
              subscription_tier: 'FREE',
              subscription_end_date: null
            }).eq('user_id', user.id);

            userProfile.subscription_tier = 'FREE';
            userProfile.subscription_end_date = null;

            alert('Your Plus subscription has expired. Please renew to continue using expert features.');
            window.location.reload();
          }
        }

        if (userProfile) {
          setProfile({ ...userProfile, user_id: user.id });
        } else {
          const username = user.user_metadata?.username || user.email?.split('@')[0] || "User";
          setProfile({ username: username, role: "USER", user_id: user.id });
        }

        // Build the dynamic query based on the selected time filter
        let query = supabase
          .from("emotion_record")
          .select(`
            *,
            anomaly_alert (*)
          `)
          .eq("user_id", user.id)
          .eq("is_deleted", false)
          .order("timestamp", { ascending: false });

        const now = new Date();
        if (timeFilter === 'Today') {
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
          query = query.gte("timestamp", startOfToday);
        } else if (timeFilter === 'This Week') {
          const startOfWeek = new Date(now.setDate(now.getDate() - 7)).toISOString();
          query = query.gte("timestamp", startOfWeek);
        } else if (timeFilter === 'This Month') {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
          query = query.gte("timestamp", startOfMonth);
        }

        // Execute query
        const { data: records, error: recordsError } = await query;

        if (recordsError) {
          console.error("Error fetching records:", recordsError);
        }

        if (records && records.length > 0) {
          setHistoryRecords(records);

          // Calculate Real Dominant Emotion Breakdown
          const emotionCounts: Record<string, number> = {};
          records.forEach(record => {
            emotionCounts[record.emotion_label] = (emotionCounts[record.emotion_label] || 0) + 1;
          });

          const sortedEmotions = Object.keys(emotionCounts).map(key => ({
            label: key,
            percentage: Math.round((emotionCounts[key] / records.length) * 100)
          })).sort((a, b) => b.percentage - a.percentage);

          setEmotionBreakdown(sortedEmotions);

          const recentRecordWithAnomaly = records.find(record => record.anomaly_alert && record.anomaly_alert.length > 0);
          if (recentRecordWithAnomaly) {
            setLatestAnomaly(recentRecordWithAnomaly.anomaly_alert[0]);
          } else {
            setLatestAnomaly(null);
          }
        } else {
          setHistoryRecords([]);
          setEmotionBreakdown([]);
          setLatestAnomaly(null);
        }

      } catch (error) {
        console.error("Failed to load user data:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadUserData();
  }, [router, timeFilter]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const getInitials = (name: string) => {
    if (!name) return "U";
    return name.substring(0, 2).toUpperCase();
  };

  const getDaysRemaining = () => {
    if (!profile?.subscription_end_date || profile?.subscription_tier === 'FREE') return null;

    const now = new Date();
    const endDate = new Date(profile.subscription_end_date);
    const diffTime = endDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
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
          const expiryDate = new Date();
          expiryDate.setMonth(expiryDate.getMonth() + 1);

          const formattedDate = expiryDate.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          });

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
          router.replace('/dashboard/history');
          setShowUpgradeModal(false);
        }
      };
      upgradeUser();
    }

    if (query.get("upgrade") === "cancelled") {
      alert("Checkout was cancelled.");
      router.replace('/dashboard/history');
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

    const channel = supabase.channel('user-global-bell-history')
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

  // ==========================================
  // RECORD ACTIONS: DELETE
  // ==========================================
  const deleteRecord = async (recordId: string) => {
    if (!confirm("Are you sure you want to permanently delete this analysis record?")) return;

    try {
      const { error } = await supabase
        .from('emotion_record')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('record_id', recordId);

      if (error) throw error;

      // Instantly update the table AND the Donut Chart!
      setHistoryRecords(prev => {
        const newRecords = prev.filter(record => record.record_id !== recordId);

        if (newRecords.length > 0) {
          const emotionCounts: Record<string, number> = {};
          newRecords.forEach(record => {
            emotionCounts[record.emotion_label] = (emotionCounts[record.emotion_label] || 0) + 1;
          });
          const sortedEmotions = Object.keys(emotionCounts).map(key => ({
            label: key,
            percentage: Math.round((emotionCounts[key] / newRecords.length) * 100)
          })).sort((a, b) => b.percentage - a.percentage);
          setEmotionBreakdown(sortedEmotions);
        } else {
          setEmotionBreakdown([]);
        }

        return newRecords;
      });

    } catch (err) {
      console.error("Failed to delete record:", err);
      alert("An error occurred while deleting the record.");
    }
  };

  // ==========================================
  // HELPER: Generate Report for a SINGLE Record
  // ==========================================
  const downloadSingleReport = (record: any) => {
    // ALLOW BOTH PLUS AND ENTERPRISE
    if (profile?.subscription_tier === 'FREE') {
      setShowUpgradeModal(true);
      return;
    }
    const currentDate = new Date().toLocaleString();
    const userName = profile?.username || "Unknown User";
    const hasAnomaly = record.anomaly_alert && record.anomaly_alert.length > 0;
    const sessionTime = new Date(record.timestamp).toLocaleString();
    // Safely truncate the long database UUID for the PDF display
    const displayId = "SEQ-" + record.record_id.substring(0, 8).toUpperCase();

    const reportHTML = `
      <html>
        <head>
          <title>Individual Session Report - ${record.record_id}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #2B3436; padding: 40px; line-height: 1.6; }
            .header { text-align: center; border-bottom: 3px solid #28667B; padding-bottom: 20px; margin-bottom: 30px; }
            .header h1 { margin: 0; font-size: 22px; color: #28667B; text-transform: uppercase; letter-spacing: 1px;}
            .header h2 { margin: 5px 0 0 0; font-size: 16px; color: #586163; font-weight: normal; }
            .meta-box { background-color: #F7FAFB; border: 1px solid #E2E9EB; padding: 15px; border-radius: 8px; margin-bottom: 30px; }
            .meta-box p { margin: 5px 0; font-size: 14px; }
            .meta-box strong { color: #28667B; display: inline-block; width: 140px; }
            h3 { color: #28667B; border-bottom: 1px solid #E2E9EB; padding-bottom: 5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 40px; }
            th, td { border: 1px solid #DBE4E6; padding: 12px 15px; text-align: left; font-size: 14px; }
            th { background-color: #28667B; color: white; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px; }
            .anomaly { color: #A83836; font-weight: bold; }
            .footer { position: fixed; bottom: 30px; left: 40px; right: 40px; text-align: center; font-size: 10px; color: #737C7F; border-top: 1px solid #E2E9EB; padding-top: 15px; text-transform: uppercase; letter-spacing: 1px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Web-Based Multi-Modal Emotion Recognition System</h1>
            <h2>Isolated Session Report</h2>
          </div>
          <div class="meta-box">
            <p><strong>User Name:</strong> ${userName}</p>
            <p><strong>Report Generated:</strong> ${currentDate}</p>
            <p><strong>Session ID:</strong> ${displayId}</p>
          </div>
          <h3>Session Details</h3>
          <table>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Dominant Metric</th>
                <th>Data Source</th>
                <th>System Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${sessionTime}</td>
                <td>${record.emotion_label} (${record.confidence_score}%)</td>
                <td>${record.detection_type}</td>
                <td class="${hasAnomaly ? 'anomaly' : ''}">
                  ${hasAnomaly ? 'Anomaly Detected' : 'Normal Baseline'}
                </td>
              </tr>
            </tbody>
          </table>
          <div class="footer">
            &copy; 2026 Web-Based Multi-Modal Emotion Recognition and Analytics System. <br/>
            Strictly Confidential. Generated automatically via secure history dashboard.
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

  // ==========================================
  // HELPER: Generate Formal PDF HISTORY Report
  // ==========================================
  const downloadHistoryReport = () => {
    // ALLOW BOTH PLUS AND ENTERPRISE
    if (profile?.subscription_tier === 'FREE') {
      setShowUpgradeModal(true);
      return;
    }
    const currentDate = new Date().toLocaleString();
    const userName = profile?.username || "Unknown User";

    const tableRows = historyRecords.length > 0 ? historyRecords.map(record => {
      const hasAnomaly = record.anomaly_alert && record.anomaly_alert.length > 0;
      // Also truncate the ID here so the long table looks cleaner
      const shortId = "SEQ-" + record.record_id.substring(0, 8).toUpperCase();
      return `
        <tr>
          <td>${shortId}</td>
          <td>${new Date(record.timestamp).toLocaleString()}</td>
          <td>${record.emotion_label} (${record.confidence_score}%)</td>
          <td class="${hasAnomaly ? 'anomaly' : ''}">
            ${hasAnomaly ? 'Anomaly Detected' : 'Normal Baseline'}
          </td>
        </tr>
      `;
    }).join('') : `<tr><td colspan="4" style="text-align: center;">No data available for this timeframe.</td></tr>`;

    const reportHTML = `
      <html>
        <head>
          <title>Longitudinal Emotion History Report</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #2B3436; padding: 40px; line-height: 1.6; }
            .header { text-align: center; border-bottom: 3px solid #28667B; padding-bottom: 20px; margin-bottom: 30px; }
            .header h1 { margin: 0; font-size: 22px; color: #28667B; text-transform: uppercase; letter-spacing: 1px;}
            .header h2 { margin: 5px 0 0 0; font-size: 16px; color: #586163; font-weight: normal; }
            .meta-box { background-color: #F7FAFB; border: 1px solid #E2E9EB; padding: 15px; border-radius: 8px; margin-bottom: 30px; }
            .meta-box p { margin: 5px 0; font-size: 14px; }
            .meta-box strong { color: #28667B; display: inline-block; width: 140px; }
            h3 { color: #28667B; border-bottom: 1px solid #E2E9EB; padding-bottom: 5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 40px; }
            th, td { border: 1px solid #DBE4E6; padding: 12px 15px; text-align: left; font-size: 14px; }
            th { background-color: #28667B; color: white; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px; }
            tr:nth-child(even) { background-color: #F7FAFB; }
            .anomaly { color: #A83836; font-weight: bold; }
            .footer { position: fixed; bottom: 30px; left: 40px; right: 40px; text-align: center; font-size: 10px; color: #737C7F; border-top: 1px solid #E2E9EB; padding-top: 15px; text-transform: uppercase; letter-spacing: 1px; }
            @media print { body { -webkit-print-color-adjust: exact; } .footer { position: fixed; bottom: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Web-Based Multi-Modal Emotion Recognition System</h1>
            <h2>Longitudinal Emotion History Report</h2>
          </div>
          <div class="meta-box">
            <p><strong>User Name:</strong> ${userName}</p>
            <p><strong>Report Generated:</strong> ${currentDate}</p>
            <p><strong>Tracking Period:</strong> ${timeFilter}</p>
          </div>
          <h3>Tracking Sessions</h3>
          <table>
            <thead>
              <tr>
                <th>Session ID</th>
                <th>Date & Time</th>
                <th>Dominant Metric</th>
                <th>System Status</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <div class="footer">
            &copy; 2026 Web-Based Multi-Modal Emotion Recognition and Analytics System. <br/>
            Strictly Confidential. Generated automatically via secure history dashboard.
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

  // ==========================================
  // DYNAMIC CHART CONFIGURATION
  // ==========================================
  const getDynamicChartConfig = () => {
    const now = new Date();
    let subtitle = "";
    let labels: string[] = [];

    if (timeFilter === 'Today') {
      subtitle = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      labels = ['8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM'];
    } else if (timeFilter === 'This Week') {
      subtitle = `Trailing 7 Days (Ending ${now.toLocaleDateString()})`;
      labels = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (6 - i));
        return d.toLocaleDateString('en-US', { weekday: 'short' });
      });
    } else if (timeFilter === 'This Month') {
      subtitle = now.toLocaleString('default', { month: 'long', year: 'numeric' });
      labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
    } else {
      subtitle = now.getFullYear().toString();
      labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    }

    return { subtitle, labels };
  };

  const chartConfig = getDynamicChartConfig();
  const todayShortStr = new Date().toLocaleDateString('en-US', { weekday: 'short' });
  const hasRealData = historyRecords.length > 0;
  const primaryEmotion = emotionBreakdown.length > 0 ? emotionBreakdown[0] : { label: "None", percentage: 0 };

  const uniqueEmotions = Array.from(new Set(historyRecords.map(r => r.emotion_label)));

  // Table Filtering Logic
  const filteredRecords = historyRecords.filter(record => {
    const recordDate = new Date(record.timestamp);

    // NEW: Date range filtering
    let matchesDateRange = true;
    if (startDate) {
      const filterStartDate = new Date(startDate);
      matchesDateRange = recordDate >= filterStartDate;
    }
    if (endDate) {
      const filterEndDate = new Date(endDate);
      filterEndDate.setHours(23, 59, 59, 999); // Include the entire end date
      matchesDateRange = matchesDateRange && recordDate <= filterEndDate;
    }

    const matchesSearch = record.emotion_label.toLowerCase().includes(searchTerm.toLowerCase()) || record.detection_type.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEmotion = tableEmotionFilter === "All Emotions" || record.emotion_label === tableEmotionFilter;

    return matchesSearch && matchesEmotion && matchesDateRange;  // ← CHANGED
  });

  // ==========================================
  // PAGINATION LOGIC
  // ==========================================
  // Reset to page 1 whenever the user types a search or changes a filter
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, startDate, endDate, tableEmotionFilter, timeFilter]);

  const totalPages = Math.ceil(filteredRecords.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedRecords = filteredRecords.slice(startIndex, endIndex);

  if (!isClient) return null;

  if (isLoading) {
    return (
      <div className={`flex h-screen w-full items-center justify-center font-bold transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0F172A] text-[#28667B]' : 'bg-[#F7FAFB] text-[#28667B]'}`}>
        Loading Dashboard...
      </div>
    );
  }

  return (
    <div className={`flex h-screen w-full font-sans overflow-hidden transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0F172A] text-[#94A3B8]' : 'bg-[#F7FAFB] text-[#586163]'}`}>

      {/* ASIDE */}
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
            <Link href="/dashboard/history" className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] ${theme === 'dark' ? 'bg-[#0F172A] border border-[#334155]' : 'bg-white'}`}>
              <History className={`w-5 h-5 ${theme === 'dark' ? 'text-white' : 'text-[#28667B]'}`} />
              <span className={`font-bold text-[14px] ${theme === 'dark' ? 'text-white' : 'text-[#28667B]'}`}>Emotion History Dashboard</span>
            </Link>
            <Link href="/dashboard/settings" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/10 transition">
              <Settings className={`w-[18px] h-[18px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`} />
              <span className={`font-normal text-[14px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>Profile & Settings</span>
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

      {/* MAIN CONTENT */}
      <main className={`flex-1 flex flex-col h-full overflow-hidden relative transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0F172A]' : 'bg-[#F7FAFB]'}`}>
        <header className={`h-[72px] backdrop-blur-md flex items-center justify-between px-8 shrink-0 z-10 border-b transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B]/80 border-[#334155]' : 'bg-white/80 border-[#E9EFF1]'}`}>
          <div className="flex-1" />

          <div className="flex items-center gap-6">

            {/* 1. Notification Bell - Navigates to Help with chat open */}
            <button
              onClick={() => {
                if (profile?.user_id) {
                  const now = Date.now();
                  localStorage.setItem(`user_read_${profile.user_id}`, String(now));
                  setTotalUnread(0);
                }
                router.push('/help?openChat=true');
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

              {/* 2. Dynamic Subscription Badge with Days Remaining */}
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
                onClick={() => {
                  const newTheme = theme === 'light' ? 'dark' : 'light';
                  setTheme(newTheme);
                  localStorage.setItem('app-theme', newTheme);
                }}
                className={`ml-2 w-10 h-10 rounded-full flex items-center justify-center transition shadow-sm border ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155] text-yellow-400 hover:bg-[#334155]' : 'bg-white border-[#E2E9EB] text-[#28667B] hover:bg-[#F7FAFB]'
                  }`}
                title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
              >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-8 flex flex-col items-center">
          <div className="w-full max-w-[1024px] flex flex-col gap-8 pb-12">

            <div className="flex flex-col gap-2">
              <h2 className={`font-['Manrope'] font-bold text-[36px] leading-[40px] tracking-[-0.9px] ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>
                Emotion History
              </h2>
              <p className={`text-[16px] leading-[24px] font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>
                Longitudinal analysis and predictive sentiment mapping.
              </p>
            </div>

            {/* Health Snapshot Chart */}
            <div className={`w-full border shadow-sm rounded-[16px] p-8 flex flex-col gap-8 transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#AAB3B6]/20'}`}>
              <div className="flex justify-between items-center relative z-20">
                <div className="flex flex-col">
                  <h3 className={`font-['Manrope'] font-bold text-[20px] ${theme === 'dark' ? 'text-white' : 'text-[#28667B]'}`}>Health Snapshot</h3>
                  <span className="text-[#586163] text-[12px]">{chartConfig.subtitle}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-4 mr-4">
                    <div className={`flex items-center gap-2 text-[12px] font-bold uppercase tracking-[1px] ${theme === 'dark' ? 'text-[#A0F3F5]' : 'text-[#28667B]'}`}>
                      Total Sessions: {historyRecords.length}
                    </div>
                  </div>

                  {/* Interactive Filter Dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setIsFilterOpen(!isFilterOpen)}
                      className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-[10px] font-bold uppercase tracking-[0.5px] transition ${theme === 'dark' ? 'bg-[#0F172A] border-[#334155] text-white hover:bg-[#334155]' : 'bg-[#EFF4F6] border-gray-300 text-[#28667B] hover:bg-gray-100'}`}
                    >
                      {timeFilter} <ChevronDown className="w-3 h-3" />
                    </button>
                    {isFilterOpen && (
                      <div className={`absolute right-0 mt-2 w-[140px] rounded-lg shadow-xl border overflow-hidden z-50 transition-colors ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-gray-200'}`}>
                        {['Today', 'This Week', 'This Month', 'All Time'].map(filterOption => (
                          <button
                            key={filterOption}
                            onClick={() => {
                              // ALLOW BOTH PLUS AND ENTERPRISE
                              if (profile?.subscription_tier === 'FREE' && (filterOption === 'This Month' || filterOption === 'All Time')) {
                                setIsFilterOpen(false);
                                setShowUpgradeModal(true);
                                return;
                              }
                              setTimeFilter(filterOption);
                              setIsFilterOpen(false);
                            }}
                            className={`block w-full text-left px-4 py-3 text-[12px] font-bold transition-colors ${timeFilter === filterOption ? (theme === 'dark' ? 'bg-[#334155] text-[#A0F3F5]' : 'bg-[#E9EFF1] text-[#28667B]') : (theme === 'dark' ? 'text-white hover:bg-[#334155]/50' : 'text-[#586163] hover:bg-gray-50')}`}
                          >
                            {filterOption}
                            {/* Show a tiny lock icon if they are free and it's a premium filter */}
                            {profile?.subscription_tier === 'FREE' && (filterOption === 'This Month' || filterOption === 'All Time') && (
                              <span className="ml-2 opacity-50">🔒</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="h-[248px] w-full flex items-end justify-between px-2 gap-4">
                {chartConfig.labels.map((label, i) => {
                  let isCurrentLabel = false;
                  let sessionCount = 0;
                  const now = new Date();

                  // 1. Calculate Real Session Counts and Highlight 'Current'
                  if (timeFilter === 'Today') {
                    const currentHour = now.getHours();
                    const labelHour = parseInt(label.split(' ')[0]);
                    const isPM = label.includes('PM');
                    const labelHour24 = (labelHour === 12 ? (isPM ? 12 : 0) : labelHour + (isPM ? 12 : 0));

                    isCurrentLabel = currentHour >= labelHour24 && currentHour < labelHour24 + 2;
                    sessionCount = historyRecords.filter(r => {
                      const h = new Date(r.timestamp).getHours();
                      return h >= labelHour24 && h < labelHour24 + 2;
                    }).length;

                  } else if (timeFilter === 'This Week') {
                    const todayShortStr = now.toLocaleDateString('en-US', { weekday: 'short' });
                    isCurrentLabel = label === todayShortStr;
                    sessionCount = historyRecords.filter(r => new Date(r.timestamp).toLocaleDateString('en-US', { weekday: 'short' }) === label).length;

                  } else if (timeFilter === 'This Month') {
                    const currentWeek = Math.ceil(now.getDate() / 7);
                    const weekStr = `Week ${currentWeek > 4 ? 4 : currentWeek}`;
                    isCurrentLabel = label === weekStr;
                    sessionCount = historyRecords.filter(r => {
                      const w = Math.ceil(new Date(r.timestamp).getDate() / 7);
                      return label === `Week ${w > 4 ? 4 : w}`;
                    }).length;

                  } else if (timeFilter === 'All Time') {
                    const currentMonthStr = now.toLocaleDateString('en-US', { month: 'short' });
                    isCurrentLabel = label === currentMonthStr;
                    sessionCount = historyRecords.filter(r => new Date(r.timestamp).toLocaleDateString('en-US', { month: 'short' }) === label).length;
                  }

                  // 2. Scale the height up to 100% based on the max sessions in any bucket
                  const maxSessions = Math.max(historyRecords.length, 1);
                  const barHeight = sessionCount > 0 ? (sessionCount / maxSessions) * 100 * 2 : 0; // x2 so small amounts are still visible

                  // 3. Styling
                  const barColor = isCurrentLabel ? 'bg-[#28667B]' : 'bg-[#28667B]/30';
                  const textStyle = isCurrentLabel
                    ? (theme === 'dark' ? 'text-[#A0F3F5] text-[12px]' : 'text-[#28667B] text-[12px] scale-110')
                    : (theme === 'dark' ? 'text-gray-400 text-[10px]' : 'text-[#586163] text-[10px]');

                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2 relative transition-all duration-300">

                      {/* Highlight label for Current time bucket */}
                      {isCurrentLabel && (
                        <div className="absolute -top-6 flex flex-col items-center">
                          <span className={`text-[9px] font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-[#A0F3F5]' : 'text-[#28667B]'}`}>
                            Current
                          </span>
                        </div>
                      )}

                      {/* SINGLE Bar displaying total sessions, strictly driven by real data */}
                      <div className="flex items-end justify-center w-full h-[204px]">
                        <div
                          className={`w-[60%] rounded-t-md transition-all duration-500 ${barColor}`}
                          style={{ height: `${Math.min(barHeight, 100)}%` }}
                        />
                      </div>

                      <span className={`font-bold transition-all duration-300 ${textStyle}`}>{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 w-full h-auto lg:h-[402px]">
              {/* Dominant Emotions */}
              <div className={`flex-[0.8] border shadow-sm rounded-[16px] p-8 relative overflow-hidden flex flex-col transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#AAB3B6]/20'}`}>
                <div className="flex flex-col mb-8 z-10">
                  <h3 className={`font-['Manrope'] font-bold text-[18px] ${theme === 'dark' ? 'text-white' : 'text-[#1E293B]'}`}>Dominant Emotions</h3>
                  <span className="text-[#64748B] text-[12px]">Filter breakdown</span>
                </div>

                {/* Dynamic Breakdown List */}
                <div className="flex flex-col gap-4 mt-auto z-10 w-full max-w-[240px]">
                  {emotionBreakdown.length > 0 ? emotionBreakdown.slice(0, 3).map((emo, idx) => (
                    <div key={idx} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className={`text-[12px] font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-[#475569]'}`}>{emo.label}</span>
                        <span className={`text-[12px] font-bold ${theme === 'dark' ? 'text-[#A0F3F5]' : 'text-[#0D9488]'}`}>{emo.percentage}%</span>
                      </div>
                      <div className={`w-full h-1 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-[#334155]' : 'bg-[#F1F5F9]'}`}>
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${emo.percentage}%`, backgroundColor: idx === 0 ? '#14B8A6' : idx === 1 ? '#0E7490' : '#64748B' }} />
                      </div>
                    </div>
                  )) : (
                    <span className="text-sm text-gray-400">No data available.</span>
                  )}
                </div>

                <div className="absolute right-8 top-[100px] w-[160px] h-[160px]">
                  <svg className="w-[160px] h-[160px] transform -rotate-90">
                    <circle cx="80" cy="80" r="68" stroke={theme === 'dark' ? '#334155' : '#F1F5F9'} strokeWidth="12" fill="none" />
                    <circle
                      cx="80" cy="80" r="68" stroke="#14B8A6" strokeWidth="12" fill="none"
                      strokeDasharray={`${(primaryEmotion.percentage / 100) * 2 * Math.PI * 68} 999`}
                      strokeLinecap="round" className="transition-all duration-1000 ease-out"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`font-['Manrope'] font-black text-[24px] ${theme === 'dark' ? 'text-white' : 'text-[#155E75]'}`}>{primaryEmotion.percentage}%</span>
                    <span className="text-[#94A3B8] font-bold text-[9px] uppercase tracking-wider">Baseline</span>
                  </div>
                </div>
              </div>

              {/* Anomaly Detection */}
              <div className={`flex-[1.2] rounded-[16px] p-8 relative overflow-hidden flex flex-col justify-center shadow-inner transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0F172A]' : 'bg-[#E2E9EB]'}`}>
                <div className="absolute -right-10 -bottom-10 w-[256px] h-[256px] bg-[#28667B]/10 rounded-full blur-[32px] pointer-events-none" />
                <div className="flex flex-col gap-6 relative z-10 w-full max-w-[546px]">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 bg-[#28667B] rounded-sm flex items-center justify-center">
                      <AlertTriangle className="w-4 h-4 text-white" />
                    </div>
                    <h3 className={`font-['Manrope'] font-bold text-[24px] ${theme === 'dark' ? 'text-white' : 'text-[#185A6E]'}`}>
                      {hasRealData && !latestAnomaly ? "Baseline Stable" : "Clinical Anomaly Detected"}
                    </h3>
                  </div>
                  <div className={`border rounded-lg p-5 flex flex-col gap-3 ${hasRealData && !latestAnomaly ? 'bg-[#4CAF50]/10 border-[#4CAF50]/20' : 'bg-[#FA746F]/20 border-[#A83836]/20'}`}>
                    <div className={`flex items-center gap-3 ${hasRealData && !latestAnomaly ? 'text-[#4CAF50]' : 'text-[#6E0A12]'}`}>
                      <AlertTriangle className={`w-[18px] h-[16px] ${hasRealData && !latestAnomaly ? 'text-[#4CAF50]' : 'text-[#A83836]'}`} />
                      <span className={`font-['Inter'] font-bold text-[14px] ${hasRealData && !latestAnomaly ? 'text-[#4CAF50]' : (theme === 'dark' ? 'text-red-400' : 'text-[#6E0A12]')}`}>
                        {hasRealData && !latestAnomaly ? "No immediate action required." : `Warning: Baseline Deviation (${latestAnomaly?.detected_emotion || 'Unknown'})`}
                      </span>
                    </div>
                    <p className={`text-[12px] leading-[20px] ${hasRealData && !latestAnomaly ? 'text-[#4CAF50]/80' : (theme === 'dark' ? 'text-red-200' : 'text-[#6E0A12]/80')}`}>
                      {hasRealData && !latestAnomaly
                        ? "Our AI has identified that the user is maintaining a stable, positive emotional baseline."
                        : "Our AI has identified patterns deviating significantly from the user’s established baseline. This indicates a sustained period of poor emotional health markers that require clinical review or immediate intervention."}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Figma-Styled Recent Sessions Table */}
            <div className={`w-full border rounded-[12px] flex flex-col overflow-hidden shadow-sm transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#AAB3B6]/20'}`}>

              <div className={`px-8 py-6 border-b flex justify-between items-center transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0F172A]/50 border-[#334155]' : 'bg-[#F7FAFB]/50 border-[#E9EFF1]'}`}>
                <h3 className={`font-['Manrope'] font-bold text-[20px] ${theme === 'dark' ? 'text-white' : 'text-[#28667B]'}`}>Recent Detection Sessions</h3>

                <div className="flex items-center gap-3">

                  {/* 1. SEARCH BAR - FIRST */}
                  <div className={`relative flex items-center border rounded-[8px] w-[136px] h-[38px] overflow-hidden ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#E2E8F0]'}`}>
                    <Search className={`absolute left-3 w-[16.5px] h-[16.5px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#6B7280]'}`} />
                    <input
                      type="text"
                      placeholder="Search..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className={`pl-[35px] pr-2 w-full h-full text-[11px] font-semibold outline-none bg-transparent ${theme === 'dark' ? 'text-white placeholder-gray-500' : 'text-[#475569] placeholder-[#94A3B8]'}`}
                    />
                  </div>

                  {/* 2. DATE RANGE - SECOND (NOW ON THE RIGHT OF SEARCH) */}
                  <div className={`flex items-center gap-2 border rounded-[8px] h-[38px] px-3 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#E2E8F0]'}`}>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      placeholder="Start date"
                      className={`text-[11px] font-semibold outline-none bg-transparent cursor-pointer w-[120px] ${theme === 'dark' ? 'text-gray-300 [color-scheme:dark]' : 'text-[#475569]'}`}
                    />
                    <span className={`text-[11px] font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-[#94A3B8]'}`}>to</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      placeholder="End date"
                      className={`text-[11px] font-semibold outline-none bg-transparent cursor-pointer w-[120px] ${theme === 'dark' ? 'text-gray-300 [color-scheme:dark]' : 'text-[#475569]'}`}
                    />
                  </div>

                  <div className="relative">
                    <button
                      onClick={() => setIsTableFilterOpen(!isTableFilterOpen)}
                      className={`flex items-center justify-center border rounded-[8px] w-[38px] h-[38px] transition ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155] hover:bg-[#334155]' : 'bg-white border-[#E2E8F0] hover:bg-gray-50'}`}
                    >
                      <Filter className={`w-[16.5px] h-[16.5px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`} />
                    </button>
                    {isTableFilterOpen && (
                      <div className={`absolute right-0 mt-2 w-[160px] rounded-lg shadow-xl border overflow-hidden z-50 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-gray-200'}`}>
                        {["All Emotions", ...uniqueEmotions].map(emo => (
                          <button
                            key={emo}
                            onClick={() => { setTableEmotionFilter(emo); setIsTableFilterOpen(false); }}
                            className={`block w-full text-left px-4 py-3 text-[12px] font-bold transition-colors ${tableEmotionFilter === emo ? (theme === 'dark' ? 'bg-[#334155] text-[#A0F3F5]' : 'bg-[#E9EFF1] text-[#28667B]') : (theme === 'dark' ? 'text-white hover:bg-[#334155]/50' : 'text-[#586163] hover:bg-gray-50')}`}
                          >
                            {emo}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={downloadHistoryReport}
                    className={`flex items-center justify-center gap-[4px] px-[12px] border rounded-[8px] h-[38px] transition ml-2 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155] hover:bg-[#334155]' : 'bg-white border-[#E2E8F0] hover:bg-gray-50'}`}
                  >
                    <Download className={`w-[14px] h-[14px] ${theme === 'dark' ? 'text-white' : 'text-[#28667B]'}`} />
                    <span className={`font-['Inter'] font-bold text-[14px] ${theme === 'dark' ? 'text-white' : 'text-[#28667B]'}`}>Export</span>
                  </button>
                </div>
              </div>

              <div className="w-full flex flex-col">
                <div className={`flex items-center px-8 py-4 transition-colors duration-500 ${theme === 'dark' ? 'bg-[#334155]' : 'bg-[#EFF4F6]'}`}>
                  <div className={`w-[200px] text-[10px] font-bold uppercase tracking-[1px] ${theme === 'dark' ? 'text-gray-300' : 'text-[#586163]'}`}>Date & Time</div>
                  <div className={`w-[200px] text-[10px] font-bold uppercase tracking-[1px] ${theme === 'dark' ? 'text-gray-300' : 'text-[#586163]'}`}>Dominant Emotion</div>
                  <div className={`w-[160px] text-[10px] font-bold uppercase tracking-[1px] ${theme === 'dark' ? 'text-gray-300' : 'text-[#586163]'}`}>Confidence</div>
                  <div className={`w-[140px] text-[10px] font-bold uppercase tracking-[1px] ${theme === 'dark' ? 'text-gray-300' : 'text-[#586163]'}`}>Data Source</div>
                  <div className={`flex-1 text-[10px] font-bold uppercase tracking-[1px] text-right pr-2 ${theme === 'dark' ? 'text-gray-300' : 'text-[#586163]'}`}>Actions</div>
                </div>

                {paginatedRecords.length > 0 ? (
                  paginatedRecords.map((record) => {
                    const hasAnomalyAlert = record.anomaly_alert && record.anomaly_alert.length > 0;
                    return (
                      <div key={record.record_id} className={`flex items-center px-8 py-5 border-b transition-colors duration-500 relative ${theme === 'dark' ? 'border-[#334155] hover:bg-[#334155]/50' : 'border-[#E9EFF1] hover:bg-gray-50'}`}>
                        {hasAnomalyAlert && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#A83836]" />}
                        <div className="w-[200px] flex flex-col pl-2">
                          <span className={`font-semibold text-[14px] ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>
                            {new Date(record.timestamp).toLocaleDateString()}
                          </span>
                          <span className="text-[#586163] text-[10px]">{new Date(record.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div className="w-[200px] flex items-center">
                          <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${hasAnomalyAlert ? 'bg-[#FA746F]/20' : 'bg-[#ABE5FE]/30'}`}>
                            <div className={`w-2.5 h-2.5 rounded-full ${hasAnomalyAlert ? 'bg-[#A83836]' : 'bg-[#185A6E]'}`} />
                            <span className={`font-bold text-[12px] ${hasAnomalyAlert ? 'text-[#A83836]' : 'text-[#185A6E]'}`}>
                              {record.emotion_label}
                            </span>
                          </div>
                        </div>
                        <div className="w-[160px] flex items-center">
                          <span className={`font-bold text-[13px] ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>
                            {record.confidence_score}%
                          </span>
                        </div>
                        <div className="w-[140px] flex items-center gap-2">
                          {record.detection_type === 'IMAGE' ? (
                            <ImageIcon className="w-4 h-4 text-[#586163]" />
                          ) : ['LIVE_VOICE', 'UPLOAD_AUDIO'].includes(record.detection_type) ? (
                            <Mic className="w-4 h-4 text-[#586163]" />
                          ) : (
                            <Video className="w-4 h-4 text-[#586163]" />
                          )}
                          <span className={`font-medium text-[12px] font-mono ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>{record.detection_type}</span>
                        </div>
                        <div className="flex-1 flex justify-end gap-3">
                          <button onClick={() => downloadSingleReport(record)} title="Download Record Report" className="w-9 h-9 bg-[#28667B]/10 rounded-lg flex items-center justify-center hover:bg-[#28667B]/20 transition">
                            <Download className="w-4 h-4 text-[#28667B]" />
                          </button>
                          <button onClick={() => deleteRecord(record.record_id)} title="Delete Record" className="w-9 h-9 bg-red-500/10 rounded-lg flex items-center justify-center hover:bg-red-500/20 transition">
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className={`flex items-center px-8 py-10 transition-colors duration-500 ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>
                    <div className="w-full text-center font-medium">No results match your search or filter.</div>
                  </div>
                )}

                {/* Live Pagination Section */}
                <div className={`px-8 py-6 border-t flex justify-between items-center transition-colors duration-500 ${theme === 'dark' ? 'border-[#334155] bg-[#0F172A]/50' : 'border-[#E9EFF1] bg-[#F7FAFB]/50'}`}>
                  <span className={`text-[12px] font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>
                    Showing {filteredRecords.length > 0 ? startIndex + 1 : 0} to {Math.min(endIndex, filteredRecords.length)} of {filteredRecords.length} entries
                  </span>

                  <div className="flex items-center gap-1">
                    {/* Previous Button */}
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : (theme === 'dark' ? 'hover:bg-[#334155] cursor-pointer' : 'hover:bg-gray-100 cursor-pointer')}`}
                    >
                      <ChevronLeft className={`w-4 h-4 ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`} />
                    </button>

                    {/* Dynamic Page Numbers with Ellipsis */}
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                      .map((page, index, array) => {
                        const showEllipsis = index > 0 && page - array[index - 1] > 1;
                        return (
                          <React.Fragment key={page}>
                            {showEllipsis && <span className={`px-2 text-[16px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>...</span>}
                            <button
                              onClick={() => setCurrentPage(page)}
                              className={`w-8 h-8 rounded-lg text-[12px] flex items-center justify-center transition ${currentPage === page
                                  ? 'bg-[#28667B] text-[#F2FAFF] font-bold'
                                  : (theme === 'dark' ? 'hover:bg-[#334155] text-gray-400 font-medium' : 'hover:bg-gray-100 text-[#586163] font-medium')
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
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${currentPage === totalPages || totalPages === 0 ? 'opacity-50 cursor-not-allowed' : (theme === 'dark' ? 'hover:bg-[#334155] cursor-pointer' : 'hover:bg-gray-100 cursor-pointer')}`}
                    >
                      <ChevronRight className={`w-4 h-4 ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`} />
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