import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Shield, Upload, Download, Trash2,
  Github, Settings2, AlertTriangle, Cloud,
  WifiOff, Database, FileDown, FileUp, Crown, UserX, UserCheck, User,
  Link2, RefreshCw, CheckCircle2, Clock, Info, ExternalLink, Play,
  Zap, ChevronDown, ChevronUp, Code2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useApp } from '@/App';
import { useGoogleSheet, toCsvUrl } from '@/hooks/useGoogleSheet';
import type { AuthUser } from '@/types/auth';
import Papa from 'papaparse';

// ── Tiny helpers ────────────────────────────────────────────────────────────────
function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-foreground">{label}</label>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      {children}
    </div>
  );
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#F5A623]/50 ${props.className ?? ''}`} />;
}
function Spinner() {
  return <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />;
}
function InfoBox({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 p-3 text-sm text-blue-800 dark:text-blue-200">{children}</div>;
}
function WarnBox({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-200">{children}</div>;
}
function SuccessBox({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 p-3 text-sm text-green-800 dark:text-green-200">{children}</div>;
}
function ErrorBox({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 p-3 text-sm text-red-800 dark:text-red-200">{children}</div>;
}

type Tab = 'users' | 'gsheet' | 'sync' | 'data' | 'aikeys';

const ADMIN_API_KEYS_KEY = 'moe_admin_api_cfg';

// ── Admin Panel ─────────────────────────────────────────────────────────────────
export function AdminPanel() {
  const {
    getAllUsers, deleteUser, toggleUserActive,
    getGithubConfig, saveGithubConfig, syncToGithub, loadFromGithub,
    isOnline, currentUser,
  } = useAuth();
  const { vocabulary, addToast, gsheet, githubSync } = useApp();
  const gs = gsheet;
  const navigate = useNavigate();

  const [tab, setTab]   = useState<Tab>('gsheet');
  const [pushingRegistry, setPushingRegistry] = useState(false);
  const [users, setUsers] = useState<AuthUser[]>(() => getAllUsers());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // GitHub state
  const [ghToken,  setGhToken]  = useState(() => getGithubConfig()?.token  || '');
  const [ghRepo,   setGhRepo]   = useState(() => getGithubConfig()?.repo   || '');
  const [ghBranch, setGhBranch] = useState(() => getGithubConfig()?.branch || 'main');
  const [ghSyncing, setGhSyncing] = useState(false);

  // Google Sheet local form state (pre-save)
  const [gsMode,     setGsMode]     = useState<'csv'|'script'>(gs.config.mode);
  const [gsCsvUrl,   setGsCsvUrl]   = useState(gs.config.csvUrl);
  const [gsScript,   setGsScript]   = useState(gs.config.scriptUrl);
  const [gsInterval, setGsInterval] = useState(gs.config.autoIntervalMin);
  const [gsTestResult, setGsTestResult] = useState<{ok:boolean; count:number; msg:string}|null>(null);
  const [gsTesting, setGsTesting] = useState(false);
  const [showScriptHelp, setShowScriptHelp] = useState(false);

  const refreshUsers = useCallback(() => setUsers(getAllUsers()), [getAllUsers]);

  // Listen for auto-sync trigger
  useEffect(() => {
    const handler = () => {
      gs.syncNow(vocabulary.importWords as any).then(r => {
        if (r.success) addToast(`Auto-synced ${r.count} words from Google Sheet`, 'success');
        else addToast(`Auto-sync failed: ${r.error}`, 'error');
      });
    };
    window.addEventListener('moe-gsheet-autosync', handler);
    return () => window.removeEventListener('moe-gsheet-autosync', handler);
  }, [gs, vocabulary.importWords, addToast]);

  // ── User actions ──────────────────────────────────────────────────────────────
  const handleToggleActive = (id: string) => { toggleUserActive(id); refreshUsers(); addToast('User status updated','success'); };
  const handleDelete = (id: string) => {
    if (confirmDelete === id) { deleteUser(id); setConfirmDelete(null); refreshUsers(); addToast('User deleted','info'); }
    else { setConfirmDelete(id); setTimeout(() => setConfirmDelete(null), 3000); }
  };

  // ── GitHub ────────────────────────────────────────────────────────────────────
  const handlePushRegistry = async () => {
    setPushingRegistry(true);
    const allUsers = getAllUsers();
    const r = await githubSync.pushUserRegistry(allUsers);
    addToast(r.message, r.success ? 'success' : 'error');
    setPushingRegistry(false);
  };

  const handleSaveGh  = () => { saveGithubConfig({ token:ghToken, repo:ghRepo, branch:ghBranch }); addToast('GitHub config saved','success'); };
  const handleGhPush  = async () => {
    if (!isOnline) { addToast('No internet connection','error'); return; }
    setGhSyncing(true);
    const r = await syncToGithub({ words:vocabulary.words, sessions:vocabulary.sessions, syncedAt:new Date().toISOString() }, currentUser!.id);
    addToast(r.message, r.success?'success':'error'); setGhSyncing(false);
  };
  const handleGhPull  = async () => {
    if (!isOnline) { addToast('No internet connection','error'); return; }
    setGhSyncing(true);
    const r = await loadFromGithub(currentUser!.id);
    if (r.success && r.data) { vocabulary.importWords((r.data as any).words || []); addToast('Loaded from GitHub','success'); }
    else addToast(r.message,'error');
    setGhSyncing(false);
  };

  // ── Google Sheet actions ──────────────────────────────────────────────────────
  const handleTestGS = async () => {
    setGsTesting(true); setGsTestResult(null); gs.setError(null);
    const r = await gs.testConnection({ mode:gsMode, csvUrl:gsCsvUrl, scriptUrl:gsScript });
    setGsTestResult({ ok:r.success, count:r.count, msg: r.success ? `${r.count} words found` : (r.error??'Unknown error') });
    setGsTesting(false);
  };
  const handleSaveGS = () => {
    gs.saveConfig({ mode:gsMode, csvUrl:gsCsvUrl, scriptUrl:gsScript, autoIntervalMin:gsInterval });
    addToast('Google Sheet config saved','success');
  };
  const handleSyncGS = async () => {
    const r = await gs.syncNow(vocabulary.importWords as any);
    if (r.success) addToast(`✅ Synced ${r.count} words — all users can now see them`,'success');
    else addToast(`❌ ${r.error}`,'error');
  };

  // ── CSV Export/Import ─────────────────────────────────────────────────────────
  const downloadCsv = (content: string, filename: string) => {
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([content],{type:'text/csv'})),
      download: filename,
    });
    a.click();
  };
  const handleExportVocab = () => {
    downloadCsv(Papa.unparse(vocabulary.words.map(w=>({
      word:w.word, partOfSpeech:w.partOfSpeech, definition:w.definition,
      exampleSentence:w.exampleSentence, synonym:w.synonym||'', antonym:w.antonym||'',
      cefrLevel:w.cefrLevel, category:w.category||'', difficulty:w.difficulty,
      laoTranslation:w.laoTranslation||'', thaiTranslation:w.thaiTranslation||'',
    }))), `vocabulary_${new Date().toISOString().split('T')[0]}.csv`);
    addToast('Vocabulary exported','success');
  };
  const handleExportUsers = () => {
    downloadCsv(Papa.unparse(users.map(u=>({
      id:u.id, username:u.username, email:u.email, role:u.role,
      joinDate:u.joinDate, isActive:u.isActive, cefrLevel:u.cefrLevel,
    }))), `users_${new Date().toISOString().split('T')[0]}.csv`);
    addToast('Users exported','success');
  };
  const handleImportVocab = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if(!file) return;
    Papa.parse(file, {
      header:true,
      complete:(r) => {
        const rows = (r.data as Record<string,string>[]).filter(x=>x.word);
        vocabulary.importWords(rows as any);
        addToast(`Imported ${rows.length} words`,'success');
      },
      error:() => addToast('Failed to parse CSV','error'),
    });
    e.target.value='';
  };
  const handleDownloadTemplate = () => {
    const header = 'word,definition,partOfSpeech,cefrLevel,exampleSentence,synonym,antonym,category,difficulty,laoTranslation,thaiTranslation\n';
    const rows = [
      'happy,feeling joy and pleasure,adjective,A2,She looks so happy today.,joyful,sad,emotion,easy,ມີຄວາມສຸກ,มีความสุข',
      'ambitious,having a strong desire to succeed,adjective,B2,She is very ambitious.,driven,lazy,personality,medium,,',
      'ephemeral,lasting for a short time only,adjective,C1,Fame can be ephemeral.,transient,permanent,abstract,hard,,',
    ].join('\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([header+rows],{type:'text/csv'})),
      download: 'master_english_template.csv',
    });
    a.click();
    addToast('Template downloaded','success');
  };

  // ── Apps Script code template ─────────────────────────────────────────────────
  const APPS_SCRIPT_CODE = `// Paste this into Google Apps Script (script.google.com)
// Then click Deploy → New deployment → Web App → Anyone
function doGet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data  = sheet.getDataRange().getValues();
  const heads = data[0].map(String);
  const words = data.slice(1)
    .filter(row => row[0])          // skip empty rows
    .map(row => {
      const obj = {};
      heads.forEach((h, i) => { obj[h] = String(row[i] ?? ''); });
      return obj;
    });
  return ContentService
    .createTextOutput(JSON.stringify({ words }))
    .setMimeType(ContentService.MimeType.JSON);
}`;

  // AI API Keys state (admin-only, stored under protected key)
  const loadAiCfg = () => { try { return JSON.parse(localStorage.getItem(ADMIN_API_KEYS_KEY) || '{}'); } catch { return {}; } };
  const [aiGoogleKey,      setAiGoogleKey]      = useState<string>(() => loadAiCfg().google      || '');
  const [aiGroqKey,        setAiGroqKey]         = useState<string>(() => loadAiCfg().groq        || '');
  const [aiElevenKey,      setAiElevenKey]       = useState<string>(() => loadAiCfg().elevenlabs  || '');
  const [aiElevenVoice,    setAiElevenVoice]     = useState<string>(() => loadAiCfg().elevenVoice || '');
  const [aiKeySaved,       setAiKeySaved]        = useState(false);
  const [showAiKeys,       setShowAiKeys]        = useState<Record<string,boolean>>({});
  const toggleShowKey = (k: string) => setShowAiKeys(prev => ({ ...prev, [k]: !prev[k] }));

  const saveAiKeys = () => {
    localStorage.setItem(ADMIN_API_KEYS_KEY, JSON.stringify({
      google:      aiGoogleKey.trim(),
      groq:        aiGroqKey.trim(),
      elevenlabs:  aiElevenKey.trim(),
      elevenVoice: aiElevenVoice.trim(),
    }));
    setAiKeySaved(true);
    setTimeout(() => setAiKeySaved(false), 2500);
  };

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id:'users',  label:'Users',        icon:Users  },
    { id:'gsheet', label:'Google Sheet', icon:Link2  },
    { id:'sync',   label:'GitHub Sync',  icon:Github },
    { id:'data',   label:'Import/Export',icon:Database },
    { id:'aikeys', label:'AI Keys',      icon:Zap    },
  ];

  return (
    <div className="space-y-5 pb-10">

      {/* ── Header ── */}
      <div className="rounded-2xl bg-[#1A1A2E] text-white px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#F5A623]/20 flex items-center justify-center shrink-0">
            <Shield className="h-5 w-5 text-[#F5A623]" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold">Admin Panel</h1>
            <p className="text-xs text-white/50">Logged in as {currentUser?.username}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${isOnline ? 'text-green-400 bg-green-500/10' : 'text-white/40 bg-white/5'}`}>
              {isOnline ? <Cloud className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {isOnline ? 'Online' : 'Offline'}
            </span>
            <button onClick={() => navigate('/my-account')} className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white border border-white/10 hover:border-white/30 px-3 py-1.5 rounded-lg transition-colors">
              <User className="h-3.5 w-3.5" /> My Account
            </button>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 flex-1 justify-center py-2 px-3 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${tab===t.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            <t.icon className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ══ USERS ══════════════════════════════════════════════════════════════ */}
      {tab === 'users' && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">All Users ({users.length})</h2>
            <button onClick={handleExportUsers} className="flex items-center gap-1.5 text-sm text-[#4A90E2] hover:text-blue-700"><FileDown className="h-4 w-4" /> Export CSV</button>
          </div>
          <div className="space-y-3">
            {users.map(user => (
              <div key={user.id} className="bg-card rounded-xl border border-border p-4">
                <div className="flex items-start gap-3">
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${user.role==='admin'?'bg-[#F5A623]':'bg-[#4A90E2]'}`}>
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground text-sm">{user.username}</span>
                      {user.role==='admin' && <span className="flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full"><Crown className="h-2.5 w-2.5"/>Admin</span>}
                      {!user.isActive && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Inactive</span>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    <p className="text-xs text-muted-foreground">Joined {new Date(user.joinDate).toLocaleDateString()} · {user.cefrLevel} · {user.currentStreak}d streak</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => handleToggleActive(user.id)} disabled={user.role==='admin'} className={`p-1.5 rounded-lg transition-colors ${user.role==='admin'?'opacity-30 cursor-not-allowed':user.isActive?'text-green-600 hover:bg-green-50':'text-muted-foreground hover:bg-muted'}`}>
                      {user.isActive ? <UserCheck className="h-4 w-4"/> : <UserX className="h-4 w-4"/>}
                    </button>
                    <button onClick={() => handleDelete(user.id)} disabled={user.role==='admin'||user.id===currentUser?.id} className={`p-1.5 rounded-lg transition-colors ${confirmDelete===user.id?'bg-red-100 text-red-600':user.role==='admin'||user.id===currentUser?.id?'opacity-30 cursor-not-allowed text-muted-foreground':'text-red-400 hover:bg-red-50'}`}>
                      <Trash2 className="h-4 w-4"/>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ══ GOOGLE SHEET ═══════════════════════════════════════════════════════ */}
      {tab === 'gsheet' && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="space-y-4">

          {/* Status banner */}
          {gs.config.lastSyncAt && (
            <SuccessBox>
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5"/>
              <div className="flex-1">
                <span className="font-semibold">Last synced:</span> {new Date(gs.config.lastSyncAt).toLocaleString()} — {gs.config.lastSyncCount} words loaded for all users
              </div>
              <button onClick={handleSyncGS} disabled={gs.syncing||(!gs.config.csvUrl&&!gs.config.scriptUrl)} className="flex items-center gap-1 text-xs font-semibold text-green-700 hover:text-green-900 shrink-0">
                {gs.syncing?<Spinner/>:<RefreshCw className="h-3.5 w-3.5"/>} Sync Now
              </button>
            </SuccessBox>
          )}

          {/* Mode toggle */}
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-[#F5A623]"/>
              <h2 className="font-semibold text-foreground">Connection Method</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setGsMode('csv')}
                className={`py-3 px-4 rounded-xl text-sm font-medium border-2 transition-all ${gsMode==='csv'?'border-[#F5A623] bg-[#F5A623]/10 text-foreground':'border-border text-muted-foreground hover:border-[#F5A623]/40'}`}>
                <div className="text-xl mb-1">📊</div>
                <div className="font-semibold">Published CSV</div>
                <div className="text-xs mt-0.5 opacity-70">Simple — no code needed</div>
              </button>
              <button onClick={() => setGsMode('script')}
                className={`py-3 px-4 rounded-xl text-sm font-medium border-2 transition-all ${gsMode==='script'?'border-[#4A90E2] bg-[#4A90E2]/10 text-foreground':'border-border text-muted-foreground hover:border-[#4A90E2]/40'}`}>
                <div className="text-xl mb-1">⚙️</div>
                <div className="font-semibold">Apps Script</div>
                <div className="text-xs mt-0.5 opacity-70">More control + real-time</div>
              </button>
            </div>
          </div>

          {/* CSV mode */}
          {gsMode === 'csv' && (
            <div className="bg-card rounded-xl border border-border p-5 space-y-4">
              <InfoBox>
                <Info className="h-4 w-4 shrink-0 mt-0.5"/>
                <div>
                  <strong>How to get the URL:</strong> In Google Sheets → File → Share → <strong>Publish to web</strong> → choose your sheet tab → choose <strong>CSV</strong> → click Publish → copy the link. Or just paste any <code className="bg-blue-100 px-1 rounded">/edit</code> URL — we auto-convert it.
                </div>
              </InfoBox>
              <Field label="Published CSV URL" note="Paste the published CSV link or any Google Sheets /edit URL">
                <Input type="url" value={gsCsvUrl} onChange={e=>{setGsCsvUrl(e.target.value);setGsTestResult(null);}} placeholder="https://docs.google.com/spreadsheets/d/…/pub?output=csv"/>
              </Field>
              {gsCsvUrl && (
                <p className="text-xs text-muted-foreground break-all">
                  Will use: <span className="text-foreground font-mono">{toCsvUrl(gsCsvUrl)}</span>
                </p>
              )}
            </div>
          )}

          {/* Script mode */}
          {gsMode === 'script' && (
            <div className="bg-card rounded-xl border border-border p-5 space-y-4">
              <InfoBox>
                <Info className="h-4 w-4 shrink-0 mt-0.5"/>
                <div>Deploy a Google Apps Script as a Web App. It returns your sheet data as JSON — works better for private sheets and gives you more control.
                </div>
              </InfoBox>
              <Field label="Apps Script Web App URL" note="The deployed URL ending in /exec">
                <Input type="url" value={gsScript} onChange={e=>{setGsScript(e.target.value);setGsTestResult(null);}} placeholder="https://script.google.com/macros/s/.../exec"/>
              </Field>

              {/* Collapsible script code */}
              <button onClick={() => setShowScriptHelp(v=>!v)} className="flex items-center gap-2 text-sm text-[#4A90E2] hover:text-blue-700 font-medium">
                <Code2 className="h-4 w-4"/>
                {showScriptHelp ? 'Hide' : 'Show'} Apps Script code to copy
                {showScriptHelp ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}
              </button>
              <AnimatePresence>
                {showScriptHelp && (
                  <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} className="overflow-hidden">
                    <pre className="bg-[#1A1A2E] text-[#A5F3FC] rounded-xl p-4 text-xs overflow-x-auto leading-relaxed">{`function doGet() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getActiveSheet();
  const data  = sheet.getDataRange().getValues();
  const heads = data[0].map(String);
  const words = data.slice(1)
    .filter(row => row[0])
    .map(row => {
      const obj = {};
      heads.forEach((h, i) => {
        obj[h] = String(row[i] ?? '');
      });
      return obj;
    });
  return ContentService
    .createTextOutput(
      JSON.stringify({ words })
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}`}</pre>
                    <ol className="text-xs text-muted-foreground space-y-1 mt-3 list-decimal list-inside">
                      <li>Go to <a href="https://script.google.com" target="_blank" rel="noreferrer" className="text-[#4A90E2] underline">script.google.com</a> → New project</li>
                      <li>Paste the code above, replacing any existing code</li>
                      <li>Click <strong>Deploy → New deployment → Web App</strong></li>
                      <li>Set <strong>Execute as: Me</strong>, <strong>Who has access: Anyone</strong></li>
                      <li>Click Deploy → copy the <code>/exec</code> URL → paste it above</li>
                    </ol>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Auto-sync interval */}
          <div className="bg-card rounded-xl border border-border p-5 space-y-3">
            <Field label="Auto-sync interval" note="Automatically re-fetch words on this schedule. Set to Off for manual-only.">
              <div className="flex gap-2 flex-wrap">
                {[{v:0,l:'Off'},{v:5,l:'5 min'},{v:15,l:'15 min'},{v:30,l:'30 min'},{v:60,l:'1 hr'}].map(({v,l}) => (
                  <button key={v} onClick={() => setGsInterval(v)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${gsInterval===v?'bg-[#1A1A2E] text-white border-[#1A1A2E]':'bg-card text-muted-foreground border-border hover:border-foreground/30'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {/* Test + Save buttons */}
          <div className="flex gap-3">
            <button onClick={handleTestGS} disabled={gsTesting||(!gsCsvUrl&&!gsScript)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-[#4A90E2] text-[#4A90E2] text-sm font-semibold hover:bg-[#4A90E2]/10 transition-colors disabled:opacity-40">
              {gsTesting?<Spinner/>:<Play className="h-4 w-4"/>} Test Connection
            </button>
            <button onClick={handleSaveGS}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#1A1A2E] text-white text-sm font-semibold hover:bg-[#252545] transition-colors">
              <Settings2 className="h-4 w-4"/> Save Config
            </button>
          </div>

          {/* Test result */}
          <AnimatePresence>
            {gsTestResult && (
              <motion.div initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
                {gsTestResult.ok
                  ? <SuccessBox><CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5"/>✅ Connected — {gsTestResult.msg}</SuccessBox>
                  : <ErrorBox><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5"/>❌ {gsTestResult.msg}</ErrorBox>
                }
              </motion.div>
            )}
            {gs.error && !gsTestResult && (
              <motion.div initial={{opacity:0}} animate={{opacity:1}}>
                <ErrorBox><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5"/>{gs.error}</ErrorBox>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sync now */}
          <div className="bg-card rounded-xl border border-border p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-[#F5A623]"/>
              <h2 className="font-semibold text-foreground">Sync Words to App</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Pull the latest words from your sheet and make them available to <strong>all users</strong> instantly — including on mobile.
              Existing words are updated; new rows are added; nothing is deleted.
            </p>
            <button onClick={handleSyncGS} disabled={gs.syncing||(!gs.config.csvUrl&&!gs.config.scriptUrl)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#F5A623] text-white text-sm font-bold hover:bg-[#E09400] transition-colors disabled:opacity-40">
              {gs.syncing?<><Spinner/>Syncing…</>:<><RefreshCw className="h-4 w-4"/>Sync from Google Sheet Now</>}
            </button>
            {!gs.config.csvUrl && !gs.config.scriptUrl && (
              <p className="text-xs text-amber-600 text-center">Save a URL above first</p>
            )}
            {gs.config.autoIntervalMin > 0 && (
              <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2">
                <Clock className="h-3.5 w-3.5 shrink-0"/>
                Auto-syncing every {gs.config.autoIntervalMin} minutes
              </div>
            )}
          </div>

          {/* Template section */}
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h2 className="font-semibold text-foreground">📄 Sheet Template</h2>
            <p className="text-sm text-muted-foreground">Your sheet must have these column headers in Row 1 (✱ = required):</p>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    {['word ✱','definition ✱','partOfSpeech','cefrLevel','exampleSentence','synonym','antonym','category','difficulty','laoTranslation','thaiTranslation'].map(h=>(
                      <th key={h} className={`px-3 py-2 text-left font-semibold whitespace-nowrap ${h.endsWith('✱')?'text-[#F5A623]':'text-muted-foreground'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border">
                    {['happy','feeling joy','adjective','A2','She looks happy.','joyful','sad','emotion','easy','ມີຄວາມສຸກ','มีความสุข'].map((v,i)=>(
                      <td key={i} className="px-3 py-2 text-muted-foreground whitespace-nowrap">{v}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 flex-wrap">
              <button onClick={handleDownloadTemplate} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors">
                <FileDown className="h-4 w-4"/> Download CSV Template
              </button>
              <a href="https://docs.google.com/spreadsheets/create" target="_blank" rel="noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#4A90E2] text-[#4A90E2] text-sm font-medium hover:bg-[#4A90E2]/10 transition-colors">
                <ExternalLink className="h-4 w-4"/> Open Google Sheets
              </a>
            </div>
          </div>
        </motion.div>
      )}

      {/* ══ GITHUB SYNC ════════════════════════════════════════════════════════ */}
      {tab === 'sync' && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="space-y-4">
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <div className="flex items-center gap-2"><Github className="h-5 w-5 text-foreground"/><h2 className="font-semibold text-foreground">GitHub Storage Config</h2></div>
            <p className="text-sm text-muted-foreground">Backup and restore all app data using a GitHub repository.</p>
            <Field label="Personal Access Token" note="Needs repo write access. GitHub → Settings → Developer settings → Tokens">
              <Input type="password" value={ghToken} onChange={e=>setGhToken(e.target.value)} placeholder="ghp_xxxxxxxxxxxx"/>
            </Field>
            <Field label="Repository (owner/repo)">
              <Input type="text" value={ghRepo} onChange={e=>setGhRepo(e.target.value)} placeholder="username/lexicon-data"/>
            </Field>
            <Field label="Branch">
              <Input type="text" value={ghBranch} onChange={e=>setGhBranch(e.target.value)} placeholder="main"/>
            </Field>
            <button onClick={handleSaveGh} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#1A1A2E] text-white text-sm font-semibold hover:bg-[#252545] transition-colors">
              <Settings2 className="h-4 w-4"/> Save Configuration
            </button>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 space-y-3">
            <h3 className="font-semibold text-foreground">Sync Actions</h3>
            <div className="flex gap-3">
              <button onClick={handleGhPush} disabled={ghSyncing||!isOnline} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#34C759] text-white text-sm font-semibold hover:bg-green-600 transition-colors disabled:opacity-50">
                {ghSyncing?<Spinner/>:<Upload className="h-4 w-4"/>} Push to GitHub
              </button>
              <button onClick={handleGhPull} disabled={ghSyncing||!isOnline} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#4A90E2] text-white text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50">
                {ghSyncing?<Spinner/>:<Download className="h-4 w-4"/>} Pull from GitHub
              </button>
            </div>
            {!isOnline && <WarnBox><WifiOff className="h-4 w-4 shrink-0"/>Offline — changes saved locally</WarnBox>}
          </div>
        </motion.div>
      )}

      {/* ══ IMPORT / EXPORT ════════════════════════════════════════════════════ */}
      {tab === 'data' && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="space-y-4">
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h2 className="font-semibold text-foreground">Vocabulary Data</h2>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={handleExportVocab} className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1A1A2E] text-white text-sm font-semibold hover:bg-[#252545] transition-colors">
                <FileDown className="h-4 w-4"/> Export CSV
              </button>
              <label className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#4A90E2] text-white text-sm font-semibold hover:bg-blue-600 cursor-pointer transition-colors">
                <FileUp className="h-4 w-4"/> Import CSV
                <input type="file" accept=".csv" onChange={handleImportVocab} className="hidden"/>
              </label>
            </div>
            <div className="text-xs text-muted-foreground bg-muted rounded-lg p-3">
              <p className="font-medium mb-1">Required CSV columns:</p>
              <p className="font-mono text-[10px]">word, definition, partOfSpeech, cefrLevel, exampleSentence, synonym, antonym, category, difficulty, laoTranslation, thaiTranslation</p>
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h2 className="font-semibold text-foreground">User Data</h2>
            <button onClick={handleExportUsers} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1A1A2E] text-white text-sm font-semibold hover:bg-[#252545] transition-colors">
              <FileDown className="h-4 w-4"/> Export All Users CSV
            </button>
          </div>
          <WarnBox>
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5"/>
            <div><strong>Admin only.</strong> Import merges words — nothing is deleted. Export includes all words in the system.</div>
          </WarnBox>
        </motion.div>
      )}

      {/* ══ AI API KEYS ═════════════════════════════════════════════════════════ */}
      {tab === 'aikeys' && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="space-y-4">

          {/* Header card */}
          <div className="rounded-2xl bg-[#1A1A2E] text-white px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#F5A623]/20 flex items-center justify-center shrink-0">
                <Zap className="h-5 w-5 text-[#F5A623]" />
              </div>
              <div>
                <h2 className="font-semibold text-white">AI Service Configuration</h2>
                <p className="text-xs text-white/50">Powers Speaking Practice — keys never exposed to users</p>
              </div>
            </div>
          </div>

          {/* Provider cards */}

          {/* ── Google Gemini ── */}
          <div className="bg-card rounded-xl border border-border p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                  <path d="M12 11.2L2 7l10-4 10 4-10 4.2Z" fill="#4285F4"/>
                  <path d="M12 11.2v10L2 17V7l10 4.2Z" fill="#34A853"/>
                  <path d="M12 11.2v10l10-4.2V7L12 11.2Z" fill="#FBBC05"/>
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Google Gemini</p>
                <p className="text-xs text-muted-foreground">AI conversation & lesson generation</p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${aiGoogleKey ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                {aiGoogleKey ? '✓ Set' : 'Not set'}
              </span>
            </div>
            <div className="relative">
              <Input
                type={showAiKeys['google'] ? 'text' : 'password'}
                placeholder="AIza…"
                value={aiGoogleKey}
                onChange={e => setAiGoogleKey(e.target.value)}
                className="pr-10"
              />
              <button onClick={() => toggleShowKey('google')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors text-xs">
                {showAiKeys['google'] ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Free tier: 1,500 req/day · <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-[#4A90E2] hover:underline">Get key at Google AI Studio →</a>
            </p>
          </div>

          {/* ── Groq ── */}
          <div className="bg-card rounded-xl border border-border p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#F55036">
                  <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2Zm0 3a7 7 0 1 1 0 14A7 7 0 0 1 12 5Zm0 2a5 5 0 1 0 0 10A5 5 0 0 0 12 7Zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"/>
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Groq</p>
                <p className="text-xs text-muted-foreground">Ultra-fast speech-to-text (Whisper)</p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${aiGroqKey ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                {aiGroqKey ? '✓ Set' : 'Not set'}
              </span>
            </div>
            <div className="relative">
              <Input
                type={showAiKeys['groq'] ? 'text' : 'password'}
                placeholder="gsk_…"
                value={aiGroqKey}
                onChange={e => setAiGroqKey(e.target.value)}
                className="pr-10"
              />
              <button onClick={() => toggleShowKey('groq')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors text-xs">
                {showAiKeys['groq'] ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Free tier: 2,000 min/month · <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="text-[#4A90E2] hover:underline">Get key at Groq Console →</a>
            </p>
          </div>

          {/* ── ElevenLabs ── */}
          <div className="bg-card rounded-xl border border-border p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#8B5CF6">
                  <rect x="4" y="3" width="3" height="18" rx="1.5"/>
                  <rect x="10.5" y="6" width="3" height="15" rx="1.5"/>
                  <rect x="17" y="9" width="3" height="12" rx="1.5"/>
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">ElevenLabs</p>
                <p className="text-xs text-muted-foreground">Natural AI voice for sentence playback</p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${aiElevenKey ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                {aiElevenKey ? '✓ Set' : 'Not set'}
              </span>
            </div>
            <div className="relative">
              <Input
                type={showAiKeys['eleven'] ? 'text' : 'password'}
                placeholder="ElevenLabs API key…"
                value={aiElevenKey}
                onChange={e => setAiElevenKey(e.target.value)}
                className="pr-10"
              />
              <button onClick={() => toggleShowKey('eleven')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors text-xs">
                {showAiKeys['eleven'] ? 'Hide' : 'Show'}
              </button>
            </div>
            <Field label="Voice ID (optional)" note="Leave blank to use the default 'Sarah' voice.">
              <Input
                type="text"
                placeholder="EXAVITQu4vr4xnSDxMaL  (default: Sarah)"
                value={aiElevenVoice}
                onChange={e => setAiElevenVoice(e.target.value)}
                className="font-mono text-xs"
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              Free tier: 10,000 chars/month · <a href="https://elevenlabs.io" target="_blank" rel="noopener noreferrer" className="text-[#4A90E2] hover:underline">Get key at ElevenLabs →</a>
              {' '}· <a href="https://elevenlabs.io/voice-library" target="_blank" rel="noopener noreferrer" className="text-[#4A90E2] hover:underline">Browse voices →</a>
            </p>
          </div>

          {/* Status summary */}
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Provider Status</p>
            <div className="space-y-1.5">
              {[
                { label: 'Google Gemini', key: aiGoogleKey,  role: 'Lesson generation & AI replies' },
                { label: 'Groq Whisper',  key: aiGroqKey,    role: 'Speech-to-text transcription'   },
                { label: 'ElevenLabs',    key: aiElevenKey,  role: 'AI voice playback'               },
              ].map(p => (
                <div key={p.label} className="flex items-center gap-2.5 text-sm">
                  <div className={`h-2 w-2 rounded-full shrink-0 ${p.key ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                  <span className="font-medium text-foreground w-28 shrink-0">{p.label}</span>
                  <span className="text-muted-foreground text-xs">{p.role}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Save button */}
          <button onClick={saveAiKeys}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#F5A623] text-white text-sm font-bold hover:bg-[#E09400] active:scale-[0.98] transition-all">
            {aiKeySaved
              ? <><CheckCircle2 className="h-4 w-4" /> All Keys Saved!</>
              : <><Zap className="h-4 w-4" /> Save All AI Keys</>}
          </button>

          <InfoBox>
            <Info className="h-4 w-4 shrink-0 mt-0.5"/>
            <div>
              <strong>User privacy:</strong> Keys are stored under a protected admin key (<code className="bg-blue-100 px-1 rounded text-xs">moe_admin_api_cfg</code>) and are never shown in any user-facing UI, settings pages, or RolePlay screens.
            </div>
          </InfoBox>
          <WarnBox>
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5"/>
            <div>Keys are stored in this browser's <code className="bg-amber-100 px-1 rounded text-xs">localStorage</code>. For production, use a backend secrets manager. Never share admin login credentials.</div>
          </WarnBox>
        </motion.div>
      )}
    </div>
  );
}
