import React, { useState, useEffect, useRef } from "react";
import { Activity, Award, BarChart3, Check, Circle, Clapperboard, ClipboardList, CornerUpLeft, Eye, GraduationCap, Lock, Monitor, Music, Palette, Radio, RefreshCw, Search, Smartphone, Sparkles, Star, Target, Timer, TrendingUp, Trophy, Users, X, Zap } from 'lucide-react';

import "./Portfolio.css";
import { ThemePreview } from "./LandingThemePreviews";



/* ================================================================

   SCREENSHOTS DATA

   ================================================================ */

const SCREENSHOTS = [

    {

        id: "scoreboard",

        label: "Live Scoreboard",

        image: "/images/portfolio/live-scoreboard.png",

        title: "Real-Time Live",

        titleAccent: "Scoreboard",

        desc: "A fully dynamic scoreboard overlay that updates every ball in real-time. Designed for OBS Studio with transparent backgrounds, smooth animations, and broadcast-grade layouts.",

        capabilities: [

            { icon: Radio, text: "Live ball-by-ball updates via Firebase" },

            { icon: Palette, text: "6 switchable broadcast themes" },

            { icon: Monitor, text: "OBS-ready with transparent background" },

            { icon: BarChart3, text: "Batsman & bowler stats display" },

            { icon: Zap, text: "Sub-100ms update latency" },

        ],

    },

    {

        id: "versus",

        label: "Versus Screen",

        image: "/images/portfolio/versus-screen.png",

        title: "Match",

        titleAccent: "Versus Screen",

        desc: "A dramatic pre-match intro screen showing both teams face-to-face. Features animated reveals and team branding — perfect for building excitement before the toss.",

        capabilities: [

            { icon: Trophy, text: "Team logos and branding display" },

            { icon: Zap, text: "Animated team name reveals" },

            { icon: Clapperboard, text: "Cinematic entrance animation" },

            { icon: ClipboardList, text: "Match info: venue, date, format" },

            { icon: RefreshCw, text: "Auto-transitions to scoreboard" },

        ],

    },

    {

        id: "summary",

        label: "Summary Screen",

        image: "/images/portfolio/summary-screen.png",

        title: "Post-Match",

        titleAccent: "Summary",

        desc: "A comprehensive match summary with batting/bowling stats, partnerships, and Man of the Match. Auto-generated from live match data — no manual work needed.",

        capabilities: [

            { icon: BarChart3, text: "Full batting & bowling scorecards" },

            { icon: Award, text: "Man of the Match highlight" },

            { icon: TrendingUp, text: "Run rate and partnership charts" },

            { icon: Target, text: "Fall of wickets timeline" },

            { icon: Smartphone, text: "Shareable as image" },

        ],

    },

    {

        id: "animations",

        label: "Special Animations",

        image: "/images/portfolio/special-animations.png",

        title: "Event",

        titleAccent: "Animations",

        desc: "Eye-catching animated overlays for key moments — FOUR, SIX, and WICKET celebrations with particle effects, glowing borders, and smooth transitions that rival international broadcasts.",

        capabilities: [

            { icon: Zap, text: "FOUR / SIX celebration popups" },

            { icon: Circle, iconColor: "#ef4444", text: "Wicket alert with red flash" },

            { icon: Sparkles, text: "Particle burst effects" },

            { icon: Music, text: "Optional sound triggers" },

            { icon: Timer, text: "Auto-dismiss after 3 seconds" },

        ],

    },

    {

        id: "admin",

        label: "Admin Panel",

        image: "/images/portfolio/admin-panel.png",

        title: "Scorer",

        titleAccent: "Admin Panel",

        desc: "A powerful yet intuitive scoring console for live match operations. One-click run scoring, ball-by-ball controls, undo, extras, and wickets — everything a scorer needs.",

        capabilities: [

            { icon: Activity, text: "One-tap run scoring (0–6, WD, NB)" },

            { icon: CornerUpLeft, text: "Undo last ball instantly" },

            { icon: Users, text: "Batsman & bowler management" },

            { icon: Smartphone, text: "Mobile-friendly mini-admin" },

            { icon: Lock, text: "Secure Firebase auth" },

        ],

    },

];



