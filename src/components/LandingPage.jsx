import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import "./LandingPage.css";
import { ScreenshotsShowcase, ThemesGallery, BuyerSolutions } from "./Portfolio";
import { useLanguage } from "../i18n/LanguageContext";
import LanguageSwitcher from "./LanguageSwitcher";

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

export default function LandingPage() {
    const { t } = useLanguage();
    const [introComplete, setIntroComplete] = useState(false);
    const [navScrolled, setNavScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [activeTestimonial, setActiveTestimonial] = useState(0);
    const [statsVisible, setStatsVisible] = useState(false);
    const [copyState, setCopyState] = useState(false);
    const statsRef = useRef(null);
    const testimonialTimer = useRef(null);
    const overlayUrl = typeof window !== "undefined" ? `${window.location.origin}/overlay` : "/overlay";

    useEffect(() => {
        const timer = setTimeout(() => setIntroComplete(true), 3600);
        return () => clearTimeout(timer);
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
                        <div className="landing-intro-icon">🏏</div>
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
                    <li><a href="#features" onClick={() => setMobileMenuOpen(false)}>{t("landing.nav.features")}</a></li>
                    <li><a href="#screenshots" onClick={() => setMobileMenuOpen(false)}>{t("landing.nav.showcase")}</a></li>
                    <li><a href="#themes" onClick={() => setMobileMenuOpen(false)}>{t("landing.nav.themes")}</a></li>
                    <li><a href="#solutions" onClick={() => setMobileMenuOpen(false)}>{t("landing.nav.solutions")}</a></li>
                    <li><a href="#testimonials" onClick={() => setMobileMenuOpen(false)}>{t("landing.nav.testimonials")}</a></li>
                    <li className="landing-nav-language"><LanguageSwitcher compact /></li>
                    <li>
                        <Link to="/login" className="landing-nav-cta" onClick={() => setMobileMenuOpen(false)}>
                            {t("landing.nav.signIn")}
                        </Link>
                    </li>
                </ul>
            </nav>

            <section className="landing-hero">
                <div className="landing-hero-content">
                    <div className="landing-hero-badge">🔴 {t("landing.hero.badge")}</div>
                    <h1>
                        {t("landing.hero.titleLine1")}<br />
                        <span>{t("landing.hero.titleLine2")}</span>
                    </h1>
                    <p className="landing-hero-sub">{t("landing.hero.subtitle")}</p>
                    <div className="landing-hero-btns">
                        <Link to="/register" className="landing-btn-primary">
                            {t("landing.hero.getStarted")}
                        </Link>
                        <Link to="/login" className="landing-btn-secondary">
                            {t("landing.hero.signIn")} →
                        </Link>
                    </div>
                </div>
            </section>

            <section className="landing-section landing-reveal" id="features">
                <h2 className="landing-section-title">
                    {t("landing.features.titlePrefix")} <span>{t("landing.features.titleHighlight")}</span>
                </h2>
                <p className="landing-section-sub">{t("landing.features.subtitle")}</p>
                <div className="landing-features-grid">
                    {FEATURES.map((feature, index) => (
                        <div className="landing-feature-card" key={index}>
                            <div className="landing-feature-icon">{feature.icon}</div>
                            <h3>{t(feature.titleKey)}</h3>
                            <p>{t(feature.descKey)}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="landing-section landing-reveal" id="how-it-works">
                <h2 className="landing-section-title">
                    {t("landing.how.titlePrefix")} <span>{t("landing.how.titleHighlight")}</span>
                </h2>
                <p className="landing-section-sub">{t("landing.how.subtitle")}</p>
                <div className="landing-how-grid">
                    <div className="landing-how-card">
                        <h3>{t("landing.how.step1.title")}</h3>
                        <p>{t("landing.how.step1.desc")}</p>
                    </div>
                    <div className="landing-how-card">
                        <h3>{t("landing.how.step2.title")}</h3>
                        <p>{t("landing.how.step2.desc")}</p>
                    </div>
                    <div className="landing-how-card">
                        <h3>{t("landing.how.step3.title")}</h3>
                        <p>{t("landing.how.step3.desc")}</p>
                    </div>
                </div>
                <div className="landing-obs-box">
                    <div>
                        <div className="landing-obs-label">{t("landing.how.obsTitle")}</div>
                        <p className="landing-obs-text">{t("landing.how.obsDesc")}</p>
                        <code className="landing-obs-code">{overlayUrl}</code>
                    </div>
                    <div className="landing-obs-actions">
                        <Link to="/admin" className="landing-btn-primary">
                            {t("common.startSystem")}
                        </Link>
                        <button type="button" className="landing-btn-secondary landing-copy-btn" onClick={handleCopyOverlay}>
                            {copyState ? t("common.copied") : t("common.overlayUrl")}
                        </button>
                    </div>
                </div>
            </section>

            <ScreenshotsShowcase />
            <ThemesGallery />
            <BuyerSolutions />

            <section className="landing-stats-section landing-reveal" id="stats" ref={statsRef}>
                <h2 className="landing-section-title" style={{ marginBottom: "2.5rem" }}>
                    {t("landing.stats.titlePrefix")} <span>{t("landing.stats.titleHighlight")}</span>
                </h2>
                <div className="landing-stats-grid">
                    {STATS.map((stat, i) => (
                        <div className="landing-stat-card" key={stat.labelKey}>
                            <div className="landing-stat-number">
                                {counts[i]}
                                {stat.suffix}
                            </div>
                            <div className="landing-stat-label">{t(stat.labelKey)}</div>
                        </div>
                    ))}
                </div>
            </section>

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

            <footer className="landing-footer">
                <p>
                    © {new Date().getFullYear()} <a href="#top">{t("landing.footer")}</a>
                </p>
            </footer>
        </div>
    );
}
