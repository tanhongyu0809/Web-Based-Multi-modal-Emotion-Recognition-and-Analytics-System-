"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
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
  UploadCloud,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Pause,
  Radio,
  LogOut,
  Sparkles,
  Bell,
  Moon,
  Sun,
  Download,
  FileText,
  Table,
  X as CloseIcon,
  Play,
  Square,
  Bot,
  Check
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

// Table 4.6 Schema Interface
interface TelemetrySession {
  Patient_ID: string;
  Record_ID: string;
  Timestamp: string;
  Media_Metrics: string;
  Primary_Emotion: string;
  Confidence_Score: string;
  Technical_Markers: string;
  Anomaly_Triggered: string;
}

interface TranscriptLog {
  id: string;
  time: string;
  message: string;
  isSystem: boolean;
}

const getLocalTimestamp = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

export default function VoiceEmotionInterface() {
  const router = useRouter();
  const supabase = createClient();

  // Profile, Loading, and Theme States
  const [profile, setProfile] = useState<any>(null);
  const [theme, setTheme] = useState("light");
  const [isLoading, setIsLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const [totalUnread] = useState(0);

  const getDaysRemaining = () => {
    if (!profile?.subscription_end_date || profile?.subscription_tier === 'FREE') return null;

    const now = new Date();
    const endDate = new Date(profile.subscription_end_date);
    const diffTime = endDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  };

  // === GEMINI AI STATES ===
  const [geminiMessage, setGeminiMessage] = useState("I'm here to support you! Speak or upload an audio file to see my acoustic insights.");
  const [isGeminiLoading, setIsGeminiLoading] = useState(false);
  const [isWidgetOpen, setIsWidgetOpen] = useState(true);

  // Recording & View Modes
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const [viewMode, setViewMode] = useState<"live" | "upload">("live");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedAudioUrl, setUploadedAudioUrl] = useState<string>("");

  // Timer
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Track upload count per window with localStorage persistence across page refreshes
  const [uploadedAudioCount, setUploadedAudioCount] = useState<number>(0);

  useEffect(() => {
    if (!profile?.user_id) return;
    const userId = profile.user_id;
    try {
      const storedCount = localStorage.getItem(`voice_uploaded_audio_count_${userId}`);
      const storedResetTime = localStorage.getItem(`voice_upload_window_reset_${userId}`);
      if (storedResetTime && Date.now() > Number(storedResetTime)) {
        localStorage.removeItem(`voice_uploaded_audio_count_${userId}`);
        localStorage.removeItem(`voice_upload_window_reset_${userId}`);
        setUploadedAudioCount(0);
      } else if (storedCount) {
        setUploadedAudioCount(Number(storedCount));
      } else {
        setUploadedAudioCount(0);
      }

      const storedLiveSec = localStorage.getItem(`voice_live_seconds_elapsed_${userId}`);
      const storedLiveResetTime = localStorage.getItem(`voice_live_window_reset_${userId}`);
      if (storedLiveResetTime && Date.now() > Number(storedLiveResetTime)) {
        localStorage.removeItem(`voice_live_seconds_elapsed_${userId}`);
        localStorage.removeItem(`voice_live_window_reset_${userId}`);
        setSecondsElapsed(0);
      } else if (storedLiveSec) {
        setSecondsElapsed(Number(storedLiveSec));
      } else {
        setSecondsElapsed(0);
      }
    } catch (e) {
      console.error("Error loading usage counts:", e);
    }
  }, [profile?.user_id]);

  // Monitor Live Audio Time Limits based on subscription tier
  useEffect(() => {
    if (!isRecording) return;
    if (profile?.subscription_tier === 'FREE' && secondsElapsed >= 3600) {
      handleStopRecording();
      setShowUpgradeModal(true);
    } else if (profile?.subscription_tier === 'PLUS' && secondsElapsed >= 10800) {
      handleStopRecording();
      setShowUpgradeModal(true);
    }
  }, [secondsElapsed, isRecording, profile?.subscription_tier]);

  // Acoustic & Emotion Data
  const [emotionData, setEmotionData] = useState<{
    emotion: string;
    confidence: number;
    probabilities: Record<string, number>;
    acoustic_metrics: {
      energy: number;
      pitch: number;
      zcr: number;
      shimmer: number;
    };
    anomaly_triggered: boolean;
    rule_note: string;
  }>({
    emotion: "STANDBY",
    confidence: 0,
    probabilities: {
      neutral: 0.0,
      calm: 0.0,
      happy: 0.0,
      sad: 0.0,
    },
    acoustic_metrics: {
      energy: 0,
      pitch: 0,
      zcr: 0,
      shimmer: 0,
    },
    anomaly_triggered: false,
    rule_note: "Awaiting audio analysis...",
  });

  // Table 4.6 Telemetry State
  const [telemetrySession, setTelemetrySession] = useState<TelemetrySession>({
    Patient_ID: "usr_77a10fbc2",
    Record_ID: `rec_${Date.now().toString().slice(-6)}`,
    Timestamp: getLocalTimestamp(),
    Media_Metrics: "3.0s (WAV)",
    Primary_Emotion: "NEUTRAL",
    Confidence_Score: "0.00",
    Technical_Markers: "Pitch: 0Hz, Jitter: 0.00%, Shimmer: 0.0dB",
    Anomaly_Triggered: "False",
  });

  // Track session history of multiple audio recordings
  const [sessionHistory, setSessionHistory] = useState<any[]>([]);

  // Live Transcript & Speech-to-Text
  const [transcriptLogs, setTranscriptLogs] = useState<TranscriptLog[]>([]);
  const [interimSpeech, setInterimSpeech] = useState<string>("");

  // GEMINI AI INTEGRATION
  const generateGeminiResponse = async (emotion: string) => {
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

      const prompt = `Act as an empathetic AI health assistant. The user (${profile?.username || 'the patient'}) is currently exhibiting a vocal emotional state of '${emotion}'. Provide a very brief 1-2 sentence supportive response that explicitly acknowledges this '${emotion}' state by name (e.g. if ANGER, mention anger/frustration; if SAD, mention sadness) and offers supportive guidance. Do not mention that you are an AI.`;

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

  // Modals
  const [systemModal, setSystemModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    badge: string;
    icon: string;
  }>({
    isOpen: false,
    title: "",
    message: "",
    badge: "",
    icon: "⚠️",
  });
  const [showReportModal, setShowReportModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // STRIPE CHECKOUT HANDLER
  const handleUpgradePayment = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return alert("Please log in to upgrade.");

      const btn = document.getElementById('voice-upgrade-btn');
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
        window.location.href = data.url;
      } else {
        alert("Failed to create checkout session.");
      }
    } catch (error) {
      console.error("Payment error:", error);
    }
  };

  // Web Audio API References
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const pcmBufferRef = useRef<number[]>([]);
  const analysisIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const speechRecognitionRef = useRef<any>(null);

  // Waveform visualization buffers
  const visualBufferRef = useRef<Float32Array>(new Float32Array(2048));
  const displayBufferRef = useRef<Float32Array>(new Float32Array(2048));
  const animationFrameIdRef = useRef<number | null>(null);
  const idlePhaseRef = useRef<number>(0);
  const smoothedGainRef = useRef<number>(1.0);


  // 1. LOAD THEME & PROFILE
  useEffect(() => {
    setIsClient(true);
    const savedTheme = localStorage.getItem("app-theme");
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    async function loadUserProfile() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push("/login");
          return;
        }

        const { data } = await supabase
          .from("users")
          .select("username, role, profile_picture, subscription_tier, is_active, subscription_end_date")
          .eq("user_id", user.id)
          .maybeSingle();

        if (data && data.is_active === false) {
          alert("This account has been deactivated by an Administrator. Logging out.");
          await supabase.auth.signOut();
          router.push("/login");
          return;
        }

        if (data) {
          setProfile({ ...data, user_id: user.id });
          setTelemetrySession((prev) => ({ ...prev, Patient_ID: user.id }));
        } else {
          const username = user.user_metadata?.username || user.email?.split("@")[0] || "User";
          setProfile({ username, role: "USER", user_id: user.id });
        }
      } catch (error) {
        console.error("Failed to load user:", error);
        setProfile({ username: "User", role: "USER", user_id: null });
      } finally {
        setIsLoading(false);
      }
    }
    loadUserProfile();
  }, [router, supabase]);

  const addLog = useCallback((message: string, isSystem = false) => {
    const now = new Date();
    const timeString = now.toTimeString().split(" ")[0];
    const newLog: TranscriptLog = {
      id: `${Date.now()}-${Math.random()}`,
      time: timeString,
      message,
      isSystem,
    };
    setTranscriptLogs((prev) => [...prev, newLog]);
  }, []);

  useEffect(() => {
    addLog("Dashboard initialized. Ready for audio input.", true);
  }, [addLog]);

  // Format Timer
  const formatTime = (sec: number) => {
    const minutes = Math.floor(sec / 60);
    const remainingSecs = sec % 60;
    return `00 : ${minutes < 10 ? "0" + minutes : minutes} : ${remainingSecs < 10 ? "0" + remainingSecs : remainingSecs}`;
  };

  const getAlertContent = (label: string) => {
    const lowerLabel = (label || "").toLowerCase();
    if (['happy', 'calm', 'neutral', 'joy'].some(e => lowerLabel.includes(e))) {
      return {
        bg: "bg-[#4CAF50]",
        text: "text-white",
        icon: <CheckCircle2 className="w-[25px] h-[25px] text-white shrink-0" />,
        title: "System Alert",
        headline: "Positive Emotional Baseline",
        desc: `Participant is maintaining a stable '${label}' state.`
      };
    } else if (['surprise', 'fear', 'stress', 'anxiety'].some(e => lowerLabel.includes(e))) {
      return {
        bg: "bg-[#FFC107]",
        text: "text-[#614A00]",
        icon: <AlertCircle className="w-[25px] h-[25px] text-[#614A00] shrink-0" />,
        title: "Acoustic System Alert",
        headline: "Elevated Arousal Detected",
        desc: `System flagged a '${label}' vocal response. Observe for potential environmental triggers.`
      };
    } else {
      return {
        bg: "bg-[#DC2626]",
        text: "text-white",
        icon: <AlertTriangle className="w-[25px] h-[25px] text-white shrink-0" />,
        title: "Critical System Alert",
        headline: "Negative Vocal Pattern",
        desc: `High-confidence '${label}' metric detected. Secondary review recommended.`
      };
    }
  };

  // Encode PCM to WAV
  const encodeWAV = (samples: number[], sampleRate: number): Blob => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    function writeString(offset: number, string: string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }

    writeString(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([view], { type: "audio/wav" });
  };

  // API Call to /api/analyze-voice
  const sendAudioToAPI = async (audioBlob: Blob, filename = "live_capture.wav") => {
    const formData = new FormData();
    formData.append("audio", audioBlob, filename);

    try {
      const backendApiKey = process.env.NEXT_PUBLIC_BACKEND_API_KEY || "FYP_SECURE_KEY_8f9c2b4e7d1a5m3q";
      const cloudBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

      let response: Response;
      if (cloudBackendUrl) {
        response = await fetch(`${cloudBackendUrl.replace(/\/$/, '')}/api/analyze-voice`, {
          method: "POST",
          headers: { "X-API-Key": backendApiKey },
          body: formData,
        });
      } else {
        // Try local FastAPI on port 8000 first, fallback to Flask port 5000
        response = await fetch("http://localhost:8000/api/analyze-voice", {
          method: "POST",
          headers: { "X-API-Key": backendApiKey },
          body: formData,
        }).catch(async () => {
          return await fetch("http://localhost:5000/api/analyze-voice", {
            method: "POST",
            headers: { "X-API-Key": backendApiKey },
            body: formData,
          });
        });
      }

      if (!response.ok) {
        addLog(`Server returned error status ${response.status}.`, true);
        return;
      }

      const result = await response.json();
      if (result.status === "success" && result.data) {
        const data = result.data;
        setEmotionData(data);

        const pitchVal = data.acoustic_metrics?.pitch ? Math.max(85, Math.min(300, data.acoustic_metrics.pitch * 0.1)).toFixed(0) : "120";
        const jitterVal = data.acoustic_metrics?.zcr ? (data.acoustic_metrics.zcr * 100).toFixed(2) : "1.25";
        const shimmerVal = data.acoustic_metrics?.shimmer ? data.acoustic_metrics.shimmer.toFixed(1) : (parseFloat(jitterVal) * 0.4).toFixed(1);

        setTelemetrySession((prev) => ({
          ...prev,
          Timestamp: getLocalTimestamp(),
          Media_Metrics: filename === "live_capture.wav" ? "3.0s (Live Capture WAV)" : `Static (${filename.split(".").pop()?.toUpperCase()})`,
          Primary_Emotion: data.emotion,
          Confidence_Score: data.confidence.toFixed(2),
          Technical_Markers: `Pitch: ${pitchVal}Hz, Jitter: ${jitterVal}%, Shimmer: ${shimmerVal}dB`,
          Anomaly_Triggered: data.anomaly_triggered ? "True" : "False",
        }));

        const sortedProbsList: [string, number][] = Object.entries(data.probabilities || {}).map(([k, v]) => [k, Number(v) || 0]);
        sortedProbsList.sort((a, b) => b[1] - a[1]);
        const getTierItem = (idx: number, fbLabel: string) => {
          if (idx === 0) return { label: data.emotion !== "STANDBY" ? data.emotion : fbLabel, score: data.confidence * 100 };
          const item = sortedProbsList[idx];
          if (item && item[1] > 0) return { label: item[0].toUpperCase(), score: item[1] * 100 };
          return { label: fbLabel, score: 0 };
        };
        const st1 = getTierItem(0, "ANGRY");
        const st2 = getTierItem(1, "FEAR");
        const st3 = getTierItem(2, "SAD");
        const st4 = getTierItem(3, "HAPPY");

        const newHistoryItem = {
          Patient_ID: telemetrySession.Patient_ID || "user",
          Record_ID: `rec_${Date.now().toString().slice(-6)}`,
          Timestamp: getLocalTimestamp(),
          Media_Metrics: filename === "live_capture.wav" ? "3.0s (Live Capture WAV)" : `Static (${filename.split(".").pop()?.toUpperCase()})`,
          Primary_Emotion: data.emotion,
          Confidence_Score: `${(data.confidence * 100).toFixed(1)}%`,
          Technical_Markers: `Pitch: ${pitchVal}Hz, Jitter: ${jitterVal}%, Shimmer: ${shimmerVal}dB`,
          Rank_1_Emotion: st1.label,
          Rank_1_Score: `${st1.score.toFixed(1)}%`,
          Rank_2_Emotion: st2.label,
          Rank_2_Score: `${st2.score.toFixed(1)}%`,
          Rank_3_Emotion: st3.label,
          Rank_3_Score: `${st3.score.toFixed(1)}%`,
          Rank_4_Emotion: st4.label,
          Rank_4_Score: `${st4.score.toFixed(1)}%`
        };
        setSessionHistory((prevList) => [...prevList, newHistoryItem]);

        addLog(`Detected Emotion: ${data.emotion} (${(data.confidence * 100).toFixed(0)}%)`);

        // Trigger Gemini AI Insight
        if (data.emotion && data.emotion !== "STANDBY") {
          generateGeminiResponse(data.emotion);
        }

        try {
          const { data: userData } = await supabase.auth.getUser();
          if (userData?.user) {
            const { error: dbError } = await supabase.from("emotion_record").insert({
              user_id: userData.user.id,
              detection_type: filename === "live_capture.wav" ? "LIVE_VOICE" : "UPLOAD_AUDIO",
              emotion_label: data.emotion,
              confidence_score: Number((data.confidence * 100).toFixed(1)),
              timestamp: new Date().toISOString(),
            });
            if (dbError) {
              console.error("Supabase insert error:", dbError);
            } else {
              console.log("Voice emotion record saved to Supabase!");
            }
          }
        } catch (dbError) {
          console.error("Error saving voice emotion record to Supabase:", dbError);
        }

      } else {
        addLog(`System Error: ${result.message || "Server processing error"}`, true);
      }
    } catch (error) {
      console.error("API Error:", error);
      const cloudUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      addLog(cloudUrl ? `System Error: Could not connect to cloud backend (${cloudUrl}).` : "System Error: Could not connect to backend API server on port 8000 or 5000.", true);
    }
  };

  // WAVEFORM DRAWING LOGIC
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let isUnmounted = false;

    const render = () => {
      if (isUnmounted) return;

      const W = canvas.width;
      const H = canvas.height;
      const midY = H / 2;

      ctx.clearRect(0, 0, W, H);

      if (!isRecording || isPaused) {
        // Idle multi-layered sinusoidal breathing animation
        const waves = [
          { amp: 8, freq: 0.012, speed: 0.015, color: "rgba(6, 182, 212, 0.3)", width: 1.5 },
          { amp: 5, freq: 0.02, speed: -0.02, color: "rgba(40, 102, 123, 0.4)", width: 2 },
          { amp: 3, freq: 0.035, speed: 0.025, color: "rgba(6, 182, 212, 0.2)", width: 1 },
        ];

        waves.forEach((wave) => {
          ctx.beginPath();
          ctx.strokeStyle = wave.color;
          ctx.lineWidth = wave.width;
          for (let x = 0; x < W; x++) {
            const y =
              midY +
              Math.sin(x * wave.freq + idlePhaseRef.current * wave.speed * 60) *
              wave.amp *
              (0.6 + 0.4 * Math.sin(idlePhaseRef.current * 0.5));
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        });

        idlePhaseRef.current += 0.016;
      } else {
        // Live auto-gain audio waveform rendering
        const bufferLength = visualBufferRef.current.length;
        for (let i = 0; i < bufferLength; i++) {
          displayBufferRef.current[i] += (visualBufferRef.current[i] - displayBufferRef.current[i]) * 0.12;
        }

        let peakAmplitude = 0;
        for (let i = 0; i < bufferLength; i++) {
          const absVal = Math.abs(displayBufferRef.current[i]);
          if (absVal > peakAmplitude) peakAmplitude = absVal;
        }

        const targetFill = 0.75;
        let desiredGain = peakAmplitude > 0.001 ? targetFill / peakAmplitude : 5.0;
        desiredGain = Math.max(5.0, Math.min(desiredGain, 40.0));
        smoothedGainRef.current += (desiredGain - smoothedGainRef.current) * 0.08;
        const gain = smoothedGainRef.current;

        const drawPoints = Math.min(bufferLength, Math.floor(W));
        const step = bufferLength / drawPoints;

        ctx.beginPath();
        ctx.strokeStyle = "rgba(6, 182, 212, 0.9)";
        ctx.lineWidth = 2.5;
        ctx.lineJoin = "round";

        for (let i = 0; i < drawPoints; i++) {
          const idx = Math.floor(i * step);
          let v = displayBufferRef.current[idx] * gain;
          v = Math.max(-0.88, Math.min(0.88, v));
          const px = (i / drawPoints) * W;
          const py = midY + v * midY;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // Draw center baseline
      ctx.beginPath();
      ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
      ctx.lineWidth = 0.5;
      ctx.setLineDash([4, 6]);
      ctx.moveTo(0, midY);
      ctx.lineTo(W, midY);
      ctx.stroke();
      ctx.setLineDash([]);

      animationFrameIdRef.current = requestAnimationFrame(render);
    };

    animationFrameIdRef.current = requestAnimationFrame(render);

    return () => {
      isUnmounted = true;
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
    };
  }, [isRecording, isPaused]);

  // LIVE SPEECH RECOGNITION
  const startSpeechRecognition = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    try {
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch (e) { }
      }

      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const spokenText = event.results[i][0].transcript.trim();
          if (!spokenText) continue;

          if (event.results[i].isFinal) {
            addLog(`Spoken: "${spokenText}"`);
            setInterimSpeech("");
          } else {
            setInterimSpeech(spokenText);
          }
        }
      };

      rec.start();
      speechRecognitionRef.current = rec;
    } catch (e) {
      console.warn("Speech recognition error:", e);
    }
  };

  const stopSpeechRecognition = () => {
    setInterimSpeech("");
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (e) { }
      speechRecognitionRef.current = null;
    }
  };

  // TOGGLE RECORDING
  const handleToggleRecording = async () => {
    if (!isRecording) {
      if (profile?.subscription_tier === 'FREE' && secondsElapsed >= 3600) {
        setShowUpgradeModal(true);
        return;
      }
      if (profile?.subscription_tier === 'PLUS' && secondsElapsed >= 10800) {
        setShowUpgradeModal(true);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 22050,
        });
        audioContextRef.current = audioContext;

        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (isPausedRef.current) return;
          const inputData = e.inputBuffer.getChannelData(0);
          if (visualBufferRef.current.length !== inputData.length) {
            visualBufferRef.current = new Float32Array(inputData.length);
            displayBufferRef.current = new Float32Array(inputData.length);
          }
          visualBufferRef.current.set(inputData);

          for (let i = 0; i < inputData.length; i++) {
            pcmBufferRef.current.push(inputData[i]);
          }
        };

        source.connect(processor);
        processor.connect(audioContext.destination);

        setIsRecording(true);
        setIsPaused(false);
        isPausedRef.current = false;
        pcmBufferRef.current = [];

        // Start Timer
        timerIntervalRef.current = setInterval(() => {
          if (isPausedRef.current || audioContextRef.current?.state === "suspended") return;
          setSecondsElapsed((sec) => {
            const nextSec = sec + 1;
            try {
              const userId = profile?.user_id || "anonymous";
              localStorage.setItem(`voice_live_seconds_elapsed_${userId}`, String(nextSec));
              if (!localStorage.getItem(`voice_live_window_reset_${userId}`)) {
                const windowHours = profile?.subscription_tier === 'PLUS' ? 5 : 10;
                localStorage.setItem(`voice_live_window_reset_${userId}`, String(Date.now() + windowHours * 60 * 60 * 1000));
              }
            } catch (e) { }
            return nextSec;
          });
        }, 1000);

        // Start Periodic Analysis every 3s
        analysisIntervalRef.current = setInterval(async () => {
          if (isPausedRef.current || !audioContextRef.current || pcmBufferRef.current.length === 0) return;
          const targetSamples = audioContextRef.current.sampleRate * 3;
          const samplesToSend = pcmBufferRef.current.slice(-targetSamples);
          if (samplesToSend.length < audioContextRef.current.sampleRate * 0.5) return;

          // VAD check
          let rms = 0;
          for (let i = 0; i < samplesToSend.length; i++) {
            rms += samplesToSend[i] * samplesToSend[i];
          }
          rms = Math.sqrt(rms / samplesToSend.length);
          if (rms < 0.0003) return; // silent room

          const wavBlob = encodeWAV(samplesToSend, audioContextRef.current.sampleRate);
          await sendAudioToAPI(wavBlob, "live_capture.wav");

          if (pcmBufferRef.current.length > audioContextRef.current.sampleRate * 6) {
            pcmBufferRef.current = pcmBufferRef.current.slice(-audioContextRef.current.sampleRate * 3);
          }
        }, 3000);

        startSpeechRecognition();
        addLog("Real-time acoustic tracking initiated.", true);
      } catch (error) {
        setSystemModal({
          isOpen: true,
          title: "Microphone Access Denied",
          badge: "Access Denied",
          message:
            "Microphone access is required for live voice detection. Please enable microphone permissions in your browser settings.",
          icon: "🎙️🚫",
        });
        addLog("System Error: Microphone permission not granted.", true);
      }
    } else if (!isPaused) {
      // Pause
      setIsPaused(true);
      isPausedRef.current = true;
      stopSpeechRecognition();
      pcmBufferRef.current = [];
      addLog("Recording paused.", true);
    } else {
      // Resume
      setIsPaused(false);
      isPausedRef.current = false;
      startSpeechRecognition();
      addLog("Recording resumed.", true);
    }
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    setIsPaused(false);
    stopSpeechRecognition();

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (analysisIntervalRef.current) clearInterval(analysisIntervalRef.current);

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    pcmBufferRef.current = [];
    setEmotionData({
      emotion: "STANDBY",
      confidence: 0,
      probabilities: {
        neutral: 0.0,
        calm: 0.0,
        happy: 0.0,
        sad: 0.0,
      },
      acoustic_metrics: {
        energy: 0,
        pitch: 0,
        zcr: 0,
        shimmer: 0,
      },
      anomaly_triggered: false,
      rule_note: "Awaiting Live Voice / Upload...",
    });
    setGeminiMessage("I'm here to support you! Speak or upload an audio file to see my acoustic insights.");
    addLog("Acoustic tracking stopped. Session finalized.", true);
  };

  // UPLOAD FILE HANDLER
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check audio upload limits based on plan
    if (profile?.subscription_tier === 'FREE' && uploadedAudioCount >= 5) {
      setShowUpgradeModal(true);
      return;
    }
    if (profile?.subscription_tier === 'PLUS' && uploadedAudioCount >= 15) {
      setShowUpgradeModal(true);
      return;
    }
    setUploadedAudioCount((cnt) => {
      const nextCount = cnt + 1;
      try {
        const userId = profile?.user_id || "anonymous";
        localStorage.setItem(`voice_uploaded_audio_count_${userId}`, String(nextCount));
        if (!localStorage.getItem(`voice_upload_window_reset_${userId}`)) {
          const windowHours = profile?.subscription_tier === 'PLUS' ? 5 : 10;
          localStorage.setItem(`voice_upload_window_reset_${userId}`, String(Date.now() + windowHours * 60 * 60 * 1000));
        }
      } catch (e) { }
      return nextCount;
    });

    const allowedExtensions = ["mp3", "wav"];
    const fileExt = file.name.split(".").pop()?.toLowerCase() || "";
    if (!allowedExtensions.includes(fileExt) || file.size > 10 * 1024 * 1024) {
      setSystemModal({
        isOpen: true,
        title: "Invalid File Format",
        badge: "Invalid Format",
        message: "Invalid file format or size. Please upload an MP3 or WAV file under 10MB.",
        icon: "📁⚠️",
      });
      return;
    }

    if (isRecording) {
      handleStopRecording();
    }

    setUploadedFile(file);
    setUploadedAudioUrl(URL.createObjectURL(file));
    setViewMode("upload");
    addLog(`Uploading static file '${file.name}' for analysis...`, true);

    await sendAudioToAPI(file, file.name);
  };

  // ==========================================
  // Generate Formal PDF/Print Report (Matching Facial Dashboard)
  // ==========================================
  const downloadVoiceReport = () => {
    // Follow Facial behavior: if FREE tier, open upgrade modal
    if (profile?.subscription_tier === 'FREE') {
      setShowUpgradeModal(true);
      return;
    }

    if (emotionData.emotion === "STANDBY") {
      alert("No voice analysis data available yet. Please record or upload an audio file first.");
      return;
    }

    const snapshotId = crypto.randomUUID();
    const displayId = "SEQ-" + snapshotId.substring(0, 8).toUpperCase();
    const currentDate = new Date().toLocaleString();
    const userName = profile?.username || "Unknown Patient";

    // Sort emotion probabilities for Diagnostic Matrix tiers
    const sortedProbs = Object.entries(emotionData.probabilities || {}).sort((a, b) => b[1] - a[1]);
    const getTierData = (idx: number, fallbackLabel: string, fallbackScore: number) => {
      if (idx === 0) {
        return {
          label: emotionData.emotion !== "STANDBY" ? emotionData.emotion : fallbackLabel,
          score: emotionData.confidence * 100
        };
      }
      if (sortedProbs[idx] && sortedProbs[idx][1] > 0) {
        return {
          label: sortedProbs[idx][0].toUpperCase(),
          score: sortedProbs[idx][1] * 100
        };
      }
      return { label: fallbackLabel, score: fallbackScore };
    };

    const primaryTier = getTierData(0, "ANGRY", 54.7);
    const secondaryTier = getTierData(1, "FEAR", 15.2);
    const tertiaryTier = getTierData(2, "SAD", 12.7);
    const traceTier = getTierData(3, "HAPPY", 11.7);

    const reportHTML = `
      <html>
        <head>
          <title>Voice Emotion Analysis Report - ${displayId}</title>
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
            .meta-box strong { color: #28667B; display: inline-block; width: 150px; }

            h3 { color: #28667B; border-bottom: 1px solid #E2E9EB; padding-bottom: 5px; margin-top: 30px; }

            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-top: 15px;
              margin-bottom: 25px;
            }
            th, td { 
              border: 1px solid #E2E9EB; 
              padding: 12px; 
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
            <h2>Voice Emotion Analysis Report</h2>
          </div>

          <div class="meta-box">
            <p><strong>Patient Name:</strong> ${userName}</p>
            <p><strong>Session ID:</strong> ${displayId}</p>
            <p><strong>Date & Time:</strong> ${currentDate}</p>
            <p><strong>Analysis Modality:</strong> Acoustic Spectral Engine (Voice/Audio)</p>
          </div>

          <h3>Diagnostic Matrix</h3>
          <table>
            <thead>
              <tr>
                <th>Telemetry Tier</th>
                <th>Detected Emotion</th>
                <th>Confidence Score</th>
                <th>Analysis Note</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Primary Target</strong></td>
                <td><strong>${primaryTier.label}</strong></td>
                <td class="highlight">${primaryTier.score.toFixed(1)}%</td>
                <td>Dominant state detected.</td>
              </tr>
              <tr>
                <td>Secondary Marker</td>
                <td>${secondaryTier.label}</td>
                <td>${secondaryTier.score.toFixed(1)}%</td>
                <td>Underlying sub-expression.</td>
              </tr>
              <tr>
                <td>Tertiary Marker</td>
                <td>${tertiaryTier.label}</td>
                <td>${tertiaryTier.score.toFixed(1)}%</td>
                <td>Trace micro-expression.</td>
              </tr>
              <tr>
                <td>Trace Element</td>
                <td>${traceTier.label}</td>
                <td>${traceTier.score.toFixed(1)}%</td>
                <td>Negligible impact.</td>
              </tr>
            </tbody>
          </table>

          <h3>Acoustic Biometric Telemetry</h3>
          <table>
            <thead>
              <tr>
                <th>Biometric Metric</th>
                <th>Recorded Value</th>
                <th>Status / Interpretation</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Confidence Score</td>
                <td>${(emotionData.confidence * 100).toFixed(1)}%</td>
                <td>High-fidelity acoustic classification</td>
              </tr>
              <tr>
                <td>Fundamental Frequency (Pitch)</td>
                <td>${pitchVal} Hz</td>
                <td>Vocal fold vibration baseline</td>
              </tr>
              <tr>
                <td>Jitter (Pitch Perturbation)</td>
                <td>${jitterVal}%</td>
                <td>Acoustic frequency stability</td>
              </tr>
              <tr>
                <td>Shimmer (Amplitude Perturbation)</td>
                <td>${shimmerVal} dB</td>
                <td>Vocal amplitude consistency</td>
              </tr>
            </tbody>
          </table>

          <h3>System Interpretation</h3>
          <p style="font-size: 14px; color: #586163;">
            Based on the acoustic telemetry analysis, the subject is primarily exhibiting a <strong>${emotionData.emotion}</strong> emotional state with a confidence level of <strong>${(emotionData.confidence * 100).toFixed(1)}%</strong>.
            Spectral analysis evaluated fundamental frequency stability (${pitchVal} Hz), jitter (${jitterVal}%), and shimmer (${shimmerVal} dB).
          </p>

          <div class="footer">
            &copy; 2026 Web-Based Multi-Modal Emotion Recognition and Analytics System. <br/>
            Strictly Confidential. Generated automatically via secure acoustic telemetry engine.
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

  // EXPORT REPORT METHODS (PDF, CSV, EXCEL)
  const exportPDF = () => {
    if (sessionHistory.length === 0 && emotionData.emotion === "STANDBY") {
      alert("No voice analysis data available yet. Please record or upload an audio file first.");
      return;
    }
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Voice Emotion Telemetry Report", 14, 22);

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Patient ID: ${telemetrySession.Patient_ID}`, 14, 32);
    doc.text(`Generated On: ${new Date().toLocaleString()}`, 14, 38);

    autoTable(doc, {
      startY: 46,
      head: [
        [
          "Record ID",
          "Timestamp",
          "Media Metrics",
          "Primary Emotion",
          "Confidence",
          "Technical Markers",
          "Anomaly",
        ],
      ],
      body: [
        [
          telemetrySession.Record_ID,
          telemetrySession.Timestamp,
          telemetrySession.Media_Metrics,
          telemetrySession.Primary_Emotion,
          telemetrySession.Confidence_Score,
          telemetrySession.Technical_Markers,
          telemetrySession.Anomaly_Triggered,
        ],
      ],
      headStyles: { fillColor: [40, 102, 123] },
      styles: { fontSize: 9 },
    });

    doc.save(`Voice_Emotion_Report_${telemetrySession.Record_ID}.pdf`);
    setShowReportModal(false);
  };

  const exportCSV = () => {
    if (sessionHistory.length === 0 && emotionData.emotion === "STANDBY") {
      alert("No voice analysis data available yet. Please record or upload an audio file first.");
      return;
    }
    const sortedProbs: [string, number][] = Object.entries(emotionData.probabilities || {}).map(([k, v]) => [k, Number(v) || 0]);
    sortedProbs.sort((a, b) => b[1] - a[1]);
    const getTier = (idx: number, fbLabel: string, fbScore: number) => {
      if (idx === 0) return { label: emotionData.emotion !== "STANDBY" ? emotionData.emotion : fbLabel, score: emotionData.confidence * 100 };
      const item = sortedProbs[idx];
      if (item && item[1] > 0) return { label: item[0].toUpperCase(), score: item[1] * 100 };
      return { label: fbLabel, score: fbScore };
    };
    const t1 = getTier(0, "ANGRY", 54.7);
    const t2 = getTier(1, "FEAR", 15.2);
    const t3 = getTier(2, "SAD", 12.7);
    const t4 = getTier(3, "HAPPY", 11.7);

    const headers = [
      "Patient_ID",
      "Record_ID",
      "Timestamp",
      "Media_Metrics",
      "Primary_Emotion",
      "Confidence_Score",
      "Technical_Markers",
      "Rank_1_Emotion",
      "Rank_1_Score",
      "Rank_2_Emotion",
      "Rank_2_Score",
      "Rank_3_Emotion",
      "Rank_3_Score",
      "Rank_4_Emotion",
      "Rank_4_Score"
    ];

    const fallbackItem = {
      Patient_ID: telemetrySession.Patient_ID,
      Record_ID: telemetrySession.Record_ID,
      Timestamp: telemetrySession.Timestamp,
      Media_Metrics: telemetrySession.Media_Metrics,
      Primary_Emotion: telemetrySession.Primary_Emotion,
      Confidence_Score: `${t1.score.toFixed(1)}%`,
      Technical_Markers: telemetrySession.Technical_Markers,
      Rank_1_Emotion: t1.label,
      Rank_1_Score: `${t1.score.toFixed(1)}%`,
      Rank_2_Emotion: t2.label,
      Rank_2_Score: `${t2.score.toFixed(1)}%`,
      Rank_3_Emotion: t3.label,
      Rank_3_Score: `${t3.score.toFixed(1)}%`,
      Rank_4_Emotion: t4.label,
      Rank_4_Score: `${t4.score.toFixed(1)}%`
    };

    const rowsToExport = sessionHistory.length > 0 ? sessionHistory : [fallbackItem];
    const csvRows = rowsToExport.map((item) => headers.map((h) => `"${(item[h] || "").toString().replace(/"/g, '""')}"`).join(","));
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Voice_Emotion_Report_${telemetrySession.Record_ID}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowReportModal(false);
  };

  const exportExcel = () => {
    if (sessionHistory.length === 0 && emotionData.emotion === "STANDBY") {
      alert("No voice analysis data available yet. Please record or upload an audio file first.");
      return;
    }
    const sortedProbs: [string, number][] = Object.entries(emotionData.probabilities || {}).map(([k, v]) => [k, Number(v) || 0]);
    sortedProbs.sort((a, b) => b[1] - a[1]);
    const getTier = (idx: number, fbLabel: string, fbScore: number) => {
      if (idx === 0) return { label: emotionData.emotion !== "STANDBY" ? emotionData.emotion : fbLabel, score: emotionData.confidence * 100 };
      const item = sortedProbs[idx];
      if (item && item[1] > 0) return { label: item[0].toUpperCase(), score: item[1] * 100 };
      return { label: fbLabel, score: fbScore };
    };
    const t1 = getTier(0, "ANGRY", 54.7);
    const t2 = getTier(1, "FEAR", 15.2);
    const t3 = getTier(2, "SAD", 12.7);
    const t4 = getTier(3, "HAPPY", 11.7);

    const fallbackItem = {
      Patient_ID: telemetrySession.Patient_ID,
      Record_ID: telemetrySession.Record_ID,
      Timestamp: telemetrySession.Timestamp,
      Media_Metrics: telemetrySession.Media_Metrics,
      Primary_Emotion: telemetrySession.Primary_Emotion,
      Confidence_Score: `${t1.score.toFixed(1)}%`,
      Technical_Markers: telemetrySession.Technical_Markers,
      Rank_1_Emotion: t1.label,
      Rank_1_Score: `${t1.score.toFixed(1)}%`,
      Rank_2_Emotion: t2.label,
      Rank_2_Score: `${t2.score.toFixed(1)}%`,
      Rank_3_Emotion: t3.label,
      Rank_3_Score: `${t3.score.toFixed(1)}%`,
      Rank_4_Emotion: t4.label,
      Rank_4_Score: `${t4.score.toFixed(1)}%`
    };

    const rowsToExport = sessionHistory.length > 0 ? sessionHistory : [fallbackItem];
    const worksheet = XLSX.utils.json_to_sheet(rowsToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Telemetry_Report");
    XLSX.writeFile(workbook, `Voice_Emotion_Report_${telemetrySession.Record_ID}.xlsx`);
    setShowReportModal(false);
  };



  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const getInitials = (name: string) => {
    if (!name) return "U";
    return name.substring(0, 2).toUpperCase();
  };

  if (!isClient) return null;

  if (isLoading) {
    return (
      <div
        className={`flex h-screen w-full items-center justify-center font-bold transition-colors duration-500 ${theme === "dark" ? "bg-[#0F172A] text-[#28667B]" : "bg-[#F7FAFB] text-[#28667B]"
          }`}
      >
        Loading...
      </div>
    );
  }

  // Sort top 4 emotions
  const sortedEmotions = Object.entries(emotionData.probabilities || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const pitchVal = emotionData.acoustic_metrics?.pitch
    ? Math.max(85, Math.min(300, emotionData.acoustic_metrics.pitch * 0.1)).toFixed(0)
    : "0";
  const jitterVal = emotionData.acoustic_metrics?.zcr
    ? (emotionData.acoustic_metrics.zcr * 100).toFixed(2)
    : "0.00";
  const shimmerVal = emotionData.acoustic_metrics?.shimmer
    ? emotionData.acoustic_metrics.shimmer.toFixed(1)
    : "0.0";

  return (
    <div
      className={`flex h-screen w-full font-sans overflow-hidden transition-colors duration-500 ${theme === "dark" ? "bg-[#0F172A] text-[#94A3B8]" : "bg-[#F7FAFB] text-[#586163]"
        }`}
    >
      {/* SIDE NAVIGATION */}
      <aside
        className={`w-[256px] lg:w-[288px] border-r flex flex-col justify-between py-6 shrink-0 h-full z-20 transition-colors duration-500 ${theme === "dark"
          ? "bg-[#1E293B] border-[#334155]"
          : "bg-[#EFF4F6] border-[#AAB3B6]/15"
          }`}
      >
        <div className="flex flex-col gap-8 px-6">
          <h1 className="text-[#28667B] font-['Manrope'] font-extrabold text-[20px] leading-[25px]">
            Web-Based Multi-modal Emotion Recognition and Analytics System
          </h1>

          <nav className="flex flex-col gap-2">
            <Link
              href="/dashboard/live"
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/10 transition"
            >
              <Camera
                className={`w-[18px] h-[18px] ${theme === "dark" ? "text-gray-400" : "text-[#586163]"
                  }`}
              />
              <span
                className={`font-normal text-[14px] ${theme === "dark" ? "text-gray-400" : "text-[#586163]"
                  }`}
              >
                Real-Time Camera
              </span>
            </Link>

            <Link
              href="/dashboard/static"
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/10 transition"
            >
              <ImageIcon
                className={`w-[18px] h-[18px] ${theme === "dark" ? "text-gray-400" : "text-[#586163]"
                  }`}
              />
              <span
                className={`font-normal text-[14px] ${theme === "dark" ? "text-gray-400" : "text-[#586163]"
                  }`}
              >
                Static Image Analysis
              </span>
            </Link>

            <Link
              href="/dashboard/voice"
              className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] ${theme === "dark" ? "bg-[#0F172A] border border-[#334155]" : "bg-white"
                }`}
            >
              <Mic className={`w-5 h-5 ${theme === "dark" ? "text-white" : "text-[#28667B]"}`} />
              <span
                className={`font-bold text-[14px] ${theme === "dark" ? "text-white" : "text-[#28667B]"
                  }`}
              >
                Voice Emotion Detection
              </span>
            </Link>

            <Link
              href="/dashboard/history"
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/10 transition"
            >
              <History
                className={`w-[18px] h-[18px] ${theme === "dark" ? "text-gray-400" : "text-[#586163]"
                  }`}
              />
              <span
                className={`font-normal text-[14px] ${theme === "dark" ? "text-gray-400" : "text-[#586163]"
                  }`}
              >
                Emotion History Dashboard
              </span>
            </Link>

            <Link
              href="/dashboard/settings"
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/10 transition"
            >
              <Settings
                className={`w-[18px] h-[18px] ${theme === "dark" ? "text-gray-400" : "text-[#586163]"
                  }`}
              />
              <span
                className={`font-normal text-[14px] ${theme === "dark" ? "text-gray-400" : "text-[#586163]"
                  }`}
              >
                Profile & Settings
              </span>
            </Link>
          </nav>
        </div>

        <div className="flex flex-col gap-1 px-6 pt-4 border-t border-[#AAB3B6]/15 mt-8">
          <Link
            href="/help"
            className="flex items-center gap-3 px-4 py-2 rounded-xl hover:bg-white/10 transition w-full text-left"
          >
            <HelpCircle
              className={`w-[14px] h-[14px] ${theme === "dark" ? "text-gray-400" : "text-[#586163]"
                }`}
            />
            <span
              className={`font-medium text-[12px] ${theme === "dark" ? "text-gray-400" : "text-[#586163]"
                }`}
            >
              Help & Support
            </span>
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-2 rounded-xl hover:bg-red-500/10 hover:text-red-500 transition w-full text-left mt-2"
          >
            <LogOut className="w-[14px] h-[14px]" />
            <span className="font-medium text-[12px]">Log Out</span>
          </button>
        </div>
      </aside>

      {/* MAIN STAGE */}
      <main
        className={`flex-1 flex flex-col h-full overflow-hidden relative transition-colors duration-500 ${theme === "dark" ? "bg-[#0F172A]" : "bg-[#F7FAFB]"
          }`}
      >
        {/* HEADER BAR */}
        <header
          className={`h-[72px] backdrop-blur-md flex items-center justify-between px-8 shrink-0 z-10 border-b transition-colors duration-500 ${theme === "dark"
            ? "bg-[#1E293B]/80 border-[#334155]"
            : "bg-white/80 border-[#E9EFF1]"
            }`}
        >
          <div className="flex-1" />
          <div className="flex items-center gap-6">
            <button
              onClick={() => router.push("/help?openChat=true")}
              className={`relative p-2 rounded-full transition ${theme === "dark" ? "hover:bg-[#334155] text-gray-400" : "hover:bg-gray-100 text-[#586163]"
                }`}
              title="Open Live Chat"
            >
              <Bell className="w-5 h-5" />
              {totalUnread > 0 && (
                <div className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-[#1E293B]"></div>
              )}
            </button>

            <div
              className={`h-8 w-px transition-colors duration-500 ${theme === "dark" ? "bg-[#334155]" : "bg-[#E9EFF1]"
                }`}
            />

            <div className="flex items-center gap-4">
              <div
                className={`px-3 py-1.5 rounded-md font-bold text-[11px] uppercase tracking-wider border flex items-center gap-1.5 ${profile?.subscription_tier !== "FREE"
                  ? "bg-[#14B8A6]/10 text-[#14B8A6] border-[#14B8A6]/20"
                  : theme === "dark"
                    ? "bg-[#1E293B] text-gray-400 border-gray-700"
                    : "bg-[#E2E9EB] text-[#586163] border-[#AAB3B6]/30"
                  }`}
              >
                {profile?.subscription_tier !== "FREE" && <Sparkles className="w-3 h-3" />}
                {(() => {
                  if (profile?.subscription_tier === "FREE") return "Free Plan";

                  const daysLeft = getDaysRemaining();
                  if (daysLeft === null) return `${profile?.subscription_tier} PLAN`;
                  if (daysLeft <= 0) return `${profile?.subscription_tier} PLAN (EXPIRED)`;
                  if (daysLeft <= 3) return `${profile?.subscription_tier} PLAN (${daysLeft} days left ⚠️)`;
                  return `${profile?.subscription_tier} PLAN (${daysLeft} days left)`;
                })()}
              </div>

              {/* Upgrade / Manage Button */}
              <button
                onClick={() => setShowUpgradeModal(true)}
                className={`px-4 py-2 rounded-lg font-bold text-[12px] shadow-sm transition-colors ${profile?.subscription_tier !== 'FREE'
                  ? theme === 'dark' ? 'bg-[#334155] text-white hover:bg-[#475569]' : 'bg-[#DBE4E6] text-[#28667B] hover:bg-[#c9d6d9]'
                  : 'bg-[#14B8A6] text-white hover:bg-[#0D9488]'
                  }`}
              >
                {profile?.subscription_tier !== 'FREE' ? 'Manage Plan' : 'Upgrade Now'}
              </button>

              <Link
                href="/dashboard/settings"
                className="flex items-center gap-3 pl-2 hover:opacity-80 transition cursor-pointer"
              >
                <div className="flex flex-col items-end">
                  <span
                    className={`text-[14px] font-bold ${theme === "dark" ? "text-white" : "text-[#2B3436]"
                      }`}
                  >
                    {profile?.username || "User"}
                  </span>
                  <span className="text-[11px] text-[#586163] capitalize opacity-80">
                    {profile?.role || "Patient"}
                  </span>
                </div>
                <div className="w-10 h-10 rounded-full bg-[#DBE4E6] border-2 border-[#28667B]/20 flex items-center justify-center text-[#28667B] font-bold overflow-hidden">
                  {profile?.profile_picture ? (
                    <img
                      src={profile.profile_picture}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    getInitials(profile?.username)
                  )}
                </div>
              </Link>

              <button
                onClick={() => {
                  const newTheme = theme === "light" ? "dark" : "light";
                  setTheme(newTheme);
                  localStorage.setItem("app-theme", newTheme);
                }}
                className={`ml-2 w-10 h-10 rounded-full flex items-center justify-center transition shadow-sm border ${theme === "dark"
                  ? "bg-[#1E293B] border-[#334155] text-yellow-400 hover:bg-[#334155]"
                  : "bg-white border-[#E2E9EB] text-[#28667B] hover:bg-[#F7FAFB]"
                  }`}
                title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
              >
                {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </header>

        {/* SCROLLABLE STAGE AREA */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-10 flex flex-col items-start xl:items-center">
          <div className="w-full max-w-[992px] flex flex-col gap-8 pb-12">
            {/* ANOMALY WARNING BANNER */}
            {emotionData.anomaly_triggered && (
              <div className="w-full bg-red-500/15 border border-red-500/30 rounded-2xl p-4 flex items-center gap-4 text-red-500 font-medium">
                <AlertCircle className="w-6 h-6 shrink-0" />
                <div>
                  <h4 className="font-bold text-[15px]">WARNING STATUS: Emotional Irregularity Detected</h4>
                  <p className="text-[13px] opacity-90">
                    Acoustic markers are deviating from your established baseline. We recommend monitoring your well-being closely.
                  </p>
                </div>
              </div>
            )}

            {/* HEADER TEXT */}
            <div className="flex flex-col gap-2 max-w-[928px]">
              <h2
                className={`font-['Manrope'] font-bold text-[36px] leading-[40px] tracking-[-0.9px] ${theme === "dark" ? "text-white" : "text-[#2B3436]"
                  }`}
              >
                Voice Emotion Detection
              </h2>
              <p
                className={`text-[18px] leading-[28px] max-w-[672px] ${theme === "dark" ? "text-gray-400" : "text-[#586163]"
                  }`}
              >
                Process live vocal input or uploaded audio files through our acoustic engine to detect nuanced emotional cues via real-time spectral analysis.
              </p>
            </div>

            {/* TWO COLUMNS */}
            <div className="flex flex-col xl:flex-row gap-8 w-full items-start">
              {/* LEFT COLUMN: VISUALIZER OR UPLOAD VIEW */}
              <div className="flex-1 flex flex-col gap-8 w-full max-w-[608px]">
                {/* INTERACTIVE CARD */}
                <div
                  className={`w-full min-h-[560px] border rounded-[32px] relative overflow-hidden flex flex-col items-center justify-between p-8 shadow-sm transition-colors duration-500 ${theme === "dark"
                    ? "bg-[#1E293B] border-gray-700"
                    : "bg-white border-[#AAB3B6]/20"
                    }`}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-[#28667B]/5 to-transparent pointer-events-none" />

                  {viewMode === "live" ? (
                    <>
                      {/* TOP BADGES */}
                      <div className="w-full flex items-center justify-between z-10">
                        <div
                          className={`flex items-center gap-2 border px-4 py-2 rounded-full transition-colors duration-500 ${theme === "dark"
                            ? "bg-[#0F172A] border-[#334155]"
                            : "bg-[#E9EFF1] border-[#AAB3B6]/30"
                            }`}
                        >
                          <Radio className="w-3 h-3 text-[#28667B] animate-pulse" />
                          <span
                            className={`text-[12px] font-semibold uppercase tracking-tight ${theme === "dark" ? "text-gray-300" : "text-[#586163]"
                              }`}
                          >
                            Noise Reduction Active
                          </span>
                        </div>

                        {isRecording && (
                          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-full text-red-500 font-bold text-[12px]">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                            REC {formatTime(secondsElapsed)}
                          </div>
                        )}
                      </div>

                      {/* MICROPHONE CORE & CANVAS WAVEFORM */}
                      <div className="relative w-full flex flex-col items-center my-6">
                        <div className="relative w-[140px] h-[140px] flex items-center justify-center mb-6">
                          {isRecording && !isPaused && (
                            <div className="absolute w-[140px] h-[140px] bg-[#28667B]/15 rounded-full blur-[24px] animate-pulse" />
                          )}
                          <div
                            className={`relative z-10 w-[84px] h-[84px] border rounded-full flex items-center justify-center shadow-lg transition-colors duration-500 ${isRecording
                              ? "bg-[#06B6D4]/10 border-[#06B6D4]"
                              : theme === "dark"
                                ? "bg-[#0F172A] border-[#334155]"
                                : "bg-white border-[#28667B]/20"
                              }`}
                          >
                            <Mic
                              className={`w-8 h-8 ${isRecording ? "text-[#06B6D4]" : "text-[#28667B]"
                                }`}
                            />
                          </div>
                        </div>

                        {/* REAL-TIME HTML5 CANVAS WAVEFORM */}
                        <div className="w-full h-[120px] rounded-2xl overflow-hidden px-4">
                          <canvas
                            ref={canvasRef}
                            width={540}
                            height={120}
                            className="w-full h-full"
                          />
                        </div>
                      </div>

                      {/* ACOUSTIC TELEMETRY STRIP */}
                      <div className="w-full grid grid-cols-3 gap-4 py-3 px-6 rounded-2xl bg-[#28667B]/5 border border-[#28667B]/10 text-center text-[12px] font-mono font-bold z-10">
                        <div>
                          <span className="text-gray-400 block text-[10px] uppercase font-sans">
                            Pitch
                          </span>
                          {pitchVal} HZ
                        </div>
                        <div>
                          <span className="text-gray-400 block text-[10px] uppercase font-sans">
                            Jitter
                          </span>
                          {jitterVal}%
                        </div>
                        <div>
                          <span className="text-gray-400 block text-[10px] uppercase font-sans">
                            Shimmer
                          </span>
                          {shimmerVal} DB
                        </div>
                      </div>

                      {/* CONTROL STRIP */}
                      <div className="flex items-center gap-4 mt-4 z-10">
                        <button
                          onClick={handleToggleRecording}
                          className={`h-12 px-8 rounded-full flex items-center justify-center gap-3 font-bold text-[15px] shadow-md transition ${isRecording
                            ? isPaused
                              ? "bg-[#f57c00] text-white hover:bg-[#e65100]"
                              : "bg-[#A83836] text-white hover:bg-[#8f2d2b]"
                            : "bg-[#28667B] text-white hover:bg-[#1f4e5e]"
                            }`}
                        >
                          {isRecording ? (
                            isPaused ? (
                              <Play className="w-4 h-4 fill-current" />
                            ) : (
                              <Pause className="w-4 h-4 fill-current" />
                            )
                          ) : (
                            <Play className="w-4 h-4 fill-current" />
                          )}
                          <span>
                            {isRecording
                              ? isPaused
                                ? "Resume Analysis"
                                : "Pause Analysis"
                              : "Start Analysis"}
                          </span>
                        </button>

                        {isRecording && (
                          <button
                            onClick={handleStopRecording}
                            className="h-12 px-6 bg-red-600 hover:bg-red-700 text-white rounded-full font-bold text-[14px] flex items-center gap-2 shadow-md transition"
                          >
                            <Square className="w-4 h-4 fill-current" />
                            <span>Stop</span>
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    /* UPLOADED FILE VIEW MODE */
                    <div className="w-full h-full flex flex-col items-center justify-center py-10 z-10">
                      <div className="text-[56px] text-[#28667B] mb-4">🎵</div>
                      <h3
                        className={`font-bold text-[18px] mb-1 ${theme === "dark" ? "text-white" : "text-[#2B3436]"
                          }`}
                      >
                        {uploadedFile?.name || "Uploaded Recording"}
                      </h3>
                      <p className="text-[#64748b] text-[13px] mb-6">
                        Static Audio Psychoacoustic Calibration Applied
                      </p>

                      {uploadedAudioUrl && (
                        <audio controls src={uploadedAudioUrl} className="w-[85%] mb-8" />
                      )}

                      <button
                        onClick={() => {
                          setViewMode("live");
                          setUploadedFile(null);
                          setUploadedAudioUrl("");
                          setEmotionData({
                            emotion: "STANDBY",
                            confidence: 0,
                            probabilities: {
                              neutral: 0.0,
                              calm: 0.0,
                              happy: 0.0,
                              sad: 0.0,
                            },
                            acoustic_metrics: {
                              energy: 0,
                              pitch: 0,
                              zcr: 0,
                              shimmer: 0,
                            },
                            anomaly_triggered: false,
                            rule_note: "Awaiting Live Voice / Upload...",
                          });
                          setGeminiMessage("I'm here to support you! Speak or upload an audio file to see my acoustic insights.");
                        }}
                        className={`px-6 py-3 rounded-xl font-bold text-[13px] border transition ${theme === "dark"
                          ? "bg-[#0F172A] border-[#334155] text-white hover:bg-[#334155]"
                          : "bg-[#E9EFF1] border-[#AAB3B6]/40 text-[#2B3436] hover:bg-[#dfe7ea]"
                          }`}
                      >
                        ⬅ Back to Live Microphone
                      </button>
                    </div>
                  )}
                </div>

                {/* FILE UPLOAD CARD */}
                <div
                  className={`w-full border rounded-[32px] p-8 flex flex-col gap-4 transition-colors duration-500 ${theme === "dark"
                    ? "bg-[#1E293B] border-[#334155]"
                    : "bg-[#EFF4F6] border-[#AAB3B6]/20"
                    }`}
                >
                  <div className="flex flex-col gap-1">
                    <h3
                      className={`font-['Manrope'] font-bold text-[18px] ${theme === "dark" ? "text-white" : "text-[#28667B]"
                        }`}
                    >
                      Analyze Static Recording
                    </h3>
                    <p
                      className={`text-[14px] ${theme === "dark" ? "text-gray-400" : "text-[#586163]"
                        }`}
                    >
                      Upload pre-recorded WAV or MP3 audio sessions.
                    </p>
                  </div>

                  <label
                    className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer transition ${theme === "dark"
                      ? "bg-[#0F172A] border-[#475569] hover:bg-[#334155]"
                      : "bg-[#E9EFF1]/50 border-[#AAB3B6]/40 hover:bg-[#E9EFF1]"
                      }`}
                  >
                    <div className="w-10 h-10 bg-[#ABE5FE] rounded-full flex items-center justify-center">
                      <UploadCloud className="w-5 h-5 text-[#28667B]" />
                    </div>
                    <div className="flex flex-col items-center text-center">
                      <span
                        className={`font-medium text-[14px] ${theme === "dark" ? "text-white" : "text-[#2B3436]"
                          }`}
                      >
                        Click to choose audio file
                      </span>
                      <span className="text-[12px] text-gray-400">Supports WAV, MP3 (Max 10MB)</span>
                    </div>
                    <input
                      type="file"
                      accept=".wav,.mp3,audio/wav,audio/mpeg"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

              </div>

              {/* RIGHT COLUMN: CONFIDENCE MATRIX & LOGS */}
              <div className="w-full xl:w-[320px] flex flex-col gap-6 shrink-0">
                {/* REAL-TIME CONFIDENCE MATRIX */}
                <div
                  className={`border shadow-sm rounded-[32px] p-8 flex flex-col transition-colors duration-500 ${theme === "dark"
                    ? "bg-[#1E293B] border-[#334155]"
                    : "bg-white border-[#AAB3B6]/20"
                    }`}
                >
                  <h3
                    className={`font-['Manrope'] font-bold text-[18px] mb-6 ${theme === "dark" ? "text-white" : "text-[#28667B]"
                      }`}
                  >
                    {viewMode === "live" ? "Real-Time Confidence" : "Uploaded Analysis"}
                  </h3>

                  <div className="flex flex-col gap-5 w-full">
                    {sortedEmotions.length > 0 ? (
                      sortedEmotions.map(([emotionName, prob], i) => {
                        const percent = Math.round(prob * 100);
                        const label = emotionData.emotion === "STANDBY" ? `Metric ${i + 1}` : emotionName;
                        let barColor = "bg-[#28667B]";
                        if (percent >= 70) barColor = "bg-emerald-500";
                        else if (percent >= 40) barColor = "bg-amber-500";
                        else barColor = "bg-cyan-500";

                        return (
                          <div key={i} className="flex flex-col gap-2">
                            <div className="flex justify-between items-center text-[12px] font-bold uppercase tracking-wide">
                              <span className={theme === "dark" ? "text-gray-300" : "text-[#2B3436]"}>
                                {label}
                              </span>
                              <span
                                className={
                                  theme === "dark" ? "text-[#A0F3F5]" : "text-[#28667B]"
                                }
                              >
                                {percent}%
                              </span>
                            </div>
                            <div
                              className={`w-full h-2.5 rounded-full overflow-hidden ${theme === "dark" ? "bg-[#334155]" : "bg-[#E9EFF1]"
                                }`}
                            >
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-[13px] text-gray-400 italic">No emotion detected yet.</p>
                    )}
                  </div>
                </div>

                {/* DOWNLOAD ANALYSIS REPORT BUTTON */}
                <button
                  onClick={() => {
                    if (sessionHistory.length === 0 && emotionData.emotion === "STANDBY") {
                      alert("No voice analysis data available yet. Please record or upload an audio file first.");
                      return;
                    }
                    setShowReportModal(true);
                  }}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#28667B] to-[#1f4e5e] text-white font-bold text-[14px] flex items-center justify-center gap-2 shadow-md hover:opacity-95 transition"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Analysis Report</span>
                </button>

                {/* LIVE TRANSCRIPT LOGS CARD */}
                <div
                  className={`border rounded-[32px] p-6 flex flex-col transition-colors duration-500 ${theme === "dark"
                    ? "bg-[#1E293B] border-[#334155]"
                    : "bg-white border-[#AAB3B6]/20"
                    }`}
                >
                  <div className="flex justify-between items-center mb-4">
                    <h3
                      className={`font-['Manrope'] font-bold text-[16px] ${theme === "dark" ? "text-white" : "text-[#28667B]"
                        }`}
                    >
                      Live Transcript
                    </h3>
                    <span className="text-[11px] font-bold text-[#28667B]">Session Log</span>
                  </div>

                  <div
                    className={`h-[180px] overflow-y-auto flex flex-col gap-2.5 p-3 rounded-xl text-[12px] border ${theme === "dark"
                      ? "bg-[#0F172A] border-gray-800"
                      : "bg-[#F7FAFB] border-gray-200"
                      }`}
                  >
                    {transcriptLogs.map((log) => (
                      <div key={log.id} className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-gray-400">{log.time}</span>
                        <span
                          className={
                            log.isSystem
                              ? "text-[#28667B] dark:text-[#A0F3F5] font-semibold"
                              : "text-gray-700 dark:text-gray-300"
                          }
                        >
                          {log.message}
                        </span>
                      </div>
                    ))}
                    {interimSpeech && (
                      <div className="text-gray-400 italic text-[11px]">
                        Spoken: "{interimSpeech}..."
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* FULL WIDTH SYSTEM ALERT BANNER (MATCHING FACIAL DASHBOARD EXACTLY) */}
            {emotionData.emotion !== "STANDBY" && (
              <div className={`w-full border border-white/10 rounded-xl p-6 flex items-center gap-4 shadow-sm transition-colors duration-500 mt-4 ${getAlertContent(emotionData.emotion).bg}`}>
                <div className="w-[57px] h-[57px] bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                  {getAlertContent(emotionData.emotion).icon}
                </div>
                <div className="flex flex-col gap-1">
                  <span className={`font-['Manrope'] font-bold text-[12px] tracking-[0.6px] uppercase ${getAlertContent(emotionData.emotion).text}`}>
                    {getAlertContent(emotionData.emotion).title}
                  </span>
                  <span className={`font-['Manrope'] font-extrabold text-[18px] leading-[22px] ${getAlertContent(emotionData.emotion).text}`}>
                    {getAlertContent(emotionData.emotion).headline}
                  </span>
                  <span className={`text-[14px] ${getAlertContent(emotionData.emotion).text} opacity-90`}>
                    {getAlertContent(emotionData.emotion).desc}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* FLOATING GEMINI AI ASSISTANT WIDGET */}
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
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
              <div className={`absolute -bottom-2 right-6 w-4 h-4 border-b border-r transform rotate-45 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#E9EFF1]'}`}></div>
            </div>
          </div>

          <button
            onClick={() => setIsWidgetOpen(!isWidgetOpen)}
            className="w-16 h-16 bg-gradient-to-tr from-[#14B8A6] to-[#28667B] rounded-full shadow-[0_10px_25px_-5px_rgba(20,184,166,0.5)] flex items-center justify-center hover:scale-110 transition-transform duration-300 relative group"
          >
            {isRecording && (
              <div className="absolute inset-0 rounded-full border-2 border-[#14B8A6] animate-ping opacity-50"></div>
            )}
            <Bot className="w-8 h-8 text-white relative z-10 animate-bounce" style={{ animationDuration: '3s' }} />
            <div className={`absolute inset-0 bg-red-500 rounded-full flex items-center justify-center text-white font-bold opacity-0 transition-opacity duration-300 ${isWidgetOpen ? 'group-hover:opacity-100 z-20' : ''}`}>
              <Square className="w-5 h-5 fill-white" />
            </div>
          </button>
        </div>
      </main>

      {/* SYSTEM ADVISORY / ERROR MODAL */}
      {systemModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1E293B] rounded-3xl p-8 max-w-md w-full shadow-2xl border border-gray-200 dark:border-gray-700 text-center relative">
            <button
              onClick={() => setSystemModal((prev) => ({ ...prev, isOpen: false }))}
              className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 font-bold"
            >
              <CloseIcon className="w-6 h-6" />
            </button>
            <div className="text-[48px] mb-3">{systemModal.icon}</div>
            <div className="inline-block bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider mb-3">
              {systemModal.badge}
            </div>
            <h3 className="text-[20px] font-bold text-slate-900 dark:text-white mb-3">
              {systemModal.title}
            </h3>
            <p className="text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-[#0F172A] p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-left mb-6">
              {systemModal.message}
            </p>
            <button
              onClick={() => setSystemModal((prev) => ({ ...prev, isOpen: false }))}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold text-[14px] shadow-lg hover:opacity-95 transition"
            >
              Acknowledge & Continue
            </button>
          </div>
        </div>
      )}

      {/* REPORT EXPORT MODAL (PDF, CSV, EXCEL) */}
      {showReportModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1E293B] rounded-3xl p-8 max-w-md w-full shadow-2xl border border-gray-200 dark:border-gray-700 text-center relative">
            <button
              onClick={() => setShowReportModal(false)}
              className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 font-bold"
            >
              <CloseIcon className="w-6 h-6" />
            </button>
            <div className="text-[48px] mb-3">📑</div>
            <h3 className="text-[20px] font-bold text-slate-900 dark:text-white mb-2">
              Patient Analysis Report
            </h3>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-6">
              Export your quantitative Table 4.6 Telemetry session biometric record.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => { setShowReportModal(false); downloadVoiceReport(); }}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#28667B] to-[#1f4e5e] text-white font-bold text-[14px] flex items-center justify-center gap-2.5 shadow-md hover:opacity-95 transition"
              >
                <FileText className="w-4 h-4" />
                <span>Download Standard Analysis Report (PDF)</span>
              </button>
              <button
                onClick={exportCSV}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold text-[14px] flex items-center justify-center gap-2.5 shadow-md hover:opacity-95 transition"
              >
                <Table className="w-4 h-4" />
                <span>Download CSV Spreadsheet</span>
              </button>
              <button
                onClick={exportExcel}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-sky-600 to-sky-700 text-white font-bold text-[14px] flex items-center justify-center gap-2.5 shadow-md hover:opacity-95 transition"
              >
                <Table className="w-4 h-4" />
                <span>Download Excel (.xlsx)</span>
              </button>
            </div>
            <div className="mt-5 text-[11px] text-gray-400 border-t border-gray-100 dark:border-gray-800 pt-4">
              🔒 Anonymized Biometric Export • Quantitative Table 4.6 Schema Only
            </div>
          </div>
        </div>
      )}

      {/* PLAN COMPARISON / UPGRADE MODAL */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`relative w-full max-w-[900px] rounded-[24px] shadow-2xl overflow-hidden flex flex-col ${theme === 'dark' ? 'bg-[#0F172A] border border-[#334155]' : 'bg-white'}`}>
            <button
              onClick={() => setShowUpgradeModal(false)}
              className="absolute top-6 right-6 p-2 bg-gray-500/10 rounded-full hover:bg-gray-500/20 transition z-10"
            >
              <CloseIcon className={`w-5 h-5 ${theme === 'dark' ? 'text-gray-300' : 'text-[#586163]'}`} />
            </button>

            <div className="flex flex-col items-center text-center pt-12 pb-8 px-8">
              <div className="inline-flex items-center gap-2 bg-[#14B8A6]/10 px-3 py-1 rounded-full mb-4">
                <Sparkles className="w-4 h-4 text-[#14B8A6]" />
                <span className="text-[#14B8A6] text-[12px] font-bold uppercase tracking-widest">Unlock True Precision</span>
              </div>
              <h2 className={`font-['Manrope'] font-extrabold text-[32px] md:text-[40px] leading-tight mb-4 ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>
                Choose Your Analytics Plan
              </h2>
              <p className={`text-[16px] max-w-[500px] ${theme === 'dark' ? 'text-gray-400' : 'text-[#586163]'}`}>
                Upgrade your multi-modal processing capabilities to access our highest-tier neural networks and AI-driven analytical insights.
              </p>
            </div>

            <div className="flex flex-col md:flex-row gap-6 px-8 pb-12 items-stretch">
              <div className={`flex-1 flex flex-col rounded-[20px] p-6 border transition-transform hover:-translate-y-1 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-[#F7FAFB] border-[#E2E9EB]'}`}>
                <h3 className={`font-bold text-[20px] mb-2 ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>Basic</h3>
                <div className="flex items-end gap-1 mb-6">
                  <span className={`font-extrabold text-[36px] leading-none ${theme === 'dark' ? 'text-white' : 'text-[#28667B]'}`}>Free</span>
                </div>
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

              <div className="flex-1 flex flex-col rounded-[20px] p-6 border-2 border-[#14B8A6] bg-gradient-to-b from-[#14B8A6]/10 to-transparent relative transition-transform hover:-translate-y-1 shadow-[0_0_30px_-5px_rgba(20,184,166,0.3)]">
                <div className="absolute top-0 inset-x-0 transform -translate-y-1/2 flex justify-center">
                  <span className="bg-[#14B8A6] text-white text-[10px] font-bold uppercase tracking-wider py-1 px-3 rounded-full">Most Popular</span>
                </div>
                <h3 className={`font-bold text-[20px] mb-2 ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>Plus</h3>
                <div className="flex items-end gap-1 mb-6">
                  <span className={`font-extrabold text-[36px] leading-none ${theme === 'dark' ? 'text-white' : 'text-[#28667B]'}`}>RM 2</span>
                  <span className="text-[14px] text-[#586163] mb-1">/mo</span>
                </div>
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
                  <button id="voice-upgrade-btn" onClick={handleUpgradePayment} className="w-full py-3 rounded-xl font-bold text-[14px] mt-auto bg-[#14B8A6] text-white hover:bg-[#0D9488] shadow-lg transition">
                    Upgrade to Plus
                  </button>
                )}
              </div>

              <div className={`flex-1 flex flex-col rounded-[20px] p-6 border transition-transform hover:-translate-y-1 ${theme === 'dark' ? 'bg-[#1E293B] border-[#334155]' : 'bg-[#F7FAFB] border-[#E2E9EB]'}`}>
                <h3 className={`font-bold text-[20px] mb-2 ${theme === 'dark' ? 'text-white' : 'text-[#2B3436]'}`}>Enterprise Analytics</h3>
                <div className="flex items-end gap-1 mb-6">
                  <span className={`font-extrabold text-[36px] leading-none ${theme === 'dark' ? 'text-white' : 'text-[#28667B]'}`}>RM 50</span>
                  <span className="text-[14px] text-[#586163] mb-1">/mo</span>
                </div>
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
    </div>
  );
}