/* ================================================================

   THEMES DATA

   ================================================================ */

const THEMES = [
    { id: "APEX", previewId: "APEX", name: "Apex (TV Broadcast)", desc: "Professional TV broadcast design with a navy bar, red score block and angled tab.", tags: ["TV Broadcast", "Navy & Red", "Live"], ribbon: "new", category: ["all", "t20", "tournament"] },
    { id: "DIAMOND", previewId: "DIAMOND", name: "Diamond (Metallic)", desc: "Metallic premium design with silver panels and a faceted gem score.", tags: ["Metallic", "Geometric", "Premium"], ribbon: "premium", category: ["all", "t20", "odi"] },
    { id: "VOLT", previewId: "VOLT", name: "Volt (Sports-Tech)", desc: "Lime green on near-black with sharp sports-tech edges and modular stats.", tags: ["Lime", "Sports-Tech", "Dark"], ribbon: "new", category: ["all", "t20"] },
    { id: "THUNDER", previewId: "THUNDER", name: "Thunder (Electric Red)", desc: "Electric red with diagonal stripes and a powerful, high-energy bar.", tags: ["Red", "Stripes", "Power"], ribbon: "new", category: ["all", "t20", "tournament"] },
    { id: "BLITZ", previewId: "BLITZ", name: "Blitz (Lightning Blue)", desc: "Electric blue T20 design inspired by lightning and fast-paced graphics.", tags: ["Blue", "T20", "Lightning"], ribbon: "popular", category: ["all", "t20"] },
    { id: "ELITE", previewId: "ELITE", name: "Elite (Minimal Gold)", desc: "Clean, minimal and elegant bar with gold accents and serif team names.", tags: ["Minimal", "Gold", "Elegant"], ribbon: "premium", category: ["all", "odi", "tournament"] },
    { id: "FRANCHISE", previewId: "FRANCHISE", name: "Franchise (Gradient)", desc: "Vibrant gradients and franchise-style branding for league matches.", tags: ["Gradient", "League", "Vibrant"], ribbon: "popular", category: ["all", "t20", "tournament"] },
    { id: "SHAKTI", previewId: "SHAKTI", name: "Shakti (Bold Contrast)", desc: "Bold colours, strong contrast and powerful visuals on a black bar.", tags: ["Bold", "Contrast", "Power"], ribbon: "new", category: ["all", "t20", "odi"] },
];



const THEME_FILTERS = [

    { key: "all", label: "All Themes" },

    { key: "t20", label: "T20" },

    { key: "odi", label: "ODI" },

    { key: "school", label: "School" },

    { key: "tournament", label: "Tournament" },

];



/* ================================================================

   BUYER SOLUTIONS DATA

   ================================================================ */

const SOLUTIONS = [

    {

        icon: GraduationCap,

        iconClass: "school",

        title: "For School Tournaments",

        desc: "Give your inter-school cricket matches a professional broadcast feel without the complexity.",

        color1: "#00d2be",

        color2: "#0096ff",

        benefits: [

            "Easy one-click scoring — any student can operate",

            "Clean, distraction-free scoreboard overlay",

            "Free tier covers most school tournament needs",

            "Mobile-friendly admin — score from courtside",

            "Team roster management for multiple schools",

        ],

    },

    {

        icon: Activity,

        iconClass: "club",

        title: "For Local Clubs",

        desc: "Level up your weekend cricket league with professional streaming and live scoreboards.",

        color1: "#a855f7",

        color2: "#6366f1",

        benefits: [

            "Multiple premium broadcast themes to choose from",

            "Real-time scoreboard for YouTube/Facebook streams",

            "Versus screen for pre-match hype",

            "Post-match summary auto-generated instantly",

            "Multi-match tournament management",

        ],

    },

    {

        icon: Trophy,

        iconClass: "pro",

        title: "For Professional Events",

        desc: "Broadcast-grade scoreboard system trusted by tournament organizers and streaming companies.",

        color1: "#f59e0b",

        color2: "#eab308",

        benefits: [

            "World Cup-level theme graphics",

            "FOUR/SIX/WICKET special animations",

            "Ticker and multi-screen broadcast support",

            "Custom branding and logo integration",

            "Dedicated support and custom design service",

        ],

    },

];



