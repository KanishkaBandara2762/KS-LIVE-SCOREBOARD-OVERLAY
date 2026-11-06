import React, { useState, useEffect, useRef } from "react";

import "./Portfolio.css";



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

            { icon: "📡", text: "Live ball-by-ball updates via Firebase" },

            { icon: "🎨", text: "6 switchable broadcast themes" },

            { icon: "🖥️", text: "OBS-ready with transparent background" },

            { icon: "📊", text: "Batsman & bowler stats display" },

            { icon: "⚡", text: "Sub-100ms update latency" },

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

            { icon: "🏆", text: "Team logos and branding display" },

            { icon: "⚡", text: "Animated team name reveals" },

            { icon: "🎬", text: "Cinematic entrance animation" },

            { icon: "📋", text: "Match info: venue, date, format" },

            { icon: "🔄", text: "Auto-transitions to scoreboard" },

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

            { icon: "📊", text: "Full batting & bowling scorecards" },

            { icon: "🏅", text: "Man of the Match highlight" },

            { icon: "📈", text: "Run rate and partnership charts" },

            { icon: "🎯", text: "Fall of wickets timeline" },

            { icon: "📱", text: "Shareable as image" },

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

            { icon: "💥", text: "FOUR / SIX celebration popups" },

            { icon: "🔴", text: "Wicket alert with red flash" },

            { icon: "✨", text: "Particle burst effects" },

            { icon: "🎵", text: "Optional sound triggers" },

            { icon: "⏱️", text: "Auto-dismiss after 3 seconds" },

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

            { icon: "🏏", text: "One-tap run scoring (0–6, WD, NB)" },

            { icon: "↩️", text: "Undo last ball instantly" },

            { icon: "👥", text: "Batsman & bowler management" },

            { icon: "📱", text: "Mobile-friendly mini-admin" },

            { icon: "🔒", text: "Secure Firebase auth" },

        ],

    },

];



/* ================================================================

   THEMES DATA

   ================================================================ */

