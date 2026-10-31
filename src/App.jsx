import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useForm } from 'react-hook-form';
import confetti from 'canvas-confetti';
import {
  Gavel,
  PlusCircle,
  Clock,
  Trophy,
  History,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Flame,
  ArrowUpRight,
  TrendingUp,
  Sliders,
  X,
  User,
  UserCheck,
  Lock,
  Edit2,
  ShieldCheck,
  Menu,
  Sparkles,
  Zap,
} from 'lucide-react';

// Connect to Render backend URL as specified by user
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://round-2-backend.onrender.com';

// Sample presets in Indian Rupees (₹)
const ITEM_PRESETS = [
  {
    title: "Leica M-Monochrom 'Stealth Edition'",
    description: "Iconic rangefinder crafted exclusively for high-contrast black & white imagery. Matte black chassis with 40MP monochrome sensor.",
    startingPrice: 5000,
    durationSeconds: 180,
    imageUrl: "/item.jpg",
  },
  {
    title: "Audemars Piguet Royal Oak 'Jumbo' Extra-Thin",
    description: "Legendary 39mm stainless steel case with 'Petite Tapisserie' dial and ultra-thin selfwinding calibre.",
    startingPrice: 25000,
    durationSeconds: 120,
    imageUrl: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1000&q=80",
  },
  {
    title: "Custom Cyberpunk Mechanical Keyboard",
    description: "CNC machined anodized aluminum casing, lubed Holy Panda tactile switches, and hand-cast artisan keycaps.",
    startingPrice: 3500,
    durationSeconds: 90,
    imageUrl: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=1000&q=80",
  },
  {
    title: "Rare First-Edition Vintage Comic Book",
    description: "Museum-grade preserved collector's issue, pristine condition with certified archival acrylic case.",
    startingPrice: 12000,
    durationSeconds: 180,
    imageUrl: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=1000&q=80",
  },
];

