import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * OTPVerification — No longer needed with JWT auth (no email verification step).
 * Auto-redirects to dashboard immediately.
 */
export default function OTPVerification() {
    const navigate = useNavigate();
    useEffect(() => {
        navigate('/dashboard', { replace: true });
    }, [navigate]);
    return null;
}