const THEMES = [
    {
        id: "icc-global",
        name: "ICC T20 Global Apex",
        image: "/themes/icc-global.svg",
        desc: "Official ICC World Cup broadcast package. Chamfered cosmic obsidian, electric cyan & neon magenta accents, striker telemetry, and stadium live beacons.",
        tags: ["ICC", "World Cup", "International"],
        ribbon: "new",
        category: ["all", "tournament", "t20"],
    },
    {
        id: "sky-hyperion",
        name: "Sky Sports Hyperion Pro",
        image: "/themes/sky-hyperion.svg",
        desc: "The pinnacle of British sports broadcast design. High-contrast Swiss typography, Citron Volt strike indicators, and The Hundred style continuous delivery bar.",
        tags: ["Sky Sports", "The Hundred", "Clean"],
        ribbon: "new",
        category: ["all", "tournament", "t20", "odi"],
    },
    {
        id: "jio-titan",
        name: "Jio Premier Titan",
        image: "/themes/jio-titan.svg",
        desc: "Tata IPL & JioCinema 4K broadcast theme. Imperial midnight navy with 24K brushed gold metallic pill capsule, gold star striker aura, and boundary flare.",
        tags: ["IPL", "Franchise", "Gold 4K"],
        ribbon: "new",
        category: ["all", "t20"],
    },
    {
        id: "fox-strike",
        name: "Fox Cricket BBL Strike",
        image: "/themes/fox-strike.svg",
        desc: "Fox Sports Australia & Big Bash League graphics. 10-degree athletic kinetic slant, fiery solar orange and flare yellow energy, and flame striker chevrons.",
        tags: ["Fox Cricket", "BBL", "Action Slant"],
        ribbon: "new",
        category: ["all", "t20"],
    },
    {
        id: "supersport-aura",
        name: "SuperSport Aura Glass",
        image: "/themes/supersport-aura.svg",
        desc: "Translucent frosted glassmorphism inspired by international OTT live streams. Emerald & cyan holographic perimeter glow with pristine typography.",
        tags: ["Glassmorphism", "International", "Minimal"],
        ribbon: "new",
        category: ["all", "tournament", "odi", "t20"],
    },
    {
        id: "emerald-pro",
        name: "Emerald Cricket Pro (KS Signature)",
        image: "/themes/new ipl.png",
        desc: "KS Live's modern emerald flagship overlay. Deep jade gradient, dual-tier tournament live strip, and color-coded boundary animation.",
        tags: ["Emerald", "Signature", "Broadcast"],
        ribbon: "premium",
        category: ["all", "tournament", "t20"],
    },
    {
        id: "new-ipl",
        name: "Tata IPL 2026 (Modern)",
        image: "/themes/new ipl.png",
        desc: "A modernized take on the classic franchise cricket overlay. Sharp angles, high contrast, and animated live score updates.",
        tags: ["IPL", "Modern", "Franchise"],
        ribbon: "popular",
        category: ["all", "t20"],
    },
    {
        id: "ipl-2026-capsule",
        name: "IPL 2026 Stadium Capsule",
        image: "/themes/Ipl classic.png",
        desc: "Curved central score capsule with green and blue team wings. Classic franchise stadium layout with high-visibility bowler HUD.",
        tags: ["IPL", "Stadium", "Capsule"],
        ribbon: "popular",
        category: ["all", "t20"],
    },
    {
        id: "ks-premium",
        name: "KS Premium TV Broadcast",
        image: "/themes/ks premium.png",
        desc: "High-end television broadcast style theme. Sleek floating layout, individual batter statistics, and full over summary.",
        tags: ["Broadcast", "Flagship", "Championship"],
        ribbon: "premium",
        category: ["all", "tournament", "t20"],
    },
    {
        id: "t20-world-cup",
        name: "T20 World Cup 2026 Electric",
        image: "/themes/t20 world cup.png",
        desc: "Official T20 World Cup tournament style layout. Vibrant electric blue, magenta accents, and lightning bolt boundary strikes.",
        tags: ["World Cup", "Tournament", "T20"],
        ribbon: "tournament",
        category: ["all", "t20", "tournament"],
    },
    {
        id: "gold-champ",
        name: "Gold Championship Finals",
        image: "/themes/gold championship.png",
        desc: "Luxurious carbon-fiber with gold framing and amber score highlights. Designed for grand finals and trophy deciders.",
        tags: ["Gold", "Championship", "Finals"],
        ribbon: "premium",
        category: ["all", "tournament"],
    },
    {
        id: "sky-sports",
        name: "Sky Sports Classic Pro",
        image: "/themes/sky sports.png",
        desc: "Television broadcast look with striking white and red accents. Extremely readable and iconic for ODI and Test formats.",
        tags: ["TV Style", "Clean", "ODI"],
        ribbon: null,
        category: ["all", "odi", "t20", "school"],
    }
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

        icon: "🎓",

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

        icon: "🏏",

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

        icon: "🏆",

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

                    <div className="showcase-zoom-hint">🔍 Click to enlarge</div>

                </div>



                <div className="showcase-info">

                    <h3>

                        {current.title} <span>{current.titleAccent}</span>

                    </h3>

                    <p>{current.desc}</p>

                    <ul className="showcase-capabilities">

                        {current.capabilities.map((c, i) => (

                            <li key={i}>

                                <span className="showcase-cap-icon">{c.icon}</span>

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

                        ✕

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

                                {theme.ribbon === "new" && "✨ New"}

                                {theme.ribbon === "premium" && "⭐ Premium"}

                                {theme.ribbon === "tournament" && "🏆 Tournament"}

                            </span>

                        )}



                        <div

                            className="theme-card-image"

                            onClick={() => setLightbox(theme)}

                            style={{ cursor: "pointer" }}

                        >

                            <img src={theme.image} alt={theme.name} loading="lazy" />

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

                                👁️ Preview Theme

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

                        ✕

                    </button>

                    <img

                        className="lightbox-img"

                        src={lightbox.image}

                        alt={lightbox.name}

                        onClick={(e) => e.stopPropagation()}

                    />

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

                        <div className={`solution-icon ${sol.iconClass}`}>{sol.icon}</div>

                        <h3>{sol.title}</h3>

                        <p>{sol.desc}</p>

                        <ul className="solution-benefits">

                            {sol.benefits.map((b, j) => (

                                <li key={j}>

                                    <span className="solution-check">✓</span>

                                    {b}

                                </li>

                            ))}

                        </ul>

                    </div>

                ))}

            </div>



            <div className="solutions-cta-wrap">

                <button className="solutions-cta-btn">

                    🎨 Request Custom Design

                </button>

            </div>

        </section>

    );

}



/* ================================================================

   Export all portfolio sections

   ================================================================ */

export { ScreenshotsShowcase, ThemesGallery, BuyerSolutions };

