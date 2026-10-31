import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useForm } from 'react-hook-form';
import confetti from 'canvas-confetti';
import {
  Gavel,
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
} from 'lucide-react';

const BACKEND_URL = 'http://localhost:5000';

export default function App() {
  const [auction, setAuction] = useState(null);
  const [bids, setBids] = useState([]);
  const [participantName, setParticipantName] = useState(() => {
    return localStorage.getItem('auction_participant_name') || '';
  });
  const [showNameModal, setShowNameModal] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [serverRejectionError, setServerRejectionError] = useState(null);
  const [serverSuccessMessage, setServerSuccessMessage] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [newBidHighlight, setNewBidHighlight] = useState(false);

  const socketRef = useRef(null);
  const timerRef = useRef(null);
  const hasTriggeredConfettiRef = useRef(false);

  // 1. React Hook Form for Participant Name Registration Dialog
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

  // 2. React Hook Form for Bidding
  const {
    register: registerBid,
    handleSubmit: handleBidSubmit,
    formState: { errors: bidErrors },
    setValue: setBidValue,
    watch: watchBid,
    reset: resetBidForm,
  } = useForm({
    defaultValues: {
      amount: '',
    },
  });

  // 3. React Hook Form for Organizer / Admin Controls
  const {
    register: registerAdmin,
    handleSubmit: handleAdminSubmit,
    formState: { errors: adminErrors },
    setValue: setAdminValue,
    watch: watchAdmin,
  } = useForm({
    defaultValues: {
      durationSeconds: 120,
      startingPrice: 1000,
    },
  });

  const watchedBidAmount = watchBid('amount');
  const watchedAdminDuration = watchAdmin('durationSeconds');

  // Show name entry dialog if no participant name is saved on initial mount
  useEffect(() => {
    const savedName = localStorage.getItem('auction_participant_name');
    if (!savedName || !savedName.trim()) {
      setShowNameModal(true);
    } else {
      setParticipantName(savedName.trim());
      setNameValue('name', savedName.trim());
    }
  }, [setNameValue]);

  // Trigger celebration confetti when auction ends with a winner
  const triggerCelebration = () => {
    confetti({
      particleCount: 90,
      spread: 75,
      origin: { y: 0.6 },
      colors: ['#0f172a', '#3b82f6', '#10b981', '#f59e0b', '#6366f1'],
    });
  };

  // Fetch initial auction data from REST API
  const fetchAuctionData = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auction`);
      const data = await res.json();
      if (data.success) {
        setAuction(data.auction);
        setBids(data.bids || []);
        setRemainingSeconds(data.auction.remainingSeconds);

        const nextMin = (data.auction.currentHighestBidder ? data.auction.currentHighestBid : data.auction.startingPrice) + 100;
        setBidValue('amount', nextMin);

        if (data.auction.status === 'ENDED' && data.auction.winner && !hasTriggeredConfettiRef.current) {
          hasTriggeredConfettiRef.current = true;
          triggerCelebration();
        }
      }
    } catch (err) {
      console.error('Failed to fetch auction data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Setup Socket.io connection and listeners
  useEffect(() => {
    fetchAuctionData();

    const socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      console.log('[Socket.io Connected]:', socket.id);
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

      // Pre-populate next recommended bid
      setBidValue('amount', data.auction.currentHighestBid + 50);
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
      setServerSuccessMessage('Auction reset! New timed session is active.');
      setTimeout(() => setServerSuccessMessage(null), 3000);
      setBidValue('amount', data.auction.startingPrice + 50);
    });

    return () => {
      socket.disconnect();
    };
  }, [setBidValue]);

  // Synchronized countdown timer tick
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

  // Handle Participant Name Submission
  const onSaveParticipantName = (data) => {
    const trimmed = data.name.trim();
    setParticipantName(trimmed);
    localStorage.setItem('auction_participant_name', trimmed);
    setShowNameModal(false);
  };

  // Handle Bidding Submission via React Hook Form
  const onPlaceBid = async (formData) => {
    setServerRejectionError(null);
    setServerSuccessMessage(null);

    // If user somehow doesn't have a name set, ask for it
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
        setServerSuccessMessage(`Bid of $${numericAmount.toLocaleString()} placed successfully by ${participantName}!`);
        setTimeout(() => setServerSuccessMessage(null), 4000);
      }
    } catch (err) {
      setServerRejectionError(`Network error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Quick increment buttons
  const handleQuickAdd = (increment) => {
    const base = auction?.currentHighestBidder ? auction.currentHighestBid : auction?.startingPrice || 1000;
    const nextVal = base + increment;
    setBidValue('amount', nextVal, { shouldValidate: true });
    setServerRejectionError(null);
  };

  // Organizer Reset Submission via React Hook Form
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
  const minimumRequiredBid = currentLeader ? highestBidVal + 1 : startingPrice;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center justify-center p-6">
        <div className="w-10 h-10 border-3 border-slate-200 border-t-slate-800 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 font-mono text-sm tracking-wider uppercase">Loading Event Auction...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Light Navbar */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-900 text-white flex items-center justify-center rounded-lg shadow-xs">
              <Gavel className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold tracking-tight text-slate-900 text-base sm:text-lg">CODERUSH</span>
                <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono border border-slate-300 font-semibold">
                  R2-01
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">Event Timed Auction System</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {/* Live Socket Status Badge */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs text-slate-600">
              <span className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
              <span className="hidden md:inline font-mono font-medium">{socketConnected ? 'LIVE SYNC' : 'CONNECTING'}</span>
            </div>

            {/* Active Participant Pill with Edit Option */}
            {participantName ? (
              <div
                onClick={() => setShowNameModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs text-slate-800 cursor-pointer transition-colors shadow-2xs"
                title="Click to change your participant name"
              >
                <div className="w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-bold uppercase">
                  {participantName.charAt(0)}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 hidden sm:inline">Participant:</span>
                  <span className="font-semibold text-slate-900 max-w-[120px] truncate">{participantName}</span>
                  <Edit2 className="w-3 h-3 text-slate-400 ml-0.5" />
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowNameModal(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors shadow-2xs cursor-pointer"
              >
                <User className="w-3.5 h-3.5" />
                Join as Participant
              </button>
            )}

            {/* Organizer Quick-Control Button */}
            <button
              onClick={() => setShowAdminModal(true)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg transition-colors cursor-pointer"
              title="Organizer / Judge Controls"
            >
              <Sliders className="w-3.5 h-3.5 text-slate-600" />
              <span className="hidden sm:inline">Organizer Controls</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex-1 w-full">
        {/* Banner: Auction Finished & Winner Callout */}
        {isAuctionEnded ? (
          <div className="mb-8 p-6 rounded-xl bg-white border border-slate-200 shadow-md relative overflow-hidden">
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
                      'No Winner (No bids placed)'
                    )}
                  </h2>
                  <p className="text-sm text-slate-600 mt-0.5">
                    {auction?.winner
                      ? `Final winning price: $${auction.winner.amount.toLocaleString()} • Hammer dropped`
                      : 'The auction has ended with zero qualifying bids.'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowAdminModal(true)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-2 self-start sm:self-auto cursor-pointer shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Restart Auction
              </button>
            </div>
          </div>
        ) : null}

        {/* 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT COLUMN: Item Display & Lot Specs */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              {/* Product Photo */}
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
                    {isAuctionEnded ? 'AUCTION CLOSED' : 'LIVE LOT #01'}
                  </span>
                </div>
                <div className="absolute bottom-3 right-3 px-2.5 py-1 bg-white/90 backdrop-blur border border-slate-200 text-slate-800 font-mono text-xs rounded-md shadow-2xs font-medium">
                  Reserve Met
                </div>
              </div>

              {/* Product Info */}
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
                      ${startingPrice.toLocaleString()}
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-xs uppercase font-mono text-slate-500 tracking-wider block font-medium">Total Bids Placed</span>
                    <span className="text-xl font-bold text-slate-900 font-mono-numbers mt-0.5 flex items-center gap-1.5">
                      {totalBidsCount}
                      <Flame className="w-4 h-4 text-amber-500" />
                    </span>
                  </div>
                </div>

                {/* Metadata Details */}
                <div className="mt-4 pt-4 border-t border-slate-100 text-xs space-y-2 text-slate-600">
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Auction Format</span>
                    <span className="font-semibold text-slate-800">Timed Reserve Single-Item</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Currency</span>
                    <span className="font-semibold text-slate-800">USD ($)</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Transparency Engine</span>
                    <span className="font-mono text-slate-800">Real-Time WebSocket & MERN</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Live Countdown, Bidding Form, and History Table */}
          <div className="lg:col-span-7 space-y-6">
            {/* Top Cards: Countdown & Highest Bid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 1. Countdown Box */}
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
                    : 'Auction closes automatically when timer reaches 00:00.'}
                </p>
              </div>

              {/* 2. Current Highest Bid Box */}
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
                  ${highestBidVal.toLocaleString()}
                </div>
                <p className="text-xs text-slate-500">
                  {currentLeader ? (
                    <>Held by <span className="font-bold text-slate-800">{currentLeader}</span></>
                  ) : (
                    <>Starting minimum is ${startingPrice.toLocaleString()}</>
                  )}
                </p>
              </div>
            </div>

            {/* Bidding Console with React Hook Form */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-900"></div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">Place Your Bid</h3>
                </div>
                <span className="text-xs font-mono text-slate-600">
                  Min Valid Bid: <span className="text-slate-900 font-bold">${minimumRequiredBid.toLocaleString()}</span>
                </span>
              </div>

              {/* Participant Identifier Card (Replaces the raw input field as requested) */}
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

              {/* Server Rejection Error Banner */}
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

              {/* Server Success Banner */}
              {serverSuccessMessage && (
                <div className="mb-4 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-emerald-800">Bid Accepted</h4>
                    <p className="text-xs text-emerald-700 mt-0.5">{serverSuccessMessage}</p>
                  </div>
                  <button onClick={() => setServerSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-800 cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Bidding Form using React Hook Form */}
              <form onSubmit={handleBidSubmit(onPlaceBid)} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-slate-600 mb-1.5 font-medium">
                    Bid Amount ($ USD)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-base font-bold">$</span>
                    <input
                      type="number"
                      step="any"
                      disabled={isAuctionEnded}
                      placeholder={`e.g. ${minimumRequiredBid}`}
                      {...registerBid('amount', {
                        required: 'Please enter a bid amount',
                        validate: {
                          isPositive: (val) => Number(val) > 0 || 'Bid amount must be greater than zero',
                          exceedsHighest: (val) => {
                            const num = Number(val);
                            if (currentLeader) {
                              return num > highestBidVal || `Bid must exceed current highest bid of $${highestBidVal.toLocaleString()}`;
                            } else {
                              return num >= startingPrice || `Bid must be at least the starting price of $${startingPrice.toLocaleString()}`;
                            }
                          },
                        },
                      })}
                      className={`w-full bg-slate-50 border pl-8 pr-3.5 py-2.5 rounded-lg text-slate-900 text-base font-mono-numbers outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-bold ${
                        bidErrors.amount ? 'border-rose-400 focus:border-rose-500 bg-rose-50/30' : 'border-slate-300 focus:border-slate-900'
                      }`}
                    />
                  </div>

                  {/* Inline React Hook Form Validation Error */}
                  {bidErrors.amount && (
                    <p className="text-xs text-rose-600 mt-1.5 flex items-center gap-1 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {bidErrors.amount.message}
                    </p>
                  )}

                  {/* Quick Add Buttons */}
                  <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                    <span className="text-[11px] text-slate-500 font-medium shrink-0">Quick Add:</span>
                    {[50, 100, 250, 500].map((inc) => (
                      <button
                        key={inc}
                        type="button"
                        disabled={isAuctionEnded}
                        onClick={() => handleQuickAdd(inc)}
                        className="px-2.5 py-1 rounded-md border border-slate-300 bg-slate-100 hover:bg-slate-900 hover:text-white hover:border-slate-900 text-slate-700 text-xs font-mono transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer font-medium"
                      >
                        +${inc}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Submit Bid Button */}
                <div className="pt-2">
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
                        Place Bid {watchedBidAmount ? `($${Number(watchedBidAmount).toLocaleString()})` : ''}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Live Bid History Ledger */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-slate-700" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">Live Bid History</h3>
                </div>
                <span className="text-xs font-mono text-slate-500 font-medium">
                  {bids.length} {bids.length === 1 ? 'Record' : 'Records'}
                </span>
              </div>

              {bids.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
                  <p className="text-slate-500 text-sm">No bids placed yet.</p>
                  <p className="text-slate-400 text-xs mt-1">Starting minimum bid is ${startingPrice.toLocaleString()}.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-mono text-xs uppercase bg-slate-50/80">
                        <th className="py-2.5 px-3">Rank</th>
                        <th className="py-2.5 px-3">Participant</th>
                        <th className="py-2.5 px-3">Amount</th>
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
                              ${b.amount.toLocaleString()}
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
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 font-mono">
          <div>
            CodeRush Hackathon 2026 • Problem R2-01 Event Auction System
          </div>
          <div className="flex items-center gap-3">
            <span>Stack: MERN + Socket.IO + React Hook Form</span>
            <span>•</span>
            <span>UI: Modern Light Theme</span>
          </div>
        </div>
      </footer>

      {/* 1. INITIAL / EDIT PARTICIPANT NAME DIALOG (Modal) */}
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
              Please enter your full name to join the live timed auction room. All your bids will be registered under this name.
            </p>

            {/* React Hook Form for Name */}
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

                {/* Quick Name Suggestions */}
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

      {/* 2. ORGANIZER / ADMIN CONTROLS MODAL */}
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
              Configure and instantly restart the timed auction for live evaluation and test cycles.
            </p>

            {/* React Hook Form for Admin Controls */}
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
                  Starting Price ($ USD)
                </label>
                <input
                  type="number"
                  placeholder="Starting Price"
                  {...registerAdmin('startingPrice', {
                    required: 'Please enter starting price',
                    min: { value: 1, message: 'Starting price must be at least $1' },
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
                  Reset & Start
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