export default function App() {
  // Navigation active tab: 'bid' (Live Auction) or 'create' (Create Auction)
  const [activeTab, setActiveTab] = useState('bid');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [auction, setAuction] = useState(null);
  const [bids, setBids] = useState([]);
  const [participantName, setParticipantName] = useState(() => {
    return localStorage.getItem('auction_participant_name') || '';
  });
  const [showNameModal, setShowNameModal] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [creatingAuction, setCreatingAuction] = useState(false);
  const [serverRejectionError, setServerRejectionError] = useState(null);
  const [serverSuccessMessage, setServerSuccessMessage] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [newBidHighlight, setNewBidHighlight] = useState(false);

  const socketRef = useRef(null);
  const timerRef = useRef(null);
  const hasTriggeredConfettiRef = useRef(false);

  // 1. React Hook Form for Participant Name Registration
  const {
    register: registerName,
    handleSubmit: handleNameSubmit,
    formState: { errors: nameErrors },
    setValue: setNameValue,
  } = useForm({
    defaultValues: {
      name: participantName || '',
    },
  });

  // 2. React Hook Form for Bidding Form
  const {
    register: registerBid,
    handleSubmit: handleBidSubmit,
    formState: { errors: bidErrors },
    setValue: setBidValue,
    watch: watchBid,
  } = useForm({
    defaultValues: {
      amount: '',
    },
  });

  // 3. React Hook Form for Create Auction (Sidebar Option 2)
  const {
    register: registerCreate,
    handleSubmit: handleCreateSubmit,
    formState: { errors: createErrors },
    setValue: setCreateValue,
    watch: watchCreate,
  } = useForm({
    defaultValues: {
      title: "Leica M-Monochrom 'Stealth Edition'",
      description: "Iconic rangefinder crafted exclusively for high-contrast black & white imagery. Matte black chassis with 40MP monochrome sensor.",
      startingPrice: 5000,
      durationSeconds: 180,
      imageUrl: "/item.jpg",
    },
  });

  // 4. React Hook Form for Quick Admin Controls
  const {
    register: registerAdmin,
    handleSubmit: handleAdminSubmit,
    formState: { errors: adminErrors },
    setValue: setAdminValue,
    watch: watchAdmin,
  } = useForm({
    defaultValues: {
      durationSeconds: 120,
      startingPrice: 5000,
    },
  });

  const watchedBidAmount = watchBid('amount');
  const watchedCreateDuration = watchCreate('durationSeconds');
  const watchedAdminDuration = watchAdmin('durationSeconds');

  // Trigger modal if participant name not found
  useEffect(() => {
    const savedName = localStorage.getItem('auction_participant_name');
    if (!savedName || !savedName.trim()) {
      setShowNameModal(true);
    } else {
      setParticipantName(savedName.trim());
      setNameValue('name', savedName.trim());
    }
  }, [setNameValue]);

  // Trigger confetti celebration
  const triggerCelebration = () => {
    confetti({
      particleCount: 90,
      spread: 75,
      origin: { y: 0.6 },
      colors: ['#0f172a', '#3b82f6', '#10b981', '#f59e0b', '#6366f1'],
    });
  };

  // Fetch auction data from backend
  const fetchAuctionData = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auction`);
      const data = await res.json();
      if (data.success) {
        setAuction(data.auction);
        setBids(data.bids || []);
        setRemainingSeconds(data.auction.remainingSeconds);

        // Specified rule: every new bid must be at least ₹100 higher than current highest bid
        const nextMin = data.auction.currentHighestBidder
          ? data.auction.currentHighestBid + 100
          : data.auction.startingPrice;
        setBidValue('amount', nextMin);

        if (data.auction.status === 'ENDED' && data.auction.winner && !hasTriggeredConfettiRef.current) {
          hasTriggeredConfettiRef.current = true;
          triggerCelebration();
        }
      }
    } catch (err) {
      console.error('Failed to fetch auction data from', BACKEND_URL, err);
    } finally {
      setLoading(false);
    }
  };

  // Setup Socket.io connection to backend URL
  useEffect(() => {
    fetchAuctionData();

    const socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      console.log('[Socket.io Connected to Render]:', socket.id);
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
      console.log('[Socket.io Disconnected]');
    });

    socket.on('initial_state', (data) => {
      if (data.auction) {
        setAuction(data.auction);
        setBids(data.bids || []);
        setRemainingSeconds(data.auction.remainingSeconds);
      }
    });

    socket.on('bid_placed', (data) => {
      setAuction(data.auction);
      setBids(data.bids || []);
      setRemainingSeconds(data.auction.remainingSeconds);

      setNewBidHighlight(true);
      setTimeout(() => setNewBidHighlight(false), 1400);

      // Rule: prefill next valid bid at least ₹100 higher
      setBidValue('amount', data.auction.currentHighestBid + 100);
    });

    socket.on('auction_ended', (data) => {
      setAuction(data.auction);
      setRemainingSeconds(0);
      if (data.winner && !hasTriggeredConfettiRef.current) {
        hasTriggeredConfettiRef.current = true;
        triggerCelebration();
      }
    });

    socket.on('auction_reset', (data) => {
      setAuction(data.auction);
      setBids(data.bids || []);
      setRemainingSeconds(data.auction.remainingSeconds);
      hasTriggeredConfettiRef.current = false;
      setServerRejectionError(null);
      setServerSuccessMessage(`Auction active for "${data.auction.title}"!`);
      setTimeout(() => setServerSuccessMessage(null), 4000);
      setBidValue('amount', data.auction.startingPrice);
    });

    return () => {
      socket.disconnect();
    };
  }, [setBidValue]);

  // Synchronized countdown timer
  useEffect(() => {
    if (!auction || auction.status === 'ENDED') {
      setRemainingSeconds(0);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const end = new Date(auction.endTime).getTime();
      const diff = Math.max(0, Math.floor((end - now) / 1000));
      setRemainingSeconds(diff);

      if (diff <= 0 && auction.status === 'ACTIVE') {
        setAuction((prev) => ({
          ...prev,
          status: 'ENDED',
          winner: prev.currentHighestBidder
            ? { name: prev.currentHighestBidder, amount: prev.currentHighestBid, wonAt: new Date() }
            : null,
        }));
        if (auction.currentHighestBidder && !hasTriggeredConfettiRef.current) {
          hasTriggeredConfettiRef.current = true;
          triggerCelebration();
        }
      }
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);

    return () => clearInterval(timerRef.current);
  }, [auction?.endTime, auction?.status]);

  // Save Participant Name
  const onSaveParticipantName = (data) => {
    const trimmed = data.name.trim();
    setParticipantName(trimmed);
    localStorage.setItem('auction_participant_name', trimmed);
    setShowNameModal(false);
  };

  // Place a Bid via React Hook Form
  const onPlaceBid = async (formData) => {
    setServerRejectionError(null);
    setServerSuccessMessage(null);

    if (!participantName || !participantName.trim()) {
      setShowNameModal(true);
      return;
    }

    const numericAmount = Number(formData.amount);
    setSubmitting(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bidderName: participantName.trim(),
          amount: numericAmount,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setServerRejectionError(data.message || 'Bid rejected by auction server.');
      } else {
        setServerSuccessMessage(`Bid of ₹${numericAmount.toLocaleString('en-IN')} placed successfully by ${participantName}!`);
        setTimeout(() => setServerSuccessMessage(null), 4000);
      }
    } catch (err) {
      setServerRejectionError(`Network error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Quick increment buttons (strictly adding >= ₹100)
  const handleQuickAdd = (increment) => {
    const currentBase = auction?.currentHighestBidder ? auction.currentHighestBid : auction?.startingPrice || 1000;
    const nextVal = currentBase + increment;
    setBidValue('amount', nextVal, { shouldValidate: true });
    setServerRejectionError(null);
  };

  // Create a New Timed Auction (Sidebar Option 2)
  const onCreateAuction = async (formData) => {
    setCreatingAuction(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/auction/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title.trim(),
          description: formData.description.trim(),
          startingPrice: Number(formData.startingPrice),
          durationSeconds: Number(formData.durationSeconds),
          imageUrl: formData.imageUrl ? formData.imageUrl.trim() : '/item.jpg',
        }),
      });

      const data = await res.json();
      if (data.success) {
        setServerSuccessMessage(`Auction for "${data.auction.title}" launched successfully!`);
        setActiveTab('bid');
        setSidebarOpen(false);
      } else {
        alert(data.message || 'Error creating auction.');
      }
    } catch (err) {
      alert(`Failed to create auction: ${err.message}`);
    } finally {
      setCreatingAuction(false);
    }
  };

  // Quick Preset select for Create Auction
  const applyPreset = (preset) => {
    setCreateValue('title', preset.title, { shouldValidate: true });
    setCreateValue('description', preset.description, { shouldValidate: true });
    setCreateValue('startingPrice', preset.startingPrice, { shouldValidate: true });
    setCreateValue('durationSeconds', preset.durationSeconds, { shouldValidate: true });
    setCreateValue('imageUrl', preset.imageUrl, { shouldValidate: true });
  };

  // Organizer Reset modal handler
  const onAdminReset = async (data) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auction/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          durationSeconds: Number(data.durationSeconds),
          startingPrice: Number(data.startingPrice),
        }),
      });
      const result = await res.json();
      if (result.success) {
        setShowAdminModal(false);
      }
    } catch (err) {
      alert(`Reset error: ${err.message}`);
    }
  };

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const isAuctionEnded = auction?.status === 'ENDED' || remainingSeconds <= 0;
  const currentLeader = auction?.currentHighestBidder;
  const highestBidVal = auction?.currentHighestBid || auction?.startingPrice || 1000;
  const startingPrice = auction?.startingPrice || 1000;
  const totalBidsCount = bids.length;

  // Specified Feature: every new bid must be at least ₹100 higher than current highest bid
  const minimumRequiredBid = currentLeader ? highestBidVal + 100 : startingPrice;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center justify-center p-6">
        <div className="w-10 h-10 border-3 border-slate-200 border-t-slate-800 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 font-mono text-sm tracking-wider uppercase">Connecting to Auction Server...</p>
        <p className="text-xs text-slate-400 font-mono mt-1">{BACKEND_URL}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row">
      {/* ======================================================== */}
      {/* SIDEBAR NAVIGATION (Option 1: Live Bid, Option 2: Create) */}
      {/* ======================================================== */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 flex flex-col justify-between transition-transform duration-300 ease-in-out md:translate-x-0 md:static ${
          sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Logo & App Title */}
          <div className="h-16 px-5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold shadow-xs">
                <Gavel className="w-4 h-4" />
              </div>
              <div>
                <span className="font-extrabold text-sm tracking-tight text-slate-900 block leading-tight">CODERUSH</span>
                <span className="text-[10px] font-mono text-slate-500 block">INR Auction Hub</span>
              </div>
            </div>

            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <div className="p-4 space-y-1.5">
            <div className="px-3 pb-2 text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
              Navigation Menu
            </div>

            {/* Option 1: Live Auction / Place Bid */}
            <button
              onClick={() => {
                setActiveTab('bid');
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'bid'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <Gavel className={`w-4 h-4 ${activeTab === 'bid' ? 'text-white' : 'text-slate-500'}`} />
                <div className="text-left">
                  <div className="leading-tight font-bold">Live Auction</div>
                  <div className={`text-[10px] ${activeTab === 'bid' ? 'text-slate-300' : 'text-slate-400'}`}>Place Bids (₹)</div>
                </div>
              </div>
              <span className={`w-2 h-2 rounded-full ${isAuctionEnded ? 'bg-slate-400' : 'bg-emerald-400 animate-pulse'}`}></span>
            </button>

            {/* Option 2: Create Auction / Create Bid */}
            <button
              onClick={() => {
                setActiveTab('create');
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'create'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <PlusCircle className={`w-4 h-4 ${activeTab === 'create' ? 'text-white' : 'text-slate-500'}`} />
                <div className="text-left">
                  <div className="leading-tight font-bold">Create Auction</div>
                  <div className={`text-[10px] ${activeTab === 'create' ? 'text-slate-300' : 'text-slate-400'}`}>New Lot & Timer</div>
                </div>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">₹ INR</span>
            </button>
          </div>

          {/* Rule Reminder Callout */}
         
         
        </div>

        {/* Sidebar Footer: Participant & Controls */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/70">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold uppercase shadow-2xs">
                {participantName ? participantName.charAt(0) : '?'}
              </div>
              <div className="overflow-hidden">
                <div className="text-[10px] font-mono text-slate-400 uppercase font-medium">Participant</div>
                <div className="text-xs font-bold text-slate-900 truncate max-w-[110px]">
                  {participantName || 'Guest User'}
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowNameModal(true)}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
              title="Change your participant name"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={() => setShowAdminModal(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 text-xs font-medium transition-colors cursor-pointer shadow-2xs"
          >
            <Sliders className="w-3 h-3 text-slate-500" />
            Organizer Controls
          </button>
        </div>
      </aside>

      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-2xs md:hidden"
        ></div>
      )}

      {/* ======================================================== */}
      {/* MAIN CONTENT AREA                                        */}
      {/* ======================================================== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Navbar */}
        <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-20 shadow-xs h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                  {activeTab === 'bid' ? 'Live Timed Auction (₹ INR)' : 'Create Auction Lot (₹ INR)'}
                </h2>
                <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-mono border border-emerald-200 font-semibold hidden sm:inline">
                  ₹ Indian Rupee
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block truncate max-w-md">
                Connected to: {BACKEND_URL}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Live Socket Status */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs text-slate-600">
              <span className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
              <span className="hidden sm:inline font-mono font-medium">{socketConnected ? 'RENDER LIVE' : 'CONNECTING'}</span>
            </div>

            {/* Switch Tab Button */}
            {activeTab === 'bid' ? (
              <button
                onClick={() => setActiveTab('create')}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors shadow-2xs cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Create Auction</span>
              </button>
            ) : (
              <button
                onClick={() => setActiveTab('bid')}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors shadow-2xs cursor-pointer"
              >
                <Gavel className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">View Auction</span>
              </button>
            )}
          </div>
        </header>

        {/* Dynamic Tab Body */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex-1 w-full">
          {/* ===================================================== */}
          {/* TAB 1: LIVE AUCTION / PLACE BID VIEW                 */}
          {/* ===================================================== */}
          {activeTab === 'bid' && (
            <div className="space-y-6">
              {/* Winner Callout Banner if Ended */}
              {isAuctionEnded && (
                <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-md relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-slate-100 rounded-full blur-3xl pointer-events-none"></div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-sm">
                        <Trophy className="w-7 h-7 text-amber-300" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono tracking-wider uppercase px-2.5 py-0.5 bg-slate-900 text-white rounded font-bold">
                            AUCTION CONCLUDED
                          </span>
                          <span className="text-xs text-slate-500 font-mono">Bidding Stopped</span>
                        </div>
                        <h2 className="text-xl sm:text-2xl font-bold mt-1 text-slate-900">
                          {auction?.winner ? (
                            <>Winner: <span className="underline underline-offset-4 decoration-slate-400">{auction.winner.name}</span></>
                          ) : (
                            'No Winner (No qualifying bids placed)'
                          )}
                        </h2>
                        <p className="text-sm text-slate-600 mt-0.5">
                          {auction?.winner
                            ? `Final winning price: ₹${auction.winner.amount.toLocaleString('en-IN')} • Hammer dropped`
                            : 'The auction has ended without qualifying bids.'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setActiveTab('create')}
                        className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        Create New Lot
                      </button>
                      <button
                        onClick={() => setShowAdminModal(true)}
                        className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Restart Timer
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 2-Column Responsive Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* LEFT: Item Details & Starting Price in INR */}
                <div className="lg:col-span-5 space-y-6">
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                    {/* Item Photo */}
                    <div className="relative aspect-square w-full bg-slate-100 border-b border-slate-200 overflow-hidden group">
                      <img
                        src={auction?.imageUrl || '/item.jpg'}
                        alt={auction?.title || 'Auction Item'}
                        className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-500"
                      />
                      <div className="absolute top-3 left-3 flex items-center gap-2">
                        <span className={`px-2.5 py-1 text-xs font-mono font-bold tracking-wider rounded-md shadow-xs ${
                          isAuctionEnded
                            ? 'bg-slate-200 text-slate-700 border border-slate-300'
                            : 'bg-slate-900 text-white flex items-center gap-1.5'
                        }`}>
                          {!isAuctionEnded && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>}
                          {isAuctionEnded ? 'AUCTION CLOSED' : 'ACTIVE LOT'}
                        </span>
                      </div>
                      <div className="absolute bottom-3 right-3 px-2.5 py-1 bg-white/90 backdrop-blur border border-slate-200 text-slate-800 font-mono text-xs rounded-md shadow-2xs font-medium">
                        Reserve Met
                      </div>
                    </div>

                    {/* Lot Info */}
                    <div className="p-6">
                      <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-2">
                        {auction?.title}
                      </h1>
                      <p className="text-slate-600 text-sm leading-relaxed mb-6">
                        {auction?.description}
                      </p>

                      {/* Starting Price & Lot Stats */}
                      <div className="border-t border-slate-100 pt-4 grid grid-cols-2 gap-4">
                        <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-xs uppercase font-mono text-slate-500 tracking-wider block font-medium">Starting Price</span>
                          <span className="text-xl font-bold text-slate-900 font-mono-numbers mt-0.5 block">
                            ₹{startingPrice.toLocaleString('en-IN')}
                          </span>
                        </div>

                        <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-xs uppercase font-mono text-slate-500 tracking-wider block font-medium">Total Bids</span>
                          <span className="text-xl font-bold text-slate-900 font-mono-numbers mt-0.5 flex items-center gap-1.5">
                            {totalBidsCount}
                            <Flame className="w-4 h-4 text-amber-500" />
                          </span>
                        </div>
                      </div>

                      {/* Rule Badge */}
                      <div className="mt-4 p-3 bg-amber-50/80 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                        <Zap className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">Specified Bidding Rule:</span>
                          <p className="text-[11px] text-amber-700 mt-0.5">
                            Every new bid must be at least ₹100 higher than the current highest bid.
                          </p>
                        </div>
                      </div>

                      {/* Metadata Details */}
                      <div className="mt-4 pt-4 border-t border-slate-100 text-xs space-y-2 text-slate-600">
                        <div className="flex justify-between py-1">
                          <span className="text-slate-500">Currency</span>
                          <span className="font-semibold text-slate-800">Indian Rupee (₹ / INR)</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-slate-500">Backend Server</span>
                          <span className="font-mono text-slate-800 text-[11px] truncate max-w-[200px]">
                            {BACKEND_URL}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* RIGHT: Countdown, Highest Bid, Bidding Form, and Bid History */}
                <div className="lg:col-span-7 space-y-6">
                  {/* Top Stats: Countdown & Current Highest Bid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Countdown */}
                    <div className={`p-5 rounded-xl border bg-white shadow-xs transition-all ${
                      isAuctionEnded
                        ? 'border-slate-200 bg-slate-50'
                        : remainingSeconds <= 30
                        ? 'border-amber-400 ring-2 ring-amber-100'
                        : 'border-slate-200'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1.5 font-medium">
                          <Clock className="w-3.5 h-3.5 text-slate-600" />
                          Time Remaining
                        </span>
                        {!isAuctionEnded && (
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                            remainingSeconds <= 30 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {remainingSeconds <= 30 ? 'EXPIRING SOON' : 'ACTIVE'}
                          </span>
                        )}
                      </div>
                      <div className="text-4xl sm:text-5xl font-black font-mono-numbers tracking-tight text-slate-900 my-1">
                        {formatTime(remainingSeconds)}
                      </div>
                      <p className="text-xs text-slate-500">
                        {isAuctionEnded
                          ? 'Bids are closed. The auction has ended.'
                          : 'Bids will stop being accepted when clock hits 00:00.'}
                      </p>
                    </div>

                    {/* Current Highest Bid */}
                    <div className={`p-5 rounded-xl border bg-white shadow-xs transition-all ${
                      newBidHighlight ? 'border-blue-500 ring-2 ring-blue-100 animate-flash' : 'border-slate-200'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1.5 font-medium">
                          <TrendingUp className="w-3.5 h-3.5 text-slate-600" />
                          Current Highest Bid
                        </span>
                        {currentLeader ? (
                          <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-900 text-white font-bold rounded">
                            LEAD: {currentLeader}
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                            NO BIDS YET
                          </span>
                        )}
                      </div>
                      <div className="text-4xl sm:text-5xl font-black font-mono-numbers tracking-tight text-slate-900 my-1">
                        ₹{highestBidVal.toLocaleString('en-IN')}
                      </div>
                      <p className="text-xs text-slate-500">
                        {currentLeader ? (
                          <>Held by <span className="font-bold text-slate-800">{currentLeader}</span></>
                        ) : (
                          <>Starting minimum is ₹{startingPrice.toLocaleString('en-IN')}</>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Bidding Console with React Hook Form */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
                    <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-slate-900"></div>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">Place Your Bid (₹)</h3>
                      </div>
                      <span className="text-xs font-mono text-slate-600">
                        Min Valid Bid: <span className="text-slate-900 font-bold">₹{minimumRequiredBid.toLocaleString('en-IN')}</span>
                      </span>
                    </div>

                    {/* Registered Participant Card */}
                    <div className="mb-4 p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm">
                          {participantName ? participantName.charAt(0).toUpperCase() : '?'}
                        </div>
                        <div>
                          <div className="text-[11px] uppercase font-mono text-slate-500 font-medium">Bidding As</div>
                          <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                            {participantName || 'Guest User'}
                            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowNameModal(true)}
                        className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <Edit2 className="w-3 h-3 text-slate-500" />
                        Change Name
                      </button>
                    </div>

                    {/* Rejection Notification */}
                    {serverRejectionError && (
                      <div className="mb-4 p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
                        <div className="flex-1">
                          <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-rose-800">Bid Rejected</h4>
                          <p className="text-xs text-rose-700 mt-0.5">{serverRejectionError}</p>
                        </div>
                        <button onClick={() => setServerRejectionError(null)} className="text-rose-500 hover:text-rose-800 cursor-pointer">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Success Notification */}
                    {serverSuccessMessage && (
                      <div className="mb-4 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
                        <div className="flex-1">
                          <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-emerald-800">Notice</h4>
                          <p className="text-xs text-emerald-700 mt-0.5">{serverSuccessMessage}</p>
                        </div>
                        <button onClick={() => setServerSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-800 cursor-pointer">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Form with React Hook Form Validations */}
                    <form onSubmit={handleBidSubmit(onPlaceBid)} className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-mono uppercase tracking-wider text-slate-600 font-medium">
                            Bid Amount (₹ INR)
                          </label>
                          <span className="text-[11px] text-slate-500 font-mono">
                            Required: ≥ ₹{minimumRequiredBid.toLocaleString('en-IN')}
                          </span>
                        </div>

                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-base font-bold">₹</span>
                          <input
                            type="number"
                            step="any"
                            disabled={isAuctionEnded}
                            placeholder={`e.g. ${minimumRequiredBid}`}
                            {...registerBid('amount', {
                              required: 'Please enter a bid amount',
                              validate: {
                                isPositive: (val) => Number(val) > 0 || 'Bid amount must be greater than zero',
                                atLeast100Higher: (val) => {
                                  const num = Number(val);
                                  if (currentLeader) {
                                    return (
                                      num >= highestBidVal + 100 ||
                                      `Every new bid must be at least ₹100 higher than current highest bid of ₹${highestBidVal.toLocaleString('en-IN')} (Minimum valid bid: ₹${(highestBidVal + 100).toLocaleString('en-IN')})`
                                    );
                                  } else {
                                    return (
                                      num >= startingPrice ||
                                      `Bid must be at least the starting price of ₹${startingPrice.toLocaleString('en-IN')}`
                                    );
                                  }
                                },
                              },
                            })}
                            className={`w-full bg-slate-50 border pl-8 pr-3.5 py-2.5 rounded-lg text-slate-900 text-base font-mono-numbers outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-bold ${
                              bidErrors.amount ? 'border-rose-400 focus:border-rose-500 bg-rose-50/30' : 'border-slate-300 focus:border-slate-900'
                            }`}
                          />
                        </div>

                        {bidErrors.amount && (
                          <p className="text-xs text-rose-600 mt-1.5 flex items-center gap-1 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            {bidErrors.amount.message}
                          </p>
                        )}

                        {/* Quick Increment Shortcuts (strictly >= ₹100) */}
                        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                          <span className="text-[11px] text-slate-500 font-medium shrink-0">Quick Add:</span>
                          {[100, 200, 500, 1000].map((inc) => (
                            <button
                              key={inc}
                              type="button"
                              disabled={isAuctionEnded}
                              onClick={() => handleQuickAdd(inc)}
                              className="px-2.5 py-1 rounded-md border border-slate-300 bg-slate-100 hover:bg-slate-900 hover:text-white hover:border-slate-900 text-slate-700 text-xs font-mono transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer font-medium"
                            >
                              +₹{inc}
                            </button>
                          ))}
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={isAuctionEnded || submitting}
                        className={`w-full py-3.5 px-6 rounded-lg font-bold text-sm tracking-wide uppercase transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-sm ${
                          isAuctionEnded
                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                            : submitting
                            ? 'bg-slate-700 text-white cursor-wait'
                            : 'bg-slate-900 hover:bg-slate-800 text-white active:scale-[0.99]'
                        }`}
                      >
                        {isAuctionEnded ? (
                          <>
                            <Lock className="w-4 h-4" />
                            Auction Ended • Bids Closed
                          </>
                        ) : submitting ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Validating & Submitting...
                          </>
                        ) : (
                          <>
                            <ArrowUpRight className="w-4 h-4" />
                            Place Bid {watchedBidAmount ? `(₹${Number(watchedBidAmount).toLocaleString('en-IN')})` : ''}
                          </>
                        )}
                      </button>
                    </form>
                  </div>

                  {/* Bid History Table */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
                    <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <History className="w-4 h-4 text-slate-700" />
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">Live Bid History (₹)</h3>
                      </div>
                      <span className="text-xs font-mono text-slate-500 font-medium">
                        {bids.length} {bids.length === 1 ? 'Record' : 'Records'}
                      </span>
                    </div>

                    {bids.length === 0 ? (
                      <div className="text-center py-10 border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
                        <p className="text-slate-500 text-sm">No bids placed yet.</p>
                        <p className="text-slate-400 text-xs mt-1">Starting minimum bid is ₹{startingPrice.toLocaleString('en-IN')}.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-slate-500 font-mono text-xs uppercase bg-slate-50/80">
                              <th className="py-2.5 px-3">Rank</th>
                              <th className="py-2.5 px-3">Participant</th>
                              <th className="py-2.5 px-3">Amount (₹)</th>
                              <th className="py-2.5 px-3">Timestamp</th>
                              <th className="py-2.5 px-3 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono">
                            {bids.map((b, index) => {
                              const isLeading = index === 0;
                              const dateObj = new Date(b.timestamp);
                              const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                              const isUserBid = b.bidderName.toLowerCase() === participantName.toLowerCase();

                              return (
                                <tr
                                  key={b.id || index}
                                  className={`transition-colors ${
                                    isLeading
                                      ? 'bg-slate-100/80 font-semibold text-slate-900'
                                      : 'text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  <td className="py-3 px-3">
                                    {isLeading ? (
                                      <span className="inline-flex items-center gap-1 text-xs bg-slate-900 text-white font-bold px-1.5 py-0.5 rounded">
                                        #1
                                      </span>
                                    ) : (
                                      <span className="text-xs text-slate-400">#{index + 1}</span>
                                    )}
                                  </td>
                                  <td className="py-3 px-3 font-sans font-medium text-slate-900 flex items-center gap-1.5">
                                    {b.bidderName}
                                    {isUserBid && (
                                      <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded font-sans font-bold">
                                        YOU
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-3 font-mono-numbers text-slate-900 font-bold">
                                    ₹{b.amount.toLocaleString('en-IN')}
                                  </td>
                                  <td className="py-3 px-3 text-xs text-slate-500">
                                    {timeStr}
                                  </td>
                                  <td className="py-3 px-3 text-right">
                                    {isLeading ? (
                                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-slate-900 text-white rounded">
                                        {isAuctionEnded ? 'WINNER' : 'HIGHEST'}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200">
                                        OUTBID
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================== */}
          {/* TAB 2: CREATE AUCTION / CREATE BID VIEW               */}
          {/* ===================================================== */}
          {activeTab === 'create' && (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Header Box */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold shadow-xs">
                    <PlusCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Create & Launch Timed Auction</h2>
                    <p className="text-xs sm:text-sm text-slate-500">
                      Configure your item, set the starting price in Indian Rupees (₹) and timer, and launch live on Render.
                    </p>
                  </div>
                </div>

                {/* Quick Presets Carousel */}
                <div className="mt-6 pt-6 border-t border-slate-100">
                  <span className="text-xs font-mono uppercase tracking-wider text-slate-500 font-semibold block mb-3">
                    Quick Sample Presets (1-Click Fill)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {ITEM_PRESETS.map((p, idx) => (
                      <div
                        key={idx}
                        onClick={() => applyPreset(p)}
                        className="p-3 rounded-xl border border-slate-200 hover:border-slate-900 bg-slate-50/50 hover:bg-white transition-all cursor-pointer group shadow-2xs"
                      >
                        <div className="aspect-video w-full rounded-lg overflow-hidden bg-slate-200 mb-2">
                          <img src={p.imageUrl} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        </div>
                        <h4 className="text-xs font-bold text-slate-900 truncate">{p.title}</h4>
                        <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 mt-1">
                          <span>₹{p.startingPrice.toLocaleString('en-IN')}</span>
                          <span>{p.durationSeconds}s</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Create Auction Form using React Hook Form */}
                <form onSubmit={handleCreateSubmit(onCreateAuction)} className="mt-8 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {/* Item Title */}
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-mono uppercase tracking-wider text-slate-600 mb-1.5 font-medium">
                        Item Title <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Vintage Leica M3 Camera"
                        {...registerCreate('title', {
                          required: 'Item title is required',
                          minLength: { value: 3, message: 'Title must be at least 3 characters' },
                        })}
                        className={`w-full bg-slate-50 border px-3.5 py-2.5 rounded-lg text-slate-900 text-sm font-semibold outline-none transition-colors ${
                          createErrors.title ? 'border-rose-400 focus:border-rose-500 bg-rose-50/40' : 'border-slate-300 focus:border-slate-900'
                        }`}
                      />
                      {createErrors.title && (
                        <p className="text-xs text-rose-600 mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {createErrors.title.message}
                        </p>
                      )}
                    </div>

                    {/* Description */}
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-mono uppercase tracking-wider text-slate-600 mb-1.5 font-medium">
                        Item Description <span className="text-rose-500">*</span>
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Provide details about the item's condition, craftsmanship, or collector value..."
                        {...registerCreate('description', {
                          required: 'Item description is required',
                          minLength: { value: 10, message: 'Description must be at least 10 characters' },
                        })}
                        className={`w-full bg-slate-50 border px-3.5 py-2.5 rounded-lg text-slate-900 text-sm outline-none transition-colors ${
                          createErrors.description ? 'border-rose-400 focus:border-rose-500 bg-rose-50/40' : 'border-slate-300 focus:border-slate-900'
                        }`}
                      />
                      {createErrors.description && (
                        <p className="text-xs text-rose-600 mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {createErrors.description.message}
                        </p>
                      )}
                    </div>

                    {/* Starting Price in INR */}
                    <div>
                      <label className="block text-xs font-mono uppercase tracking-wider text-slate-600 mb-1.5 font-medium">
                        Starting Price (₹ INR) <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-mono font-bold">₹</span>
                        <input
                          type="number"
                          step="any"
                          placeholder="5000"
                          {...registerCreate('startingPrice', {
                            required: 'Starting price is required',
                            min: { value: 1, message: 'Starting price must be at least ₹1' },
                          })}
                          className={`w-full bg-slate-50 border pl-8 pr-3.5 py-2.5 rounded-lg text-slate-900 font-mono-numbers text-sm font-bold outline-none transition-colors ${
                            createErrors.startingPrice ? 'border-rose-400 focus:border-rose-500 bg-rose-50/40' : 'border-slate-300 focus:border-slate-900'
                          }`}
                        />
                      </div>
                      {createErrors.startingPrice && (
                        <p className="text-xs text-rose-600 mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {createErrors.startingPrice.message}
                        </p>
                      )}
                    </div>

                    {/* Auction Duration */}
                    <div>
                      <label className="block text-xs font-mono uppercase tracking-wider text-slate-600 mb-1.5 font-medium">
                        Auction Duration (Seconds) <span className="text-rose-500">*</span>
                      </label>
                      <div className="flex items-center gap-2 mb-2">
                        {[60, 120, 180, 300].map((sec) => (
                          <button
                            key={sec}
                            type="button"
                            onClick={() => setCreateValue('durationSeconds', sec, { shouldValidate: true })}
                            className={`px-2.5 py-1 text-xs font-mono rounded-md border transition-colors cursor-pointer ${
                              Number(watchedCreateDuration) === sec
                                ? 'bg-slate-900 text-white border-slate-900 font-bold'
                                : 'bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-400'
                            }`}
                          >
                            {sec}s
                          </button>
                        ))}
                      </div>
                      <input
                        type="number"
                        placeholder="e.g. 180"
                        {...registerCreate('durationSeconds', {
                          required: 'Duration in seconds is required',
                          min: { value: 5, message: 'Duration must be at least 5 seconds' },
                          max: { value: 3600, message: 'Duration cannot exceed 3600 seconds' },
                        })}
                        className={`w-full bg-slate-50 border px-3.5 py-2 rounded-lg text-slate-900 font-mono text-sm outline-none transition-colors ${
                          createErrors.durationSeconds ? 'border-rose-400 focus:border-rose-500' : 'border-slate-300 focus:border-slate-900'
                        }`}
                      />
                      {createErrors.durationSeconds && (
                        <p className="text-xs text-rose-600 mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {createErrors.durationSeconds.message}
                        </p>
                      )}
                    </div>

                    {/* Item Image URL */}
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-mono uppercase tracking-wider text-slate-600 mb-1.5 font-medium">
                        Item Image URL (or use default /item.jpg)
                      </label>
                      <input
                        type="text"
                        placeholder="/item.jpg or https://images.unsplash.com/..."
                        {...registerCreate('imageUrl')}
                        className="w-full bg-slate-50 border border-slate-300 focus:border-slate-900 px-3.5 py-2.5 rounded-lg text-slate-900 text-sm outline-none"
                      />
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setActiveTab('bid')}
                      className="px-5 py-3 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={creatingAuction}
                      className="px-6 py-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold font-mono uppercase tracking-wide transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
                    >
                      {creatingAuction ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Launching Auction...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-amber-300" />
                          Launch Timed Auction (₹)
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="border-t border-slate-200 bg-white py-6 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 font-mono">
            <div>
              CodeRush Hackathon 2026 • Problem R2-01 Event Auction System
            </div>
            <div className="flex items-center gap-3">
              <span>Currency: ₹ INR</span>
              <span>•</span>
              <span>Backend: https://round-2-backend.onrender.com</span>
            </div>
          </div>
        </footer>
      </div>

      {/* ======================================================== */}
      {/* 1. INITIAL / EDIT PARTICIPANT NAME MODAL                 */}
      {/* ======================================================== */}
      {showNameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-slate-200 w-full max-w-md rounded-2xl p-6 sm:p-7 shadow-xl relative">
            {participantName && (
              <button
                onClick={() => setShowNameModal(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            )}

            <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center mb-4 shadow-sm">
              <UserCheck className="w-6 h-6" />
            </div>

            <h3 className="text-xl font-bold text-slate-900">
              {participantName ? 'Update Participant Name' : 'Welcome to Event Auction'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 mb-5 leading-relaxed">
              Please enter your full name to join the live timed auction room. All bids will be placed in Indian Rupees (₹) under this name.
            </p>

            <form onSubmit={handleNameSubmit(onSaveParticipantName)} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-slate-600 mb-1.5 font-medium">
                  Your Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. Rahul Sharma"
                  {...registerName('name', {
                    required: 'Participant name is required to enter the auction',
                    minLength: {
                      value: 2,
                      message: 'Name must be at least 2 characters long',
                    },
                    maxLength: {
                      value: 40,
                      message: 'Name cannot exceed 40 characters',
                    },
                    validate: (val) => !!val.trim() || 'Name cannot be empty spaces',
                  })}
                  className={`w-full bg-slate-50 border px-3.5 py-2.5 rounded-lg text-slate-900 text-sm font-medium outline-none transition-colors ${
                    nameErrors.name ? 'border-rose-400 focus:border-rose-500 bg-rose-50/40' : 'border-slate-300 focus:border-slate-900'
                  }`}
                />

                {nameErrors.name && (
                  <p className="text-xs text-rose-600 mt-1.5 flex items-center gap-1 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {nameErrors.name.message}
                  </p>
                )}

                <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                  <span className="text-[11px] text-slate-400 font-mono">Suggestions:</span>
                  {['Rahul Sharma', 'Priya Patel', 'Amit Verma', 'Ananya Roy'].map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setNameValue('name', sug, { shouldValidate: true })}
                      className="px-2 py-0.5 text-xs rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold tracking-wide uppercase transition-colors shadow-xs cursor-pointer"
                >
                  {participantName ? 'Save & Continue' : 'Enter Auction Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. ORGANIZER QUICK RESET CONTROLS MODAL                  */}
      {/* ======================================================== */}
      {showAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-slate-200 w-full max-w-md rounded-2xl p-6 shadow-xl relative">
            <button
              onClick={() => setShowAdminModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-2">
              <Sliders className="w-5 h-5 text-slate-900" />
              <h3 className="text-lg font-bold text-slate-900">Organizer / Judge Controls</h3>
            </div>
            <p className="text-xs text-slate-500 mb-6">
              Quickly reset or set timer duration for demo testing.
            </p>

            <form onSubmit={handleAdminSubmit(onAdminReset)} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-slate-600 mb-2 font-medium">
                  Auction Duration (Seconds)
                </label>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {[60, 120, 180].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setAdminValue('durationSeconds', sec, { shouldValidate: true })}
                      className={`py-2 text-xs font-mono rounded-lg border transition-colors cursor-pointer ${
                        Number(watchedAdminDuration) === sec
                          ? 'bg-slate-900 text-white border-slate-900 font-bold'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      {sec}s ({sec / 60}m)
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  placeholder="Custom seconds (e.g. 15)"
                  {...registerAdmin('durationSeconds', {
                    required: 'Please enter duration in seconds',
                    min: { value: 5, message: 'Duration must be at least 5 seconds' },
                    max: { value: 3600, message: 'Duration cannot exceed 3600 seconds' },
                  })}
                  className="w-full bg-slate-50 border border-slate-300 focus:border-slate-900 px-3 py-2 rounded-lg text-slate-900 text-sm font-mono outline-none"
                />
                {adminErrors.durationSeconds && (
                  <p className="text-xs text-rose-600 mt-1 font-medium">{adminErrors.durationSeconds.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-slate-600 mb-2 font-medium">
                  Starting Price (₹ INR)
                </label>
                <input
                  type="number"
                  placeholder="Starting Price (e.g. 5000)"
                  {...registerAdmin('startingPrice', {
                    required: 'Please enter starting price',
                    min: { value: 1, message: 'Starting price must be at least ₹1' },
                  })}
                  className="w-full bg-slate-50 border border-slate-300 focus:border-slate-900 px-3 py-2 rounded-lg text-slate-900 text-sm font-mono outline-none"
                />
                {adminErrors.startingPrice && (
                  <p className="text-xs text-rose-600 mt-1 font-medium">{adminErrors.startingPrice.message}</p>
                )}
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAdminModal(false)}
                  className="flex-1 py-2.5 px-4 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-mono cursor-pointer font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold font-mono uppercase transition-colors cursor-pointer shadow-xs"
                >
                  Reset & Start (₹)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
