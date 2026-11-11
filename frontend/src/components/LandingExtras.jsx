import React, { useState } from 'react';
import './LandingExtras.css';
import { School, Trophy, Activity, Check, Star, Phone, MapPin, MessageSquare, Mail } from 'lucide-react';

export function BroadcastingServices() {
    return (
        <section className="landing-broadcasting-section landing-reveal" id="broadcasting">
            <div className="broadcasting-content">
                <div className="broadcasting-badge">Professional Broadcasting Services</div>
                <h2 className="landing-section-title">
                    Take Your Event to the <span>Next Level</span>
                </h2>
                <p className="landing-section-sub">
                    KS Live provides high-quality live streaming, professional production crews, and premium camcorder-based broadcasting services anywhere in Sri Lanka.
                </p>
                <div className="broadcasting-grid">
                    <div className="broadcasting-card">
                        <div className="broadcasting-icon">
                            <School size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" />
                        </div>
                        <h3>Schools & Colleges</h3>
                        <p>Perfect for big matches and inter-school tournaments with multi-camera setups.</p>
                    </div>
                    <div className="broadcasting-card">
                        <div className="broadcasting-icon"><Trophy size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></div>
                        <h3>Tournaments & Leagues</h3>
                        <p>Complete broadcast solutions including live scoring, overlays, and commentary boxes.</p>
                    </div>
                    <div className="broadcasting-card">
                        <div className="broadcasting-icon"><Activity size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></div>
                        <h3>Clubs & Organizations</h3>
                        <p>Affordable, premium live streaming to showcase your weekend matches to the world.</p>
                    </div>
                </div>
                <div className="broadcasting-cta">
                    <p>Looking for a professional production crew?</p>
                    <a href="https://wa.me/94719574089" target="_blank" rel="noopener noreferrer" className="landing-btn-primary">
                        Contact Us Today
                    </a>
                </div>
            </div>
        </section>
    );
}

export function ReviewsSection() {
    const [rating, setRating] = useState(5);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        // In a real scenario, this would post to the backend for admin moderation
        setSubmitted(true);
        setTimeout(() => setSubmitted(false), 5000);
    };

    return (
        <section className="landing-reviews-section landing-reveal" id="reviews">
            <div className="reviews-container">
                <h2 className="landing-section-title">
                    Leave a <span>Review</span>
                </h2>
                <p className="landing-section-sub">
                    Submit your ratings, feedback, feature requests, and customization suggestions. 
                </p>

                {submitted ? (
                    <div className="review-success">
                        <div className="success-icon"><Check size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></div>
                        <h3>Thank you for your feedback!</h3>
                        <p>Your review has been submitted for moderation.</p>
                    </div>
                ) : (
                    <form className="review-form" onSubmit={handleSubmit}>
                        <div className="star-rating-input">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button 
                                    type="button"
                                    key={star} 
                                    className={`star-btn ${rating >= star ? 'active' : ''}`}
                                    onClick={() => setRating(star)}
                                >
                                    <Star size="1em" style={{ verticalAlign: '-0.125em' }} fill={rating >= star ? 'currentColor' : 'none'} aria-hidden="true" />
                                </button>
                            ))}
                        </div>
                        <div className="form-group">
                            <input type="text" placeholder="Your Name" required className="review-input" />
                            <input type="text" placeholder="Club / Organization (Optional)" className="review-input" />
                        </div>
                        <textarea placeholder="Write your review, feedback, or feature request here..." required className="review-textarea"></textarea>
                        <button type="submit" className="landing-btn-primary submit-review-btn">Submit Review</button>
                    </form>
                )}
            </div>
        </section>
    );
}

export function ModernFooter() {
    return (
        <footer className="modern-footer">
            <div className="footer-top">
                <div className="footer-col company-info">
                    <img src="/ks_logo.png" alt="KS Live Logo" className="footer-logo" />
                    <h3>KS Live Broadcasting</h3>
                    <p className="est-text">Established in 2026</p>
                    <p className="company-desc">
                        Providing premier cricket live scoring, live streaming, scoreboard solutions, sports broadcasting services, and professional video production throughout Sri Lanka.
                    </p>
                </div>

                <div className="footer-col developer-info">
                    <h4>About the Developer</h4>
                    <p className="dev-name"><strong>A.G.K.S. Bandara</strong></p>
                    <p className="dev-title">Owner</p>
                    <div className="contact-details">
                        <p><span><Phone size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></span> 0719574089 / 0789577089</p>
                        <p><span><MapPin size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></span> 121/1, Pamunuwa, Pilimathalawa, Kandy, Sri Lanka.</p>
                    </div>
                </div>

                <div className="footer-col quick-contact">
                    <h4>Get In Touch</h4>
                    <div className="social-links">
                        <a href="tel:+94719574089" className="social-btn call"><Phone size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Call Now</a>
                        <a href="https://wa.me/94719574089" target="_blank" rel="noopener noreferrer" className="social-btn whatsapp"><MessageSquare size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> WhatsApp</a>
                        <a href="mailto:contact@kslive.com" className="social-btn email"><Mail size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Email</a>
                    </div>
                </div>
            </div>
            
            <div className="footer-bottom">
                <p><strong>© {new Date().getFullYear()} KS Live Broadcasting. All Rights Reserved.</strong></p>
                <p className="dev-credit">Software Engineer: H.P.N.I.Herath</p>
            </div>
        </footer>
    );
}