/* ================================================================

   ScreenshotsShowcase Component

   ================================================================ */

function ScreenshotsShowcase() {

    const [activeTab, setActiveTab] = useState(0);

    const [lightbox, setLightbox] = useState(null);



    const current = SCREENSHOTS[activeTab];



    // Close lightbox on Escape

    useEffect(() => {

        function onKey(e) {

            if (e.key === "Escape") setLightbox(null);

        }

        window.addEventListener("keydown", onKey);

        return () => window.removeEventListener("keydown", onKey);

    }, []);



    return (

        <section className="showcase-section landing-reveal" id="screenshots">

            <h2 className="landing-section-title">

                Product <span>Showcase</span>

            </h2>

            <p className="landing-section-sub">

                Explore every screen of the KS Live broadcast system

            </p>



            {/* Tabs */}

            <div className="showcase-tabs">

                {SCREENSHOTS.map((s, i) => (

                    <button

                        key={s.id}

                        className={`showcase-tab ${i === activeTab ? "active" : ""}`}

                        onClick={() => setActiveTab(i)}

                    >

                        {s.label}

                    </button>

                ))}

            </div>



            {/* Panel */}

            <div className="showcase-panel" key={current.id}>

                <div

                    className="showcase-image-wrap"

                    onClick={() => setLightbox(current)}

                >

                    <img src={current.image} alt={current.label} loading="lazy" />

                    <div className="showcase-zoom-hint"><Search size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Click to enlarge</div>

                </div>



                <div className="showcase-info">

                    <h3>

                        {current.title} <span>{current.titleAccent}</span>

                    </h3>

                    <p>{current.desc}</p>

                    <ul className="showcase-capabilities">

                        {current.capabilities.map((c, i) => (

                            <li key={i}>

                                <span className="showcase-cap-icon"><c.icon size="1em" style={{ verticalAlign: '-0.125em', color: c.iconColor }} aria-hidden="true" /></span>

                                {c.text}

                            </li>

                        ))}

                    </ul>

                </div>

            </div>



            {/* Lightbox */}

            {lightbox && (

                <div className="lightbox-overlay" onClick={() => setLightbox(null)}>

                    <button

                        className="lightbox-close"

                        onClick={(e) => { e.stopPropagation(); setLightbox(null); }}

                    >

                        <X size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" />

                    </button>

                    <img

                        className="lightbox-img"

                        src={lightbox.image}

                        alt={lightbox.label}

                        onClick={(e) => e.stopPropagation()}

                    />

                    <div className="lightbox-label">{lightbox.label}</div>

                </div>

            )}

        </section>

    );

}



/* ================================================================

   ThemesGallery Component

   ================================================================ */

