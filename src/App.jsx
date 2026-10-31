import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
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
  Radio,
  Lock,
} from 'lucide-react';

const BACKEND_URL = 'http://localhost:5000';

export default function App() {
  const [auction, setAuction] = useState(null);
  const [bids, setBids] = useState([]);
  const [bidderName, setBidderName] = useState('Alex Rivera');
  const [bidAmount, setBidAmount] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rejectionError, setRejectionError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminDuration, setAdminDuration] = useState(120);
  const [adminStartPrice, setAdminStartPrice] = useState(1000);
  const [newBidHighlight, setNewBidHighlight] = useState(false);

  const socketRef = useRef(null);
  const timerRef = useRef(null);
  const hasTriggeredConfettiRef = useRef(false);

  // Trigger monochrome confetti celebration
  const triggerMonochromeConfetti = () => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#ffffff', '#a1a1aa', '#71717a', '#27272a', '#e4e4e7'],
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
        // Pre-fill bid amount with a smart suggestion
        const nextMin = (data.auction.currentHighestBidder ? data.auction.currentHighestBid : data.auction.startingPrice) + 100;
        setBidAmount(String(nextMin));

        if (data.auction.status === 'ENDED' && data.auction.winner && !hasTriggeredConfettiRef.current) {
          hasTriggeredConfettiRef.current = true;
          triggerMonochromeConfetti();
        }
      }
    } catch (err) {
      console.error('Failed to fetch auction data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Setup Socket.io connection and real-time listeners
  useEffect(() => {
    fetchAuctionData();

    const socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      console.log('[Socket Connected]:', socket.id);
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
      console.log('[Socket Disconnected]');
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
      // Flash highlight animation
      setNewBidHighlight(true);
      setTimeout(() => setNewBidHighlight(false), 1500);

      // Pre-fill next minimum recommended bid
      setBidAmount(String(data.auction.currentHighestBid + 50));
    });

    socket.on('auction_ended', (data) => {
      setAuction(data.auction);
      setRemainingSeconds(0);
      if (data.winner && !hasTriggeredConfettiRef.current) {
        hasTriggeredConfettiRef.current = true;
        triggerMonochromeConfetti();
      }
    });

    socket.on('auction_reset', (data) => {
      setAuction(data.auction);
      setBids(data.bids || []);
      setRemainingSeconds(data.auction.remainingSeconds);
      hasTriggeredConfettiRef.current = false;
      setRejectionError(null);
      setSuccessMessage('Auction reset! New timed session is active.');
      setTimeout(() => setSuccessMessage(null), 3000);
      setBidAmount(String(data.auction.startingPrice + 50));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

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
        // Auction ended locally
        setAuction((prev) => ({
          ...prev,
          status: 'ENDED',
          winner: prev.currentHighestBidder
            ? { name: prev.currentHighestBidder, amount: prev.currentHighestBid, wonAt: new Date() }
            : null,
        }));
        if (auction.currentHighestBidder && !hasTriggeredConfettiRef.current) {
          hasTriggeredConfettiRef.current = true;
          triggerMonochromeConfetti();
        }
      }
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);

    return () => clearInterval(timerRef.current);
  }, [auction?.endTime, auction?.status]);

  // Handle participant submitting a bid
  const handlePlaceBid = async (e) => {
    e.preventDefault();
    setRejectionError(null);
    setSuccessMessage(null);

    const numericAmount = Number(bidAmount);

    if (!bidderName.trim()) {
      setRejectionError('Please enter your participant name.');
      return;
    }

    if (isNaN(numericAmount) || numericAmount <= 0) {
      setRejectionError('Please enter a valid numeric bid amount.');
      return;
    }

    // Client-side quick check
    const currentMax = auction.currentHighestBidder ? auction.currentHighestBid : auction.startingPrice - 1;
    if (numericAmount <= currentMax) {
      const reason = auction.currentHighestBidder
        ? `Bid rejected: Your bid of $${numericAmount.toLocaleString()} must be strictly higher than current highest bid of $${auction.currentHighestBid.toLocaleString()}.`
        : `Bid rejected: Your bid of $${numericAmount.toLocaleString()} must be at least the starting price of $${auction.startingPrice.toLocaleString()}.`;
      setRejectionError(reason);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bidderName: bidderName.trim(),
          amount: numericAmount,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setRejectionError(data.message || 'Bid rejected by auction server.');
      } else {
        setSuccessMessage(`Success! Bid of $${numericAmount.toLocaleString()} placed by ${bidderName}.`);
        setTimeout(() => setSuccessMessage(null), 4000);
      }
    } catch (err) {
      setRejectionError(`Network error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Quick increment buttons
  const handleQuickAdd = (increment) => {
    const base = auction?.currentHighestBidder ? auction.currentHighestBid : auction?.startingPrice || 1000;
    const nextVal = base + increment;
    setBidAmount(String(nextVal));
    setRejectionError(null);
  };

  // Admin Reset Handler
  const handleAdminReset = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auction/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          durationSeconds: Number(adminDuration),
          startingPrice: Number(adminStartPrice),
        }),
      });
      const data = await res.json();
      if (data.success) {
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

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
        <div className="w-12 h-12 border-2 border-white/20 border-t-white rounded-full animate-spin mb-4"></div>
        <p className="text-zinc-400 font-mono text-sm tracking-wider uppercase">Initializing Event Auction...</p>
      </div>
    );
  }

  const currentLeader = auction?.currentHighestBidder;
  const highestBidVal = auction?.currentHighestBid || auction?.startingPrice || 1000;
  const startingPrice = auction?.startingPrice || 1000;
  const totalBidsCount = bids.length;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Top Monochrome Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white text-black flex items-center justify-center rounded-sm font-black text-lg shadow-sm">
              <Gavel className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold tracking-tight text-white text-base sm:text-lg">CODERUSH</span>
                <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded font-mono border border-zinc-700">R2-01</span>
              </div>
              <p className="text-xs text-zinc-400 hidden sm:block">Event Timed Auction System</p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {/* Live Socket Status */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-300">
              <span className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-white animate-pulse' : 'bg-zinc-600'}`}></span>
              <span className="hidden sm:inline font-mono">{socketConnected ? 'REAL-TIME SYNC' : 'OFFLINE'}</span>
            </div>

            {/* Organizer Reset Button */}
            <button
              onClick={() => setShowAdminModal(true)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 rounded transition-colors cursor-pointer"
              title="Reset Auction / Timer settings for Hackathon judging"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Organizer Controls</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex-1 w-full">
        {/* Banner: Auction Status & Winner Callout if Ended */}
        {isAuctionEnded ? (
          <div className="mb-8 p-6 rounded-lg bg-zinc-950 border border-white/30 relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none"></div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center shrink-0">
                  <Trophy className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono tracking-widest uppercase px-2 py-0.5 bg-white text-black rounded font-bold">
                      AUCTION CONCLUDED
                    </span>
                    <span className="text-xs text-zinc-400 font-mono">Bidding Stopped</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold mt-1 text-white">
                    {auction?.winner ? (
                      <>Winner: <span className="underline underline-offset-4 decoration-white">{auction.winner.name}</span></>
                    ) : (
                      'No Winner (No bids placed)'
                    )}
                  </h2>
                  <p className="text-sm text-zinc-400 mt-0.5">
                    {auction?.winner
                      ? `Final winning bid: $${auction.winner.amount.toLocaleString()} • Hammer dropped`
                      : 'The auction has completed with zero bids exceeding starting price.'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowAdminModal(true)}
                className="px-4 py-2 bg-white text-black font-semibold text-xs rounded hover:bg-zinc-200 transition-colors flex items-center gap-2 self-start sm:self-auto cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Start New Auction
              </button>
            </div>
          </div>
        ) : null}

        {/* 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT COLUMN: Item Display & Description (Cols 1 to 5) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
              {/* Item Image with Monochrome styling */}
              <div className="relative aspect-square w-full bg-zinc-900 border-b border-zinc-800 overflow-hidden group">
                <img
                  src={auction?.imageUrl || '/item.jpg'}
                  alt={auction?.title || 'Auction Item'}
                  className="w-full h-full object-cover grayscale contrast-125 filter group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <span className={`px-2.5 py-1 text-xs font-mono font-bold tracking-wider rounded ${
                    isAuctionEnded
                      ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                      : 'bg-white text-black flex items-center gap-1.5'
                  }`}>
                    {!isAuctionEnded && <span className="w-1.5 h-1.5 rounded-full bg-black animate-ping"></span>}
                    {isAuctionEnded ? 'CLOSED' : 'LIVE LOT #01'}
                  </span>
                </div>
                <div className="absolute bottom-3 right-3 px-2 py-1 bg-black/80 backdrop-blur border border-zinc-700 text-zinc-300 font-mono text-xs rounded">
                  Reserve Met
                </div>
              </div>

              {/* Item Details */}
              <div className="p-6">
                <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
                  {auction?.title}
                </h1>
                <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                  {auction?.description}
                </p>

                {/* Starting Price & Item Specs */}
                <div className="border-t border-zinc-900 pt-4 grid grid-cols-2 gap-4">
                  <div className="p-3 bg-zinc-900/60 rounded border border-zinc-800/80">
                    <span className="text-xs uppercase font-mono text-zinc-400 tracking-wider block">Starting Price</span>
                    <span className="text-xl font-bold text-white font-mono-numbers mt-0.5 block">
                      ${startingPrice.toLocaleString()}
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-900/60 rounded border border-zinc-800/80">
                    <span className="text-xs uppercase font-mono text-zinc-400 tracking-wider block">Total Bids Placed</span>
                    <span className="text-xl font-bold text-white font-mono-numbers mt-0.5 block flex items-center gap-1.5">
                      {totalBidsCount}
                      <Flame className="w-4 h-4 text-zinc-400" />
                    </span>
                  </div>
                </div>

                {/* Specification Table */}
                <div className="mt-4 pt-4 border-t border-zinc-900 text-xs space-y-2 text-zinc-400">
                  <div className="flex justify-between py-1">
                    <span className="text-zinc-400">Auction Format</span>
                    <span className="font-mono text-zinc-200">Single Item Timed Auction</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-zinc-400">Currency</span>
                    <span className="font-mono text-zinc-200">USD ($)</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-zinc-400">Transparency Engine</span>
                    <span className="font-mono text-zinc-200">Real-time WebSocket & MERN</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Live Countdown, Bidding Controls, and Bid History (Cols 6 to 12) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Live Timer & Highest Bid Banner Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 1. Countdown Timer Box */}
              <div className={`p-5 rounded-lg border transition-all ${
                isAuctionEnded
                  ? 'bg-zinc-950 border-zinc-800'
                  : remainingSeconds <= 30
                  ? 'bg-zinc-950 border-white/60 shadow-[0_0_20px_rgba(255,255,255,0.1)]'
                  : 'bg-zinc-950 border-zinc-800'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Time Remaining
                  </span>
                  {!isAuctionEnded && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 text-zinc-300 rounded">
                      {remainingSeconds <= 30 ? 'ENDING SOON' : 'ACTIVE'}
                    </span>
                  )}
                </div>
                <div className="text-4xl sm:text-5xl font-black font-mono-numbers tracking-tight text-white my-1">
                  {formatTime(remainingSeconds)}
                </div>
                <p className="text-xs text-zinc-400">
                  {isAuctionEnded
                    ? 'Bidding has stopped. Auction closed.'
                    : `Auction closes automatically when clock hits 00:00.`}
                </p>
              </div>

              {/* 2. Current Highest Bid Box */}
              <div className={`p-5 rounded-lg border transition-all ${
                newBidHighlight
                  ? 'bg-zinc-900 border-white animate-flash'
                  : 'bg-zinc-950 border-zinc-800'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" />
                    Current Highest Bid
                  </span>
                  {currentLeader ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 bg-white text-black font-bold rounded">
                      LEAD: {currentLeader}
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded">
                      NO BIDS YET
                    </span>
                  )}
                </div>
                <div className="text-4xl sm:text-5xl font-black font-mono-numbers tracking-tight text-white my-1">
                  ${highestBidVal.toLocaleString()}
                </div>
                <p className="text-xs text-zinc-400">
                  {currentLeader ? (
                    <>Held by <span className="text-white font-semibold">{currentLeader}</span></>
                  ) : (
                    <>Starting minimum is ${startingPrice.toLocaleString()}</>
                  )}
                </p>
              </div>
            </div>

            {/* Bidding Action Console */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-6">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-zinc-900">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-white"></div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-white">Place Your Bid</h3>
                </div>
                <span className="text-xs font-mono text-zinc-400">
                  Min Valid Bid: <span className="text-white font-bold">${(currentLeader ? highestBidVal + 1 : startingPrice).toLocaleString()}</span>
                </span>
              </div>

              {/* Rejection Notification Banner */}
              {rejectionError && (
                <div className="mb-4 p-4 rounded bg-black border border-white/80 text-white flex items-start gap-3 animate-pulse-subtle">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-white mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-xs font-bold uppercase tracking-wider font-mono">Bid Rejected</h4>
                    <p className="text-xs text-zinc-300 mt-0.5">{rejectionError}</p>
                  </div>
                  <button onClick={() => setRejectionError(null)} className="text-zinc-400 hover:text-white cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Success Notification Banner */}
              {successMessage && (
                <div className="mb-4 p-4 rounded bg-zinc-900 border border-zinc-600 text-white flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-white mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-xs font-bold uppercase tracking-wider font-mono">Bid Accepted</h4>
                    <p className="text-xs text-zinc-300 mt-0.5">{successMessage}</p>
                  </div>
                  <button onClick={() => setSuccessMessage(null)} className="text-zinc-400 hover:text-white cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Bid Form */}
              <form onSubmit={handlePlaceBid} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Participant Name */}
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-1.5">
                      Participant Name
                    </label>
                    <input
                      type="text"
                      disabled={isAuctionEnded}
                      value={bidderName}
                      onChange={(e) => setBidderName(e.target.value)}
                      placeholder="Enter your name"
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-white px-3.5 py-2.5 rounded text-white text-sm outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    />
                    {/* Quick personas for fast demo testing */}
                    <div className="flex items-center gap-1.5 mt-2 overflow-x-auto text-[11px] text-zinc-400">
                      <span className="shrink-0">Quick Switch:</span>
                      {['Alex', 'Sarah', 'Marcus', 'Elena'].map((name) => (
                        <button
                          key={name}
                          type="button"
                          disabled={isAuctionEnded}
                          onClick={() => setBidderName(name)}
                          className={`px-2 py-0.5 rounded border transition-colors ${
                            bidderName === name
                              ? 'bg-white text-black border-white font-bold'
                              : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                          }`}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Bid Amount */}
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-1.5">
                      Bid Amount ($ USD)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 font-mono text-base font-bold">$</span>
                      <input
                        type="number"
                        disabled={isAuctionEnded}
                        value={bidAmount}
                        onChange={(e) => {
                          setBidAmount(e.target.value);
                          setRejectionError(null);
                        }}
                        placeholder={`e.g. ${highestBidVal + 50}`}
                        className="w-full bg-zinc-900 border border-zinc-800 focus:border-white pl-8 pr-3.5 py-2.5 rounded text-white text-base font-mono-numbers outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-bold"
                      />
                    </div>
                    {/* Quick Increment Buttons */}
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className="text-[11px] text-zinc-400 shrink-0">Quick Add:</span>
                      {[50, 100, 250, 500].map((inc) => (
                        <button
                          key={inc}
                          type="button"
                          disabled={isAuctionEnded}
                          onClick={() => handleQuickAdd(inc)}
                          className="px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-white hover:text-black hover:border-white text-[11px] font-mono transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          +${inc}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Submit Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isAuctionEnded || submitting}
                    className={`w-full py-3.5 px-6 rounded font-bold text-sm tracking-wide uppercase transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
                      isAuctionEnded
                        ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700'
                        : submitting
                        ? 'bg-zinc-700 text-white cursor-wait'
                        : 'bg-white text-black hover:bg-zinc-200 active:scale-[0.99] shadow-lg'
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
                        Validating Bid...
                      </>
                    ) : (
                      <>
                        <ArrowUpRight className="w-4 h-4" />
                        Submit Bid (${Number(bidAmount || 0).toLocaleString()})
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Bid History Table / Audit Ledger */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-6">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-zinc-900">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-white" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-white">Live Bid History</h3>
                </div>
                <span className="text-xs font-mono text-zinc-400">
                  {bids.length} {bids.length === 1 ? 'Record' : 'Records'}
                </span>
              </div>

              {bids.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-zinc-900 rounded">
                  <p className="text-zinc-400 text-sm">No bids placed yet.</p>
                  <p className="text-zinc-400 text-xs mt-1">Starting minimum bid is ${startingPrice.toLocaleString()}.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-900 text-zinc-400 font-mono text-xs uppercase">
                        <th className="py-2.5 px-3">Rank</th>
                        <th className="py-2.5 px-3">Participant</th>
                        <th className="py-2.5 px-3">Amount</th>
                        <th className="py-2.5 px-3">Time</th>
                        <th className="py-2.5 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900/80 font-mono">
                      {bids.map((b, index) => {
                        const isLeading = index === 0;
                        const dateObj = new Date(b.timestamp);
                        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                        return (
                          <tr
                            key={b.id || index}
                            className={`transition-colors ${
                              isLeading ? 'bg-zinc-900/60 font-semibold text-white' : 'text-zinc-400 hover:bg-zinc-900/30'
                            }`}
                          >
                            <td className="py-3 px-3">
                              {isLeading ? (
                                <span className="inline-flex items-center gap-1 text-xs bg-white text-black font-bold px-1.5 py-0.5 rounded">
                                  #1
                                </span>
                              ) : (
                                <span className="text-xs text-zinc-400">#{index + 1}</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-white font-sans font-medium">
                              {b.bidderName}
                            </td>
                            <td className="py-3 px-3 font-mono-numbers text-white font-bold">
                              ${b.amount.toLocaleString()}
                            </td>
                            <td className="py-3 px-3 text-xs text-zinc-400">
                              {timeStr}
                            </td>
                            <td className="py-3 px-3 text-right">
                              {isLeading ? (
                                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-white text-black rounded">
                                  {isAuctionEnded ? 'WINNER' : 'HIGHEST'}
                                </span>
                              ) : (
                                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 bg-zinc-900 text-zinc-400 rounded border border-zinc-800">
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
      <footer className="border-t border-zinc-900 bg-black py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-400 font-mono">
          <div>
            CodeRush Hackathon 2026 • Problem R2-01 Event Auction System
          </div>
          <div className="flex items-center gap-4">
            <span>Stack: MERN + Socket.IO</span>
            <span>•</span>
            <span>Theme: Black & White</span>
          </div>
        </div>
      </footer>

      {/* Organizer Controls Modal */}
      {showAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-zinc-950 border border-zinc-700 w-full max-w-md rounded-lg p-6 shadow-2xl relative">
            <button
              onClick={() => setShowAdminModal(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <Sliders className="w-5 h-5 text-white" />
              <h3 className="text-lg font-bold text-white">Organizer / Judge Controls</h3>
            </div>
            <p className="text-xs text-zinc-400 mb-6">
              Configure and instantly restart the timed auction for live evaluation and testing.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-2">
                  Auction Duration (Seconds)
                </label>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {[60, 120, 180].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setAdminDuration(sec)}
                      className={`py-2 text-xs font-mono rounded border transition-colors ${
                        adminDuration === sec
                          ? 'bg-white text-black border-white font-bold'
                          : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-600'
                      }`}
                    >
                      {sec}s ({sec / 60}m)
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  value={adminDuration}
                  onChange={(e) => setAdminDuration(e.target.value)}
                  placeholder="Custom seconds"
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-white px-3 py-2 rounded text-white text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-2">
                  Starting Price ($ USD)
                </label>
                <input
                  type="number"
                  value={adminStartPrice}
                  onChange={(e) => setAdminStartPrice(e.target.value)}
                  placeholder="Starting Price"
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-white px-3 py-2 rounded text-white text-sm font-mono"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAdminModal(false)}
                  className="flex-1 py-2.5 px-4 rounded border border-zinc-800 text-zinc-300 hover:text-white text-xs font-mono cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAdminReset}
                  className="flex-1 py-2.5 px-4 rounded bg-white text-black hover:bg-zinc-200 text-xs font-bold font-mono uppercase transition-colors cursor-pointer"
                >
                  Reset & Start
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
