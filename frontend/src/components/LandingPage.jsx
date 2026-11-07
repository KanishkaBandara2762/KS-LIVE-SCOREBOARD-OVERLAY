import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import "./LandingPage.css";
import { ScreenshotsShowcase, ThemesGallery, BuyerSolutions } from "./Portfolio";
import { useLanguage } from "../i18n/LanguageContext";
import LanguageSwitcher from "./LanguageSwitcher";
import { matchesApi } from "../api";
import { BroadcastingServices, ReviewsSection, ModernFooter } from './LandingExtras';
import { HeroCarousel } from './HeroCarousel';
import { FeaturesHub } from './FeaturesHub';

const TESTIMONIALS = [
    {
        text: "KS Live transformed our local cricket league. The real-time scoreboard overlay looks absolutely professional on our stream. Our viewers love it!",
        name: "Rahul Sharma",
        role: "Tournament Organizer",
        initials: "RS",
    },
    {
        text: "We used KS Live for our inter-college T20 tournament. The setup was incredibly easy, and the broadcast quality was top-notch. Highly recommend!",
        name: "Priya Menon",
        role: "Sports Secretary, Delhi University",
        initials: "PM",
    },
    {
        text: "As a freelance cricket streamer, KS Live is my go-to tool. The admin panel is intuitive, and the live overlay impresses every client I work with.",
        name: "Arjun Patel",
        role: "Freelance Streamer",
        initials: "AP",
    },
    {
        text: "The overlay themes are stunning, especially the World Cup 2026 theme. It gives our club matches that international broadcast feel instantly.",
        name: "Mohammed Irfan",
        role: "Cricket Club President",
        initials: "MI",
    },
    {
        text: "Managing teams and live scoring has never been this smooth. KS Live saved us hours of manual work during our weekend tournaments.",
        name: "Sneha Reddy",
        role: "Event Coordinator",
        initials: "SR",
    },
];

const STATS = [
    { target: 500, suffix: "+", labelKey: "landing.stats.matchesCovered" },
    { target: 50, suffix: "+", labelKey: "landing.stats.tournamentsHosted" },
    { target: 120, suffix: "+", labelKey: "landing.stats.teamsRegistered" },
    { target: 10, suffix: "K+", labelKey: "landing.stats.liveViewers" },
];

const FEATURES = [
    { icon: "📡", titleKey: "landing.feature.liveOverlay.title", descKey: "landing.feature.liveOverlay.desc" },
    { icon: "⚡", titleKey: "landing.feature.realtime.title", descKey: "landing.feature.realtime.desc" },
    { icon: "🎨", titleKey: "landing.feature.themes.title", descKey: "landing.feature.themes.desc" },
    { icon: "📱", titleKey: "landing.feature.mobile.title", descKey: "landing.feature.mobile.desc" },
    { icon: "👥", titleKey: "landing.feature.team.title", descKey: "landing.feature.team.desc" },
    { icon: "🔒", titleKey: "landing.feature.secure.title", descKey: "landing.feature.secure.desc" },
];

function useAnimatedCounter(target, duration = 2000, shouldStart = false) {
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (!shouldStart) return;
        let startTime = null;
        let rafId;

        function animate(timestamp) {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * target));
            if (progress < 1) {
                rafId = requestAnimationFrame(animate);
            }
        }

        rafId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(rafId);
    }, [target, duration, shouldStart]);

    return count;
}

function generateParticles(count) {
    const particles = [];
    for (let i = 0; i < count; i += 1) {
        const angle = (Math.PI * 2 * i) / count;
        const distance = 80 + Math.random() * 120;
        particles.push({
            id: i,
            px: `${Math.cos(angle) * distance}px`,
            py: `${Math.sin(angle) * distance}px`,
            delay: `${1.4 + Math.random() * 0.6}s`,
            left: `calc(50% + ${(Math.random() - 0.5) * 40}px)`,
            top: `calc(50% + ${(Math.random() - 0.5) * 40}px)`,
        });
    }
    return particles;
}

const PARTICLES = generateParticles(16);

const isSriLankanUser = () => {
    const locale = navigator.language || "";
    const locales = navigator.languages || [];
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";

    return locale.toLowerCase().includes("-lk")
        || locales.some((item) => item.toLowerCase().includes("-lk"))
        || timeZone === "Asia/Colombo";
};

const getPlanPrices = () => {
    const local = isSriLankanUser();

    return {
        daily: {
            currency: local ? "Rs" : "$",
            amount: local ? "500" : "2",
            period: "/ 24h",
        },
        monthly: {
            currency: local ? "Rs" : "$",
            amount: local ? "4000" : "10",
            period: "/ mo",
        },
        annual: {
            currency: local ? "Rs" : "$",
            amount: local ? "15000" : "40",
            period: "/ yr",
        },
    };
};

