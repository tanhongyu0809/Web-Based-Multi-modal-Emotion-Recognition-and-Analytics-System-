"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Webcam from "react-webcam";
import { createClient } from "../../utils/supabase/client";
import {
  Camera,
  Image as ImageIcon,
  Mic,
  History,
  Settings,
  HelpCircle,
  Video,
  Bell,
  Square,
  CheckCircle2,
  LogOut,
  AlertCircle,
  AlertTriangle,
  Download,
  Zap,
  Cpu,
  Bot,
  Sparkles,
  Check, X as CloseIcon,
  Moon,
  Sun
} from "lucide-react";

export default function LiveCameraInterface() {
  const router = useRouter();
  const supabase = createClient();

  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  const [isRecording, setIsRecording] = useState(false);
  const [activeModel, setActiveModel] = useState("adamw");
  const [isSwitchingModel, setIsSwitchingModel] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [theme, setTheme] = useState('light');
  const [isLoading, setIsLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // --- ADD THIS MISSING FUNCTION ---
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('app-theme', newTheme);
  };

  // AI & STREAMING STATES
  const webcamRef = useRef<Webcam>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [results, setResults] = useState<any>(null);
  const latestResults = useRef<any>(null); // Used to safely grab data for DB saving
  const [statusMessage, setStatusMessage] = useState("Standing By");
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null);

  // === NEW: GEMINI AI STATES ===
  const [geminiMessage, setGeminiMessage] = useState("I'm here to support you! Let's start the camera to see how you're feeling.");
  const [isGeminiLoading, setIsGeminiLoading] = useState(false);
  const [currentStableEmotion, setCurrentStableEmotion] = useState<string | null>(null);
  const [isWidgetOpen, setIsWidgetOpen] = useState(true);

  // ==========================================
  // MODEL SWITCHING HANDLER
  // ==========================================
  const handleModelSwitch = async () => {
    // ALLOW BOTH PLUS AND ENTERPRISE
    if (activeModel === "adamw" && profile?.subscription_tier === 'FREE') {
      setShowUpgradeModal(true); // Pop up the paywall!
      return;
    }

    if (isSwitchingModel) return;
    setIsSwitchingModel(true);

    const targetModel = activeModel === "adamw" ? "resnet152" : "adamw";

    try {
      const backendUrl = process.env.NEXT_PUBLIC_FASTAPI_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
      let response: Response | null = null;
      if (backendUrl) {
        try {
          response = await fetch(`${backendUrl.replace(/\/$/, '')}/api/model/switch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model_name: targetModel })
          });
          if (!response.ok) response = null;
        } catch (e) { response = null; }
      }
      if (!response) {
        response = await fetch("http://127.0.0.1:8000/api/model/switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model_name: targetModel })
        });
      }

      const data = await response.json();
      if (data.status === "success") {
        setActiveModel(data.active_model);
      } else {
        console.error("Model switch failed:", data.error);
      }
    } catch (error) {
      console.error("Error connecting to backend:", error);
    } finally {
      setIsSwitchingModel(false);
    }
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

  // ==========================================
  // GEMINI AI INTEGRATION
  // ==========================================
  const generateGeminiResponse = async (emotion: string) => {
    // ALLOW BOTH PLUS AND ENTERPRISE
    if (profile?.subscription_tier === 'FREE') {
      setGeminiMessage("Unlock Gemini Core Insights by upgrading your plan.");
      return;
    }

    setIsGeminiLoading(true);

    try {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) {
        setGeminiMessage("API key missing. Please add NEXT_PUBLIC_GEMINI_API_KEY to your .env.local file.");
        return;
      }

      const prompt = `Act as an empathetic AI health assistant for a system analyzing emotional states. The user (${profile?.username || 'the patient'}) is currently exhibiting a stable '${emotion}' emotional state based on facial telemetry. Provide a very brief, natural, and supportive 1-2 sentence response. If it's a negative emotion, be comforting. If it's positive, be encouraging. Do not mention that you are an AI.`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Google API Error:", errorData);
        setGeminiMessage(`API Error: ${errorData.error?.message || 'Unknown error'}`);
        return;
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) setGeminiMessage(text.replace(/"/g, ''));

    } catch (error) {
      console.error("Gemini API Error:", error);
      setGeminiMessage("I'm having trouble connecting to my neural core right now.");
    } finally {
      setIsGeminiLoading(false);
    }
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
        window.location.href = '/dashboard/live'; 
      }
    };
    upgradeUser();
  }

  if (query.get("upgrade") === "cancelled") {
    alert("Checkout was cancelled.");
    window.location.href = '/dashboard/live'; 
  }
}, [supabase, router]);

  // Track Emotion Stability (Wait 4 seconds before triggering Gemini)
  useEffect(() => {
    // Only track if we are actively recording and we have a label
    if (!isRecording || !results?.primary?.label) return;

    // Grab the specific string (e.g., "Happy") so we don't depend on the whole object
    const detectedEmotion = results.primary.label;

    // If the emotion is already what we consider "stable", do nothing
    if (detectedEmotion === currentStableEmotion) return;

    // Start a timer to see if they HOLD this emotion
    const timer = setTimeout(() => {
      setCurrentStableEmotion(detectedEmotion);
      generateGeminiResponse(detectedEmotion);
    }, 4000);

    // Cleanup: If the emotion changes BEFORE 4 seconds, cancel the timer
    return () => clearTimeout(timer);

    // IMPORTANT: We specifically listen to the label string, not the results object!
  }, [results?.primary?.label, isRecording, currentStableEmotion]);

  // 1. LOAD THEME
  useEffect(() => {
    setIsClient(true);
    const savedTheme = localStorage.getItem('app-theme');
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  // 2. LOAD PROFILE
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
          .select("username, role, profile_picture, subscription_tier, is_active, subscription_end_date")
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
          // ✅ CRITICAL FIX: Add user_id to profile
          setProfile({
            ...data,
            user_id: user.id  // <-- This is the key fix!
          });
        } else {
          console.log("No profile found in database");
          const username = user.user_metadata?.username || user.email?.split('@')[0] || "User";
          setProfile({
            username: username,
            role: "USER",
            user_id: user.id  // <-- Add user_id here too
          });
        }
      } catch (error) {
        console.error("Failed to load user:", error);
        setProfile({
          username: "User",
          role: "USER",
          user_id: null
        });
      } finally {
        setIsLoading(false);
      }
    }
    loadUserProfile();
  }, [router]);

  // ==========================================
  // GLOBAL NOTIFICATION LISTENER (USER SIDE)
  // ==========================================
  const [totalUnread, setTotalUnread] = useState(0);

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

    const channel = supabase.channel('user-global-bell')
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const getInitials = (name: string) => {
    if (!name) return "U";
    return name.substring(0, 2).toUpperCase();
  };

  // ==========================================
  // TRUE REAL-TIME WEBSOCKET STREAM
  // ==========================================
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isRecording) {
      setStatusMessage("Connecting to stream...");

      // 1. Connect to Python Backend
      const baseBackendUrl = process.env.NEXT_PUBLIC_FASTAPI_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";
      const wsUrl = baseBackendUrl.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://').replace(/\/$/, '');
      wsRef.current = new WebSocket(`${wsUrl}/ws/analyze/live`);

      wsRef.current.onopen = () => {
        setStatusMessage("Active Monitoring");

        // 2. Send frames at 5 FPS
        interval = setInterval(() => {
          if (webcamRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
            const imageSrc = webcamRef.current.getScreenshot();
            if (imageSrc) {
              wsRef.current.send(imageSrc);
            }
          }
        }, 200);
      };

      // 3. Receive predictions
      wsRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.error) {
          setStatusMessage(data.error);
          setResults(null);
          latestResults.current = null; // Sync ref
        } else {
          setStatusMessage("Active Monitoring");
          setResults(data);
          latestResults.current = data; // Sync ref for database saver
        }
      };

      wsRef.current.onerror = () => {
        if (wsUrl !== "ws://127.0.0.1:8000") {
          console.log("Cloud WebSocket failed or asleep, falling back to local uvicorn ws://127.0.0.1:8000...");
          wsRef.current = new WebSocket("ws://127.0.0.1:8000/ws/analyze/live");
          wsRef.current.onopen = () => setStatusMessage("Active Monitoring (Localhost)");
          wsRef.current.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (!data.error) { setResults(data); latestResults.current = data; }
          };
        }
      };

      wsRef.current.onclose = () => {
        setStatusMessage("Stream Disconnected");
      };

    } else {
      setStatusMessage("Standing By");
      setResults(null);
      latestResults.current = null;
      if (wsRef.current) {
        wsRef.current.close();
      }
      clearInterval(interval!);
    }

    return () => {
      clearInterval(interval!);
      if (wsRef.current) wsRef.current.close();
    };
  }, [isRecording]);

  // ==========================================
  // DATABASE SAVING (THROTTLED TO 5 SECONDS)
  // ==========================================
  useEffect(() => {
    let dbInterval: NodeJS.Timeout;

    if (isRecording) {
      dbInterval = setInterval(async () => {
        // 1. Take a "Snapshot" so it can't change while we wait for the database
        const snapshot = latestResults.current;

        if (snapshot && snapshot.primary) {
          try {
            const { data: userData } = await supabase.auth.getUser();

            if (userData.user) {
              // 2. INSTANTLY generate a permanent ID for this snapshot
              const snapshotId = crypto.randomUUID();

              // 3. Save it to our safe state IMMEDIATELY so the PDF button can use it right now
              setSavedSessionId(snapshotId);

              // 4. Send that exact ID to the database (No need for .select() anymore!)
              const { error: dbError } = await supabase.from('emotion_record').insert({
                record_id: snapshotId,
                user_id: userData.user.id,
                detection_type: 'LIVE_VIDEO',
                emotion_label: snapshot.primary.label,
                confidence_score: snapshot.primary.score
              });

              if (dbError) {
                console.error("Failed to save live snapshot:", dbError);
              } else {
                console.log("Live stream snapshot securely saved with ID:", snapshotId);
              }
            }
          } catch (err) {
            console.error("Error during live save:", err);
          }
        }
      }, 5000);
    }

    return () => {
      if (dbInterval) clearInterval(dbInterval);
    };
  }, [isRecording, activeModel, supabase]);

  // ==========================================
  // HELPER: Generate Formal PDF/Print Report (FIXED)
  // ==========================================
  const downloadReport = async () => {
    // ALLOW BOTH PLUS AND ENTERPRISE
    if (profile?.subscription_tier === 'FREE') {
      setShowUpgradeModal(true);
      return;
    }

    if (!results) {
      alert("No analysis data available to download yet. Please wait for the system to detect a face.");
      return;
    }

    // 1. Use the EXISTING savedSessionId from the database, or generate one if not available
    const snapshotId = savedSessionId || crypto.randomUUID();
    const displayId = "SEQ-" + snapshotId.substring(0, 8).toUpperCase();

    const currentDate = new Date().toLocaleString();
    const actualModelUsed = activeModel;
    const userName = profile?.username || "Unknown Patient";

    // 2. Only save to DB if we don't already have a savedSessionId (avoid duplicates)
    if (!savedSessionId) {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          await supabase.from('emotion_record').insert({
            record_id: snapshotId,
            user_id: userData.user.id,
            detection_type: 'LIVE_VIDEO',
            emotion_label: results.primary.label,
            confidence_score: results.primary.score
          });
          // Update the savedSessionId for future downloads in this session
          setSavedSessionId(snapshotId);
        }
      } catch (err) {
        console.error("Failed to sync download to history:", err);
      }
    }

    // 3. Generate the HTML with the guaranteed synced ID
    const reportHTML = `
      <html>
        <head>
          <title>Emotion Analysis Report - ${displayId}</title>
          <style>
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              color: #2B3436; 
              padding: 40px;
              line-height: 1.6;
            }
            .header { 
              text-align: center; 
              border-bottom: 3px solid #28667B; 
              padding-bottom: 20px; 
              margin-bottom: 30px; 
            }
            .header h1 { margin: 0; font-size: 22px; color: #28667B; text-transform: uppercase; letter-spacing: 1px;}
            .header h2 { margin: 5px 0 0 0; font-size: 16px; color: #586163; font-weight: normal; }
            
            .meta-box {
              background-color: #F7FAFB;
              border: 1px solid #E2E9EB;
              padding: 15px;
              border-radius: 8px;
              margin-bottom: 30px;
            }
            .meta-box p { margin: 5px 0; font-size: 14px; }
            .meta-box strong { color: #28667B; display: inline-block; width: 120px; }

            h3 { color: #28667B; border-bottom: 1px solid #E2E9EB; padding-bottom: 5px; }

            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-top: 15px; 
              margin-bottom: 40px;
            }
            th, td { 
              border: 1px solid #DBE4E6; 
              padding: 12px 15px; 
              text-align: left; 
              font-size: 14px;
            }
            th { 
              background-color: #28667B; 
              color: white; 
              text-transform: uppercase;
              font-size: 12px;
              letter-spacing: 0.5px;
            }
            tr:nth-child(even) { background-color: #F7FAFB; }
            
            .highlight { font-weight: bold; color: #A83836; }

            .footer { 
              position: fixed; 
              bottom: 30px; 
              left: 40px;
              right: 40px;
              text-align: center; 
              font-size: 10px; 
              color: #737C7F; 
              border-top: 1px solid #E2E9EB; 
              padding-top: 15px; 
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            
            @media print {
              body { -webkit-print-color-adjust: exact; }
              .footer { position: fixed; bottom: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Web-Based Multi-Modal Emotion Recognition System</h1>
            <h2>Real-Time Camera Report</h2>
          </div>

          <div class="meta-box">
            <p><strong>User Name:</strong> ${userName}</p>
            <p><strong>Session ID:</strong> ${displayId}</p>
            <p><strong>Date & Time:</strong> ${currentDate}</p>
            <p><strong>AI Engine:</strong> ${actualModelUsed === 'adamw' ? 'ResNet34 (Instant Mode)' : 'ResNet152 (Expert Mode)'}</p>
          </div>

          <h3>Diagnostic Matrix</h3>
          <table>
            <thead>
              <tr>
                <th>Marker Level</th>
                <th>Detected Emotion</th>
                <th>Confidence Score</th>
                <th>Clinical Note</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Primary Target</strong></td>
                <td><strong>${results.primary.label}</strong></td>
                <td class="highlight">${results.primary.score.toFixed(1)}%</td>
                <td>Dominant state detected.</td>
              </tr>
              <tr>
                <td>Secondary Marker</td>
                <td>${results.secondary.label}</td>
                <td>${results.secondary.score.toFixed(1)}%</td>
                <td>Underlying sub-expression.</td>
              </tr>
              <tr>
                <td>Tertiary Marker</td>
                <td>${results.tertiary.label}</td>
                <td>${results.tertiary.score.toFixed(1)}%</td>
                <td>Trace micro-expression.</td>
              </tr>
              <tr>
                <td>Trace Element</td>
                <td>${results.trace.label}</td>
                <td>${results.trace.score.toFixed(1)}%</td>
                <td>Negligible impact.</td>
              </tr>
            </tbody>
          </table>

          <h3>System Interpretation</h3>
          <p style="font-size: 14px; color: #586163;">
            Based on the live telemetry, the subject is primarily exhibiting a <strong>${results.primary.label}</strong> emotional state. 
            This assessment was generated instantly via the active monitoring WebSockets stream and processed through our proprietary neural engine.
          </p>

          <div class="footer">
            &copy; 2026 Web-Based Multi-Modal Emotion Recognition and Analytics System. <br/>
            Strictly Confidential. Generated automatically via secure live-stream analysis.
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
    } else {
      alert("Please allow pop-ups to download the report.");
    }
  };

  // ==========================================
  // HELPER: Dynamic Alert Box
  // ==========================================
  const getAlertContent = (label: string) => {
    const lowerLabel = label.toLowerCase();
    if (['happy', 'calm', 'neutral', 'joy'].some(e => lowerLabel.includes(e))) {
      return {
        bg: "bg-[#4CAF50]",
        text: "text-white",
        icon: <CheckCircle2 className="w-[25px] h-[25px] text-white" />,
        title: "System Alert",
        headline: "Positive Emotional Baseline",
        desc: `Participant is maintaining a stable '${label}' state.`
      };
    } else if (['surprise', 'fear', 'stress', 'anxiety'].some(e => lowerLabel.includes(e))) {
      return {
        bg: "bg-[#FFC107]",
        text: "text-[#614A00]",
        icon: <AlertCircle className="w-[25px] h-[25px] text-[#614A00]" />,
        title: "Visual System Alert",
        headline: "Elevated Arousal Detected",
        desc: `System flagged a '${label}' response. Observe for potential environmental triggers.`
      };
    } else {
      return {
        bg: "bg-[#DC2626]",
        text: "text-white",
        icon: <AlertTriangle className="w-[25px] h-[25px] text-white" />,
        title: "Critical System Alert",
        headline: "Negative Micro-Expression",
        desc: `High-confidence '${label}' metric. Secondary clinical review recommended.`
      };
    }
  };

  // ==========================================
  // STRIPE CHECKOUT HANDLER
  // ==========================================
  const handleUpgradePayment = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return alert("Please log in to upgrade.");

      // Change button text to show loading
      const btn = document.getElementById('upgrade-btn');
      if (btn) btn.innerText = "Redirecting to Secure Checkout...";

      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          email: user.email
        }),
      });

      const data = await response.json();

      if (data.url) {
        // Redirect the user to the Stripe Checkout page!
        window.location.href = data.url;
      } else {
        alert("Failed to create checkout session.");
      }
    } catch (error) {
      console.error("Payment error:", error);
    }
  };

  if (!isClient) {
    return null;
  }

  if (isLoading) {
    return (
      <div className={`flex h-screen w-full items-center justify-center font-bold transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0F172A] text-[#28667B]' : 'bg-[#F7FAFB] text-[#28667B]'}`}>
        Loading...
      </div>
    );
  }

  return (
    <div className={`flex h-screen w-full font-sans overflow-hidden transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0F172A] text-[#94A3B8]' : 'bg-[#F7FAFB] text-[#586163]'}`}>

      {/* ================================================================= */}
      {/* ASIDE - SIDE NAVIGATION (DESKTOP)                                 */}
      {/* ================================================================= */}
      <aside className={`w-[256px] lg:w-[288px] border-r flex flex-col justify-between py-6 shrink-0 h-full z-20 transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-[#EFF4F6] border-[#AAB3B6]/15'}`}>
        <div className="flex flex-col gap-8 px-6">
          <h1 className="text-[#28667B] font-['Manrope'] font-extrabold text-[20px] leading-[25px]">
            Web-Based Multi-modal Emotion Recognition and Analytics System
          </h1>

          <nav className="flex flex-col gap-2">
            <Link href="/dashboard/live" className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] ${theme === 'dark' ? 'bg-[#0F172A] border border-[#334155]' : 'bg-white'}`}>
              <Camera className={`w-5 h-5 ${theme === 'dark' ? 'text-white' : 'text-[#28667B]'}`} />
              <span className={`font-bold text-[14px] ${theme === 'dark' ? 'text-white' : 'text-[#28667B]'}`}>Real-Time Camera</span>
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

      {/* ================================================================= */}
      {/* MAIN CONTENT STAGE                                                */}
      {/* ================================================================= */}
      <main className={`flex-1 flex flex-col h-full overflow-hidden relative transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0F172A]' : 'bg-[#F7FAFB]'}`}>

        {/* Top App Bar Navigation */}
        <header className={`h-[72px] backdrop-blur-md flex items-center justify-between px-8 shrink-0 z-10 border-b transition-colors duration-500 ${theme === 'dark' ? 'bg-[#1E293B]/80 border-[#334155]' : 'bg-white/80 border-[#E9EFF1]'}`}>
          <div className="flex-1" />

          <div className="flex items-center gap-6">
            
            {/* 1. Notification Bell - Updated to trigger chat open immediately */}
            <button
              onClick={async () => {
                // Mark messages as read before navigating
                if (profile?.user_id) {
                  const now = Date.now();
                  localStorage.setItem(`user_read_${profile.user_id}`, String(now));
                  setTotalUnread(0);
                }
                router.push('/help');
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

              {/* 2. Dynamic Subscription Badge - COMPLETE FIX */}
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

              {/* 5. THEME TOGGLE BUTTON (Far right) */}
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
        <div className="flex-1 overflow-y-auto p-6 lg:p-8 flex flex-col items-center">
          <div className="w-full max-w-[976px] flex flex-col gap-6 pb-12">

            {/* Header Section */}
            <div className="flex flex-col gap-2">
              <h2 className={`font-['Manrope'] font-bold text-[36px] leading-[40px] tracking-[-0.9px] ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>
                Real-Time Camera Emotion Detection
              </h2>
              <p className={`text-[18px] leading-[28px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>
                Leverage live camera input for instantaneous emotion recognition and analysis.
              </p>
            </div>

            {/* ============================================================ */}
            {/* CENTRAL VIDEO ANALYSIS MODULE                                */}
            {/* ============================================================ */}
            <div className="relative w-full h-[665px] bg-[#0B0F10] rounded-xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] overflow-hidden flex flex-col">

              {/* WEBCAM FEED */}
              <div className="absolute inset-0 bg-[#1A1C1E] flex items-center justify-center overflow-hidden">
                {isRecording ? (
                  <Webcam
                    ref={webcamRef}
                    audio={false}
                    screenshotFormat="image/jpeg"
                    videoConstraints={{ facingMode: "user" }}
                    className="w-full h-full object-cover opacity-80"
                    mirrored={true}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <Camera className="w-24 h-24 text-white/10" />
                    <span className="text-white/40 font-bold uppercase tracking-widest text-sm">Camera Offline</span>
                  </div>
                )}
              </div>

              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />

              {/* Top Status Bar (Within Video) */}
              <div className="absolute top-6 left-6 flex flex-col gap-2 z-10">
                <div className="flex gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-[#28667B]/90 backdrop-blur-md rounded-full">
                    {isRecording && <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
                    <span className="text-[#F2FAFF] text-[10px] font-bold uppercase tracking-wider">
                      {isRecording ? "Live" : "Standby"}
                    </span>
                  </div>
                  <div className="flex items-center px-3 py-1 bg-white/20 border border-white/10 backdrop-blur-md rounded-full">
                    <span className="text-white text-[10px] font-bold tracking-wider">
                      {activeModel === 'adamw' ? 'RESNET-34 CORE' : 'RESNET-152 CORE'}
                    </span>
                  </div>
                </div>
                <h3 className="text-white/90 font-['Manrope'] font-bold text-[18px]">
                  Session: {statusMessage}
                </h3>
              </div>

              {/* Dynamic Confidence Metric Panel (Left Side) */}
              {results && isRecording && (
                <div className="absolute top-[140px] left-6 flex flex-col gap-2 z-10 transition-opacity duration-300">
                  <div className="bg-white/10 border border-white/20 backdrop-blur-md rounded-xl p-3 flex gap-4 shadow-xl">
                    <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                      <span className="text-white font-serif text-[24px]">
                        {results.primary.label === 'Happy' ? ':)' : results.primary.label === 'Sad' ? ':(' : ':|'}
                      </span>
                    </div>
                    <div className="flex flex-col justify-center">
                      <span className="text-white font-['Manrope'] font-bold text-[14px]">Primary Target</span>
                      <div className="w-24 h-1.5 bg-white/20 rounded-full mt-1.5 overflow-hidden">
                        <div className="h-full bg-[#A0F3F5] rounded-full transition-all duration-200" style={{ width: `${results.primary.score}%` }} />
                      </div>
                      <span className="text-[#9DD7EF] text-[10px] font-semibold mt-1">{results.primary.score.toFixed(1)}% Confidence</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Right Side Analysis Overlay (Emotion Labeling Card) */}
              <div className="absolute right-6 top-6 w-[320px] h-[314px] bg-white/10 border border-white/20 backdrop-blur-md rounded-[12px] p-[21px] shadow-2xl z-10 flex flex-col transition-opacity duration-300">
                <h3 className="text-white text-[10px] font-bold uppercase tracking-[1px] mb-[20px] opacity-80">
                  Real-Time Matrix
                </h3>

                <div className="flex flex-col gap-[12px] flex-1">
                  {['primary', 'secondary', 'tertiary', 'trace'].map((key, index) => {
                    const label = (results && isRecording) ? results[key].label : `Metric ${index + 1}`;
                    const score = (results && isRecording) ? results[key].score : 0;

                    return (
                      <div key={key} className="flex flex-col gap-1">
                        <div className={`flex justify-between items-center text-[11px] ${index === 0 ? 'font-bold text-white' : 'font-normal text-white/70'}`}>
                          <span>{label}</span>
                          <span className={index === 0 ? 'text-[#A0F3F5]' : ''}>{score.toFixed(1)}%</span>
                        </div>
                        <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-200 ${index === 0 ? 'bg-[#A0F3F5]' : index === 1 ? 'bg-[#006A6C]' : index === 2 ? 'bg-[#3A6573]' : 'bg-[#A83836]'}`}
                            style={{ width: `${score}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>

                <button
                  onClick={downloadReport}
                  className="w-full h-[40px] mt-auto border-2 border-white/20 rounded-[8px] flex justify-center items-center gap-2 hover:bg-white/10 transition"
                >
                  <Download className="w-[12px] h-[12px] text-white" />
                  <span className="text-white font-['Manrope'] font-bold text-[12px]">Download Analysis Report</span>
                </button>
              </div>

              {/* Signal Visualization / Toolbar (Lower Center) */}
              <div className="absolute bottom-6 left-[25%] right-[25%] lg:left-[30%] lg:right-[30%] h-[78px] bg-black/40 border border-white/20 backdrop-blur-md rounded-2xl flex items-center justify-between px-4 shadow-2xl z-10">

                {/* Left: Stop Button (Fixed Width to balance layout) */}
                <button
                  onClick={() => {
                    setIsRecording(false);
                    setCurrentStableEmotion(null); // Reset the AI tracker!
                  }}
                  className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg hover:bg-white/10 transition group w-[110px]"
                >
                  <Square className="w-6 h-6 text-[#A83836] fill-[#A83836]/20 group-hover:fill-[#A83836]/40 transition" />
                  <span className="text-[#A83836] font-bold text-[9px] tracking-[0.9px] uppercase">Stop</span>
                </button>

                {/* Center: Record Button */}
                <div
                  onClick={() => setIsRecording(true)}
                  className={`w-[45px] h-[45px] rounded-full flex items-center justify-center shadow-lg border border-white/20 cursor-pointer hover:scale-105 transition transform shrink-0 ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-[#28667B]'}`}
                >
                  <Video className="w-5 h-5 text-white" />
                </div>

                {/* Right: Model Switch Button (Fixed Width to balance layout) */}
                <button
                  onClick={handleModelSwitch}
                  disabled={isSwitchingModel}
                  className="flex flex-col items-center justify-center gap-[2px] p-2 rounded-lg hover:bg-white/10 transition group w-[110px]"
                >
                  {activeModel === 'adamw' ? (
                    <>
                      <Zap className={`w-5 h-5 mb-0.5 ${isSwitchingModel ? 'text-white/30' : 'text-[#F59E0B] group-hover:text-[#FBBF24]'}`} />
                      <span className="text-white font-bold text-[10px] uppercase tracking-wide">Instant</span>
                      <span className="text-white/50 font-medium text-[7px] uppercase tracking-widest text-center">Rapid Verdict</span>
                    </>
                  ) : (
                    <>
                      <Cpu className={`w-5 h-5 mb-0.5 ${isSwitchingModel ? 'text-white/30' : 'text-[#A855F7] group-hover:text-[#C084FC]'}`} />
                      <span className="text-white font-bold text-[10px] uppercase tracking-wide">Expert</span>
                      <span className="text-white/50 font-medium text-[7px] uppercase tracking-widest text-center">Flawless precision</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* ============================================================ */}
            {/* DYNAMIC SUGGESTION MODULE (Compact Suggestion Box)           */}
            {/* ============================================================ */}
            {results && isRecording && (
              <div className={`w-full border border-white/10 rounded-xl p-6 flex items-center gap-4 shadow-sm transition-colors duration-500 mt-4 ${getAlertContent(results.primary.label).bg}`}>
                <div className="w-[57px] h-[57px] bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                  {getAlertContent(results.primary.label).icon}
                </div>
                <div className="flex flex-col gap-1">
                  <span className={`font-['Manrope'] font-bold text-[12px] tracking-[0.6px] uppercase ${getAlertContent(results.primary.label).text}`}>
                    {getAlertContent(results.primary.label).title}
                  </span>
                  <span className={`font-['Manrope'] font-extrabold text-[18px] leading-[22px] ${getAlertContent(results.primary.label).text}`}>
                    {getAlertContent(results.primary.label).headline}
                  </span>
                  <span className={`text-[14px] ${getAlertContent(results.primary.label).text} opacity-90`}>
                    {getAlertContent(results.primary.label).desc}
                  </span>
                </div>
              </div>
            )}

            {/* Footer */}
            <footer className="w-full py-8 mt-4 border-t border-[#E2E8F0]/20 flex justify-center">
              <p className="text-[#737C7F] text-[12px] font-semibold tracking-[2.4px] uppercase text-center">
                © 2026 WEB-BASED MULTI-MODAL EMOTION RECOGNITION AND ANALYTICS SYSTEM.
              </p>
            </footer>

          </div>
        </div>

        {/* ============================================================ */}
        {/* FLOATING GEMINI AI ASSISTANT WIDGET                          */}
        {/* ============================================================ */}
        <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end gap-4">

          {/* Chat Bubble */}
          <div className={`transition-all duration-300 origin-bottom-right ${isWidgetOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'}`}>
            <div className={`w-[320px] border rounded-2xl p-5 shadow-2xl relative ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#E9EFF1]'}`}>
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-500/10">
                <Sparkles className="w-4 h-4 text-[#14B8A6]" />
                <span className={`text-[11px] font-extrabold uppercase tracking-widest ${theme === 'dark' ? 'text-[#A0F3F5]' : 'text-[#28667B]'}`}>
                  Gemini Core Insights
                </span>
              </div>
              <p className={`text-[14px] leading-relaxed font-medium min-h-[40px] flex items-center ${theme === 'dark' ? 'text-gray-300' : 'text-[#586163]'}`}>
                {isGeminiLoading ? (
                  <span className="flex items-center gap-2 animate-pulse">
                    <span className="w-2 h-2 bg-[#14B8A6] rounded-full"></span>
                    <span className="w-2 h-2 bg-[#14B8A6] rounded-full animation-delay-200"></span>
                    <span className="w-2 h-2 bg-[#14B8A6] rounded-full animation-delay-400"></span>
                  </span>
                ) : (
                  geminiMessage
                )}
              </p>
              {/* Triangle pointing to the avatar */}
              <div className={`absolute -bottom-2 right-6 w-4 h-4 border-b border-r transform rotate-45 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#E9EFF1]'}`}></div>
            </div>
          </div>

          {/* Animated Avatar Button */}
          <button
            onClick={() => setIsWidgetOpen(!isWidgetOpen)}
            className="w-16 h-16 bg-gradient-to-tr from-[#14B8A6] to-[#28667B] rounded-full shadow-[0_10px_25px_-5px_rgba(20,184,166,0.5)] flex items-center justify-center hover:scale-110 transition-transform duration-300 relative group"
          >
            {/* Ambient Pulse Ring when Recording */}
            {isRecording && (
              <div className="absolute inset-0 rounded-full border-2 border-[#14B8A6] animate-ping opacity-50"></div>
            )}

            {/* The Robot Emoji/Icon with gentle bounce */}
            <Bot className="w-8 h-8 text-white relative z-10 animate-bounce" style={{ animationDuration: '3s' }} />

            {/* Close cross on hover if open */}
            <div className={`absolute inset-0 bg-red-500 rounded-full flex items-center justify-center text-white font-bold opacity-0 transition-opacity duration-300 ${isWidgetOpen ? 'group-hover:opacity-100 z-20' : ''}`}>
              <Square className="w-5 h-5 fill-white" />
            </div>
          </button>
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
                  <ul className="flex flex-col gap-2.5 mb-6 flex-1 max-h-[145px] overflow-y-auto pr-2">
                    <li className="flex items-center gap-2.5 text-[13px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0" /> CNN-LSTM Vocal Emotion Engine</li>
                    <li className="flex items-center gap-2.5 text-[13px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0" /> Standard ResNet-34 Facial Engine</li>
                    <li className="flex items-center gap-2.5 text-[13px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0" /> 1 Hour Live Audio per 10 Hours</li>
                    <li className="flex items-center gap-2.5 text-[13px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0" /> Allow Upload 5 Audio Files Only per 10 hours</li>
                    <li className="flex items-center gap-2.5 text-[13px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0" /> 7-Day History Retention</li>
                    <li className="flex items-center gap-2.5 text-[13px] text-gray-400 opacity-50"><CloseIcon className="w-4 h-4 shrink-0" /> No Gemini AI Insights</li>
                    <li className="flex items-center gap-2.5 text-[13px] text-gray-400 opacity-50"><CloseIcon className="w-4 h-4 shrink-0" /> No PDF Export</li>
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
                  <ul className="flex flex-col gap-2.5 mb-6 flex-1 max-h-[145px] overflow-y-auto pr-2">
                    <li className="flex items-start gap-2.5 text-[13px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0 mt-0.5" /> <span className="font-bold text-[#14B8A6]">Full-Spectrum CNN-LSTM Acoustic Analysis</span></li>
                    <li className="flex items-start gap-2.5 text-[13px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0 mt-0.5" /> <span className="font-bold text-[#14B8A6]">Expert ResNet-152 Facial Engine</span></li>
                    <li className="flex items-start gap-2.5 text-[13px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0 mt-0.5" /> 60s Live / 5 Static Analysis daily</li>
                    <li className="flex items-start gap-2.5 text-[13px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0 mt-0.5" /> 3 Hours Live Audio per 5 Hours</li>
                    <li className="flex items-start gap-2.5 text-[13px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0 mt-0.5" /> Allow Upload 15 Audio Files Only per 5 hours</li>
                    <li className="flex items-start gap-2.5 text-[13px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0 mt-0.5" /> Gemini AI Assistant (5 uses)</li>
                    <li className="flex items-start gap-2.5 text-[13px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0 mt-0.5" /> Full PDF Report Exports</li>
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
                  <ul className="flex flex-col gap-2.5 mb-6 flex-1 max-h-[145px] overflow-y-auto pr-2">
                    <li className="flex items-start gap-2.5 text-[13px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0 mt-0.5" /> Dedicated Multi-Modal AI Engines (CNN-LSTM + ResNet-152)</li>
                    <li className="flex items-start gap-2.5 text-[13px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0 mt-0.5" /> Unlimited time for live audio and allow upload unlimited audio files</li>
                    <li className="flex items-start gap-2.5 text-[13px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0 mt-0.5" /> Multi-Patient Admin Dashboard</li>
                    <li className="flex items-start gap-2.5 text-[13px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0 mt-0.5" /> Unlimited Gemini Insights</li>
                    <li className="flex items-start gap-2.5 text-[13px] text-[#586163]"><Check className="w-4 h-4 text-[#14B8A6] shrink-0 mt-0.5" /> Longitudinal Predictive Metrics</li>
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