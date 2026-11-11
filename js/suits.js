/**
 * camlab - Formal Suit & Attire Overlays (High-Quality Scalable SVGs)
 * Supports gender-aware auto selection (Male / Female) and precision collar alignment.
 */

const SUIT_TEMPLATES = [
    {
        id: 'none',
        gender: 'neutral',
        name_en: 'Original Dress',
        name_bn: 'নিজের পোশাক (আসল)',
        svg: null
    },
    {
        id: 'mens_black_suit',
        gender: 'male',
        name_en: 'Men\'s Black Suit & Tie',
        name_bn: 'পুরুষ: কালো স্যুট ও টাই',
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
            </defs>
            <path d="M188 18 L250 86 L312 18 L290 145 L210 145 Z" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>
            <path d="M188 18 L238 88 L215 95 L172 38 Z" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
            <path d="M312 18 L262 88 L285 95 L328 38 Z" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
            <path d="M236 82 L264 82 L258 112 L242 112 Z" fill="url(#tieGrad)" stroke="#450a0a" stroke-width="1.5"/>
            <path d="M242 112 L258 112 L268 310 L250 340 L232 310 Z" fill="url(#tieGrad)" stroke="#450a0a" stroke-width="1.5"/>
            <path d="M35 450 L110 112 C135 64 168 42 195 36 L210 125 L290 125 L305 36 C332 42 365 64 390 112 L465 450 Z" fill="url(#suitGrad)"/>
            <path d="M195 36 L158 180 L235 240 L210 125 Z" fill="url(#lapelGradLeft)" stroke="#09090b" stroke-width="2"/>
            <path d="M305 36 L342 180 L265 240 L290 125 Z" fill="url(#lapelGradRight)" stroke="#09090b" stroke-width="2"/>
            <circle cx="250" cy="275" r="7" fill="#09090b" stroke="#3f3f46" stroke-width="2"/>
            <circle cx="250" cy="345" r="7" fill="#09090b" stroke="#3f3f46" stroke-width="2"/>
        </svg>`
    },
    {
        id: 'mens_navy_suit',
        gender: 'male',
        name_en: 'Men\'s Navy Business Suit',
        name_bn: 'পুরুষ: নেভি ব্লু স্যুট',
        svg: `<svg viewBox="0 0 500 450" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="navyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#1e293b" />
                    <stop offset="50%" stop-color="#0f172a" />
                    <stop offset="100%" stop-color="#020617" />
                </linearGradient>
                <linearGradient id="goldTie" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#1d4ed8" />
                    <stop offset="50%" stop-color="#1e40af" />
                    <stop offset="100%" stop-color="#172554" />
                </linearGradient>
            </defs>
            <path d="M188 18 L250 86 L312 18 L290 145 L210 145 Z" fill="#f0f9ff" stroke="#bae6fd" stroke-width="2"/>
            <path d="M188 18 L238 88 L215 95 L172 38 Z" fill="#ffffff" stroke="#bae6fd" stroke-width="1.5"/>
            <path d="M312 18 L262 88 L285 95 L328 38 Z" fill="#ffffff" stroke="#bae6fd" stroke-width="1.5"/>
            <path d="M236 82 L264 82 L258 112 L242 112 Z" fill="url(#goldTie)"/>
            <path d="M242 112 L258 112 L268 310 L250 340 L232 310 Z" fill="url(#goldTie)"/>
            <path d="M35 450 L110 112 C135 64 168 42 195 36 L210 125 L290 125 L305 36 C332 42 365 64 390 112 L465 450 Z" fill="url(#navyGrad)"/>
            <path d="M195 36 L158 180 L235 240 L210 125 Z" fill="#334155" stroke="#0f172a" stroke-width="2"/>
            <path d="M305 36 L342 180 L265 240 L290 125 Z" fill="#334155" stroke="#0f172a" stroke-width="2"/>
            <circle cx="250" cy="275" r="7" fill="#020617" stroke="#475569" stroke-width="2"/>
        </svg>`
    },
    {
        id: 'mens_white_shirt',
        gender: 'male',
        name_en: 'Men\'s White Shirt & Tie',
        name_bn: 'পুরুষ: সাদা শার্ট ও টাই',
        svg: `<svg viewBox="0 0 500 450" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="whiteShirt" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#ffffff" />
                    <stop offset="100%" stop-color="#e2e8f0" />
                </linearGradient>
                <linearGradient id="blueTie" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#1d4ed8" />
                    <stop offset="100%" stop-color="#1e3a8a" />
                </linearGradient>
            </defs>
            <path d="M45 450 L115 110 C140 62 172 38 195 28 L250 85 L305 28 C328 38 360 62 385 110 L455 450 Z" fill="url(#whiteShirt)" stroke="#cbd5e1" stroke-width="2"/>
            <path d="M235 85 L265 85 L265 450 L235 450 Z" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1.5"/>
            <circle cx="250" cy="180" r="5" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5"/>
            <circle cx="250" cy="250" r="5" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5"/>
            <path d="M195 28 L242 90 L210 100 L168 44 Z" fill="#ffffff" stroke="#94a3b8" stroke-width="2"/>
            <path d="M305 28 L258 90 L290 100 L332 44 Z" fill="#ffffff" stroke="#94a3b8" stroke-width="2"/>
            <path d="M238 82 L262 82 L256 112 L244 112 Z" fill="url(#blueTie)"/>
            <path d="M244 112 L256 112 L266 330 L250 360 L234 330 Z" fill="url(#blueTie)"/>
        </svg>`
    },
    {
        id: 'womens_dark_blazer',
        gender: 'female',
        name_en: 'Women\'s Black Blazer',
        name_bn: 'নারী: ব্ল্যাক ব্লেজার',
        svg: `<svg viewBox="0 0 500 450" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="blazerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#27272a" />
                    <stop offset="60%" stop-color="#18181b" />
                    <stop offset="100%" stop-color="#09090b" />
                </linearGradient>
            </defs>
            <path d="M185 22 Q250 148 315 22 L295 180 L205 180 Z" fill="#ffffff" stroke="#e4e4e7" stroke-width="2"/>
            <path d="M48 450 L120 108 C142 64 168 42 190 32 L205 170 L295 170 L310 32 C332 42 358 64 380 108 L452 450 Z" fill="url(#blazerGrad)"/>
            <path d="M190 32 L156 160 L240 245 L205 170 Z" fill="#3f3f46" stroke="#18181b" stroke-width="2"/>
            <path d="M310 32 L344 160 L260 245 L295 170 Z" fill="#3f3f46" stroke="#18181b" stroke-width="2"/>
            <circle cx="250" cy="270" r="6" fill="#18181b" stroke="#71717a" stroke-width="2"/>
        </svg>`
    },
    {
        id: 'womens_navy_blazer',
        gender: 'female',
        name_en: 'Women\'s Navy Formal Blazer',
        name_bn: 'নারী: নেভি ফরমাল ব্লেজার',
        svg: `<svg viewBox="0 0 500 450" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="wNavyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#1e3a8a" />
                    <stop offset="60%" stop-color="#172554" />
                    <stop offset="100%" stop-color="#0f172a" />
                </linearGradient>
            </defs>
            <path d="M185 22 Q250 140 315 22 L295 180 L205 180 Z" fill="#f8fafc" stroke="#e2e8f0" stroke-width="2"/>
            <path d="M48 450 L120 108 C142 64 168 42 190 32 L205 170 L295 170 L310 32 C332 42 358 64 380 108 L452 450 Z" fill="url(#wNavyGrad)"/>
            <path d="M190 32 L156 160 L240 245 L205 170 Z" fill="#1e40af" stroke="#0f172a" stroke-width="2"/>
            <path d="M310 32 L344 160 L260 245 L295 170 Z" fill="#1e40af" stroke="#0f172a" stroke-width="2"/>
        </svg>`
    },
    {
        id: 'womens_formal_shirt',
        gender: 'female',
        name_en: 'Women\'s Crisp White Shirt',
        name_bn: 'নারী: ফরমাল সাদা শার্ট',
        svg: `<svg viewBox="0 0 500 450" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="wWhiteShirt" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#ffffff" />
                    <stop offset="100%" stop-color="#e2e8f0" />
                </linearGradient>
            </defs>
            <path d="M52 450 L122 108 C145 64 172 38 196 28 Q250 105 304 28 C328 38 355 64 378 108 L448 450 Z" fill="url(#wWhiteShirt)" stroke="#cbd5e1" stroke-width="2"/>
            <path d="M196 28 L236 86 L205 98 L168 44 Z" fill="#ffffff" stroke="#94a3b8" stroke-width="1.8"/>
            <path d="M304 28 L264 86 L295 98 L332 44 Z" fill="#ffffff" stroke="#94a3b8" stroke-width="1.8"/>
            <circle cx="250" cy="145" r="4.5" fill="#f1f5f9" stroke="#94a3b8" stroke-width="1.5"/>
            <circle cx="250" cy="210" r="4.5" fill="#f1f5f9" stroke="#94a3b8" stroke-width="1.5"/>
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