export default function LandingPage() {
    const { t } = useLanguage();
    const [introComplete, setIntroComplete] = useState(false);
    const [liveMatches, setLiveMatches] = useState([]);
    const [navScrolled, setNavScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [activeTestimonial, setActiveTestimonial] = useState(0);
    const [statsVisible, setStatsVisible] = useState(false);
    const [copyState, setCopyState] = useState(false);
    const [showMore, setShowMore] = useState(false);
    const statsRef = useRef(null);
    const testimonialTimer = useRef(null);
    const overlayUrl = typeof window !== "undefined" ? `${window.location.origin}/overlay` : "/overlay";
    const planPrices = getPlanPrices();
    const handleFeatureNav = (e) => {
        e.preventDefault();
        setShowMore(true);
        setMobileMenuOpen(false);
        setTimeout(() => {
            document.getElementById('features-hub')?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };


    useEffect(() => {
        const timer = setTimeout(() => setIntroComplete(true), 3600);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        matchesApi.getPublicMatches()
            .then((res) => {
                if (res.success && res.matches && res.matches.live) {
                    setLiveMatches(res.matches.live);
                }
            })
            .catch((err) => {
                console.error("Failed to fetch live matches for showcase:", err);
            });
    }, []);

    useEffect(() => {
        function onScroll() {
            setNavScrolled(window.scrollY > 40);
        }
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    useEffect(() => {
        if (!statsRef.current) return undefined;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setStatsVisible(true);
                    observer.disconnect();
                }
            },
            { threshold: 0.3 }
        );
        observer.observe(statsRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const els = document.querySelectorAll(".landing-reveal");
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("visible");
                    }
                });
            },
            { threshold: 0.15 }
        );
        els.forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, [introComplete]);

    const nextTestimonial = useCallback(() => {
        setActiveTestimonial((prev) => (prev + 1) % TESTIMONIALS.length);
    }, []);

    const prevTestimonial = useCallback(() => {
        setActiveTestimonial((prev) => (prev === 0 ? TESTIMONIALS.length - 1 : prev - 1));
    }, []);

    useEffect(() => {
        testimonialTimer.current = setInterval(nextTestimonial, 5000);
        return () => clearInterval(testimonialTimer.current);
    }, [nextTestimonial]);

    function goToTestimonial(index) {
        setActiveTestimonial(index);
        clearInterval(testimonialTimer.current);
        testimonialTimer.current = setInterval(nextTestimonial, 5000);
    }

    const handleCopyOverlay = async () => {
        try {
            await navigator.clipboard.writeText(overlayUrl);
            setCopyState(true);
            window.setTimeout(() => setCopyState(false), 1800);
        } catch (error) {
            console.error("Overlay URL copy failed", error);
        }
    };

    const count0 = useAnimatedCounter(STATS[0].target, 2200, statsVisible);
    const count1 = useAnimatedCounter(STATS[1].target, 2000, statsVisible);
    const count2 = useAnimatedCounter(STATS[2].target, 2100, statsVisible);
    const count3 = useAnimatedCounter(STATS[3].target, 1900, statsVisible);
    const counts = [count0, count1, count2, count3];

    return (
        <div className="landing-page">
            {!introComplete && (
                <div className="landing-intro-overlay">
                    <div className="landing-intro-logo-wrap">
                        <img src="/ks_logo.png" className="w-28 h-28 object-contain mb-4" alt="KS Live Logo" style={{ filter: 'drop-shadow(0 0 15px rgba(255, 255, 255, 0.4))' }} />
                        <div className="landing-intro-text">KS LIVE</div>
                        <div className="landing-intro-tagline">Broadcasting</div>
                        <div className="landing-intro-particles">
                            {PARTICLES.map((p) => (
                                <div
                                    key={p.id}
                                    className="landing-intro-particle"
                                    style={{
                                        left: p.left,
                                        top: p.top,
                                        animationDelay: p.delay,
                                        "--px": p.px,
                                        "--py": p.py,
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <nav className={`landing-nav ${navScrolled ? "scrolled" : ""}`}>
                <Link to="/landing" className="landing-nav-brand" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img src="/ks_logo.png" alt="KS Live" className="landing-nav-logo-img" style={{ height: '40px', width: 'auto', objectFit: 'contain' }} />
                    <span className="landing-nav-name">KS Live</span>
                </Link>

                <button
                    className="landing-nav-hamburger"
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    aria-label="Menu"
                >
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        {mobileMenuOpen ? (
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                        )}
                    </svg>
                </button>

                <ul className={`landing-nav-links ${mobileMenuOpen ? "open" : ""}`}>
                    <li><Link to="/live" onClick={() => setMobileMenuOpen(false)} style={{ color: '#2dd4bf', fontWeight: 'bold' }}>{t("landing.nav.liveScores")}</Link></li>
                    <li><Link to="/auctions" onClick={() => setMobileMenuOpen(false)} className="landing-nav-auction">🔨 Explore Auctions</Link></li>
                    <li><a href="#features-hub" onClick={handleFeatureNav}>{t("landing.nav.features")}</a></li>
                    <li><a href="#features-hub" onClick={handleFeatureNav}>{t("landing.nav.showcase")}</a></li>
                    <li><a href="#themes" onClick={() => setMobileMenuOpen(false)}>{t("landing.nav.themes")}</a></li>
                    <li><a href="#features-hub" onClick={handleFeatureNav}>{t("landing.nav.solutions")}</a></li>
                    <li><a href="#plans" onClick={() => setMobileMenuOpen(false)}>{t("landing.nav.plans")}</a></li>
                    <li><a href="#testimonials" onClick={() => setMobileMenuOpen(false)}>{t("landing.nav.testimonials")}</a></li>
                    <li className="landing-nav-language"><LanguageSwitcher compact /></li>
                    <li>
                        <Link to="/login" className="landing-nav-cta" onClick={() => setMobileMenuOpen(false)}>
                            {t("landing.nav.signIn")}
                        </Link>
                    </li>
                </ul>
            </nav>

            <HeroCarousel />

            {/* AUCTION SPOTLIGHT BANNER */}
            <section className="max-w-7xl mx-auto px-6 py-4 relative z-10">
                <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-slate-900/90 border border-amber-500/30 rounded-3xl p-6 md:p-8 backdrop-blur-xl shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-5">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-3xl shadow-lg shadow-amber-500/30 flex-shrink-0">
                            🔨
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="bg-amber-500/20 text-amber-300 text-[11px] font-black uppercase px-2 py-0.5 rounded border border-amber-500/30">
                                    LIVE AUCTION ENGINE
                                </span>
                                <span className="text-slate-400 text-xs font-semibold">Real-Time Team Bidding</span>
                            </div>
                            <h3 className="text-xl md:text-2xl font-black text-white tracking-wide">
                                Cricket Player Auction System
                            </h3>
                            <p className="text-slate-300 text-sm max-w-2xl mt-1">
                                Host professional IPL-style player auctions with live bidder sync, purse management, team limits, and dedicated OBS projector displays.
                            </p>
                        </div>
                    </div>
                    <Link
                        to="/auctions"
                        className="bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-black px-7 py-3.5 rounded-xl shadow-lg shadow-amber-500/30 transition-all duration-200 transform hover:-translate-y-0.5 flex items-center gap-2.5 whitespace-nowrap text-sm tracking-wide uppercase"
                    >
                        <span>🔨 Explore Auctions</span>
                        <span className="text-base font-bold">→</span>
                    </Link>
                </div>
            </section>

            {liveMatches.length > 0 && (
                <section className="max-w-7xl mx-auto px-6 py-8 -mt-16 relative z-10">
                    <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <span className="relative flex h-3.5 w-3.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span>
                                </span>
                                <h2 className="text-xl md:text-2xl font-extrabold tracking-wide uppercase bg-gradient-to-r from-red-400 to-amber-400 bg-clip-text text-transparent">
                                    Live Matches
                                </h2>
                            </div>
                            <Link to="/live" className="text-sm font-bold text-teal-400 hover:text-teal-300 transition-colors flex items-center gap-1">
                                View All Scores <span className="text-base">→</span>
                            </Link>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {liveMatches.map((m) => {
                                const matchSlug = m.slug || m.matchId;
                                const overs = Math.floor((m.legalBallCount || 0) / 6);
                                const balls = (m.legalBallCount || 0) % 6;
                                const formattedOvers = `${overs}.${balls}`;
                                const getInitials = (name) => { if (!name) return ""; const words = name.split(" "); if (words.length === 1) return name.slice(0, 3).toUpperCase(); return words.map(w => w[0]).join("").toUpperCase().slice(0, 3); };

                                return (
                                    <Link
                                        key={m.matchId}
                                        to={`/live/match/${matchSlug}`}
                                        className="group relative block bg-slate-950/60 hover:bg-slate-950/90 border border-white/5 hover:border-teal-500/40 rounded-2xl p-5 transition-all duration-300 shadow-lg hover:shadow-teal-500/5 overflow-hidden"
                                    >
                                        <div className="absolute top-0 right-0 h-1 w-1/4 bg-gradient-to-r from-teal-400 to-emerald-400 rounded-bl-lg group-hover:w-full transition-all duration-300"></div>
                                        
                                        <div className="flex items-center justify-between text-[11px] text-slate-500 mb-3">
                                            <span className="font-bold text-teal-400 uppercase tracking-wider">{m.matchType || "T20"}</span>
                                            <span className="truncate max-w-[50%] font-medium bg-slate-900 px-2 py-0.5 rounded border border-white/5">{m.tournamentName || "KS Cup"}</span>
                                        </div>

                                        <div className="space-y-3 mb-4">
                                            {/* Batting team */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-7 h-7 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center font-bold text-[10px] text-teal-400 uppercase shadow-inner">
                                                        {getInitials(m.battingTeam)}
                                                    </div>
                                                    <span className="font-bold text-sm text-slate-200 group-hover:text-white transition-colors truncate">
                                                        {m.battingTeam}
                                                    </span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="font-extrabold text-sm text-teal-300">{m.score}/{m.wickets}</span>
                                                    <span className="text-[10px] text-slate-500 block">{formattedOvers} ov</span>
                                                </div>
                                            </div>

                                            {/* Bowling team */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-7 h-7 rounded-full bg-slate-800/40 border border-white/5 flex items-center justify-center font-bold text-[10px] text-slate-500 uppercase">
                                                        {getInitials(m.bowlingTeam)}
                                                    </div>
                                                    <span className="font-medium text-xs text-slate-400 truncate">
                                                        {m.bowlingTeam}
                                                    </span>
                                                </div>
                                                {m.isSecondInnings && m.targetScore > 0 && (
                                                    <span className="text-[10px] font-semibold text-slate-500">
                                                        Target: {m.targetScore}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400">
                                            <span className="text-teal-400 font-bold bg-teal-500/10 px-1.5 py-0.5 rounded border border-teal-500/20">
                                                LIVE
                                            </span>
                                            <span className="italic truncate max-w-[160px] text-right font-medium">
                                                {m.isSecondInnings && m.targetScore > 0
                                                    ? `Need ${Math.max(0, m.targetScore - m.score)} runs`
                                                    : `CRR: ${m.score && m.legalBallCount ? (m.score / (m.legalBallCount / 6)).toFixed(2) : "0.00"}`}
                                            </span>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                </section>
            )}

            <ThemesGallery />

            <section className="landing-plans-section landing-reveal" id="plans">
                <h2 className="landing-section-title">
                    {t("landing.plans.titlePrefix")} <span>{t("landing.plans.titleHighlight")}</span>
                </h2>
                <p className="landing-section-sub">{t("landing.plans.subtitle")}</p>

                <div className="landing-plans-grid">
                    {/* DAILY PASS */}
                    <div className="landing-plan-card">
                        <div className="landing-plan-badge-placeholder"></div>
                        <div className="landing-plan-header">
                            <h3>{t("landing.plans.daily.name")}</h3>
                            <div className="landing-plan-price">
                                <span className="currency">$</span>
                                <span className="amount">2</span>
                                <span className="period">/ 24h</span>
                            </div>
                        </div>
                        <div className="landing-plan-body">
                            <ul>
                                <li><span className="check">✅</span> {t("landing.plans.feature.allThemes")}</li>
                                <li><span className="check">✅</span> {t("landing.plans.feature.liveScoring")}</li>
                                <li><span className="check">✅</span> {t("landing.plans.feature.obsSupport")}</li>
                            </ul>
                        </div>
                        <div className="landing-plan-footer">
                            <Link to="/pricing?plan=daily" className="landing-plan-btn">
                                {t("landing.plans.btn.select")}
                            </Link>
                        </div>
                    </div>

                    {/* MONTHLY PLAN */}
                    <div className="landing-plan-card popular">
                        <div className="landing-plan-popular-badge">{t("landing.plans.badge.popular")}</div>
                        <div className="landing-plan-header">
                            <h3>{t("landing.plans.monthly.name")}</h3>
                            <div className="landing-plan-price">
                                <span className="currency">$</span>
                                <span className="amount">10</span>
                                <span className="period">/ mo</span>
                            </div>
                        </div>
                        <div className="landing-plan-body">
                            <ul>
                                <li><span className="check">✅</span> {t("landing.plans.feature.allThemes")}</li>
                                <li><span className="check">✅</span> {t("landing.plans.feature.liveScoring")}</li>
                                <li><span className="check">✅</span> {t("landing.plans.feature.obsSupport")}</li>
                                <li><span className="check">✅</span> {t("landing.plans.feature.unlimitedMatches")}</li>
                                <li><span className="check">✅</span> {t("landing.plans.feature.prioritySupport")}</li>
                            </ul>
                        </div>
                        <div className="landing-plan-footer">
                            <Link to="/pricing?plan=monthly" className="landing-plan-btn popular-btn">
                                {t("landing.plans.btn.select")}
                            </Link>
                        </div>
                    </div>

                    {/* ANNUAL PLAN */}
                    <div className="landing-plan-card best-value">
                        <div className="landing-plan-best-value-badge">{t("landing.plans.badge.bestValue")}</div>
                        <div className="landing-plan-header">
                            <h3>{t("landing.plans.annual.name")}</h3>
                            <div className="landing-plan-price">
                                <span className="currency">$</span>
                                <span className="amount">50</span>
                                <span className="period">/ yr</span>
                            </div>
                        </div>
                        <div className="landing-plan-body">
                            <ul>
                                <li><span className="check">✅</span> {t("landing.plans.feature.allThemes")}</li>
                                <li><span className="check">✅</span> {t("landing.plans.feature.liveScoring")}</li>
                                <li><span className="check">✅</span> {t("landing.plans.feature.obsSupport")}</li>
                                <li><span className="check">✅</span> {t("landing.plans.feature.unlimitedMatches")}</li>
                                <li><span className="check">✅</span> {t("landing.plans.feature.prioritySupport")}</li>
                                <li><span className="check">✅</span> {t("landing.plans.feature.earlyAccess")}</li>
                                <li className="highlight-feature"><span className="check">✅</span> {t("landing.plans.feature.saveMore")}</li>
                            </ul>
                        </div>
                        <div className="landing-plan-footer">
                            <Link to="/pricing?plan=annual" className="landing-plan-btn best-value-btn">
                                {t("landing.plans.btn.select")}
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {!showMore ? (
                <div style={{textAlign: 'center', margin: '4rem 0'}}>
                    <button onClick={() => setShowMore(true)} className="landing-btn-primary" style={{padding: '1rem 3rem', fontSize: '1.2rem', fontFamily: 'var(--font-serif)'}}>
                        Discover All Features & Tools 👇
                    </button>
                </div>
            ) : (
                <div id="features-hub"><FeaturesHub /></div>
            )}

            <section className="landing-testimonials-section landing-reveal" id="testimonials">
                <h2 className="landing-section-title">
                    {t("landing.testimonials.titlePrefix")} <span>{t("landing.testimonials.titleHighlight")}</span>
                </h2>
                <p className="landing-section-sub">{t("landing.testimonials.subtitle")}</p>

                <div className="landing-testimonials-track" style={{ transform: `translateX(-${activeTestimonial * 100}%)` }}>
                    {TESTIMONIALS.map((testimonial, index) => (
                        <div className="landing-testimonial-card" key={index}>
                            <div className="landing-testimonial-inner">
                                <div className="landing-testimonial-quote">❝</div>
                                <p className="landing-testimonial-text">{testimonial.text}</p>
                                <div className="landing-testimonial-author">
                                    <div className="landing-testimonial-avatar">{testimonial.initials}</div>
                                    <div>
                                        <div className="landing-testimonial-name">{testimonial.name}</div>
                                        <div className="landing-testimonial-role">{testimonial.role}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="landing-testimonial-dots">
                    {TESTIMONIALS.map((_, index) => (
                        <button
                            key={index}
                            className={`landing-testimonial-dot ${index === activeTestimonial ? "active" : ""}`}
                            onClick={() => goToTestimonial(index)}
                            aria-label={`Testimonial ${index + 1}`}
                        />
                    ))}
                </div>

                <div className="landing-testimonial-arrows">
                    <button className="landing-testimonial-arrow" onClick={prevTestimonial} aria-label="Previous testimonial">
                        ←
                    </button>
                    <button className="landing-testimonial-arrow" onClick={nextTestimonial} aria-label="Next testimonial">
                        →
                    </button>
                </div>
            </section>

            <section className="landing-cta-section landing-reveal">
                <div className="landing-cta-box">
                    <h2>
                        {t("landing.cta.titlePrefix")} <span>{t("landing.cta.titleHighlight")}</span>?
                    </h2>
                    <p>{t("landing.cta.desc")}</p>
                    <Link to="/register" className="landing-btn-primary">
                        {t("landing.cta.button")}
                    </Link>
                </div>
            </section>

            <BroadcastingServices />
            <ReviewsSection />
            <ModernFooter />
        </div>
    );
}







