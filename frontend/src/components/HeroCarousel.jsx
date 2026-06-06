import React, { useState, useEffect } from 'react';
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
        title: "Premium OBS Overlays",
        subtitle: "Customizable. Automated.",
        description: "Integrate seamlessly with OBS Studio. Dynamic lower-thirds, versus screens, and match summaries.",
        image: "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80",
        cta: "View Themes"
    },
    {
        id: 3,
        title: "Live Broadcasting Services",
        subtitle: "Multi-Camera. Pro Commentary.",
        description: "Hire our professional production crew for your next big tournament anywhere in Sri Lanka.",
        image: "https://images.unsplash.com/photo-1522869635100-9f4c5e86faa3?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80",
        cta: "Contact Production"
    }
];

export function HeroCarousel() {
    const [currentSlide, setCurrentSlide] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentSlide((prev) => (prev + 1) % HERO_SLIDES.length);
        }, 6000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="hero-carousel-wrapper">
            {HERO_SLIDES.map((slide, index) => (
                <div 
                    key={slide.id}
                    className={`hero-slide ${index === currentSlide ? 'active' : ''}`}
                    style={{ backgroundImage: `url(${slide.image})` }}
                >
                    <div className="hero-overlay"></div>
                    <div className="hero-content">
                        <h2 className="hero-subtitle">{slide.subtitle}</h2>
                        <h1 className="hero-title">{slide.title}</h1>
                        <p className="hero-desc">{slide.description}</p>
                        <button className="hero-btn" onClick={() => {
                            if (index === 1) document.getElementById('themes')?.scrollIntoView({ behavior: 'smooth' });
                            else if (index === 2) document.getElementById('broadcasting')?.scrollIntoView({ behavior: 'smooth' });
                            else document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' });
                        }}>
                            {slide.cta}
                        </button>
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
