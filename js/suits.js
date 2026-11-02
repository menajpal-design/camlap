/**
 * CamScanner Web - Formal Suit & Attire Overlays (High-Quality Scalable SVGs)
 * Allows users to add formal attire to their passport photos.
 */

const SUIT_TEMPLATES = [
    {
        id: 'none',
        name_en: 'No Suit (Original)',
        name_bn: 'কোনো স্যুট নয় (আসল)',
        svg: null
    },
    {
        id: 'mens_black_suit',
        name_en: 'Men\'s Black Classic Suit & Tie',
        name_bn: 'পুরুষদের ক্লাসিক ব্ল্যাক স্যুট ও টাই',
        svg: `<svg viewBox="0 0 500 450" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="suitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#1e1e24" />
                    <stop offset="50%" stop-color="#121216" />
                    <stop offset="100%" stop-color="#08080a" />
                </linearGradient>
                <linearGradient id="lapelGradLeft" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#2a2a30" />
                    <stop offset="100%" stop-color="#17171c" />
                </linearGradient>
                <linearGradient id="lapelGradRight" x1="100%" y1="0%" x2="0%" y2="0%">
                    <stop offset="0%" stop-color="#2a2a30" />
                    <stop offset="100%" stop-color="#17171c" />
                </linearGradient>
                <linearGradient id="tieGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#991b1b" />
                    <stop offset="50%" stop-color="#7f1d1d" />
                    <stop offset="100%" stop-color="#450a0a" />
                </linearGradient>
                <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
                    <feDropShadow dx="0" dy="6" stdDeviation="5" flood-opacity="0.5"/>
                </filter>
            </defs>
            <!-- White Shirt -->
            <path d="M190 20 L250 85 L310 20 L290 140 L210 140 Z" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>
            <!-- Shirt Collar Left -->
            <path d="M190 20 L238 90 L215 95 L175 40 Z" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
            <!-- Shirt Collar Right -->
            <path d="M310 20 L262 90 L285 95 L325 40 Z" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
            
            <!-- Tie Knot -->
            <path d="M236 82 L264 82 L258 112 L242 112 Z" fill="url(#tieGrad)" stroke="#450a0a" stroke-width="1.5"/>
            <!-- Tie Body -->
            <path d="M242 112 L258 112 L268 310 L250 340 L232 310 Z" fill="url(#tieGrad)" stroke="#450a0a" stroke-width="1.5"/>
            <!-- Tie Pattern lines -->
            <line x1="242" y1="140" x2="258" y2="152" stroke="#b91c1c" stroke-width="2"/>
            <line x1="239" y1="180" x2="261" y2="192" stroke="#b91c1c" stroke-width="2"/>
            <line x1="236" y1="220" x2="264" y2="232" stroke="#b91c1c" stroke-width="2"/>
            <line x1="233" y1="260" x2="267" y2="272" stroke="#b91c1c" stroke-width="2"/>

            <!-- Suit Base & Shoulders -->
            <path d="M50 450 L120 120 C140 70 170 45 195 40 L210 125 L290 125 L305 40 C330 45 360 70 380 120 L450 450 Z" fill="url(#suitGrad)"/>

            <!-- Left Lapel -->
            <path d="M195 40 L160 180 L235 240 L210 125 Z" fill="url(#lapelGradLeft)" stroke="#09090b" stroke-width="2" filter="url(#shadow)"/>
            <!-- Right Lapel -->
            <path d="M305 40 L340 180 L265 240 L290 125 Z" fill="url(#lapelGradRight)" stroke="#09090b" stroke-width="2" filter="url(#shadow)"/>
            <!-- Suit Buttons & Center crease -->
            <circle cx="250" cy="275" r="7" fill="#09090b" stroke="#3f3f46" stroke-width="2"/>
            <circle cx="250" cy="345" r="7" fill="#09090b" stroke="#3f3f46" stroke-width="2"/>
        </svg>`
    },
    {
        id: 'mens_navy_suit',
        name_en: 'Men\'s Navy Blue Business Suit',
        name_bn: 'পুরুষদের নেভি ব্লু বিজনেস স্যুট',
        svg: `<svg viewBox="0 0 500 450" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="navyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#1e293b" />
                    <stop offset="50%" stop-color="#0f172a" />
                    <stop offset="100%" stop-color="#020617" />
                </linearGradient>
                <linearGradient id="navyLapelL" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#334155" />
                    <stop offset="100%" stop-color="#1e293b" />
                </linearGradient>
                <linearGradient id="navyLapelR" x1="100%" y1="0%" x2="0%" y2="0%">
                    <stop offset="0%" stop-color="#334155" />
                    <stop offset="100%" stop-color="#1e293b" />
                </linearGradient>
                <linearGradient id="goldTie" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#b45309" />
                    <stop offset="50%" stop-color="#d97706" />
                    <stop offset="100%" stop-color="#92400e" />
                </linearGradient>
            </defs>
            <!-- Light Blue Shirt -->
            <path d="M190 20 L250 85 L310 20 L290 140 L210 140 Z" fill="#e0f2fe" stroke="#bae6fd" stroke-width="2"/>
            <!-- Shirt Collar Left -->
            <path d="M190 20 L238 90 L215 95 L175 40 Z" fill="#f0f9ff" stroke="#bae6fd" stroke-width="1.5"/>
            <!-- Shirt Collar Right -->
            <path d="M310 20 L262 90 L285 95 L325 40 Z" fill="#f0f9ff" stroke="#bae6fd" stroke-width="1.5"/>
            
            <!-- Tie Knot -->
            <path d="M236 82 L264 82 L258 112 L242 112 Z" fill="url(#goldTie)" stroke="#78350f" stroke-width="1.5"/>
            <!-- Tie Body -->
            <path d="M242 112 L258 112 L268 310 L250 340 L232 310 Z" fill="url(#goldTie)" stroke="#78350f" stroke-width="1.5"/>
            
            <!-- Suit Base -->
            <path d="M50 450 L120 120 C140 70 170 45 195 40 L210 125 L290 125 L305 40 C330 45 360 70 380 120 L450 450 Z" fill="url(#navyGrad)"/>
            <!-- Lapels -->
            <path d="M195 40 L160 180 L235 240 L210 125 Z" fill="url(#navyLapelL)" stroke="#0f172a" stroke-width="2"/>
            <path d="M305 40 L340 180 L265 240 L290 125 Z" fill="url(#navyLapelR)" stroke="#0f172a" stroke-width="2"/>
            <!-- Buttons -->
            <circle cx="250" cy="275" r="7" fill="#020617" stroke="#475569" stroke-width="2"/>
            <circle cx="250" cy="345" r="7" fill="#020617" stroke="#475569" stroke-width="2"/>
        </svg>`
    },
    {
        id: 'womens_dark_blazer',
        name_en: 'Women\'s Professional Blazer & Blouse',
        name_bn: 'মহিলাদের প্রফেশনাল ব্লেজার ও ব্লাউজ',
        svg: `<svg viewBox="0 0 500 450" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="blazerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#27272a" />
                    <stop offset="50%" stop-color="#18181b" />
                    <stop offset="100%" stop-color="#09090b" />
                </linearGradient>
            </defs>
            <!-- White Inner Blouse / V-Neck -->
            <path d="M185 25 Q250 160 315 25 L295 180 L205 180 Z" fill="#fafafa" stroke="#e4e4e7" stroke-width="2"/>
            <!-- Pearl Necklace -->
            <path d="M210 70 Q250 115 290 70" fill="none" stroke="#d4d4d8" stroke-width="3" stroke-dasharray="2,6"/>

            <!-- Blazer Base -->
            <path d="M55 450 L125 110 C145 65 170 45 190 35 L205 170 L295 170 L310 35 C330 45 355 65 375 110 L445 450 Z" fill="url(#blazerGrad)"/>
            <!-- Lapels -->
            <path d="M190 35 L155 160 L240 250 L205 170 Z" fill="#3f3f46" stroke="#18181b" stroke-width="2"/>
            <path d="M310 35 L345 160 L260 250 L295 170 Z" fill="#3f3f46" stroke="#18181b" stroke-width="2"/>
            <!-- Button -->
            <circle cx="250" cy="270" r="6" fill="#18181b" stroke="#71717a" stroke-width="2"/>
        </svg>`
    },
    {
        id: 'mens_white_shirt',
        name_en: 'Men\'s Formal White Shirt & Tie',
        name_bn: 'পুরুষদের ফরমাল সাদা শার্ট ও টাই',
        svg: `<svg viewBox="0 0 500 450" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="whiteShirt" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#ffffff" />
                    <stop offset="50%" stop-color="#f8fafc" />
                    <stop offset="100%" stop-color="#e2e8f0" />
                </linearGradient>
                <linearGradient id="blueTie" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#1d4ed8" />
                    <stop offset="50%" stop-color="#1e40af" />
                    <stop offset="100%" stop-color="#1e3a8a" />
                </linearGradient>
            </defs>
            <!-- Shirt Shoulders -->
            <path d="M60 450 L125 110 C145 65 175 40 195 30 L250 85 L305 30 C325 40 355 65 375 110 L440 450 Z" fill="url(#whiteShirt)" stroke="#cbd5e1" stroke-width="2"/>
            
            <!-- Shirt Placket (Center strip) -->
            <path d="M235 85 L265 85 L265 450 L235 450 Z" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1.5"/>
            <!-- Buttons -->
            <circle cx="250" cy="180" r="5" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5"/>
            <circle cx="250" cy="250" r="5" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5"/>
            <circle cx="250" cy="320" r="5" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5"/>

            <!-- Collar Left -->
            <path d="M195 30 L242 90 L210 100 L168 45 Z" fill="#ffffff" stroke="#94a3b8" stroke-width="2"/>
            <!-- Collar Right -->
            <path d="M305 30 L258 90 L290 100 L332 45 Z" fill="#ffffff" stroke="#94a3b8" stroke-width="2"/>

            <!-- Tie Knot -->
            <path d="M238 82 L262 82 L256 112 L244 112 Z" fill="url(#blueTie)" stroke="#1e3a8a" stroke-width="1.5"/>
            <!-- Tie Body -->
            <path d="M244 112 L256 112 L266 330 L250 360 L234 330 Z" fill="url(#blueTie)" stroke="#1e3a8a" stroke-width="1.5"/>
        </svg>`
    }
];

// Pre-load all Suit SVG images into memory for instant synchronous canvas drawing
SUIT_TEMPLATES.forEach(suit => {
    if (suit.svg) {
        const img = new Image();
        const svgBlob = new Blob([suit.svg], { type: 'image/svg+xml;charset=utf-8' });
        img.src = URL.createObjectURL(svgBlob);
        suit.image = img;
    } else {
        suit.image = null;
    }
});

