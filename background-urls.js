const NETLIFY_ASSETS_BASE = 'https://trapstars-assets.netlify.app';

export const BACKGROUND_URLS = {
    '2 Face': `${NETLIFY_ASSETS_BASE}/background/2%20face.png`,
    '21 21': `${NETLIFY_ASSETS_BASE}/background/21%2021.png`,
    '666': `${NETLIFY_ASSETS_BASE}/background/666.png`,
    'Cave': `${NETLIFY_ASSETS_BASE}/background/cave.png`,
    'Christmas': `${NETLIFY_ASSETS_BASE}/background/christmas.png`,
    'Expensive': `${NETLIFY_ASSETS_BASE}/background/expensive.png`,
    'Flames': `${NETLIFY_ASSETS_BASE}/background/flames.png`,
    'Going Dark': `${NETLIFY_ASSETS_BASE}/background/going%20dark.png`,
    'Grow House': `${NETLIFY_ASSETS_BASE}/background/grow%20house.png`,
    'Gucci': `${NETLIFY_ASSETS_BASE}/background/gucci.png`,
    'Lambo': `${NETLIFY_ASSETS_BASE}/background/lambo.png`,
    'Lights': `${NETLIFY_ASSETS_BASE}/background/lights.png`,
    'Locked Up': `${NETLIFY_ASSETS_BASE}/background/locked%20up.png`,
    'Mansion': `${NETLIFY_ASSETS_BASE}/background/mansion.png`,
    'Metal': `${NETLIFY_ASSETS_BASE}/background/metal.png`,
    'Moon': `${NETLIFY_ASSETS_BASE}/background/moon.png`,
    'Penthouse': `${NETLIFY_ASSETS_BASE}/background/penthouse.png`,
    'Pick Your Weapon': `${NETLIFY_ASSETS_BASE}/background/pick%20your%20weapon.png`,
    'Private Jet RR': `${NETLIFY_ASSETS_BASE}/background/private%20jet%20rr.png`,
    'RR 1': `${NETLIFY_ASSETS_BASE}/background/rr%201.png`,
    'RR Inside': `${NETLIFY_ASSETS_BASE}/background/rr%20inside.png`,
    'Sega': `${NETLIFY_ASSETS_BASE}/background/sega.png`,
    'Studio': `${NETLIFY_ASSETS_BASE}/background/studio.png`,
    'Tony Montana': `${NETLIFY_ASSETS_BASE}/background/tony%20montana.png`,
    'Trap 1': `${NETLIFY_ASSETS_BASE}/background/trap%201.png`,
    'Trap 2': `${NETLIFY_ASSETS_BASE}/background/trap%202.png`,
    'Up In Space': `${NETLIFY_ASSETS_BASE}/background/up%20in%20space.png`,
    'Vapot': `${NETLIFY_ASSETS_BASE}/background/vapot.png`,
    'Views': `${NETLIFY_ASSETS_BASE}/background/views.png`
};

export function getBackgroundUrl(backgroundName) {
    if (!backgroundName) return null;

    if (BACKGROUND_URLS[backgroundName]) {
        return BACKGROUND_URLS[backgroundName];
    }

    const lowerName = backgroundName.toLowerCase();
    for (const [key, url] of Object.entries(BACKGROUND_URLS)) {
        if (key.toLowerCase() === lowerName) {
            return url;
        }
    }

    return null;
}
