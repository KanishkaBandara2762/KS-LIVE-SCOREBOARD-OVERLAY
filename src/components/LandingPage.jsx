import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import "./LandingPage.css";
import { ScreenshotsShowcase, ThemesGallery, BuyerSolutions } from "./Portfolio";

/* ─── Testimonials Data ───────────────────────────────────────── */
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
        text: "The overlay themes are stunning — especially the World Cup 2026 theme. It gives our club matches that international broadcast feel instantly.",
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

/* ─── Stats Data ──────────────────────────────────────────────── */
const STATS = [
    { target: 500, suffix: "+", label: "Matches Covered" },
    { target: 50, suffix: "+", label: "Tournaments Hosted" },
    { target: 120, suffix: "+", label: "Teams Registered" },
    { target: 10, suffix: "K+", label: "Live Viewers" },
];

/* ─── Features Data ───────────────────────────────────────────── */
const FEATURES = [
    {
        icon: "📡",
        title: "Live OBS Overlay",
        desc: "Professional broadcast-quality scoreboard overlays that integrate seamlessly with OBS Studio.",
    },
    {
        icon: "⚡",
        title: "Real-Time Updates",
        desc: "Instant score updates powered by Firebase. Every ball, every run, reflected live in milliseconds.",
    },
    {
        icon: "🎨",
        title: "Premium Themes",
        desc: "6 stunning broadcast themes including T20 Neon, World Cup 2026, and Gold Championship.",
    },
    {
        icon: "📱",
        title: "Mobile Friendly",
        desc: "Manage scoring from your phone. The compact mini-admin panel works perfectly on any device.",
    },
    {
        icon: "👥",
        title: "Team Management",
        desc: "Full roster management with player profiles, stats tracking, and easy team switching.",
    },
    {
        icon: "🔒",
        title: "Secure Access",
        desc: "Firebase authentication with email verification ensures only authorized scorers can operate.",
    },
];

