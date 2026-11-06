import React from 'react';
import './FeaturesHub.css';

const MODULES = [
    {
        category: "Core Systems",
        items: [
            { icon: "⚡", title: "Live Scoring", desc: "Real-time ball-by-ball updates with zero latency." },
            { icon: "📺", title: "Real-Time Overlays", desc: "Broadcast-quality graphics for live streams." },
            { icon: "🔨", title: "Live Player Auctions", desc: "Real-time IPL-style bidding rooms with projector displays." },
            { icon: "🖥️", title: "OBS Integration", desc: "One-click URL import for OBS Studio and vMix." }
        ]
    },
    {
        category: "Match & Stats Center",
        items: [
            { icon: "🏆", title: "Tournament Management", desc: "Manage leagues, points tables, and brackets easily." },
            { icon: "📊", title: "Match Center", desc: "Comprehensive scorecards, Manhattan charts, and wagon wheels." },
            { icon: "👥", title: "Team & Player Statistics", desc: "Deep dive into career averages and strike rates." }
        ]
    },
    {
        category: "Professional Services",
        items: [
            { icon: "🎥", title: "Broadcasting Services", desc: "Multi-camera setups for any tournament size." },
            { icon: "🎬", title: "Production Services", desc: "Commentary, replays, and professional crews." },
            { icon: "📈", title: "Advanced Analytics", desc: "Data-driven insights for coaches and fans." }
        ]
    }
];

export function FeaturesHub() {
    return (
        <section className="features-hub-wrapper">
            <h2 className="hub-title">Complete <span>Features & Tools</span></h2>
            <p className="hub-subtitle">Explore every powerful module available in the KS Live System.</p>
            
            <div className="hub-grid">
                {MODULES.map((module, index) => (
                    <div key={index} className="hub-category-card">
                        <h3 className="category-title">{module.category}</h3>
                        <div className="category-items">
                            {module.items.map((item, i) => (
                                <div key={i} className="hub-item">
                                    <div className="item-icon">{item.icon}</div>
                                    <div className="item-text">
                                        <h4>{item.title}</h4>
                                        <p>{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            
            <div className="hub-previews">
                <div className="preview-card">
                    <h4>Admin Panel Preview</h4>
                    <img src="/images/portfolio/Match Panel.png" alt="Admin Panel" className="preview-img" />
                </div>
                <div className="preview-card">
                    <h4>Scorecard Preview</h4>
                    <img src="/images/portfolio/live-scoreboard.png" alt="Scorecard" className="preview-img" />
                </div>
                <div className="preview-card">
                    <h4>Themes Preview</h4>
                    <img src="/themes/new ipl.png" alt="Themes" className="preview-img" />
                </div>
            </div>
        </section>
    );
}