function ThemesGallery() {

    const [activeFilter, setActiveFilter] = useState("all");

    const [lightbox, setLightbox] = useState(null);



    const filtered = THEMES.filter((t) => t.category.includes(activeFilter));



    useEffect(() => {

        function onKey(e) {

            if (e.key === "Escape") setLightbox(null);

        }

        window.addEventListener("keydown", onKey);

        return () => window.removeEventListener("keydown", onKey);

    }, []);



    return (

        <section className="themes-section landing-reveal" id="themes">

            <h2 className="landing-section-title">

                Overlay <span>Themes</span>

            </h2>

            <p className="landing-section-sub">

                Choose from stunning broadcast themes — or request a custom design

            </p>



            {/* Filters */}

            <div className="themes-filters">

                {THEME_FILTERS.map((f) => (

                    <button

                        key={f.key}

                        className={`themes-filter-btn ${activeFilter === f.key ? "active" : ""}`}

                        onClick={() => setActiveFilter(f.key)}

                    >

                        {f.label}

                    </button>

                ))}

            </div>



            {/* Grid */}

            <div className="themes-grid" key={activeFilter}>

                {filtered.map((theme) => (

                    <div className="theme-card" key={theme.id}>

                        {/* Ribbon */}

                        {theme.ribbon && (

                            <span className={`theme-card-ribbon ${theme.ribbon}`}>

                                {theme.ribbon === "new" && <>New<Sparkles size="1em" aria-hidden="true" /></>}

                                {theme.ribbon === "premium" && <>Premium<Star size="1em" aria-hidden="true" /></>}

                                {theme.ribbon === "tournament" && <>Tournament<Trophy size="1em" aria-hidden="true" /></>}

                            </span>

                        )}



                        <div

                            className="theme-card-image"

                            onClick={() => setLightbox(theme)}

                            style={{ cursor: "pointer" }}

                        >

                            <ThemePreview previewId={theme.previewId} />

                        </div>



                        <div className="theme-card-info">

                            <div className="theme-card-name">{theme.name}</div>

                            <div className="theme-card-desc">{theme.desc}</div>

                            <div className="theme-card-tags">

                                {theme.tags.map((tag) => (

                                    <span key={tag} className="theme-card-tag">{tag}</span>

                                ))}

                            </div>

                            <button

                                className="theme-card-preview-btn"

                                onClick={() => setLightbox(theme)}

                            >

                                <Eye size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Preview Theme

                            </button>

                        </div>

                    </div>

                ))}

            </div>



            {/* Lightbox */}

            {lightbox && (

                <div className="lightbox-overlay" onClick={() => setLightbox(null)}>

                    <button

                        className="lightbox-close"

                        onClick={(e) => { e.stopPropagation(); setLightbox(null); }}

                    >

                        <X size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" />

                    </button>

                    <div
                        className="ltp-lightbox"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <ThemePreview previewId={lightbox.previewId} />
                    </div>

                    <div className="lightbox-label">{lightbox.name}</div>

                </div>

            )}

        </section>

    );

}



/* ================================================================

   BuyerSolutions Component

   ================================================================ */

function BuyerSolutions() {

    return (

        <section className="solutions-section landing-reveal" id="solutions">

            <h2 className="landing-section-title">

                The Right Solution for <span>Every Level</span>

            </h2>

            <p className="landing-section-sub">

                Whether you're running school games or professional tournaments — we've got you covered

            </p>



            <div className="solutions-grid">

                {SOLUTIONS.map((sol, i) => (

                    <div

                        className="solution-card"

                        key={i}

                        style={{

                            "--sol-color-1": sol.color1,

                            "--sol-color-2": sol.color2,

                        }}

                    >

                        <div className={`solution-icon ${sol.iconClass}`}><sol.icon size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></div>

                        <h3>{sol.title}</h3>

                        <p>{sol.desc}</p>

                        <ul className="solution-benefits">

                            {sol.benefits.map((b, j) => (

                                <li key={j}>

                                    <span className="solution-check"><Check size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></span>

                                    {b}

                                </li>

                            ))}

                        </ul>

                    </div>

                ))}

            </div>



            <div className="solutions-cta-wrap">

                <button className="solutions-cta-btn">

                    <Palette size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Request Custom Design

                </button>

            </div>

        </section>

    );

}



/* ================================================================

   Export all portfolio sections

   ================================================================ */

export { ScreenshotsShowcase, ThemesGallery, BuyerSolutions };