/* ─── Animated Counter Hook ───────────────────────────────────── */
function useAnimatedCounter(target, duration = 2000, shouldStart = false) {
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (!shouldStart) return;
        let startTime = null;
        let rafId;

        function animate(timestamp) {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            // Ease out cubic
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

/* ─── Particle positions for intro ────────────────────────────── */
function generateParticles(count) {
    const particles = [];
    for (let i = 0; i < count; i++) {
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

/* ================================================================
   LandingPage Component
   ================================================================ */
export default function LandingPage() {
    const [introComplete, setIntroComplete] = useState(false);
    const [navScrolled, setNavScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [activeTestimonial, setActiveTestimonial] = useState(0);
    const [statsVisible, setStatsVisible] = useState(false);
    const statsRef = useRef(null);
    const testimonialTimer = useRef(null);

    // ── Intro complete after 3.6s ──
    useEffect(() => {
        const t = setTimeout(() => setIntroComplete(true), 3600);
        return () => clearTimeout(t);
    }, []);

    // ── Nav scroll ──
    useEffect(() => {
        function onScroll() {
            setNavScrolled(window.scrollY > 40);
        }
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    // ── Stats intersection observer ──
    useEffect(() => {
        if (!statsRef.current) return;
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

    // ── Scroll reveal ──
    useEffect(() => {
        const els = document.querySelectorAll(".landing-reveal");
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) {
                        e.target.classList.add("visible");
                    }
                });
            },
            { threshold: 0.15 }
        );
        els.forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, [introComplete]);

    // ── Testimonial auto-slide ──
    const nextTestimonial = useCallback(() => {
        setActiveTestimonial((prev) => (prev + 1) % TESTIMONIALS.length);
    }, []);

    const prevTestimonial = useCallback(() => {
        setActiveTestimonial((prev) =>
            prev === 0 ? TESTIMONIALS.length - 1 : prev - 1
        );
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

    // ── Animated counters ──
    const count0 = useAnimatedCounter(STATS[0].target, 2200, statsVisible);
    const count1 = useAnimatedCounter(STATS[1].target, 2000, statsVisible);
    const count2 = useAnimatedCounter(STATS[2].target, 2100, statsVisible);
    const count3 = useAnimatedCounter(STATS[3].target, 1900, statsVisible);
    const counts = [count0, count1, count2, count3];

    return (
        <div className="landing-page">
            {/* ──────────── CINEMATIC INTRO ──────────── */}
            {!introComplete && (
                <div className="landing-intro-overlay">
                    <div className="landing-intro-logo-wrap">
                        <div className="landing-intro-icon">🏏</div>
                        <div className="landing-intro-text">KS LIVE</div>
                        <div className="landing-intro-tagline">Broadcasting</div>

                        {/* Particles */}
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

            {/* ──────────── NAVIGATION ──────────── */}
            <nav className={`landing-nav ${navScrolled ? "scrolled" : ""}`}>
                <Link to="/landing" className="landing-nav-brand">
                    <div className="landing-nav-logo">🏏</div>
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
                    <li><a href="#features" onClick={() => setMobileMenuOpen(false)}>Features</a></li>
                    <li><a href="#screenshots" onClick={() => setMobileMenuOpen(false)}>Showcase</a></li>
                    <li><a href="#themes" onClick={() => setMobileMenuOpen(false)}>Themes</a></li>
                    <li><a href="#solutions" onClick={() => setMobileMenuOpen(false)}>Solutions</a></li>
                    <li><a href="#testimonials" onClick={() => setMobileMenuOpen(false)}>Testimonials</a></li>
                    <li>
                        <Link
                            to="/login"
                            className="landing-nav-cta"
                            onClick={() => setMobileMenuOpen(false)}
                        >
                            Sign In
                        </Link>
                    </li>
                </ul>
            </nav>

            {/* ──────────── HERO ──────────── */}
            <section className="landing-hero">
                <div className="landing-hero-content">
                    <div className="landing-hero-badge">🔴 Live Broadcasting Platform</div>
                    <h1>
                        Professional Cricket<br />
                        <span>Live Scoring & Overlay</span>
                    </h1>
                    <p className="landing-hero-sub">
                        Deliver broadcast-quality live scoreboard overlays for your cricket
                        matches. Real-time updates, stunning themes, and seamless OBS
                        integration — all in one platform.
                    </p>
                    <div className="landing-hero-btns">
                        <Link to="/register" className="landing-btn-primary">
                            Get Started Free
                        </Link>
                        <Link to="/login" className="landing-btn-secondary">
                            Sign In →
                        </Link>
                    </div>
                </div>
            </section>

            {/* ──────────── FEATURES ──────────── */}
            <section className="landing-section landing-reveal" id="features">
                <h2 className="landing-section-title">
                    Everything You Need to <span>Go Live</span>
                </h2>
                <p className="landing-section-sub">
                    From live scoring to broadcast overlays — KS Live has you covered
                </p>
                <div className="landing-features-grid">
                    {FEATURES.map((f, i) => (
                        <div className="landing-feature-card" key={i}>
                            <div className="landing-feature-icon">{f.icon}</div>
                            <h3>{f.title}</h3>
                            <p>{f.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ──────────── SCREENSHOTS SHOWCASE ──────────── */}
            <ScreenshotsShowcase />

            {/* ──────────── THEMES GALLERY ──────────── */}
            <ThemesGallery />

            {/* ──────────── BUYER SOLUTIONS ──────────── */}
            <BuyerSolutions />

            {/* ──────────── STATS / ANIMATED COUNTERS ──────────── */}
            <section
                className="landing-stats-section landing-reveal"
                id="stats"
                ref={statsRef}
            >
                <h2 className="landing-section-title" style={{ marginBottom: "2.5rem" }}>
                    Trusted by <span>Cricket Communities</span>
                </h2>
                <div className="landing-stats-grid">
                    {STATS.map((stat, i) => (
                        <div className="landing-stat-card" key={i}>
                            <div className="landing-stat-number">
                                {counts[i]}
                                {stat.suffix}
                            </div>
                            <div className="landing-stat-label">{stat.label}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ──────────── TESTIMONIALS ──────────── */}
            <section
                className="landing-testimonials-section landing-reveal"
                id="testimonials"
            >
                <h2 className="landing-section-title">
                    What Our Users <span>Say</span>
                </h2>
                <p className="landing-section-sub">
                    Hear from tournament organizers, streamers, and cricket enthusiasts
                </p>

                <div className="landing-testimonials-track"
                    style={{ transform: `translateX(-${activeTestimonial * 100}%)` }}
                >
                    {TESTIMONIALS.map((t, i) => (
                        <div className="landing-testimonial-card" key={i}>
                            <div className="landing-testimonial-inner">
                                <div className="landing-testimonial-quote">❝</div>
                                <p className="landing-testimonial-text">{t.text}</p>
                                <div className="landing-testimonial-author">
                                    <div className="landing-testimonial-avatar">{t.initials}</div>
                                    <div>
                                        <div className="landing-testimonial-name">{t.name}</div>
                                        <div className="landing-testimonial-role">{t.role}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Navigation */}
                <div className="landing-testimonial-dots">
                    {TESTIMONIALS.map((_, i) => (
                        <button
                            key={i}
                            className={`landing-testimonial-dot ${i === activeTestimonial ? "active" : ""}`}
                            onClick={() => goToTestimonial(i)}
                            aria-label={`Testimonial ${i + 1}`}
                        />
                    ))}
                </div>

                <div className="landing-testimonial-arrows">
                    <button
                        className="landing-testimonial-arrow"
                        onClick={prevTestimonial}
                        aria-label="Previous testimonial"
                    >
                        ←
                    </button>
                    <button
                        className="landing-testimonial-arrow"
                        onClick={nextTestimonial}
                        aria-label="Next testimonial"
                    >
                        →
                    </button>
                </div>
            </section>

            {/* ──────────── CTA BANNER ──────────── */}
            <section className="landing-cta-section landing-reveal">
                <div className="landing-cta-box">
                    <h2>
                        Ready to Go <span>Live</span>?
                    </h2>
                    <p>
                        Join hundreds of cricket communities using KS Live for professional
                        live scoring and broadcast overlays.
                    </p>
                    <Link to="/register" className="landing-btn-primary">
                        Create Free Account
                    </Link>
                </div>
            </section>

            {/* ──────────── FOOTER ──────────── */}
            <footer className="landing-footer">
                <p>
                    © {new Date().getFullYear()}{" "}
                    <a href="#top">KS Live Broadcasting</a>. All rights reserved.
                </p>
            </footer>
        </div>
    );
}
