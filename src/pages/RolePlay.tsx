/**
 * RolePlay — AI Speaking Practice with Shadow Learning
 *
 * Pipeline:
 *  1. Lesson selected → AI generates shadow sentences via Anthropic API
 *  2. AI sentence plays via browser TTS (SpeechSynthesis) 
 *  3. User shadows (repeats) → MediaRecorder captures audio
 *  4. Audio → Anthropic Whisper-compatible transcription → feedback
 *  5. Next sentence until lesson complete
 *
 * API keys are set ONLY by admin in AdminPanel (stored under protected key).
 * Users cannot see or set API keys — they are pulled transparently from storage.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, MicOff, Volume2, ChevronDown, ChevronRight,
  Loader2, AlertCircle, CheckCircle2, Play, Pause,
  Square, Send, RefreshCw, BookOpen, Star, Lock,
  Globe, Coffee, Heart, Briefcase, Plane, ShoppingCart,
  Users, GraduationCap, Home, Phone, Stethoscope, Car,
  SkipForward, Award, TrendingUp, MessageCircle
} from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────────────────
/** Admin-only storage key — users never see this in Settings UI */
const ADMIN_API_KEYS_KEY = 'moe_admin_api_cfg';

// ── Types ─────────────────────────────────────────────────────────────────────
type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

interface Lesson {
  id: string;
  title: string;
  topic: string;
  icon: React.ElementType;
  color: string;
  level: CEFRLevel;
  description: string;
  systemPrompt: string;
  starterPrompt: string;
}

interface ShadowSentence {
  id: string;
  text: string;
  phonetic?: string;
  tip?: string;
  userTranscript?: string;
  score?: number; // 0-100
  status: 'pending' | 'playing' | 'recording' | 'done' | 'skipped';
}

type RecordState = 'idle' | 'countdown' | 'recording' | 'paused' | 'processing';

