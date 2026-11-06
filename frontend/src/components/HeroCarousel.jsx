import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './HeroCarousel.css';

const HERO_SLIDES = [
    {
        id: 1,
        title: "World-Class Live Scoring",
        subtitle: "Professional Grade. Lightning Fast.",
        description: "Transform your cricket tournaments with broadcast-quality overlays and real-time scorecards.",
        image: "https://images.unsplash.com/photo-1531415074968-036ba1b575da?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80",
        cta: "Start Scoring Now"
    },
    {
        id: 2,
        title: "Live Player Auction System",
        subtitle: "IPL-Style Bidding. Live Rooms.",
        description: "Run high-voltage team auctions with real-time bidder sync, purse tracking, squad limits, and OBS projector displays.",
        image: "https://images.unsplash.com/photo-1511193311914-0346f16efe90?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80",
        cta: "Explore Auctions",
        action: "auction"
    },
    {
        id: 3,
        title: "Premium OBS Overlays",
        subtitle: "Customizable. Automated.",
        description: "Integrate seamlessly with OBS Studio. Dynamic lower-thirds, versus screens, and match summaries.",
        image: "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80",
        cta: "View Themes"
    },
    {
        id: 4,
        title: "Live Broadcasting Services",
        subtitle: "Multi-Camera. Pro Commentary.",
        description: "Hire our professional production crew for your next big tournament anywhere in Sri Lanka.",
        image: "https://images.unsplash.com/photo-1522869635100-9f4c5e86faa3?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80",
        cta: "Contact Production"
    }
];

export function HeroCarousel() {
    const [currentSlide, setCurrentSlide] = useState(0);
    const navigate = useNavigate();

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentSlide((prev) => (prev + 1) % HERO_SLIDES.length);
        }, 6000);
        return () => clearInterval(timer);
    }, []);

    const slide = HERO_SLIDES[currentSlide];

    return (
        <div className="hero-carousel-wrapper">
            {HERO_SLIDES.map((s, index) => (
                <div 
                    key={s.id}
                    className={`hero-slide ${index === currentSlide ? 'active' : ''}`}
                    style={{ backgroundImage: `url(${s.image})` }}
                >
                    <div className="hero-overlay"></div>
                    <div className="hero-content">
                        <h2 className="hero-subtitle">{s.subtitle}</h2>
                        <h1 className="hero-title">{s.title}</h1>
                        <p className="hero-desc">{s.description}</p>
                        <div className="hero-btn-group">
                            <button className="hero-btn" onClick={() => {
                                if (s.action === 'auction') navigate('/auctions');
                                else if (s.id === 3) document.getElementById('themes')?.scrollIntoView({ behavior: 'smooth' });
                                else if (s.id === 4) document.getElementById('broadcasting')?.scrollIntoView({ behavior: 'smooth' });
                                else document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' });
                            }}>
                                {s.cta}
                            </button>
                            <Link to="/auctions" className="hero-btn-auction">
                                🔨 Explore Auctions
                            </Link>
                        </div>
                    </div>
                </div>
            ))}
            
            <div className="hero-indicators">
                {HERO_SLIDES.map((_, index) => (
                    <button 
                        key={index}
                        className={`indicator-dot ${index === currentSlide ? 'active' : ''}`}
                        onClick={() => setCurrentSlide(index)}
                    />
                ))}
            </div>
        </div>
    );
}