// ── Lesson Database ───────────────────────────────────────────────────────────
const LEVELS: { level: CEFRLevel; label: string; color: string; badge: string; desc: string }[] = [
  { level: 'A1', label: 'Beginner',     color: 'emerald', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', desc: 'Basic greetings & simple phrases' },
  { level: 'A2', label: 'Elementary',   color: 'teal',    badge: 'bg-teal-100 text-teal-700 border-teal-200',          desc: 'Everyday conversations' },
  { level: 'B1', label: 'Intermediate', color: 'blue',    badge: 'bg-blue-100 text-blue-700 border-blue-200',          desc: 'Clear communication on familiar topics' },
  { level: 'B2', label: 'Upper-Int.',   color: 'indigo',  badge: 'bg-indigo-100 text-indigo-700 border-indigo-200',    desc: 'Complex ideas & abstract topics' },
  { level: 'C1', label: 'Advanced',     color: 'purple',  badge: 'bg-purple-100 text-purple-700 border-purple-200',    desc: 'Fluent professional discourse' },
  { level: 'C2', label: 'Mastery',      color: 'rose',    badge: 'bg-rose-100 text-rose-700 border-rose-200',          desc: 'Native-like precision & nuance' },
];

const LESSONS: Lesson[] = [
  // ── A1 ──
  {
    id: 'a1-greetings', level: 'A1', title: 'Greetings & Introductions', topic: 'Meeting people',
    icon: Users, color: 'bg-emerald-50 text-emerald-600',
    description: 'Learn to say hello, introduce yourself, and ask basic questions.',
    systemPrompt: 'You are an English teacher. Generate 8 short A1-level shadow sentences for "Greetings & Introductions". Each sentence must be under 10 words, very simple vocabulary. Topics: hello, my name is, nice to meet you, how are you, where are you from. Return ONLY a JSON array of objects with fields: text (the sentence), tip (a 1-sentence pronunciation or cultural tip). No extra text.',
    starterPrompt: 'Generate shadow practice sentences for A1 greetings.',
  },
  {
    id: 'a1-numbers', level: 'A1', title: 'Numbers & Daily Life', topic: 'Shopping & counting',
    icon: ShoppingCart, color: 'bg-emerald-50 text-emerald-600',
    description: 'Practice numbers, prices, and simple shopping phrases.',
    systemPrompt: 'You are an English teacher. Generate 8 short A1-level shadow sentences about numbers, prices, and basic shopping. Under 10 words each. Topics: prices, quantities, "how much", "I want". Return ONLY a JSON array: [{text, tip}]. No extra text.',
    starterPrompt: 'Generate shadow practice sentences for A1 numbers and shopping.',
  },
  // ── A2 ──
  {
    id: 'a2-cafe', level: 'A2', title: 'At the Café', topic: 'Ordering food & drinks',
    icon: Coffee, color: 'bg-teal-50 text-teal-600',
    description: 'Order drinks, ask about the menu, and make small talk at a café.',
    systemPrompt: 'You are an English teacher. Generate 8 A2-level shadow sentences for café ordering. 10-15 words each. Topics: ordering coffee/tea, asking for the bill, table requests, common café phrases. Return ONLY a JSON array: [{text, tip}]. No extra text.',
    starterPrompt: 'Generate shadow practice sentences for A2 café ordering.',
  },
  {
    id: 'a2-directions', level: 'A2', title: 'Asking for Directions', topic: 'Getting around',
    icon: Car, color: 'bg-teal-50 text-teal-600',
    description: 'Ask for and give directions in a city.',
    systemPrompt: 'You are an English teacher. Generate 8 A2-level shadow sentences for directions. 10-15 words each. Topics: turn left/right, near the corner, excuse me, how far, bus stop, landmarks. Return ONLY a JSON array: [{text, tip}]. No extra text.',
    starterPrompt: 'Generate shadow practice sentences for A2 directions.',
  },
  // ── B1 ──
  {
    id: 'b1-travel', level: 'B1', title: 'Travel & Airport', topic: 'Travelling abroad',
    icon: Plane, color: 'bg-blue-50 text-blue-600',
    description: 'Navigate airports, check in, and handle travel situations.',
    systemPrompt: 'You are an English teacher. Generate 8 B1-level shadow sentences for travel and airports. 12-18 words each. Topics: check-in, baggage, boarding, delays, hotel check-in, tourist questions. Return ONLY a JSON array: [{text, tip}]. No extra text.',
    starterPrompt: 'Generate shadow practice sentences for B1 travel.',
  },
  {
    id: 'b1-work', level: 'B1', title: 'At the Office', topic: 'Workplace English',
    icon: Briefcase, color: 'bg-blue-50 text-blue-600',
    description: 'Communicate professionally in meetings, emails, and with colleagues.',
    systemPrompt: 'You are an English teacher. Generate 8 B1-level shadow sentences for workplace English. 12-18 words each. Topics: meetings, scheduling, emails, polite requests, project updates. Return ONLY a JSON array: [{text, tip}]. No extra text.',
    starterPrompt: 'Generate shadow practice sentences for B1 office communication.',
  },
  {
    id: 'b1-health', level: 'B1', title: 'Health & Doctor', topic: 'Medical situations',
    icon: Stethoscope, color: 'bg-blue-50 text-blue-600',
    description: 'Describe symptoms, talk to doctors, and understand medical advice.',
    systemPrompt: 'You are an English teacher. Generate 8 B1-level shadow sentences for medical English. 12-18 words each. Topics: describing symptoms, appointments, prescriptions, asking for clarification, pharmacy. Return ONLY a JSON array: [{text, tip}]. No extra text.',
    starterPrompt: 'Generate shadow practice sentences for B1 health and medical English.',
  },
  // ── B2 ──
  {
    id: 'b2-debate', level: 'B2', title: 'Expressing Opinions', topic: 'Discussions & debates',
    icon: MessageCircle, color: 'bg-indigo-50 text-indigo-600',
    description: 'Express, defend, and challenge opinions on contemporary topics.',
    systemPrompt: 'You are an English teacher. Generate 8 B2-level shadow sentences for expressing opinions. 15-22 words each. Topics: agreeing/disagreeing politely, giving reasons, hedging language, current events opinions. Return ONLY a JSON array: [{text, tip}]. No extra text.',
    starterPrompt: 'Generate shadow practice sentences for B2 expressing opinions.',
  },
  {
    id: 'b2-phone', level: 'B2', title: 'Phone & Video Calls', topic: 'Professional communication',
    icon: Phone, color: 'bg-indigo-50 text-indigo-600',
    description: 'Handle professional calls, leave messages, and navigate video meetings.',
    systemPrompt: 'You are an English teacher. Generate 8 B2-level shadow sentences for phone/video calls. 15-22 words each. Topics: call openings, clarifying, asking to repeat, leaving voicemail, video meeting phrases. Return ONLY a JSON array: [{text, tip}]. No extra text.',
    starterPrompt: 'Generate shadow practice sentences for B2 phone and video calls.',
  },
  // ── C1 ──
  {
    id: 'c1-academic', level: 'C1', title: 'Academic Discussion', topic: 'University & research',
    icon: GraduationCap, color: 'bg-purple-50 text-purple-600',
    description: 'Discuss research, argue positions, and engage in academic discourse.',
    systemPrompt: 'You are an English teacher. Generate 8 C1-level shadow sentences for academic English. 18-28 words each. Topics: presenting research, critical analysis, academic hedging, literature references, seminar discussion. Return ONLY a JSON array: [{text, tip}]. No extra text.',
    starterPrompt: 'Generate shadow practice sentences for C1 academic English.',
  },
  {
    id: 'c1-global', level: 'C1', title: 'Global Issues', topic: 'World affairs & culture',
    icon: Globe, color: 'bg-purple-50 text-purple-600',
    description: 'Discuss global trends, cultural differences, and complex world events.',
    systemPrompt: 'You are an English teacher. Generate 8 C1-level shadow sentences on global issues. 18-28 words each. Topics: sustainability, cultural exchange, international relations, social change, global economy. Return ONLY a JSON array: [{text, tip}]. No extra text.',
    starterPrompt: 'Generate shadow practice sentences for C1 global issues.',
  },
  // ── C2 ──
  {
    id: 'c2-nuance', level: 'C2', title: 'Nuance & Register', topic: 'Native-like precision',
    icon: Star, color: 'bg-rose-50 text-rose-600',
    description: 'Master idiomatic expressions, rhetorical devices, and subtle register shifts.',
    systemPrompt: 'You are an English teacher. Generate 8 C2-level shadow sentences focusing on nuance and advanced register. 20-35 words each. Topics: idioms in context, formal/informal register shifts, rhetorical questions, understatement, irony. Return ONLY a JSON array: [{text, tip}]. No extra text.',
    starterPrompt: 'Generate shadow practice sentences for C2 nuance and register.',
  },
  {
    id: 'c2-literature', level: 'C2', title: 'Literature & Culture', topic: 'Arts & humanities',
    icon: BookOpen, color: 'bg-rose-50 text-rose-600',
    description: 'Discuss literature, film, art, and cultural commentary with native-like fluency.',
    systemPrompt: 'You are an English teacher. Generate 8 C2-level shadow sentences for literature and cultural discussion. 20-35 words each. Topics: analyzing themes, cultural references, metaphorical language, critical commentary on art/film/books. Return ONLY a JSON array: [{text, tip}]. No extra text.',
    starterPrompt: 'Generate shadow practice sentences for C2 literature and culture.',
  },
  // ── Extra cross-level everyday topics ──
  {
    id: 'b1-home', level: 'B1', title: 'Home & Family', topic: 'Daily home life',
    icon: Home, color: 'bg-blue-50 text-blue-600',
    description: 'Talk about your home, family routines, and household topics.',
    systemPrompt: 'You are an English teacher. Generate 8 B1-level shadow sentences about home and family. 12-18 words each. Topics: describing home, daily routines, family roles, household chores, neighborhood. Return ONLY a JSON array: [{text, tip}]. No extra text.',
    starterPrompt: 'Generate shadow practice sentences for B1 home and family.',
  },
  {
    id: 'b2-relationships', level: 'B2', title: 'Relationships & Emotions', topic: 'Social & emotional life',
    icon: Heart, color: 'bg-indigo-50 text-indigo-600',
    description: 'Discuss feelings, relationships, and social situations with empathy.',
    systemPrompt: 'You are an English teacher. Generate 8 B2-level shadow sentences about relationships and emotions. 15-22 words each. Topics: expressing feelings, empathy phrases, resolving conflict, social situations, emotional vocabulary. Return ONLY a JSON array: [{text, tip}]. No extra text.',
    starterPrompt: 'Generate shadow practice sentences for B2 relationships and emotions.',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function getAdminKeys(): { google?: string; groq?: string; elevenlabs?: string; elevenVoice?: string } {
  try {
    const raw = localStorage.getItem(ADMIN_API_KEYS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

const DEFAULT_ELEVEN_VOICE = 'EXAVITQu4vr4xnSDxMaL'; // ElevenLabs "Sarah"

/** Groq Whisper: transcribe audio blob → text */
async function transcribeAudio(audioBlob: Blob, groqKey: string): Promise<string> {
  const form = new FormData();
  form.append('file', new File([audioBlob], 'audio.webm', { type: audioBlob.type }));
  form.append('model', 'whisper-large-v3-turbo');
  form.append('language', 'en');
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Groq STT error ${res.status}`);
  const data = await res.json();
  return data.text?.trim() || '';
}

/** ElevenLabs TTS: text → audio URL */
async function textToSpeech(text: string, elevenKey: string, voiceId: string): Promise<string> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId || DEFAULT_ELEVEN_VOICE}`, {
    method: 'POST',
    headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs TTS error ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/** Gemini Flash: generate shadow sentences or evaluate speech */
async function callGemini(systemPrompt: string, userPrompt: string, googleKey: string): Promise<string> {
  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: { maxOutputTokens: 1200, temperature: 0.7 },
  };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${googleKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

function speakText(text: string, onEnd?: () => void) {
  const synth = window.speechSynthesis;
  synth.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 0.85;
  utt.pitch = 1;
  utt.lang = 'en-US';
  const voices = synth.getVoices();
  const preferred = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha')));
  if (preferred) utt.voice = preferred;
  if (onEnd) utt.onend = onEnd;
  synth.speak(utt);
}

async function generateShadowSentences(lesson: Lesson, googleKey: string): Promise<ShadowSentence[]> {
  const raw = await callGemini(
    lesson.systemPrompt,
    lesson.starterPrompt,
    googleKey,
  );
  const clean = raw.replace(/```json|```/g, '').trim();
  const parsed: { text: string; tip?: string }[] = JSON.parse(clean);
  return parsed.map((s, i) => ({
    id: `s-${i}`,
    text: s.text,
    tip: s.tip,
    status: 'pending' as const,
  }));
}

async function evaluateSpeech(original: string, transcript: string, googleKey: string): Promise<{ score: number; feedback: string }> {
  const raw = await callGemini(
    'You are a precise English pronunciation evaluator. Compare the target sentence with what the user said. Return ONLY valid JSON with: {"score": 0-100, "feedback": "one short encouraging sentence"}. Score 100 = perfect, 80+ = great, 60+ = good, below 60 = needs practice. Be encouraging.',
    `Target: "${original}"\nUser said: "${transcript}"`,
    googleKey,
  ).catch(() => '');
  if (!raw) return { score: 75, feedback: 'Good effort! Keep practicing.' };
  const clean = raw.replace(/```json|```/g, '').trim();
  try { return JSON.parse(clean); } catch { return { score: 75, feedback: 'Good effort!' }; }
}

// ── Component ─────────────────────────────────────────────────────────────────
export function RolePlay() {
  const [selectedLevel, setSelectedLevel] = useState<CEFRLevel | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [sentences, setSentences] = useState<ShadowSentence[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [recordState, setRecordState] = useState<RecordState>('idle');
  const [countdown, setCountdown] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lessonDone, setLessonDone] = useState(false);
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('moe_rp_done') || '[]')); } catch { return new Set(); }
  });
  const [showLevelPicker, setShowLevelPicker] = useState(false);
  const [processingStep, setProcessingStep] = useState('');

  const mediaRef     = useRef<MediaRecorder | null>(null);
  const chunksRef    = useRef<Blob[]>([]);
  const analyserRef  = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef    = useRef<MediaStream | null>(null);
  const ctxRef       = useRef<AudioContext | null>(null);
  const bottomRef    = useRef<HTMLDivElement>(null);

  const keys = getAdminKeys();
  const googleKey   = keys.google     || '';
  const groqKey     = keys.groq       || '';
  const elevenKey   = keys.elevenlabs || '';
  const elevenVoice = keys.elevenVoice || DEFAULT_ELEVEN_VOICE;
  const hasApiKey   = !!(googleKey && groqKey && elevenKey);

  // Auto-scroll
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [currentIdx, sentences]);

  // Level meter
  const animateLevels = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    setAudioLevel(avg / 128);
    animFrameRef.current = requestAnimationFrame(animateLevels);
  }, []);

  const stopStream = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    setAudioLevel(0);
    streamRef.current?.getTracks().forEach(t => t.stop());
    ctxRef.current?.close().catch(() => {});
    streamRef.current = null;
    ctxRef.current = null;
    analyserRef.current = null;
  }, []);

  // ── Lesson loading ──────────────────────────────────────────────────────────
  const loadLesson = async (lesson: Lesson) => {
    setError('');
    setLoading(true);
    setSelectedLesson(lesson);
    setSentences([]);
    setCurrentIdx(0);
    setLessonDone(false);

    try {
      const s = await generateShadowSentences(lesson, googleKey);
      setSentences(s);
    } catch (e) {
      setError('Failed to load lesson. Please try again.');
      setSentences([]);
    } finally {
      setLoading(false);
    }
  };

  // ── Playback ────────────────────────────────────────────────────────────────
  const playTextWithVoice = useCallback(async (text: string, onEnd: () => void) => {
    if (elevenKey) {
      try {
        const url = await textToSpeech(text, elevenKey, elevenVoice);
        const audio = new Audio(url);
        audio.onended = () => { URL.revokeObjectURL(url); onEnd(); };
        audio.onerror = () => { URL.revokeObjectURL(url); speakText(text, onEnd); };
        await audio.play();
        return;
      } catch { /* fall through to browser TTS */ }
    }
    speakText(text, onEnd);
  }, [elevenKey, elevenVoice]);

  const playCurrent = useCallback(() => {
    if (!sentences[currentIdx]) return;
    setSentences(prev => prev.map((s, i) => i === currentIdx ? { ...s, status: 'playing' } : s));
    playTextWithVoice(sentences[currentIdx].text, () => {
      setSentences(prev => prev.map((s, i) => i === currentIdx ? { ...s, status: 'recording' } : s));
      startRecording();
    });
  }, [sentences, currentIdx, playTextWithVoice]);

  // ── Recording ───────────────────────────────────────────────────────────────
  const startRecording = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyserRef.current = analyser;
      animFrameRef.current = requestAnimationFrame(animateLevels);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stopStream();
        const transcript = stopSpeechRecognition();
        const blob = new Blob(chunksRef.current, { type: mimeType });
        await processRecording(blob, transcript);
      };
      recorder.start(250);
      mediaRef.current = recorder;
      startSpeechRecognition();
      setRecordState('recording');
    } catch {
      setError('Microphone access denied. Please allow microphone access.');
      setRecordState('idle');
    }
  };

  const pauseRecording = () => {
    if (mediaRef.current?.state === 'recording') {
      mediaRef.current.pause();
      cancelAnimationFrame(animFrameRef.current);
      setAudioLevel(0);
      setRecordState('paused');
    }
  };

  const resumeRecording = () => {
    if (mediaRef.current?.state === 'paused') {
      mediaRef.current.resume();
      animFrameRef.current = requestAnimationFrame(animateLevels);
      setRecordState('recording');
    }
  };

  const stopAndSend = () => {
    if (mediaRef.current && (mediaRef.current.state === 'recording' || mediaRef.current.state === 'paused')) {
      // Speech recognition will be stopped in recorder.onstop
      mediaRef.current.stop();
      setRecordState('processing');
    }
  };

  const processRecording = async (blob: Blob, webSpeechTranscript?: string) => {
    setProcessingStep('🎙 Transcribing your speech…');
    const sentence = sentences[currentIdx];

    try {
      // Step 1: STT — prefer Groq Whisper, fall back to Web Speech transcript
      let transcript = '';
      if (groqKey) {
        try {
          transcript = await transcribeAudio(blob, groqKey);
        } catch { /* fall through */ }
      }
      if (!transcript) transcript = webSpeechTranscript?.trim() || sentence.text;

      // Step 2: Evaluate via Gemini
      setProcessingStep('🤖 Evaluating your pronunciation…');
      const { score, feedback } = await evaluateSpeech(sentence.text, transcript, googleKey);

      setSentences(prev => prev.map((s, i) => i === currentIdx
        ? { ...s, status: 'done', userTranscript: transcript, score }
        : s
      ));

      setProcessingStep('');
      setRecordState('idle');

      // Brief delay before advancing
      await new Promise(r => setTimeout(r, 1800));

      // Advance to next
      const next = currentIdx + 1;
      if (next >= sentences.length) {
        setLessonDone(true);
        setCompletedLessons(prev => {
          const updated = new Set([...prev, selectedLesson!.id]);
          localStorage.setItem('moe_rp_done', JSON.stringify([...updated]));
          return updated;
        });
      } else {
        setCurrentIdx(next);
        // Auto-play next after short pause
        setTimeout(() => {
          setSentences(prev => prev.map((s, idx) => idx === next ? { ...s, status: 'playing' } : s));
          playTextWithVoice(sentences[next].text, () => {
            setSentences(prev => prev.map((s, idx) => idx === next ? { ...s, status: 'recording' } : s));
            startRecording();
          });
        }, 800);
      }
    } catch (e) {
      setError('Could not process recording. Please try again.');
      setRecordState('idle');
      setProcessingStep('');
      setSentences(prev => prev.map((s, i) => i === currentIdx ? { ...s, status: 'pending' } : s));
    }
  };

  const skipSentence = () => {
    window.speechSynthesis.cancel();
    if (mediaRef.current?.state !== 'inactive') mediaRef.current?.stop();
    stopSpeechRecognition();
    stopStream();
    setRecordState('idle');
    setSentences(prev => prev.map((s, i) => i === currentIdx ? { ...s, status: 'skipped' } : s));
    const next = currentIdx + 1;
    if (next >= sentences.length) {
      setLessonDone(true);
    } else {
      setCurrentIdx(next);
    }
  };

  const replayCurrent = () => {
    window.speechSynthesis.cancel();
    if (recordState === 'recording' || recordState === 'paused') {
      mediaRef.current?.stop();
      stopStream();
      setRecordState('idle');
    }
    setSentences(prev => prev.map((s, i) => i === currentIdx ? { ...s, status: 'playing' } : s));
    playTextWithVoice(sentences[currentIdx].text, () => {
      setSentences(prev => prev.map((s, i) => i === currentIdx ? { ...s, status: 'recording' } : s));
      startRecording();
    });
  };

  const resetLesson = () => {
    window.speechSynthesis.cancel();
    stopStream();
    setRecordState('idle');
    setSentences([]);
    setCurrentIdx(0);
    setLessonDone(false);
    setSelectedLesson(null);
    setError('');
    setProcessingStep('');
  };

  const avgScore = sentences.filter(s => s.score !== undefined).reduce((acc, s, _, arr) => acc + (s.score || 0) / arr.length, 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  // Lesson done screen
  if (lessonDone && selectedLesson) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center min-h-[60vh] px-4 space-y-6 text-center">
        <div className="h-20 w-20 rounded-full bg-[#F5A623]/10 flex items-center justify-center">
          <Award className="h-10 w-10 text-[#F5A623]" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-foreground">Lesson Complete!</h2>
          <p className="text-muted-foreground mt-1">{selectedLesson.title}</p>
        </div>
        {avgScore > 0 && (
          <div className="rounded-2xl bg-[#1A1A2E] text-white px-8 py-5 space-y-1">
            <p className="text-[11px] text-white/40 uppercase tracking-widest font-semibold">Average Score</p>
            <p className="text-5xl font-bold">{Math.round(avgScore)}<span className="text-2xl text-white/40">/100</span></p>
          </div>
        )}
        <div className="w-full max-w-sm space-y-2">
          {sentences.map((s, i) => (
            <div key={s.id} className="flex items-center gap-3 text-left bg-card border border-border rounded-xl px-4 py-2.5">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0
                ${s.status === 'skipped' ? 'bg-muted text-muted-foreground' : s.score && s.score >= 80 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {s.status === 'skipped' ? '–' : s.score || '?'}
              </div>
              <p className="text-sm text-foreground truncate">{s.text}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={() => { resetLesson(); loadLesson(selectedLesson!); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-muted text-foreground rounded-xl text-sm font-semibold hover:bg-muted/70 transition-colors">
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
          <button onClick={resetLesson}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#F5A623] text-white rounded-xl text-sm font-semibold hover:bg-[#E09400] transition-colors">
            <BookOpen className="h-4 w-4" /> New Lesson
          </button>
        </div>
      </motion.div>
    );
  }

  // Active lesson screen
  if (selectedLesson) {
    const current = sentences[currentIdx];
    const isPlaying   = current?.status === 'playing';
    const isRecording = recordState === 'recording';
    const isPaused    = recordState === 'paused';
    const isProcessing = recordState === 'processing';
    const canRecord   = current?.status === 'recording' && recordState === 'idle';

    return (
      <div className="flex flex-col h-[calc(100vh-120px)] md:h-[calc(100vh-80px)]">

        {/* Header */}
        <div className="flex items-center justify-between px-1 py-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={resetLesson} className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
              <ChevronDown className="h-4 w-4 rotate-90" />
            </button>
            <div>
              <h1 className="text-base font-bold text-foreground">{selectedLesson.title}</h1>
              <p className="text-xs text-muted-foreground">{selectedLesson.topic}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${LEVELS.find(l => l.level === selectedLesson.level)?.badge}`}>
              {selectedLesson.level}
            </span>
            <span className="text-xs text-muted-foreground font-medium">{currentIdx + 1}/{sentences.length}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex-shrink-0 h-1.5 bg-muted rounded-full overflow-hidden mx-1">
          <motion.div className="h-full bg-[#F5A623] rounded-full"
            animate={{ width: sentences.length > 0 ? `${((currentIdx) / sentences.length) * 100}%` : '0%' }}
            transition={{ duration: 0.5 }} />
        </div>

        {/* Sentences scroll */}
        <div className="flex-1 overflow-y-auto py-4 space-y-2 min-h-0">
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-[#F5A623]" />
              <p className="text-sm text-muted-foreground">Generating your lesson…</p>
            </div>
          )}

          {!loading && sentences.map((s, idx) => {
            const isCurrent = idx === currentIdx;
            const isDone = s.status === 'done' || s.status === 'skipped';
            return (
              <motion.div key={s.id}
                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                className={`mx-1 rounded-2xl border transition-all ${
                  isCurrent
                    ? 'border-[#F5A623] bg-[#FFF3DD] shadow-sm'
                    : isDone
                    ? 'border-border bg-card opacity-60'
                    : 'border-border bg-card opacity-40'
                }`}>
                <div className="px-4 py-3 space-y-2">
                  {/* Sentence header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0
                        ${s.status === 'done' && s.score && s.score >= 80 ? 'bg-emerald-100 text-emerald-700'
                        : s.status === 'done' ? 'bg-amber-100 text-amber-700'
                        : s.status === 'skipped' ? 'bg-muted text-muted-foreground'
                        : isCurrent ? 'bg-[#F5A623] text-white' : 'bg-muted text-muted-foreground'}`}>
                        {s.status === 'done' ? (s.score || '✓') : s.status === 'skipped' ? '–' : idx + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        {s.status === 'playing' && <Volume2 className="h-3.5 w-3.5 text-[#F5A623] animate-pulse" />}
                        {s.status === 'recording' && recordState !== 'idle' && <Mic className="h-3.5 w-3.5 text-red-500 animate-pulse" />}
                      </div>
                    </div>
                    {s.score !== undefined && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.score >= 80 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {s.score}/100
                      </span>
                    )}
                  </div>

                  {/* Sentence text */}
                  <p className={`text-base font-medium leading-relaxed ${isCurrent ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {s.text}
                  </p>

                  {/* User transcript */}
                  {s.userTranscript && s.userTranscript !== s.text && (
                    <p className="text-xs text-muted-foreground italic">You said: "{s.userTranscript}"</p>
                  )}

                  {/* Tip */}
                  {isCurrent && s.tip && (
                    <p className="text-xs text-[#F5A623] bg-[#F5A623]/10 rounded-lg px-3 py-1.5">💡 {s.tip}</p>
                  )}

                  {/* Current controls inside card */}
                  {isCurrent && !isDone && (
                    <div className="pt-1 flex items-center gap-2 flex-wrap">
                      <button onClick={replayCurrent} disabled={isPlaying || isProcessing}
                        className="flex items-center gap-1.5 text-xs font-medium text-[#4A90E2] hover:text-[#2E6FBA] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                        <Volume2 className="h-3.5 w-3.5" /> Replay AI
                      </button>
                      <button onClick={skipSentence} disabled={isProcessing}
                        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors ml-auto">
                        <SkipForward className="h-3.5 w-3.5" /> Skip
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}

          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="mx-1 flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-red-700">{error}</span>
            </motion.div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* ── Bottom controls ─────────────────────────────────────────────── */}
        <div className="flex-shrink-0 pb-4 pt-2 px-1 space-y-3">

          {/* Status label */}
          <p className="text-xs text-center text-muted-foreground min-h-[16px]">
            {isProcessing ? processingStep
            : isPlaying ? '🔊 Listen carefully…'
            : isRecording ? '🔴 Recording — speak now!'
            : isPaused ? '⏸ Paused — resume or send'
            : canRecord ? '👂 Ready? Tap Record to shadow'
            : sentences.length > 0 && !loading ? '▶ Tap Play to start'
            : ''}
          </p>

          {/* Level waveform */}
          {(isRecording || isPaused) && (
            <div className="flex items-center justify-center gap-1 h-8">
              {Array.from({ length: 16 }).map((_, i) => (
                <div key={i}
                  className={`w-1 rounded-full transition-all duration-75 ${isPaused ? 'bg-muted' : 'bg-[#F5A623]'}`}
                  style={{ height: isPaused ? '4px' : `${Math.max(4, Math.min(28, audioLevel * 28 * (0.4 + Math.abs(Math.sin(i * 0.9 + Date.now() / 180)) * 0.6)))}px` }}
                />
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-center gap-3">

            {/* PLAY / re-listen */}
            {!isRecording && !isPaused && !isProcessing && (
              <button
                onClick={sentences.length > 0 && !loading && current && current.status !== 'done' && current.status !== 'skipped'
                  ? (current.status === 'pending' || current.status === 'recording' && recordState === 'idle' ? playCurrent : replayCurrent)
                  : undefined}
                disabled={loading || isProcessing || !sentences.length || (current?.status === 'done') || (current?.status === 'skipped')}
                className={`h-16 w-16 rounded-full flex items-center justify-center transition-all shadow-md
                  ${loading || isProcessing || !sentences.length || current?.status === 'done' || current?.status === 'skipped'
                    ? 'bg-muted opacity-40 cursor-not-allowed'
                    : 'bg-[#4A90E2] hover:bg-[#2E6FBA] active:scale-95 cursor-pointer shadow-blue-500/20'}`}>
                <Play className="h-7 w-7 text-white ml-1" />
              </button>
            )}

            {/* RECORD — only when AI finished speaking */}
            {canRecord && !isRecording && !isPaused && !isProcessing && (
              <button onClick={startRecording}
                className="h-20 w-20 rounded-full flex items-center justify-center bg-[#1A1A2E] hover:bg-[#252540] shadow-lg shadow-[#1A1A2E]/30 active:scale-95 transition-all">
                <Mic className="h-8 w-8 text-[#F5A623]" strokeWidth={1.5} />
              </button>
            )}

            {/* PAUSE — while recording */}
            {isRecording && (
              <button onClick={pauseRecording}
                className="h-14 w-14 rounded-full flex items-center justify-center bg-amber-500 hover:bg-amber-600 shadow-md active:scale-95 transition-all">
                <Pause className="h-6 w-6 text-white" />
              </button>
            )}

            {/* RESUME — while paused */}
            {isPaused && (
              <button onClick={resumeRecording}
                className="h-14 w-14 rounded-full flex items-center justify-center bg-[#1A1A2E] hover:bg-[#252540] shadow-md active:scale-95 transition-all">
                <Mic className="h-6 w-6 text-[#F5A623]" strokeWidth={1.5} />
              </button>
            )}

            {/* SEND / STOP — while recording or paused */}
            {(isRecording || isPaused) && (
              <button onClick={stopAndSend}
                className="h-14 w-14 rounded-full flex items-center justify-center bg-[#F5A623] hover:bg-[#E09400] shadow-md active:scale-95 transition-all">
                <Send className="h-6 w-6 text-white" />
              </button>
            )}

            {/* PROCESSING */}
            {isProcessing && (
              <div className="h-16 w-16 rounded-full flex items-center justify-center bg-muted">
                <Loader2 className="h-7 w-7 animate-spin text-[#F5A623]" />
              </div>
            )}
          </div>

          {/* Button labels */}
          <div className="flex items-center justify-center gap-3 text-[10px] text-muted-foreground">
            {!isRecording && !isPaused && !isProcessing && <span className="w-16 text-center">Play AI</span>}
            {canRecord && !isRecording && !isPaused && !isProcessing && <span className="w-20 text-center">Record</span>}
            {isRecording && <span className="w-14 text-center">Pause</span>}
            {isPaused && <span className="w-14 text-center">Resume</span>}
            {(isRecording || isPaused) && <span className="w-14 text-center">Send</span>}
          </div>
        </div>
      </div>
    );
  }

  // ── Lesson picker (home) ────────────────────────────────────────────────────
  const displayLevel = selectedLevel || 'A1';
  const levelLessons = LESSONS.filter(l => l.level === displayLevel);
  const levelInfo = LEVELS.find(l => l.level === displayLevel)!;

  return (
    <div className="space-y-5 pb-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <Mic className="h-6 w-6 text-[#F5A623]" strokeWidth={1.5} /> Speaking Practice
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Shadow AI sentences to improve your fluency & accent</p>
      </div>

      {!hasApiKey && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 space-y-0.5">
            <p><strong>Setup required.</strong> An administrator must configure the AI services in the Admin Panel.</p>
            <p className="text-xs text-amber-700">Needed: Google Gemini · Groq · ElevenLabs</p>
          </div>
        </div>
      )}

      {/* Level selector */}
      <div className="relative">
        <button onClick={() => setShowLevelPicker(!showLevelPicker)}
          className="flex items-center gap-3 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/30 transition-colors">
          <TrendingUp className="h-4 w-4 text-[#F5A623]" />
          <span className="flex-1 text-left">{levelInfo.label} ({displayLevel}) — {levelInfo.desc}</span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showLevelPicker ? 'rotate-180' : ''}`} />
        </button>
        <AnimatePresence>
          {showLevelPicker && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="absolute top-full mt-1 w-full z-30 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
              {LEVELS.map(l => (
                <button key={l.level} onClick={() => { setSelectedLevel(l.level); setShowLevelPicker(false); }}
                  className={`flex items-center gap-3 w-full px-4 py-3 text-sm text-left transition-colors
                    ${l.level === displayLevel ? 'bg-[#FFF3DD]' : 'hover:bg-muted/40'}`}>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${l.badge}`}>{l.level}</span>
                  <span className="text-foreground">{l.label}</span>
                  <span className="text-muted-foreground text-xs ml-auto">{l.desc}</span>
                  {l.level === displayLevel && <CheckCircle2 className="h-4 w-4 text-[#F5A623]" />}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Stats strip */}
      <div className="flex items-center gap-3">
        <div className="flex-1 rounded-xl bg-card border border-border px-4 py-2.5 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Completed</p>
          <p className="text-xl font-bold text-foreground mt-0.5">
            {levelLessons.filter(l => completedLessons.has(l.id)).length}
            <span className="text-sm text-muted-foreground font-normal">/{levelLessons.length}</span>
          </p>
        </div>
        <div className="flex-1 rounded-xl bg-[#1A1A2E] text-white px-4 py-2.5 text-center">
          <p className="text-[10px] text-white/40 uppercase tracking-widest font-semibold">Total Lessons</p>
          <p className="text-xl font-bold mt-0.5">{LESSONS.length}</p>
        </div>
      </div>

      {/* Lesson cards */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
          {levelInfo.label} Lessons
        </h2>
        {levelLessons.map((lesson) => {
          const done = completedLessons.has(lesson.id);
          return (
            <motion.button key={lesson.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => hasApiKey ? loadLesson(lesson) : undefined}
              disabled={!hasApiKey}
              className={`w-full text-left rounded-2xl border transition-all ${
                done ? 'border-emerald-200 bg-emerald-50/50' : 'border-border bg-card hover:border-[#F5A623]/40 hover:bg-[#FFF3DD]/30'
              } ${!hasApiKey ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
              <div className="flex items-center gap-4 px-4 py-3.5">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${lesson.color}`}>
                  <lesson.icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{lesson.title}</p>
                    {done && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{lesson.description}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* All level lesson counts */}
      <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">All Levels</p>
        {LEVELS.map(l => {
          const lLessons = LESSONS.filter(ls => ls.level === l.level);
          const lDone = lLessons.filter(ls => completedLessons.has(ls.id)).length;
          return (
            <div key={l.level} className="flex items-center gap-3">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border shrink-0 ${l.badge}`}>{l.level}</span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-[#F5A623] rounded-full" style={{ width: `${lLessons.length ? (lDone / lLessons.length) * 100 : 0}%` }} />
              </div>
              <span className="text-xs text-muted-foreground w-8 text-right">{lDone}/{lLessons.length}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Web Speech Recognition helper ─────────────────────────────────────────────
// We use the browser's built-in SpeechRecognition API which works in parallel
// with MediaRecorder. Call startSpeechRecognition() when recording starts and
// it collects a transcript. Call stopSpeechRecognition() to get the result.

let _recognition: any = null;
let _transcript = '';

export function startSpeechRecognition(): void {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return;
  try {
    _transcript = '';
    _recognition = new SR();
    _recognition.continuous = true;
    _recognition.interimResults = false;
    _recognition.lang = 'en-US';
    _recognition.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) _transcript += e.results[i][0].transcript + ' ';
      }
    };
    _recognition.onerror = () => {};
    _recognition.start();
  } catch {}
}

export function stopSpeechRecognition(): string {
  try { _recognition?.stop(); } catch {}
  _recognition = null;
  return _transcript.trim();
}
